import {
  TABLES,
  calculateHandValue,
  createInitialState,
  gameReducer,
  type Card,
  type GameAction,
  type GameState,
  type Hand,
  type Seat,
  type SideBets,
  type TableConfig,
} from '@workspace/blackjack-engine';

export type PlayerGameAction =
  | { type: 'hit'; seatId: number; handId: string }
  | { type: 'stand'; seatId: number; handId: string }
  | { type: 'double'; seatId: number; handId: string }
  | { type: 'split'; seatId: number; handId: string }
  | { type: 'surrender'; seatId: number; handId: string }
  | { type: 'insurance'; seatId: number }
  | { type: 'decline_insurance'; seatId: number };

export interface SeatBet {
  seatId: number;
  main: number;
  sideBets?: Partial<SideBets>;
}

export type GameEvent =
  | { type: 'card_dealt'; to: 'player'; seatId: number; handId: string; card: Card }
  | { type: 'card_dealt'; to: 'dealer'; card: Card; hole: boolean }
  | { type: 'dealer_hole_revealed'; card: Card }
  | { type: 'phase_changed'; phase: GameState['phase'] }
  | { type: 'settled' };

export interface PublicDealerCard extends Card {
  hidden?: boolean;
}

function hiddenCard(card: Card): PublicDealerCard {
  return {
    id: 'dealer-hole-hidden',
    shoeId: 'hidden',
    deckIndex: 0,
    rank: '2',
    suit: 'spades',
    value: 0,
    hidden: true,
  };
}

export interface PublicGameState {
  phase: GameState['phase'];
  table: TableConfig;
  seats: Seat[];
  dealerCards: PublicDealerCard[];
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

export class GameRuleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GameRuleError';
    this.code = code;
  }
}

function dispatch(state: GameState, action: GameAction): GameState {
  return gameReducer(state, action);
}

function tableById(tableId: string) {
  const table = TABLES.find(candidate => candidate.id === tableId);
  if (!table) throw new GameRuleError('TABLE_NOT_FOUND', 'That blackjack table does not exist.');
  return table;
}

function assertChipAmount(value: number, label: string, allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new GameRuleError('INVALID_BET', `${label} must be a whole-chip amount.`);
  }
}

function validateBets(table: TableConfig, bets: SeatBet[], balance: number) {
  if (!Array.isArray(bets) || bets.length === 0) {
    throw new GameRuleError('BET_REQUIRED', 'Place at least one main bet before dealing.');
  }
  const seatIds = new Set<number>();
  let wager = 0;

  for (const bet of bets) {
    if (!Number.isSafeInteger(bet.seatId) || bet.seatId < 0 || bet.seatId >= table.seats) {
      throw new GameRuleError('INVALID_SEAT', 'One of the selected seats is invalid.');
    }
    if (seatIds.has(bet.seatId)) {
      throw new GameRuleError('DUPLICATE_SEAT', 'Each seat may appear only once.');
    }
    seatIds.add(bet.seatId);
    assertChipAmount(bet.main, 'Main bet');
    if (bet.main < table.minBet || bet.main > table.maxBet) {
      throw new GameRuleError('BET_OUT_OF_RANGE', `Main bets at this table must be ${table.minBet}-${table.maxBet} chips.`);
    }
    wager += bet.main;

    for (const [name, rawAmount] of Object.entries(bet.sideBets ?? {})) {
      if (!table.sideBets.includes(name) || name === 'insurance') {
        throw new GameRuleError('SIDE_BET_NOT_ALLOWED', `${name} is not offered at this table.`);
      }
      const amount = rawAmount ?? 0;
      assertChipAmount(amount, `${name} side bet`, true);
      if (amount > table.maxBet) {
        throw new GameRuleError('SIDE_BET_OUT_OF_RANGE', 'A side bet cannot exceed the table maximum.');
      }
      wager += amount;
    }
  }

  if (wager > balance) {
    throw new GameRuleError('INSUFFICIENT_CHIPS', 'The wallet does not have enough chips for these bets.');
  }
  return wager;
}

