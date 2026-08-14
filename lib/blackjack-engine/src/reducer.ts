import type { CardIntegrity, GameState, GameAction } from './types.ts';
import type { TableConfig, Card, Hand, Seat } from './blackjack.ts';
import {
  calculateHandValue, isBlackjack, buildShoe, shuffle,
  createGameId, randomPenetration,
  evaluateBustIt, evaluate21Plus3, evaluateLuckyLadies, evaluateLuckyLucky,
  evaluatePerfectPairs, evaluateRoyalMatch, evaluateSuperSevens
} from './blackjack.ts';

function prepareFreshShoe(table: TableConfig, shoeNumber: number): {
  shoe: Card[];
  discard: Card[];
  cutCardIndex: number;
  penetration: number;
  lastBurnCardId?: string;
} {
  const shoeId = `${table.id}-${shoeNumber}-${createGameId('shoe')}`;
  const shoe = shuffle(buildShoe(table.decks, shoeId));
  const penetration = randomPenetration(table.rules.penetration);
  const cutCardIndex = Math.max(1, shoe.length - Math.floor(shoe.length * penetration));
  const discard: Card[] = [];

  for (let i = 0; i < table.rules.burnCards; i++) {
    const burn = shoe.pop();
    if (burn) discard.push(burn);
  }

  return {
    shoe,
    discard,
    cutCardIndex,
    penetration,
    lastBurnCardId: discard.at(-1)?.id,
  };
}

function inspectCardIntegrity(state: Pick<GameState, 'table' | 'shoe' | 'discard' | 'dealerCards' | 'seats'>): CardIntegrity {
  const cards = [
    ...state.shoe,
    ...state.discard,
    ...state.dealerCards,
    ...state.seats.flatMap(seat => seat.hands.flatMap(hand => hand.cards)),
  ];
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) duplicateIds.push(card.id);
    seen.add(card.id);
  }
  const expected = state.table.decks * 52;
  return {
    valid: cards.length === expected && duplicateIds.length === 0,
    total: cards.length,
    expected,
    duplicateIds,
  };
}

function withCardIntegrity(state: GameState): GameState {
  const cardIntegrity = inspectCardIntegrity(state);
  if (!cardIntegrity.valid) {
    console.error('Blackjack shoe integrity failure', cardIntegrity);
  }
  return { ...state, cardIntegrity };
}

export function createInitialState(table: TableConfig, initialBankroll: number): GameState {
  const seats: Seat[] = Array.from({ length: table.seats }, (_, i) => ({
    id: i,
    isActive: false,
    hands: [],
    activeHandIndex: 0,
    sideBets: {},
    sideBetResults: [],
  }));
  const fresh = prepareFreshShoe(table, 1);
  return withCardIntegrity({
    phase: 'SEAT_SELECTION',
    table,
    shoe: fresh.shoe,
    discard: fresh.discard,
    seats,
    dealerCards: [],
    dealerStatus: 'playing',
    activeSeatIndex: -1,
    cutCardIndex: fresh.cutCardIndex,
    penetration: fresh.penetration,
    needsShuffle: false,
    shoeNumber: 1,
    lastBurnCardId: fresh.lastBurnCardId,
    cardIntegrity: { valid: true, total: table.decks * 52, expected: table.decks * 52, duplicateIds: [] },
    dealSequence: 0,
    actionLocked: false,
    settled: false,
    bankroll: initialBankroll,
    bettingSeatId: undefined,
  });
}

type ExtendedAction = GameAction
  | { type: 'PERFORM_SETTLEMENT' }
  | { type: 'DEALER_PLAY' };

