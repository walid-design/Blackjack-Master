import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card, Seat, TableConfig } from '@/lib/blackjack';
import type { GameAction, GameState } from '@/lib/types';
import { createInitialState, gameReducer } from '@/lib/reducer';

type PublicCard = Card & { hidden?: boolean };

interface PublicGame {
  phase: GameState['phase'];
  table: TableConfig;
  seats: Seat[];
  dealerCards: PublicCard[];
  dealerStatus: GameState['dealerStatus'];
  settled: boolean;
  activeSeatIndex: number;
  needsShuffle: boolean;
  shoeNumber: number;
  cardsRemaining: number;
  cardsDiscarded: number;
  cutCardIndex: number;
  actionLocked: boolean;
  bankroll: number;
}

type ServerEvent =
  | { type: 'card_dealt'; to: 'player'; seatId: number; handId: string; card: Card }
  | { type: 'card_dealt'; to: 'dealer'; card: PublicCard; hole: boolean }
  | { type: 'dealer_hole_revealed'; card: Card }
  | { type: 'phase_changed'; phase: GameState['phase'] }
  | { type: 'settled' };

interface GameResponse {
  sessionId: string;
  tableId: string;
  round: number;
  version: number;
  balance: number;
  game: PublicGame;
  events: ServerEvent[];
}

interface SessionRef {
  id: string;
  version: number;
}

