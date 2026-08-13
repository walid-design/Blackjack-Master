import { GameState, GameAction } from './types';
import {
  calculateHandValue, isBlackjack, TableConfig, Card, buildShoe, shuffle, Hand, Seat,
  evaluateBustIt, evaluate21Plus3, evaluateLuckyLadies, evaluateLuckyLucky,
  evaluatePerfectPairs, evaluateRoyalMatch, evaluateSuperSevens
} from './blackjack';

export function createInitialState(table: TableConfig, initialBankroll: number): GameState {
  const seats: Seat[] = Array.from({ length: table.seats }, (_, i) => ({
    id: i,
    isActive: false,
    hands: [],
    activeHandIndex: 0,
    sideBets: {},
    sideBetResults: [],
  }));
  const shoe = shuffle(buildShoe(table.decks));
  return {
    phase: 'SEAT_SELECTION',
    shoe,
    discard: [],
    seats,
    dealerCards: [],
    dealerStatus: 'playing',
    activeSeatIndex: -1,
    cutCardIndex: Math.floor(shoe.length * 0.25),
    needsShuffle: false,
    bankroll: initialBankroll,
    bettingSeatId: undefined,
  };
}

type ExtendedAction = GameAction
  | { type: 'PERFORM_SETTLEMENT' }
  | { type: 'DEALER_PLAY' };