function reduceGameState(state: GameState, action: ExtendedAction): GameState {
  switch (action.type) {
    // ── Seat management ──────────────────────────────────────────────────────
    case 'SIT': {
      if (state.phase !== 'SEAT_SELECTION' && state.phase !== 'BETTING') return state;
      const s = { ...state, seats: [...state.seats] };
      s.seats[action.seatId] = { ...s.seats[action.seatId], isActive: true };
      if (s.phase === 'SEAT_SELECTION') {
        s.phase = 'BETTING';
        s.bettingSeatId = action.seatId;
      }
      return s;
    }
    case 'LEAVE': {
      if (state.phase !== 'SEAT_SELECTION' && state.phase !== 'BETTING') return state;
      const s = { ...state, seats: [...state.seats] };
      const seat = s.seats[action.seatId];
      // Return un-deducted bet to bankroll
      const returnBet = seat.hands[0]?.bet || 0;
      const returnSide = Object.values(seat.sideBets).reduce((a: number, b) => a + (b as number), 0);
      s.bankroll += returnBet + returnSide;
      s.seats[action.seatId] = { ...seat, isActive: false, hands: [], sideBets: {}, sideBetResults: [] };
      if (s.seats.every(st => !st.isActive)) s.phase = 'SEAT_SELECTION';
      return s;
    }
    case 'SELECT_BET_SEAT': {
      if (state.phase !== 'SEAT_SELECTION' && state.phase !== 'BETTING') return state;
      return { ...state, bettingSeatId: action.seatId };
    }

    // ── Betting ──────────────────────────────────────────────────────────────
    case 'PLACE_BET': {
      const { seatId, amount } = action;
      if (state.phase !== 'BETTING' || !state.seats[seatId]?.isActive) return state;
      if (state.bankroll < amount) return state;
      const s = { ...state, seats: [...state.seats], bankroll: state.bankroll - amount };
      const seat = { ...s.seats[seatId] };
      const currentBet = seat.hands[0]?.bet || 0;
      seat.hands = [{
        id: seat.hands[0]?.id || createGameId('hand'),
        cards: [],
        bet: currentBet + amount,
        status: 'playing',
        isSplit: false,
        doubled: false,
      }];
      s.seats[seatId] = seat;
      return s;
    }
    case 'PLACE_SIDE_BET': {
      const { seatId, betType, amount } = action;
      if (state.phase !== 'BETTING' || !state.seats[seatId]?.isActive) return state;
      if (state.bankroll < amount) return state;
      const s = { ...state, seats: [...state.seats], bankroll: state.bankroll - amount };
      const seat = { ...s.seats[seatId], sideBets: { ...s.seats[seatId].sideBets } };
      seat.sideBets[betType] = ((seat.sideBets[betType] || 0) as number) + amount;
      s.seats[seatId] = seat;
      return s;
    }
    case 'REMOVE_LAST_BET': {
      return state; // handled by CLEAR_BETS
    }
    case 'CLEAR_BETS': {
      if (state.phase !== 'BETTING') return state;
      let returned = 0;
      const seats = state.seats.map(seat => {
        if (!seat.isActive) return seat;
        returned += (seat.hands[0]?.bet || 0);
        returned += Object.values(seat.sideBets).reduce((a: number, b) => a + (b as number), 0);
        return { ...seat, hands: [], sideBets: {}, sideBetResults: [] };
      });
      return { ...state, seats, bankroll: state.bankroll + returned };
    }

    // ── Dealing ──────────────────────────────────────────────────────────────
    case 'REPEAT_BET': {
      if (state.phase !== 'BETTING') return state;
      if (!state.lastBets) return state;
      const rb = state.lastBets;
      // Calculate total cost
      let cost = 0;
      state.seats.forEach((seat, i) => {
        if (!seat.isActive) return;
        cost += rb.main[i] ?? 0;
        cost += Object.values(rb.side[i] ?? {}).reduce((a: number, b) => a + (b as number), 0);
      });
      if (state.bankroll < cost) return state;
      const s = { ...state, seats: [...state.seats], bankroll: state.bankroll - cost };
      s.seats = s.seats.map((seat, i) => {
        if (!seat.isActive) return seat;
        const mainBet = rb.main[i] ?? 0;
        const sideBets = { ...(rb.side[i] ?? {}) } as any;
        if (mainBet === 0) return seat;
        return {
          ...seat,
          sideBets,
          hands: [{
            id: createGameId('hand'),
            cards: [],
            bet: mainBet,
            status: 'playing' as const,
            isSplit: false,
            doubled: false,
          }],
        };
      });
      // Clear lastBets so a second Repeat click is a no-op (no double-charge)
      s.lastBets = undefined;
      return s;
    }

    case 'DEAL': {
      // A fading betting panel may still receive a rapid second click. Never
      // let that duplicate DEAL reset cards that the active sequence just drew.
      if (state.phase !== 'BETTING') return state;
      if (!state.seats.some(seat => seat.isActive && (seat.hands[0]?.bet ?? 0) > 0)) return state;
      // Snapshot bets for Repeat Bet before dealing
      const lastBets: GameState['lastBets'] = { main: {}, side: {} };
      state.seats.forEach((seat, i) => {
        if (seat.isActive && (seat.hands[0]?.bet ?? 0) > 0) {
          lastBets!.main[i] = seat.hands[0].bet;
          lastBets!.side[i] = { ...(seat.sideBets as any) };
        }
      });

      // Reset dealer, keep seat bets, transition to DEALING
      return {
        ...state,
        lastBets,
        phase: 'DEALING',
        dealSequence: state.dealSequence + 1,
        dealerCards: [],
        dealerStatus: 'playing',
        settled: false,
        actionLocked: false,
        pendingTurnAdvance: false,
        activeSeatIndex: -1,
        seats: state.seats.map(seat => {
          if (!seat.isActive) return seat;
          const bet = seat.hands[0]?.bet || 0;
          if (bet === 0) return seat;
          return {
            ...seat,
            activeHandIndex: 0,
            sideBetResults: [],
            hands: [{
              id: createGameId('hand'),
              cards: [],
              bet,
              status: 'playing',
              isSplit: false,
              doubled: false,
            }],
          };
        }),
      };
    }
    case 'CARD_DEALT': {
      if (state.phase !== 'DEALING' || action.dealSequence !== state.dealSequence) return state;
      const s = { ...state, shoe: [...state.shoe] };
      const card = s.shoe.pop();
      if (!card) return s;
      if (s.shoe.length <= s.cutCardIndex) s.needsShuffle = true;
      s.seats = [...s.seats];

      if (action.to === 'dealer') {
        s.dealerCards = [...s.dealerCards, card];
      } else if (action.to === 'player' && action.seatId !== undefined) {
        const sid = action.seatId;
        const seat = { ...s.seats[sid], hands: [...s.seats[sid].hands] };
        const hi = seat.activeHandIndex;
        const hand = { ...seat.hands[hi], cards: [...seat.hands[hi].cards, card] };
        seat.hands[hi] = hand;
        s.seats[sid] = seat;

        if (s.phase === 'PLAYER_TURN') {
          const val = calculateHandValue(hand.cards);
          if (val.total > 21) {
            hand.status = 'busted';
            seat.hands[hi] = hand;
            s.seats[sid] = seat;
            return moveToNextHand(s);
          }
          if (val.total === 21) {
            hand.status = 'stood';
            seat.hands[hi] = hand;
            s.seats[sid] = seat;
            return moveToNextHand(s);
          }
        }
      }
      return s;
    }

    // ── Dealer BJ check / insurance ──────────────────────────────────────────
    case 'CHECK_DEALER_BJ': {
      if (state.phase !== 'DEALING' || action.dealSequence !== state.dealSequence) return state;
      const incompletePlayerHand = state.seats.some(
        seat => seat.isActive && seat.hands.length > 0 && seat.hands[0].cards.length !== 2,
      );
      if (state.dealerCards.length !== 2 || incompletePlayerHand) return state;
      const s = { ...state };
      const upcard = s.dealerCards[0];
      if (upcard?.rank === 'A') {
        s.phase = 'INSURANCE';
        s.activeSeatIndex = s.seats.findIndex(st => st.isActive && st.hands.length > 0);
        return s;
      }
      // Peek on 10-value: if dealer has BJ go straight to settlement
      if (upcard?.value === 10 && isBlackjack(s.dealerCards)) {
        s.dealerStatus = 'blackjack';
        s.phase = 'SETTLEMENT';
        return s;
      }
      // Auto-stand all natural BJ hands, pay immediate side bet bonuses, start player turn
      s.seats = autoStandBlackjacks(s.seats);
      s.phase = 'PLAYER_TURN';
      const withBonuses = evaluateImmediateSideBets(s as GameState);
      withBonuses.activeSeatIndex = findRightmostActive(withBonuses.seats);
      if (withBonuses.activeSeatIndex === -1) withBonuses.phase = 'DEALER_TURN';
      return checkAllDone(withBonuses);
    }
    case 'INSURANCE': {
      if (state.phase !== 'INSURANCE' || action.seatId !== state.activeSeatIndex) return state;
      const s = { ...state, seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex] };
      const insAmount = Math.floor((seat.hands[0]?.bet || 0) / 2);
      if (s.bankroll < insAmount || insAmount === 0) return moveToNextInsurance(s);
      s.bankroll -= insAmount;
      seat.sideBets = { ...seat.sideBets, insurance: insAmount };
      s.seats[s.activeSeatIndex] = seat;
      return moveToNextInsurance(s);
    }
    case 'DECLINE_INSURANCE': {
      if (state.phase !== 'INSURANCE' || action.seatId !== state.activeSeatIndex) return state;
      return moveToNextInsurance({ ...state });
    }

    // ── Player actions ────────────────────────────────────────────────────────
    case 'HIT': {
      if (!canActOnHand(state, action.seatId, action.handId)) return state;
      const s = { ...state, shoe: [...state.shoe], seats: [...state.seats] };
      const card = s.shoe.pop();
      if (!card) return s;
      if (s.shoe.length <= s.cutCardIndex) s.needsShuffle = true;

      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const hi = seat.activeHandIndex;
      const hand = { ...seat.hands[hi], cards: [...seat.hands[hi].cards, card] };
      const val = calculateHandValue(hand.cards);

      if (val.total > 21) hand.status = 'busted';
      else if (val.total === 21) hand.status = 'stood';

      seat.hands[hi] = hand;
      s.seats[s.activeSeatIndex] = seat;

      return {
        ...s,
        actionLocked: true,
        pendingTurnAdvance: hand.status !== 'playing',
      };
    }
    case 'STAND': {
      if (!canActOnHand(state, action.seatId, action.handId)) return state;
      const s = { ...state, seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      seat.hands[seat.activeHandIndex] = { ...seat.hands[seat.activeHandIndex], status: 'stood' };
      s.seats[s.activeSeatIndex] = seat;
      return moveToNextHand(s);
    }
    case 'DOUBLE': {
      if (!canActOnHand(state, action.seatId, action.handId)) return state;
      const s = { ...state, shoe: [...state.shoe], seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const hi = seat.activeHandIndex;
      const hand = seat.hands[hi];
      const rules = s.table.rules;
      if (
        s.bankroll < hand.bet ||
        (rules.doubleOnFirstTwoOnly && hand.cards.length !== 2) ||
        (hand.isSplit && !rules.doubleAfterSplit)
      ) return state;

      s.bankroll -= hand.bet;
      const card = s.shoe.pop();
      if (!card) { s.bankroll += hand.bet; return s; }
      if (s.shoe.length <= s.cutCardIndex) s.needsShuffle = true;

      const newCards = [...hand.cards, card];
      const val = calculateHandValue(newCards);
      seat.hands[hi] = {
        ...hand,
        bet: hand.bet * 2,
        doubled: true,
        cards: newCards,
        status: val.total > 21 ? 'busted' : 'stood',
      };
      s.seats[s.activeSeatIndex] = seat;
      return { ...s, actionLocked: true, pendingTurnAdvance: true };
    }
    case 'SPLIT': {
      if (!canActOnHand(state, action.seatId, action.handId)) return state;
      const s = { ...state, shoe: [...state.shoe], seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const hi = seat.activeHandIndex;
      const hand = seat.hands[hi];

      if (
        s.bankroll < hand.bet ||
        hand.cards.length !== 2 ||
        (s.table.rules.splitByValue
          ? hand.cards[0].value !== hand.cards[1].value
          : hand.cards[0].rank !== hand.cards[1].rank) ||
        seat.hands.length >= s.table.rules.maxSplitHands ||
        (hand.cards[0].rank === 'A' && hand.isSplit && !s.table.rules.resplitAces)
      ) return state;

      s.bankroll -= hand.bet;

      // Create two one-card hands. Only the active hand receives a card now.
      const hand1: Hand = {
        id: createGameId('hand'),
        cards: [hand.cards[0]],
        bet: hand.bet,
        status: 'playing',
        isSplit: true,
        doubled: false,
      };
      const hand2: Hand = {
        id: createGameId('hand'),
        cards: [hand.cards[1]],
        bet: hand.bet,
        status: 'playing',
        isSplit: true,
        doubled: false,
      };

      seat.hands.splice(hi, 1, hand1, hand2);
      s.seats[s.activeSeatIndex] = seat;

      // Complete the first split hand before dealing to the second.
      return { ...s, phase: 'SPLIT_DEALING', splitCardTarget: hi, actionLocked: true };
    }

    case 'SPLIT_CARD': {
      if (state.phase !== 'SPLIT_DEALING' || state.splitCardTarget === undefined) return state;
      const s = { ...state, shoe: [...state.shoe], seats: [...state.seats] };
      const targetHandIdx = state.splitCardTarget;
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const sourceHand = seat.hands[targetHandIdx];
      if (!sourceHand || sourceHand.cards.length !== 1) return state;
      const isSplitAces = sourceHand.isSplit && sourceHand.cards[0]?.rank === 'A';

      const card = s.shoe.pop();
      if (!card) return s;
      if (s.shoe.length <= s.cutCardIndex) s.needsShuffle = true;

      const hand = { ...sourceHand, cards: [...sourceHand.cards, card] };

      // Auto-stand: split aces get one card each, or hand is a 21
      if ((isSplitAces && !s.table.rules.hitSplitAces) || calculateHandValue(hand.cards).total === 21) {
        hand.status = 'stood';
      }

      seat.hands[targetHandIdx] = hand;
      s.seats[s.activeSeatIndex] = seat;

      return {
        ...s,
        phase: 'PLAYER_TURN',
        splitCardTarget: undefined,
        actionLocked: true,
        pendingTurnAdvance: hand.status !== 'playing',
      };
    }
    case 'PLAYER_CARD_LANDED': {
      if (!state.actionLocked || state.phase !== 'PLAYER_TURN') return state;
      const seat = state.seats[state.activeSeatIndex];
      const hand = seat?.hands[seat.activeHandIndex];
      if (
        state.activeSeatIndex !== action.seatId ||
        hand?.id !== action.handId ||
        hand.cards.at(-1)?.id !== action.cardId
      ) return state;

      const unlocked = { ...state, actionLocked: false, pendingTurnAdvance: false };
      return state.pendingTurnAdvance ? moveToNextHand(unlocked) : unlocked;
    }
    case 'SURRENDER': {
      if (!canActOnHand(state, action.seatId, action.handId) || !state.table.rules.lateSurrender) return state;
      const s = { ...state, seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const hand = { ...seat.hands[seat.activeHandIndex] };
      if (hand.cards.length !== 2 || hand.isSplit) return state;
      hand.status = 'surrendered';
      s.bankroll += Math.floor(hand.bet / 2);
      seat.hands[seat.activeHandIndex] = hand;
      s.seats[s.activeSeatIndex] = seat;
      return moveToNextHand(s);
    }
    case 'NEXT_HAND': {
      if (!state.pendingTurnAdvance) return state;
      return moveToNextHand({ ...state, actionLocked: false, pendingTurnAdvance: false });
    }

    // ── Dealer ────────────────────────────────────────────────────────────────
    case 'DEALER_TURN': {
      return { ...state, phase: 'DEALER_TURN' };
    }
    case 'DEALER_PLAY': {
      if (state.phase !== 'DEALER_TURN') return state;
      // Draw exactly one card per action. The UI waits for that card to land
      // before dispatching again, matching a real dealer's draw cadence.
      const s = { ...state, shoe: [...state.shoe] };
      const dealerCards = [...s.dealerCards];
      const currentVal = calculateHandValue(dealerCards);
      const shouldHit = currentVal.total < 17 || (
        currentVal.total === 17 && currentVal.soft && s.table.rules.dealerHitsSoft17
      );

      if (shouldHit) {
        const card = s.shoe.pop();
        if (card) dealerCards.push(card);
      }

      if (s.shoe.length <= s.cutCardIndex) s.needsShuffle = true;

      const finalVal = calculateHandValue(dealerCards);
      const shouldHitAgain = finalVal.total < 17 || (
        finalVal.total === 17 && finalVal.soft && s.table.rules.dealerHitsSoft17
      );
      s.dealerCards = dealerCards;
      if (!shouldHitAgain || s.shoe.length === 0) {
        s.dealerStatus = finalVal.total > 21 ? 'busted' as any : 'stood' as any;
        s.phase = 'SETTLEMENT';
      }
      return s;
    }

    // ── Settlement ────────────────────────────────────────────────────────────
    case 'SETTLEMENT': {
      return { ...state, phase: 'SETTLEMENT' };
    }
    case 'PERFORM_SETTLEMENT': {
      if (state.phase !== 'SETTLEMENT' || state.settled) return state;
      const s = { ...state } as any;
      s.settled = true;

      const dealerVal = calculateHandValue(s.dealerCards).total;
      const dealerBust = dealerVal > 21;
      const dealerBJ = s.dealerStatus === 'blackjack';
      const multiDeck = s.table.decks > 1;

      s.seats = s.seats.map((seat: Seat) => {
        if (!seat.isActive || seat.hands.length === 0) return seat;
        let wonAmount = 0;

        const newHands = seat.hands.map((hand: Hand) => {
          if (hand.status === 'surrendered') return { ...hand, result: 'surrender' as const };

          const val = calculateHandValue(hand.cards).total;
          const isBJ = isBlackjack(hand.cards) && !hand.isSplit;

          if (val > 21) return { ...hand, result: 'bust' as const };
          if (isBJ) {
            if (dealerBJ) { wonAmount += hand.bet; return { ...hand, result: 'push' as const }; }
            // Wallet chips are indivisible integers. Odd 3:2 wagers therefore
            // round the profit down instead of leaking fractional balances into
            // the database ledger.
            const profit = Math.floor(hand.bet * s.table.rules.blackjackPayout);
            wonAmount += hand.bet + profit;
            return { ...hand, result: 'blackjack_win' as const, payout: profit };
          }
          if (dealerBJ) return { ...hand, result: 'lose' as const };
          if (dealerBust) { wonAmount += hand.bet * 2; return { ...hand, result: 'win' as const, payout: hand.bet }; }
          if (val > dealerVal) { wonAmount += hand.bet * 2; return { ...hand, result: 'win' as const, payout: hand.bet }; }
          if (val === dealerVal) { wonAmount += hand.bet; return { ...hand, result: 'push' as const }; }
          return { ...hand, result: 'lose' as const };
        });

        // Side bet settlement — skip any bet already paid immediately at PLAYER_TURN start.
        // `immediate: true` entries in sideBetResults were already bankrolled.
        const firstHand = seat.hands[0];
        const firstCards = firstHand?.cards || [];

        // Carry forward any results already stored (immediate payouts)
        const sideResults: any[] = [...(seat.sideBetResults || [])];
        const already = (name: string) => sideResults.some(r => r.betName === name);

        // Insurance (still handled here — only known after dealer peek)
        if (seat.sideBets.insurance && dealerBJ && !already('Insurance')) {
          const win = (seat.sideBets.insurance as number) * 2;
          wonAmount += (seat.sideBets.insurance as number) + win;
          sideResults.push({ betName: 'Insurance', win: true, payout: win, message: 'Pays 2:1' });
        }
        // Perfect Pairs — skip if already paid
        if (seat.sideBets.perfectPairs && firstCards.length >= 2 && !already('Perfect Pairs')) {
          const res = evaluatePerfectPairs(firstCards, multiDeck);
          if (res.payout > 0) {
            const win = (seat.sideBets.perfectPairs as number) * res.payout;
            wonAmount += (seat.sideBets.perfectPairs as number) + win;
            sideResults.push({ betName: 'Perfect Pairs', win: true, payout: win, message: res.msg });
          } else {
            sideResults.push({ betName: 'Perfect Pairs', win: false, payout: 0, message: 'No pair' });
          }
        }
        // 21+3 — skip if already paid
        if (seat.sideBets.twentyOnePlusThree && firstCards.length >= 2 && s.dealerCards.length >= 1 && !already('21+3')) {
          const res = evaluate21Plus3(firstCards, s.dealerCards[0], multiDeck);
          if (res.payout > 0) {
            const win = (seat.sideBets.twentyOnePlusThree as number) * res.payout;
            wonAmount += (seat.sideBets.twentyOnePlusThree as number) + win;
            sideResults.push({ betName: '21+3', win: true, payout: win, message: res.msg });
          } else {
            sideResults.push({ betName: '21+3', win: false, payout: 0, message: 'No match' });
          }
        }
        // Lucky Ladies — skip if already paid
        if (seat.sideBets.luckyLadies && firstCards.length >= 2 && !already('Lucky Ladies')) {
          const res = evaluateLuckyLadies(firstCards, s.dealerCards, multiDeck);
          if (res.payout > 0) {
            const win = (seat.sideBets.luckyLadies as number) * res.payout;
            wonAmount += (seat.sideBets.luckyLadies as number) + win;
            sideResults.push({ betName: 'Lucky Ladies', win: true, payout: win, message: res.msg });
          } else {
            sideResults.push({ betName: 'Lucky Ladies', win: false, payout: 0, message: 'No 20' });
          }
        }
        // Super Sevens — always end-of-round (progressive, depends on hit cards)
        if (seat.sideBets.superSevens && !already('Super Sevens')) {
          const handCards = newHands[0]?.cards || firstCards;
          const res = evaluateSuperSevens(handCards);
          if (res.payout > 0) {
            const win = (seat.sideBets.superSevens as number) * res.payout;
            wonAmount += (seat.sideBets.superSevens as number) + win;
            sideResults.push({ betName: 'Super Sevens', win: true, payout: win, message: res.msg });
          } else {
            sideResults.push({ betName: 'Super Sevens', win: false, payout: 0, message: 'No 7' });
          }
        }
        // Lucky Lucky — skip if already paid
        if (seat.sideBets.luckyLucky && firstCards.length >= 2 && s.dealerCards.length >= 1 && !already('Lucky Lucky')) {
          const res = evaluateLuckyLucky(firstCards, s.dealerCards[0]);
          if (res.payout > 0) {
            const win = (seat.sideBets.luckyLucky as number) * res.payout;
            wonAmount += (seat.sideBets.luckyLucky as number) + win;
            sideResults.push({ betName: 'Lucky Lucky', win: true, payout: win, message: res.msg });
          } else {
            sideResults.push({ betName: 'Lucky Lucky', win: false, payout: 0, message: 'Under 19' });
          }
        }
        // Royal Match — skip if already paid
        if (seat.sideBets.royalMatch && firstCards.length >= 2 && !already('Royal Match')) {
          const res = evaluateRoyalMatch(firstCards);
          if (res.payout > 0) {
            const win = Math.floor((seat.sideBets.royalMatch as number) * res.payout);
            wonAmount += (seat.sideBets.royalMatch as number) + win;
            sideResults.push({ betName: 'Royal Match', win: true, payout: win, message: res.msg });
          } else {
            sideResults.push({ betName: 'Royal Match', win: false, payout: 0, message: 'Off-suit' });
          }
        }
        // Bust It — always end-of-round (needs dealer outcome)
        if (seat.sideBets.bustIt && !already('Bust It')) {
          const res = evaluateBustIt(s.dealerCards);
          if (res.payout > 0) {
            const win = (seat.sideBets.bustIt as number) * res.payout;
            wonAmount += (seat.sideBets.bustIt as number) + win;
            sideResults.push({ betName: 'Bust It', win: true, payout: win, message: res.msg });
          } else {
            sideResults.push({ betName: 'Bust It', win: false, payout: 0, message: 'No bust' });
          }
        }

        s.bankroll += wonAmount;
        return { ...seat, hands: newHands, sideBetResults: sideResults };
      });

      return s;
    }

    // ── Next round ────────────────────────────────────────────────────────────
    case 'NEXT_ROUND': {
      if (state.phase !== 'SETTLEMENT' || !state.settled) return state;
      const roundCards = [
        ...state.dealerCards,
        ...state.seats.flatMap(seat => seat.hands.flatMap(hand => hand.cards)),
      ];
      const seats = state.seats.map((seat: Seat) => ({
        ...seat,
        hands: [],
        activeHandIndex: 0,
        sideBets: {},
        sideBetResults: [],
      }));
      return {
        ...state,
        phase: state.needsShuffle ? 'SHUFFLING' : 'BETTING',
        shuffleStage: state.needsShuffle ? 'collecting' : undefined,
        settled: false,
        dealerCards: [],
        dealerStatus: 'playing',
        activeSeatIndex: -1,
        bettingSeatId: undefined,
        discard: [...state.discard, ...roundCards],
        seats,
        actionLocked: state.needsShuffle,
        pendingTurnAdvance: false,
      };
    }

    case 'RESHUFFLE': {
      if (state.phase !== 'SHUFFLING') return state;
      if (state.shuffleStage === 'collecting') {
        return { ...state, shuffleStage: 'shuffling' };
      }
      if (state.shuffleStage !== 'shuffling') return state;

      const shoeNumber = state.shoeNumber + 1;
      const fresh = prepareFreshShoe(state.table, shoeNumber);
      return {
        ...state,
        shoe: fresh.shoe,
        discard: fresh.discard,
        cutCardIndex: fresh.cutCardIndex,
        penetration: fresh.penetration,
        lastBurnCardId: fresh.lastBurnCardId,
        shoeNumber,
        needsShuffle: false,
        shuffleStage: 'burning',
      };
    }

    case 'SHUFFLE_COMPLETE': {
      if (state.phase !== 'SHUFFLING' || state.shuffleStage !== 'burning') return state;
      return {
        ...state,
        phase: state.seats.some(seat => seat.isActive) ? 'BETTING' : 'SEAT_SELECTION',
        shuffleStage: undefined,
        actionLocked: false,
      };
    }

    case 'ADD_BANKROLL': {
      return { ...state, bankroll: state.bankroll + action.amount };
    }

    default:
      return state;
  }
}

export function gameReducer(state: GameState, action: ExtendedAction): GameState {
  const next = reduceGameState(state, action);
  return next === state ? state : withCardIntegrity(next);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function canActOnHand(state: GameState, seatId: number, handId: string): boolean {
  if (state.phase !== 'PLAYER_TURN' || state.actionLocked || state.pendingTurnAdvance) return false;
  if (state.activeSeatIndex !== seatId) return false;
  const seat = state.seats[seatId];
  const hand = seat?.hands[seat.activeHandIndex];
  return hand?.id === handId && hand.status === 'playing';
}

/** Rightmost seat that still has a hand in 'playing' status. */
function findRightmostActive(seats: Seat[]): number {
  for (let i = seats.length - 1; i >= 0; i--) {
    if (seats[i].isActive && seats[i].hands.some(h => h.status === 'playing')) return i;
  }
  return -1;
}

/**
 * Auto-stand every non-split natural blackjack (2-card 21).
 * Called before entering PLAYER_TURN so the active-seat search skips them.
 */
function autoStandBlackjacks(seats: Seat[]): Seat[] {
  return seats.map(seat => {
    if (!seat.isActive) return seat;
    const hands = seat.hands.map(hand => {
      if (
        hand.status === 'playing' &&
        !hand.isSplit &&
        hand.cards.length === 2 &&
        calculateHandValue(hand.cards).total === 21
      ) {
        return { ...hand, status: 'stood' as const };
      }
      return hand;
    });
    return { ...seat, hands };
  });
}

/**
 * Evaluate side bets that are decided by the initial 2 player cards + dealer upcard.
 * Pays them out immediately and stores results with `immediate: true`.
 * PERFORM_SETTLEMENT will skip any bet whose name already appears in sideBetResults.
 */
function evaluateImmediateSideBets(state: GameState): GameState {
  const dealerUpcard = state.dealerCards[0];
  const multiDeck = state.table.decks > 1;
  let bankrollDelta = 0;

  const seats = state.seats.map(seat => {
    if (!seat.isActive || seat.hands.length === 0) return seat;
    const firstCards = seat.hands[0]?.cards || [];
    if (firstCards.length < 2) return seat;

    const existing = seat.sideBetResults || [];
    const already = (name: string) => existing.some(r => r.betName === name);
    const newResults = [...existing];
    let won = 0;

    // Perfect Pairs
    if (seat.sideBets.perfectPairs && !already('Perfect Pairs')) {
      const r = evaluatePerfectPairs(firstCards, multiDeck);
      if (r.payout > 0) {
        const w = (seat.sideBets.perfectPairs as number) * r.payout;
        won += (seat.sideBets.perfectPairs as number) + w;
        newResults.push({ betName: 'Perfect Pairs', win: true, payout: w, message: r.msg, immediate: true } as any);
      } else {
        newResults.push({ betName: 'Perfect Pairs', win: false, payout: 0, message: 'No pair', immediate: true } as any);
      }
    }

    // 21+3
    if (seat.sideBets.twentyOnePlusThree && dealerUpcard && !already('21+3')) {
      const r = evaluate21Plus3(firstCards, dealerUpcard, multiDeck);
      if (r.payout > 0) {
        const w = (seat.sideBets.twentyOnePlusThree as number) * r.payout;
        won += (seat.sideBets.twentyOnePlusThree as number) + w;
        newResults.push({ betName: '21+3', win: true, payout: w, message: r.msg, immediate: true } as any);
      } else {
        newResults.push({ betName: '21+3', win: false, payout: 0, message: 'No match', immediate: true } as any);
      }
    }

    // Lucky Ladies
    if (seat.sideBets.luckyLadies && !already('Lucky Ladies')) {
      const r = evaluateLuckyLadies(firstCards, state.dealerCards, multiDeck);
      if (r.payout > 0) {
        const w = (seat.sideBets.luckyLadies as number) * r.payout;
        won += (seat.sideBets.luckyLadies as number) + w;
        newResults.push({ betName: 'Lucky Ladies', win: true, payout: w, message: r.msg, immediate: true } as any);
      } else {
        newResults.push({ betName: 'Lucky Ladies', win: false, payout: 0, message: 'No 20', immediate: true } as any);
      }
    }

    // Lucky Lucky
    if (seat.sideBets.luckyLucky && dealerUpcard && !already('Lucky Lucky')) {
      const r = evaluateLuckyLucky(firstCards, dealerUpcard);
      if (r.payout > 0) {
        const w = (seat.sideBets.luckyLucky as number) * r.payout;
        won += (seat.sideBets.luckyLucky as number) + w;
        newResults.push({ betName: 'Lucky Lucky', win: true, payout: w, message: r.msg, immediate: true } as any);
      } else {
        newResults.push({ betName: 'Lucky Lucky', win: false, payout: 0, message: 'Under 19', immediate: true } as any);
      }
    }

    // Royal Match
    if (seat.sideBets.royalMatch && !already('Royal Match')) {
      const r = evaluateRoyalMatch(firstCards);
      if (r.payout > 0) {
        const w = Math.floor((seat.sideBets.royalMatch as number) * r.payout);
        won += (seat.sideBets.royalMatch as number) + w;
        newResults.push({ betName: 'Royal Match', win: true, payout: w, message: r.msg, immediate: true } as any);
      } else {
        newResults.push({ betName: 'Royal Match', win: false, payout: 0, message: 'Off-suit', immediate: true } as any);
      }
    }

    bankrollDelta += won;
    return { ...seat, sideBetResults: newResults };
  });

  return { ...state, seats, bankroll: state.bankroll + bankrollDelta };
}

function moveToNextInsurance(state: GameState): GameState {
  // Insurance offered left→right (standard), so increment
  let next = state.activeSeatIndex + 1;
  while (next < state.seats.length) {
    if (state.seats[next].isActive && state.seats[next].hands.length > 0) {
      return { ...state, activeSeatIndex: next };
    }
    next++;
  }
  // All seats answered insurance — check if dealer has BJ
  if (isBlackjack(state.dealerCards)) {
    return { ...state, dealerStatus: 'blackjack', phase: 'SETTLEMENT' } as any;
  }
  // Auto-stand natural BJ hands, pay immediate bonuses, start player turn from rightmost
  let s = { ...state, phase: 'PLAYER_TURN' } as GameState;
  s.seats = autoStandBlackjacks(s.seats) as any;
  s = evaluateImmediateSideBets(s) as GameState;
  s.activeSeatIndex = findRightmostActive(s.seats);
  if (s.activeSeatIndex === -1) s.phase = 'DEALER_TURN';
  return checkAllDone(s);
}

function checkAllDone(state: GameState): GameState {
  const anyPlaying = state.seats.some(
    seat => seat.isActive && seat.hands.some(h => h.status === 'playing')
  );
  if (!anyPlaying) return { ...state, phase: 'DEALER_TURN' };
  return state;
}

function moveToNextHand(state: GameState): GameState {
  const s = { ...state, seats: [...state.seats] };
  const seat = s.seats[s.activeSeatIndex];

  // Try next hand in same seat (split hands go left→right within a seat)
  if (seat && seat.activeHandIndex < seat.hands.length - 1) {
    const newIdx = seat.activeHandIndex + 1;
    const nextHand = seat.hands[newIdx];
    s.seats[s.activeSeatIndex] = { ...seat, activeHandIndex: newIdx };
    if (nextHand.status !== 'playing') return moveToNextHand(s);
    if (nextHand.isSplit && nextHand.cards.length === 1) {
      return {
        ...s,
        phase: 'SPLIT_DEALING',
        splitCardTarget: newIdx,
        actionLocked: true,
        pendingTurnAdvance: false,
      };
    }
    return s;
  }

  // Move to next seat going RIGHT → LEFT (decrement index)
  let nextSeat = s.activeSeatIndex - 1;
  while (nextSeat >= 0) {
    if (s.seats[nextSeat].isActive && s.seats[nextSeat].hands.length > 0) {
      s.activeSeatIndex = nextSeat;
      s.seats[nextSeat] = { ...s.seats[nextSeat], activeHandIndex: 0 };
      const firstHand = s.seats[nextSeat].hands[0];
      if (firstHand.status !== 'playing') return moveToNextHand(s);
      return s;
    }
    nextSeat--;
  }

  // All hands done → dealer
  s.phase = 'DEALER_TURN';
  return s;
}