function prepareBettingState(state: GameState, balance: number) {
  let next = state;
  if (next.phase === 'SETTLEMENT' && next.settled) next = dispatch(next, { type: 'NEXT_ROUND' });
  if (next.phase === 'SHUFFLING') {
    next = dispatch(next, { type: 'RESHUFFLE' });
    next = dispatch(next, { type: 'RESHUFFLE' });
    next = dispatch(next, { type: 'SHUFFLE_COMPLETE' });
  }
  if (next.phase !== 'SEAT_SELECTION' && next.phase !== 'BETTING') {
    throw new GameRuleError('ROUND_IN_PROGRESS', 'Finish the current round before starting another one.');
  }

  // A hosted wallet can change between rounds (daily reward or purchase).
  return { ...next, bankroll: balance };
}

function lastPlayerCard(state: GameState, seatId: number) {
  const seat = state.seats[seatId];
  const hand = seat?.hands[seat.activeHandIndex];
  const card = hand?.cards.at(-1);
  if (!hand || !card) throw new GameRuleError('CARD_DEAL_FAILED', 'The server could not deal the requested card.');
  return { hand, card };
}

function recordPlayerCard(events: GameEvent[], state: GameState, seatId: number) {
  const { hand, card } = lastPlayerCard(state, seatId);
  events.push({ type: 'card_dealt', to: 'player', seatId, handId: hand.id, card });
}

function landPlayerCard(state: GameState, seatId: number) {
  const { hand, card } = lastPlayerCard(state, seatId);
  return dispatch(state, {
    type: 'PLAYER_CARD_LANDED',
    seatId,
    handId: hand.id,
    cardId: card.id,
  });
}

function completeAutomaticPlay(state: GameState, events: GameEvent[]) {
  let next = state;

  // A stand, bust or completed split can expose another one-card split hand.
  while (next.phase === 'SPLIT_DEALING') {
    const seatId = next.activeSeatIndex;
    const beforeCount = next.seats[seatId]?.hands[next.splitCardTarget ?? -1]?.cards.length ?? 0;
    next = dispatch(next, { type: 'SPLIT_CARD' });
    const hand = next.seats[seatId]?.hands[next.seats[seatId].activeHandIndex];
    if (!hand || hand.cards.length === beforeCount) {
      throw new GameRuleError('CARD_DEAL_FAILED', 'The server could not complete the split deal.');
    }
    recordPlayerCard(events, next, seatId);
    next = landPlayerCard(next, seatId);
    if (next.phase === 'PLAYER_TURN') break;
  }

  if (next.phase === 'DEALER_TURN') {
    if (next.dealerCards[1]) events.push({ type: 'dealer_hole_revealed', card: next.dealerCards[1] });
    while (next.phase === 'DEALER_TURN') {
      const before = next.dealerCards.length;
      next = dispatch(next, { type: 'DEALER_PLAY' });
      if (next.dealerCards.length > before) {
        events.push({
          type: 'card_dealt',
          to: 'dealer',
          card: next.dealerCards.at(-1)!,
          hole: false,
        });
      }
    }
  }

  if (next.phase === 'SETTLEMENT' && !next.settled) {
    next = dispatch(next, { type: 'PERFORM_SETTLEMENT' });
    events.push({ type: 'settled' });
  }
  return next;
}

export function createServerGame(tableId: string, balance: number) {
  assertChipAmount(balance, 'Wallet balance', true);
  return createInitialState(tableById(tableId), balance);
}

export function committedWager(state: GameState) {
  return state.seats.reduce((total, seat) => {
    if (!seat.isActive) return total;
    const main = seat.hands.reduce((sum, hand) => sum + hand.bet, 0);
    const side = Object.values(seat.sideBets).reduce((sum, amount) => sum + (amount ?? 0), 0);
    return total + main + side;
  }, 0);
}