interface StoredSession {
  id?: string;
  requestId: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

function requestId(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function storageKey(tableId: string) {
  return `royal_ace_server_table_${tableId}`;
}

function readStoredSession(tableId: string): StoredSession | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(storageKey(tableId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof value.requestId !== 'string') return null;
    return { requestId: value.requestId, id: typeof value.id === 'string' ? value.id : undefined };
  } catch {
    return null;
  }
}

function writeStoredSession(tableId: string, value: StoredSession) {
  try {
    globalThis.sessionStorage?.setItem(storageKey(tableId), JSON.stringify(value));
  } catch {
    // Private browsing restrictions should not stop a game session.
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : `The game server returned ${response.status}.`;
    const failure = new Error(message) as Error & { status?: number };
    failure.status = response.status;
    throw failure;
  }
  return body as T;
}

function fakeCard(id: string): Card {
  return { id, shoeId: 'server-hidden', deckIndex: 0, suit: 'spades', rank: '2', value: 2 };
}

function hydratePublicGame(game: PublicGame, balance: number, previous: GameState): GameState {
  const shoe = Array.from({ length: game.cardsRemaining }, (_, index) => fakeCard(`server-shoe-${game.shoeNumber}-${index}`));
  const discard = Array.from({ length: game.cardsDiscarded }, (_, index) => fakeCard(`server-discard-${game.shoeNumber}-${index}`));
  const expected = game.table.decks * 52;
  return {
    ...previous,
    phase: game.phase,
    table: game.table,
    seats: game.seats,
    dealerCards: game.dealerCards,
    dealerStatus: game.dealerStatus,
    settled: game.settled,
    activeSeatIndex: game.activeSeatIndex,
    needsShuffle: game.needsShuffle,
    shoeNumber: game.shoeNumber,
    cutCardIndex: game.cutCardIndex,
    shoe,
    discard,
    actionLocked: game.actionLocked,
    pendingTurnAdvance: false,
    bankroll: balance,
    cardIntegrity: { valid: true, total: expected, expected, duplicateIds: [] },
  };
}

function openingAnimationState(response: GameResponse, previous: GameState) {
  const hydrated = hydratePublicGame(response.game, response.balance, previous);
  return {
    ...hydrated,
    phase: 'DEALING' as const,
    settled: false,
    dealerCards: [],
    dealerStatus: 'playing' as const,
    activeSeatIndex: -1,
    actionLocked: true,
    seats: hydrated.seats.map(seat => ({
      ...seat,
      activeHandIndex: 0,
      sideBetResults: [],
      hands: seat.hands.map(hand => ({ ...hand, cards: [], status: 'playing' as const, result: undefined, payout: undefined })),
    })),
  };
}

function actionAnimationState(response: GameResponse, previous: GameState) {
  const playerDealEvents = response.events.filter(
    (event): event is Extract<ServerEvent, { type: 'card_dealt'; to: 'player' }> =>
      event.type === 'card_dealt' && event.to === 'player',
  );
  const knownHands = new Set(previous.seats.flatMap(seat => seat.hands.map(hand => hand.id)));
  if (playerDealEvents.every(event => knownHands.has(event.handId))) {
    return { ...previous, actionLocked: true };
  }

  // SPLIT replaces one hand ID with two server-owned hand IDs. Build the
  // pre-flight split layout from the final public state, then add only the
  // event cards as their animations land.
  const eventCardIds = new Set(playerDealEvents.map(event => event.card.id));
  const hydrated = hydratePublicGame(response.game, previous.bankroll, previous);
  return {
    ...hydrated,
    phase: previous.phase,
    dealerCards: previous.dealerCards,
    dealerStatus: previous.dealerStatus,
    settled: false,
    actionLocked: true,
    seats: hydrated.seats.map(seat => ({
      ...seat,
      sideBetResults: previous.seats[seat.id]?.sideBetResults ?? [],
      hands: seat.hands.map(hand => ({
        ...hand,
        cards: hand.cards.filter(card => !eventCardIds.has(card.id)),
        status: 'playing' as const,
        result: undefined,
        payout: undefined,
      })),
    })),
  };
}

function extractBets(state: GameState) {
  return state.seats
    .filter(seat => seat.isActive && (seat.hands[0]?.bet ?? 0) > 0)
    .map(seat => ({
      seatId: seat.id,
      main: seat.hands[0].bet,
      sideBets: seat.sideBets,
    }));
}

function serverAction(action: GameAction) {
  switch (action.type) {
    case 'HIT': return { type: 'hit', seatId: action.seatId, handId: action.handId };
    case 'STAND': return { type: 'stand', seatId: action.seatId, handId: action.handId };
    case 'DOUBLE': return { type: 'double', seatId: action.seatId, handId: action.handId };
    case 'SPLIT': return { type: 'split', seatId: action.seatId, handId: action.handId };
    case 'SURRENDER': return { type: 'surrender', seatId: action.seatId, handId: action.handId };
    case 'INSURANCE': return { type: 'insurance', seatId: action.seatId };
    case 'DECLINE_INSURANCE': return { type: 'decline_insurance', seatId: action.seatId };
    default: return null;
  }
}

export function useServerGame(
  table: TableConfig,
  balance: number,
  enabled: boolean,
  onBalance: (balance: number) => void,
) {
  const [state, setReactState] = useState(() => createInitialState(table, balance));
  const [error, setError] = useState('');
  const [serverReady, setServerReady] = useState(!enabled);
  const stateRef = useRef(state);
  const sessionRef = useRef<SessionRef | null>(null);
  const sessionPromiseRef = useRef<Promise<SessionRef> | null>(null);
  const initialStoredSessionRef = useRef(readStoredSession(table.id));
  const storedSessionIdRef = useRef<string | null>(initialStoredSessionRef.current?.id ?? null);
  const sessionRequestIdRef = useRef(initialStoredSessionRef.current?.requestId ?? requestId('table'));
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const updateState = useCallback((next: GameState) => {
    stateRef.current = next;
    if (mountedRef.current) setReactState(next);
  }, []);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    const next = createInitialState(table, balance);
    stateRef.current = next;
    setReactState(next);
    sessionRef.current = null;
    sessionPromiseRef.current = null;
    const stored = readStoredSession(table.id);
    storedSessionIdRef.current = stored?.id ?? null;
    sessionRequestIdRef.current = stored?.requestId ?? requestId('table');
    inFlightRef.current = false;
    setServerReady(!enabled);
    setError('');
  }, [table.id]);

  useEffect(() => {
    if (!enabled) return;
    const current = stateRef.current;
    const hasBets = current.seats.some(seat => seat.hands.some(hand => hand.bet > 0));
    if (!inFlightRef.current && !hasBets && (current.phase === 'SEAT_SELECTION' || current.phase === 'BETTING')) {
      updateState({ ...current, bankroll: balance });
    }
  }, [balance, enabled, updateState]);

  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;
    const promise = (async () => {
      const storedId = storedSessionIdRef.current;
      if (storedId) {
        try {
          const response = await apiRequest<GameResponse>(`/games/sessions/${storedId}`);
          const session = { id: response.sessionId, version: response.version };
          sessionRef.current = session;
          writeStoredSession(table.id, { id: session.id, requestId: sessionRequestIdRef.current });
          updateState(hydratePublicGame(response.game, response.balance, stateRef.current));
          onBalance(response.balance);
          setServerReady(true);
          return session;
        } catch (reason) {
          if ((reason as Error & { status?: number }).status !== 404) throw reason;
          storedSessionIdRef.current = null;
        }
      }

      writeStoredSession(table.id, { requestId: sessionRequestIdRef.current });
      const response = await apiRequest<GameResponse>('/games/sessions', {
        method: 'POST',
        body: JSON.stringify({ tableId: table.id, requestId: sessionRequestIdRef.current }),
      });
      const session = { id: response.sessionId, version: response.version };
      sessionRef.current = session;
      storedSessionIdRef.current = session.id;
      writeStoredSession(table.id, { id: session.id, requestId: sessionRequestIdRef.current });
      setServerReady(true);
      return session;
    })().finally(() => { sessionPromiseRef.current = null; });
    sessionPromiseRef.current = promise;
    return promise;
  }, [onBalance, table.id, updateState]);

  useEffect(() => {
    if (!enabled) return;
    void ensureSession().catch(reason => setError(reason instanceof Error ? reason.message : 'Could not connect to the game server.'));
  }, [enabled, ensureSession]);

  const playResponse = useCallback(async (response: GameResponse, base: GameState, opening: boolean) => {
    sessionRef.current = { id: response.sessionId, version: response.version };
    writeStoredSession(table.id, { id: response.sessionId, requestId: sessionRequestIdRef.current });
    let animated = opening ? openingAnimationState(response, base) : actionAnimationState(response, base);
    updateState(animated);
    let lastEventWasCard = false;

    for (const event of response.events) {
      if (!mountedRef.current) return;
      if (event.type === 'card_dealt') {
        if (event.to === 'dealer') {
          animated = { ...animated, dealerCards: [...animated.dealerCards, event.card] };
        } else {
          animated = {
            ...animated,
            seats: animated.seats.map(seat => seat.id !== event.seatId ? seat : {
              ...seat,
              hands: seat.hands.map(hand => hand.id !== event.handId ? hand : { ...hand, cards: [...hand.cards, event.card] }),
            }),
          };
        }
        updateState(animated);
        await sleep(event.to === 'dealer'
          ? (event.hole ? 950 : animated.phase === 'DEALER_TURN' ? 1_200 : 720)
          : opening ? 720 : 900);
        lastEventWasCard = true;
      } else if (event.type === 'dealer_hole_revealed') {
        animated = {
          ...animated,
          phase: 'DEALER_TURN',
          dealerCards: animated.dealerCards.map((card, index) => index === 1 ? event.card : card),
        };
        updateState(animated);
        await sleep(760);
        lastEventWasCard = false;
      } else if (event.type === 'settled') {
        await sleep(lastEventWasCard ? 180 : 900);
        lastEventWasCard = false;
      }
    }

    const finalState = hydratePublicGame(response.game, response.balance, animated);
    updateState(finalState);
    onBalance(response.balance);
  }, [onBalance, table.id, updateState]);

  const recoverSession = useCallback(async (fallback: GameState, sentVersion: number, failureMessage: string) => {
    const session = sessionRef.current;
    if (!session) {
      updateState(fallback);
      setError(failureMessage);
      return;
    }
    try {
      const response = await apiRequest<GameResponse>(`/games/sessions/${session.id}`);
      sessionRef.current = { id: response.sessionId, version: response.version };
      writeStoredSession(table.id, { id: response.sessionId, requestId: sessionRequestIdRef.current });
      if (response.version === sentVersion) {
        updateState(fallback);
        setError(failureMessage);
        return;
      }
      updateState(hydratePublicGame(response.game, response.balance, fallback));
      onBalance(response.balance);
      setError('');
    } catch {
      updateState(fallback);
      setError(failureMessage);
    }
  }, [onBalance, table.id, updateState]);

  const dispatch = useCallback((action: GameAction) => {
    if (!enabled) {
      updateState(gameReducer(stateRef.current, action));
      return;
    }

    if (!serverReady) return;

    const current = stateRef.current;
    const remoteAction = serverAction(action);
    const localOnly = ['SIT', 'LEAVE', 'SELECT_BET_SEAT', 'PLACE_BET', 'PLACE_SIDE_BET', 'CLEAR_BETS', 'REPEAT_BET', 'NEXT_ROUND', 'ADD_BANKROLL'];
    if (localOnly.includes(action.type)) {
      if (inFlightRef.current) return;
      let next = gameReducer(current, action);
      if (action.type === 'NEXT_ROUND' && next.phase === 'SHUFFLING') {
        next = { ...next, phase: 'BETTING', shuffleStage: undefined, actionLocked: false };
      }
      updateState(next);
      return;
    }
    if (['CARD_DEALT', 'CHECK_DEALER_BJ', 'START_PLAYER_TURN', 'SPLIT_CARD', 'PLAYER_CARD_LANDED', 'NEXT_HAND', 'DEALER_TURN', 'DEALER_PLAY', 'PERFORM_SETTLEMENT', 'SETTLEMENT', 'RESHUFFLE', 'SHUFFLE_COMPLETE'].includes(action.type)) {
      return;
    }
    if (inFlightRef.current) return;

    if (action.type === 'DEAL') {
      if (current.phase !== 'BETTING') return;
      inFlightRef.current = true;
      setError('');
      const bets = extractBets(current);
      const dealing = gameReducer(current, action);
      updateState({ ...dealing, actionLocked: true });
      void (async () => {
        let sentVersion = -1;
        try {
          const session = await ensureSession();
          sentVersion = session.version;
          const response = await apiRequest<GameResponse>(`/games/${session.id}/rounds`, {
            method: 'POST',
            body: JSON.stringify({ requestId: requestId('round'), expectedVersion: sentVersion, bets }),
          });
          await playResponse(response, dealing, true);
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : 'The round could not be started.';
          await recoverSession(current, sentVersion, message);
        } finally {
          inFlightRef.current = false;
        }
      })();
      return;
    }

    if (!remoteAction || current.actionLocked) return;
    inFlightRef.current = true;
    setError('');
    updateState({ ...current, actionLocked: true });
    void (async () => {
      let sentVersion = -1;
      try {
        const session = await ensureSession();
        sentVersion = session.version;
        const response = await apiRequest<GameResponse>(`/games/${session.id}/actions`, {
          method: 'POST',
          body: JSON.stringify({ requestId: requestId('action'), expectedVersion: sentVersion, action: remoteAction }),
        });
        await playResponse(response, current, false);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'The action could not be completed.';
        await recoverSession(current, sentVersion, message);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [enabled, ensureSession, playResponse, recoverSession, serverReady, updateState]);

  return { state, dispatch, error, connected: serverReady };
}