export function gameReducer(state: GameState, action: ExtendedAction): GameState {
  switch (action.type) {
    // ── Seat management ──────────────────────────────────────────────────────
    case 'SIT': {
      const s = { ...state, seats: [...state.seats] };
      s.seats[action.seatId] = { ...s.seats[action.seatId], isActive: true };
      if (s.phase === 'SEAT_SELECTION') {
        s.phase = 'BETTING';
        s.bettingSeatId = action.seatId;
      }
      return s;
    }
    case 'LEAVE': {
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
      return { ...state, bettingSeatId: action.seatId };
    }

    // ── Betting ──────────────────────────────────────────────────────────────
    case 'PLACE_BET': {
      const { seatId, amount } = action;
      if (state.bankroll < amount) return state;
      const s = { ...state, seats: [...state.seats], bankroll: state.bankroll - amount };
      const seat = { ...s.seats[seatId] };
      const currentBet = seat.hands[0]?.bet || 0;
      seat.hands = [{
        id: seat.hands[0]?.id || Math.random().toString(36),
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
            id: Math.random().toString(36),
            cards: [],
            bet: mainBet,
            status: 'playing' as const,
            isSplit: false,
            doubled: false,
          }],
        };
      });
      // Clear lastBets so a second Repeat click is a no-op (no double-charge)
      s.lastBets = null;
      return s;
    }

    case 'DEAL': {
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
        dealerCards: [],
        dealerStatus: 'playing',
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
              id: Math.random().toString(36),
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
      return moveToNextInsurance({ ...state });
    }

    // ── Player actions ────────────────────────────────────────────────────────
    case 'HIT': {
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

      if (hand.status !== 'playing') return moveToNextHand(s);
      return s;
    }
    case 'STAND': {
      const s = { ...state, seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      seat.hands[seat.activeHandIndex] = { ...seat.hands[seat.activeHandIndex], status: 'stood' };
      s.seats[s.activeSeatIndex] = seat;
      return moveToNextHand(s);
    }
    case 'DOUBLE': {
      const s = { ...state, shoe: [...state.shoe], seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const hi = seat.activeHandIndex;
      const hand = seat.hands[hi];
      // Double allowed on any number of cards (any-double rule), bankroll must cover extra bet
      if (s.bankroll < hand.bet) return s;

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
      return moveToNextHand(s);
    }
    case 'SPLIT': {
      const s = { ...state, shoe: [...state.shoe], seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const hi = seat.activeHandIndex;
      const hand = seat.hands[hi];

      if (
        s.bankroll < hand.bet ||
        hand.cards.length !== 2 ||
        hand.cards[0].rank !== hand.cards[1].rank ||
        seat.hands.length >= 4
      ) return s;

      s.bankroll -= hand.bet;

      // Create two 1-card hands — second cards arrive one at a time via SPLIT_CARD
      const hand1: Hand = {
        id: Math.random().toString(36),
        cards: [hand.cards[0]],
        bet: hand.bet,
        status: 'playing',
        isSplit: true,
        doubled: false,
      };
      const hand2: Hand = {
        id: Math.random().toString(36),
        cards: [hand.cards[1]],
        bet: hand.bet,
        status: 'playing',
        isSplit: true,
        doubled: false,
      };

      seat.hands.splice(hi, 1, hand1, hand2);
      s.seats[s.activeSeatIndex] = seat;

      // Enter SPLIT_DEALING — Table.tsx will dispatch SPLIT_CARD twice with 550ms gaps.
      // Deal to hand[1] (right) first, then hand[0] (left) — standard casino convention.
      return { ...s, phase: 'SPLIT_DEALING', splitCardTarget: 1 };
    }

    case 'SPLIT_CARD': {
      const s = { ...state, shoe: [...state.shoe], seats: [...state.seats] };
      const targetHandIdx = s.splitCardTarget ?? 0;
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const isSplitAces = seat.hands[0]?.cards[0]?.rank === 'A';

      const card = s.shoe.pop();
      if (!card) return s;
      if (s.shoe.length <= s.cutCardIndex) s.needsShuffle = true;

      const hand = { ...seat.hands[targetHandIdx], cards: [...seat.hands[targetHandIdx].cards, card] };

      // Auto-stand: split aces get one card each, or hand is a 21
      if (isSplitAces || calculateHandValue(hand.cards).total === 21) {
        hand.status = 'stood';
      }

      seat.hands[targetHandIdx] = hand;
      s.seats[s.activeSeatIndex] = seat;

      if (targetHandIdx === 1) {
        // Right hand received its card — now deal to the left hand (hand[0])
        return { ...s, phase: 'SPLIT_DEALING', splitCardTarget: 0 };
      }

      // Both cards dealt — evaluate immediate side bets, then start player turn
      let next = { ...s, phase: 'PLAYER_TURN', splitCardTarget: undefined } as GameState;
      next.seats = autoStandBlackjacks(next.seats);
      next = evaluateImmediateSideBets(next) as GameState;
      next.activeSeatIndex = s.activeSeatIndex; // stay on the split seat, hand 0
      // Re-check if hand 0 is playable
      const splitSeat = next.seats[next.activeSeatIndex];
      if (splitSeat.hands[0]?.status !== 'playing') {
        return moveToNextHand(next);
      }
      return checkAllDone(next);
    }
    case 'SURRENDER': {
      const s = { ...state, seats: [...state.seats] };
      const seat = { ...s.seats[s.activeSeatIndex], hands: [...s.seats[s.activeSeatIndex].hands] };
      const hand = { ...seat.hands[seat.activeHandIndex] };
      if (hand.cards.length !== 2) return s;
      hand.status = 'surrendered';
      s.bankroll += Math.floor(hand.bet / 2);
      seat.hands[seat.activeHandIndex] = hand;
      s.seats[s.activeSeatIndex] = seat;
      return moveToNextHand(s);
    }
    case 'NEXT_HAND': {
      return moveToNextHand(state);
    }

    // ── Dealer ────────────────────────────────────────────────────────────────
    case 'DEALER_TURN': {
      return { ...state, phase: 'DEALER_TURN' };
    }
    case 'DEALER_PLAY': {
      // Compute all dealer cards at once; animation is handled by stagger in UI
      const s = { ...state, shoe: [...state.shoe] };
      let dealerCards = [...s.dealerCards];

      while (true) {
        const { total } = calculateHandValue(dealerCards);
        if (total >= 17) break;
        const card = s.shoe.pop();
        if (!card) break;
        dealerCards.push(card);
      }

      if (s.shoe.length <= s.cutCardIndex) s.needsShuffle = true;

      const finalVal = calculateHandValue(dealerCards);
      s.dealerCards = dealerCards;
      s.dealerStatus = finalVal.total > 21 ? 'busted' as any : 'stood' as any;
      s.phase = 'SETTLEMENT';
      return s;
    }

    // ── Settlement ────────────────────────────────────────────────────────────
    case 'SETTLEMENT': {
      return { ...state, phase: 'SETTLEMENT' };
    }
    case 'PERFORM_SETTLEMENT': {
      if ((state as any).settled) return state;
      const s = { ...state } as any;
      s.settled = true;

      const dealerVal = calculateHandValue(s.dealerCards).total;
      const dealerBust = dealerVal > 21;
      const dealerBJ = s.dealerStatus === 'blackjack';
      const multiDeck = s.dealerCards.length > 0; // always true; use table.decks > 1 ideally

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
            const profit = hand.bet * 1.5;
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
          const res = evaluatePerfectPairs(firstCards, true);
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
          const res = evaluate21Plus3(firstCards, s.dealerCards[0], true);
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
          const res = evaluateLuckyLadies(firstCards, s.dealerCards, true);
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
      const s = { ...state } as any;
      s.settled = false;
      s.dealerCards = [];
      s.dealerStatus = 'playing';
      s.activeSeatIndex = -1;
      s.bettingSeatId = undefined;
      s.discard = [...s.discard, ...s.dealerCards];

      s.seats = s.seats.map((seat: Seat) => {
        if (!seat.isActive) return seat;
        s.discard.push(...seat.hands.flatMap((h: Hand) => h.cards));
        return {
          ...seat,
          hands: [],
          activeHandIndex: 0,
          sideBets: {},
          sideBetResults: [],
        };
      });

      if (s.needsShuffle) {
        s.shoe = shuffle([...s.shoe, ...s.discard]);
        s.discard = [];
        s.needsShuffle = false;
      }

      s.phase = 'BETTING';
      return s;
    }

    case 'ADD_BANKROLL': {
      return { ...state, bankroll: state.bankroll + action.amount };
    }

    default:
      return state;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      const r = evaluatePerfectPairs(firstCards, true);
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
      const r = evaluate21Plus3(firstCards, dealerUpcard, true);
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
      const r = evaluateLuckyLadies(firstCards, state.dealerCards, true);
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