export function startServerRound(state: GameState, bets: SeatBet[], balance: number) {
  let next = prepareBettingState(state, balance);
  const wager = validateBets(next.table, bets, balance);

  // Seats are server-owned. Do not inherit a previous browser selection.
  next = {
    ...next,
    seats: next.seats.map(seat => ({
      ...seat,
      isActive: false,
      hands: [],
      activeHandIndex: 0,
      sideBets: {},
      sideBetResults: [],
    })),
    phase: 'SEAT_SELECTION',
    bettingSeatId: undefined,
  };

  for (const bet of [...bets].sort((a, b) => a.seatId - b.seatId)) {
    next = dispatch(next, { type: 'SIT', seatId: bet.seatId });
    next = dispatch(next, { type: 'PLACE_BET', seatId: bet.seatId, amount: bet.main });
    for (const [betType, amount] of Object.entries(bet.sideBets ?? {})) {
      if (!amount) continue;
      next = dispatch(next, {
        type: 'PLACE_SIDE_BET',
        seatId: bet.seatId,
        betType: betType as keyof SideBets,
        amount,
      });
    }
  }
  if (committedWager(next) !== wager) {
    throw new GameRuleError('BET_VALIDATION_FAILED', 'The accepted wager did not match the requested wager.');
  }

  next = dispatch(next, { type: 'DEAL' });
  const sequence = next.dealSequence;
  const activeSeats = next.seats.filter(seat => seat.isActive && seat.hands.length > 0);
  const events: GameEvent[] = [];

  for (let pass = 0; pass < 2; pass += 1) {
    for (const seat of activeSeats) {
      next = dispatch(next, { type: 'CARD_DEALT', to: 'player', seatId: seat.id, dealSequence: sequence });
      recordPlayerCard(events, next, seat.id);
    }
    next = dispatch(next, { type: 'CARD_DEALT', to: 'dealer', dealSequence: sequence });
    events.push({
      type: 'card_dealt',
      to: 'dealer',
      card: next.dealerCards.at(-1)!,
      hole: pass === 1,
    });
  }

  next = dispatch(next, { type: 'CHECK_DEALER_BJ', dealSequence: sequence });
  next = completeAutomaticPlay(next, events);
  events.push({ type: 'phase_changed', phase: next.phase });
  return { state: next, wager, events };
}

function mapPlayerAction(action: PlayerGameAction): GameAction {
  switch (action.type) {
    case 'hit': return { type: 'HIT', seatId: action.seatId, handId: action.handId };
    case 'stand': return { type: 'STAND', seatId: action.seatId, handId: action.handId };
    case 'double': return { type: 'DOUBLE', seatId: action.seatId, handId: action.handId };
    case 'split': return { type: 'SPLIT', seatId: action.seatId, handId: action.handId };
    case 'surrender': return { type: 'SURRENDER', seatId: action.seatId, handId: action.handId };
    case 'insurance': return { type: 'INSURANCE', seatId: action.seatId };
    case 'decline_insurance': return { type: 'DECLINE_INSURANCE', seatId: action.seatId };
  }
}

export function applyServerAction(state: GameState, action: PlayerGameAction) {
  const beforeWager = committedWager(state);
  const before = state;
  let next = dispatch(state, mapPlayerAction(action));
  if (next === before) {
    throw new GameRuleError('ACTION_NOT_ALLOWED', 'That action is not allowed for the active hand.');
  }

  const events: GameEvent[] = [];
  if (action.type === 'hit' || action.type === 'double') {
    recordPlayerCard(events, next, action.seatId);
    next = landPlayerCard(next, action.seatId);
  }
  next = completeAutomaticPlay(next, events);
  events.push({ type: 'phase_changed', phase: next.phase });

  return {
    state: next,
    additionalWager: committedWager(next) - beforeWager,
    events,
  };
}

export function toPublicGameState(state: GameState): PublicGameState {
  const revealHole = state.phase === 'DEALER_TURN' || state.phase === 'SETTLEMENT' || state.dealerStatus === 'blackjack';
  return {
    phase: state.phase,
    table: state.table,
    seats: state.seats,
    dealerCards: state.dealerCards.map((card, index) => index === 1 && !revealHole
      ? hiddenCard(card)
      : card),
    dealerStatus: state.dealerStatus,
    settled: state.settled,
    activeSeatIndex: state.activeSeatIndex,
    needsShuffle: state.needsShuffle,
    shoeNumber: state.shoeNumber,
    cardsRemaining: state.shoe.length,
    cardsDiscarded: state.discard.length,
    cutCardIndex: state.cutCardIndex,
    actionLocked: false,
    bankroll: state.bankroll,
  };
}

export function toPublicGameEvents(events: GameEvent[], state: GameState): GameEvent[] {
  const revealHole = state.phase === 'DEALER_TURN' || state.phase === 'SETTLEMENT' || state.dealerStatus === 'blackjack';
  return events.map(event => event.type === 'card_dealt' && event.to === 'dealer' && event.hole && !revealHole
    ? { ...event, card: hiddenCard(event.card) }
    : event);
}

export function visibleDealerValue(state: PublicGameState) {
  return calculateHandValue(state.dealerCards.filter(card => !card.hidden)).total;
}

export function activeHand(state: GameState): Hand | null {
  const seat = state.seats[state.activeSeatIndex];
  return seat?.hands[seat.activeHandIndex] ?? null;
}
