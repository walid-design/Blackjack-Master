import { GameState, GameAction } from './types';
import { calculateHandValue, isBlackjack, TableConfig, Card, buildShoe, shuffle, Hand, Seat, evaluateBustIt, evaluate21Plus3, evaluateLuckyLadies, evaluateLuckyLucky, evaluatePerfectPairs, evaluateRoyalMatch, evaluateSuperSevens } from './blackjack';

export function createInitialState(table: TableConfig, initialBankroll: number): GameState {
  const seats = Array.from({ length: table.seats }).map((_, i) => ({
    id: i,
    isActive: false,
    hands: [],
    activeHandIndex: 0,
    sideBets: {},
    sideBetResults: []
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
    bankroll: initialBankroll
  };
}

export function gameReducer(state: GameState, action: GameAction | { type: 'DEALER_TICK' } | { type: 'PERFORM_SETTLEMENT' } | { type: 'RESOLVE_INSURANCE' } | { type: 'END_INSURANCE' }): GameState {
  switch (action.type) {
    case 'SIT': {
      const s = { ...state };
      s.seats = [...s.seats];
      s.seats[action.seatId] = { ...s.seats[action.seatId], isActive: true };
      if (s.phase === 'SEAT_SELECTION') s.phase = 'BETTING';
      return s;
    }
    case 'LEAVE': {
      const s = { ...state };
      s.seats = [...s.seats];
      s.seats[action.seatId] = { ...s.seats[action.seatId], isActive: false, hands: [], sideBets: {} };
      if (s.seats.every(seat => !seat.isActive)) {
        s.phase = 'SEAT_SELECTION';
      }
      return s;
    }
    case 'SELECT_BET_SEAT': {
      return { ...state, bettingSeatId: action.seatId };
    }
    case 'PLACE_BET': {
      const { seatId, amount } = action;
      if (state.bankroll < amount) return state;
      const s = { ...state };
      s.bankroll -= amount;
      s.seats = [...s.seats];
      const seat = { ...s.seats[seatId] };
      const currentBet = seat.hands[0]?.bet || 0;
      seat.hands = [{ id: Math.random().toString(), cards: [], bet: currentBet + amount, status: 'playing', isSplit: false, doubled: false }];
      s.seats[seatId] = seat;
      return s;
    }
    case 'PLACE_SIDE_BET': {
      const { seatId, betType, amount } = action;
      if (state.bankroll < amount) return state;
      const s = { ...state };
      s.bankroll -= amount;
      s.seats = [...s.seats];
      const seat = { ...s.seats[seatId] };
      seat.sideBets = { ...seat.sideBets };
      seat.sideBets[betType] = (seat.sideBets[betType] || 0) + amount;
      s.seats[seatId] = seat;
      return s;
    }
    case 'CLEAR_BETS': {
      const s = { ...state };
      let returned = 0;
      s.seats = s.seats.map(seat => {
        if (!seat.isActive) return seat;
        returned += (seat.hands[0]?.bet || 0) + Object.values(seat.sideBets).reduce((a, b) => (a as number) + (b as number), 0) as number;
        return { ...seat, hands: [], sideBets: {} };
      });
      s.bankroll += returned;
      return s;
    }
    case 'DEAL': {
      return { ...state, phase: 'DEALING', dealerCards: [], dealerStatus: 'playing' };
    }
    case 'CARD_DEALT': {
      const s = { ...state };
      s.shoe = [...s.shoe];
      const card = s.shoe.pop();
      if (!card) return s;

      if (s.shoe.length <= s.cutCardIndex) {
        s.needsShuffle = true;
      }

      s.seats = [...s.seats];
      if (action.to === 'player' && action.seatId !== undefined) {
        const seatId = action.seatId;
        const seat = { ...s.seats[seatId] };
        seat.hands = [...seat.hands];
        const handIdx = seat.activeHandIndex;
        const hand = { ...seat.hands[handIdx] };
        hand.cards = [...hand.cards, card];
        seat.hands[handIdx] = hand;
        s.seats[seatId] = seat;

        const val = calculateHandValue(hand.cards);
        if (val.total >= 21 && s.phase === 'PLAYER_TURN') {
          hand.status = val.total === 21 ? (hand.cards.length === 2 ? 'blackjack' : 'stood') : 'busted';
          seat.hands[handIdx] = hand;
          s.seats[seatId] = seat;
          return moveToNextHand(s);
        }

      } else if (action.to === 'dealer') {
        s.dealerCards = [...s.dealerCards, card];
      }
      return s;
    }
    case 'CHECK_DEALER_BJ': {
      const s = { ...state };
      const upcard = s.dealerCards[0];
      
      if (upcard && upcard.rank === 'A') {
         s.phase = 'INSURANCE';
         s.activeSeatIndex = s.seats.findIndex(seat => seat.isActive && seat.hands.length > 0);
         return s;
      }
      
      if (upcard && upcard.value === 10) {
         if (isBlackjack(s.dealerCards)) {
           s.dealerStatus = 'blackjack';
           s.phase = 'SETTLEMENT';
           return s;
         }
      }
      
      s.phase = 'PLAYER_TURN';
      s.activeSeatIndex = s.seats.findIndex(seat => seat.isActive && seat.hands.length > 0);
      if (s.activeSeatIndex === -1) {
        s.phase = 'DEALER_TURN';
      }
      return checkSkipPlayerTurn(s);
    }
    case 'INSURANCE': {
       const s = { ...state };
       const seat = s.seats[s.activeSeatIndex];
       const hand = seat.hands[0]; // main hand
       const insAmount = hand.bet / 2;
       if (s.bankroll < insAmount) return s;
       
       s.bankroll -= insAmount;
       s.seats = [...s.seats];
       const newSeat = { ...seat, sideBets: { ...seat.sideBets, insurance: insAmount } };
       s.seats[s.activeSeatIndex] = newSeat;
       
       return moveToNextInsuranceHand(s);
    }
    case 'DECLINE_INSURANCE': {
       return moveToNextInsuranceHand({ ...state });
    }
    case 'END_INSURANCE': {
       const s = { ...state };
       if (isBlackjack(s.dealerCards)) {
          s.dealerStatus = 'blackjack';
          s.phase = 'SETTLEMENT';
       } else {
          s.phase = 'PLAYER_TURN';
          s.activeSeatIndex = s.seats.findIndex(seat => seat.isActive && seat.hands.length > 0);
          return checkSkipPlayerTurn(s);
       }
       return s;
    }
    case 'HIT': return state; 
    case 'STAND': {
      const s = { ...state };
      s.seats = [...s.seats];
      const seat = { ...s.seats[s.activeSeatIndex] };
      seat.hands = [...seat.hands];
      const hand = { ...seat.hands[seat.activeHandIndex] };
      hand.status = 'stood';
      seat.hands[seat.activeHandIndex] = hand;
      s.seats[s.activeSeatIndex] = seat;
      return moveToNextHand(s);
    }
    case 'DOUBLE': {
       const s = { ...state };
       const seat = s.seats[s.activeSeatIndex];
       const hand = seat.hands[seat.activeHandIndex];
       if (s.bankroll < hand.bet) return s; 
       s.bankroll -= hand.bet;
       
       s.seats = [...s.seats];
       const newSeat = { ...seat };
       newSeat.hands = [...seat.hands];
       const newHand = { ...hand, bet: hand.bet * 2, doubled: true, status: 'stood' }; 
       newSeat.hands[seat.activeHandIndex] = newHand;
       s.seats[s.activeSeatIndex] = newSeat;
       return s; 
    }
    case 'SPLIT': {
       const s = { ...state };
       const seat = s.seats[s.activeSeatIndex];
       const hand = seat.hands[seat.activeHandIndex];
       if (s.bankroll < hand.bet) return s; 
       
       s.bankroll -= hand.bet;
       
       s.seats = [...s.seats];
       const newSeat = { ...seat };
       newSeat.hands = [...seat.hands];
       
       const hand1: Hand = { ...hand, cards: [hand.cards[0]], isSplit: true };
       const hand2: Hand = { ...hand, id: Math.random().toString(), cards: [hand.cards[1]], isSplit: true };
       
       newSeat.hands.splice(seat.activeHandIndex, 1, hand1, hand2);
       s.seats[s.activeSeatIndex] = newSeat;
       return s;
    }
    case 'SURRENDER': {
      const s = { ...state };
      s.seats = [...s.seats];
      const seat = { ...s.seats[s.activeSeatIndex] };
      seat.hands = [...seat.hands];
      const hand = { ...seat.hands[seat.activeHandIndex] };
      
      hand.status = 'surrendered';
      s.bankroll += hand.bet / 2;
      
      seat.hands[seat.activeHandIndex] = hand;
      s.seats[s.activeSeatIndex] = seat;
      
      return moveToNextHand(s);
    }
    case 'NEXT_HAND': {
       return moveToNextHand(state);
    }
    case 'DEALER_TICK': {
      return { ...state, phase: 'DEALER_TICK' as any };
    }
    case 'SETTLEMENT': {
      return { ...state, phase: 'SETTLEMENT' };
    }
    case 'PERFORM_SETTLEMENT': {
      const s = { ...state };
      if ((s as any).settled) return s;
      (s as any).settled = true;
      
      const dealerVal = calculateHandValue(s.dealerCards).total;
      const dealerBust = dealerVal > 21;
      const dealerBJ = s.dealerStatus === 'blackjack';

      s.seats = s.seats.map(seat => {
        if (!seat.isActive || seat.hands.length === 0) return seat;
        let wonAmount = 0;
        
        const newHands = seat.hands.map(hand => {
          const val = calculateHandValue(hand.cards).total;
          const isBJ = isBlackjack(hand.cards);
          
          if (hand.status === 'surrendered') {
            return { ...hand, result: 'surrender' as const };
          }
          
          if (val > 21) {
            return { ...hand, result: 'bust' as const };
          }
          
          if (isBJ) {
            if (dealerBJ) {
              wonAmount += hand.bet;
              return { ...hand, result: 'push' as const };
            } else {
              const payout = hand.bet * 1.5;
              wonAmount += hand.bet + payout;
              return { ...hand, result: 'blackjack_win' as const, payout };
            }
          }
          
          if (dealerBJ) {
            return { ...hand, result: 'lose' as const };
          }
          
          if (dealerBust) {
            wonAmount += hand.bet * 2;
            return { ...hand, result: 'win' as const, payout: hand.bet };
          }
          
          if (val > dealerVal) {
            wonAmount += hand.bet * 2;
            return { ...hand, result: 'win' as const, payout: hand.bet };
          } else if (val === dealerVal) {
            wonAmount += hand.bet;
            return { ...hand, result: 'push' as const };
          } else {
            return { ...hand, result: 'lose' as const };
          }
        });
        
        let sideWon = 0;
        const sideResults = [];
        
        if (seat.sideBets.insurance && dealerBJ) {
           const win = seat.sideBets.insurance * 2;
           sideWon += seat.sideBets.insurance + win;
           sideResults.push({ betName: 'Insurance', win: true, payout: win, message: 'Pays 2:1' });
        }
        
        if (seat.sideBets.perfectPairs) {
           const res = evaluatePerfectPairs(seat.hands[0].cards, true);
           if (res.payout > 0) {
              const win = seat.sideBets.perfectPairs * res.payout;
              sideWon += seat.sideBets.perfectPairs + win;
              sideResults.push({ betName: 'Perfect Pairs', win: true, payout: win, message: res.msg });
           }
        }
        
        if (seat.sideBets.twentyOnePlusThree) {
           const res = evaluate21Plus3(seat.hands[0].cards, s.dealerCards[0], true);
           if (res.payout > 0) {
              const win = seat.sideBets.twentyOnePlusThree * res.payout;
              sideWon += seat.sideBets.twentyOnePlusThree + win;
              sideResults.push({ betName: '21+3', win: true, payout: win, message: res.msg });
           }
        }
        
        s.bankroll += wonAmount + sideWon;
        
        return { ...seat, hands: newHands, sideBetResults: sideResults };
      });
      return s;
    }
    case 'NEXT_ROUND': {
      const s = { ...state };
      s.phase = 'BETTING';
      (s as any).settled = false;
      s.discard = [...s.discard, ...s.dealerCards];
      s.dealerCards = [];
      s.dealerStatus = 'playing';
      s.activeSeatIndex = -1;
      s.seats = s.seats.map(seat => {
         if (!seat.isActive) return seat;
         s.discard.push(...seat.hands.flatMap(h => h.cards));
         return {
           ...seat,
           hands: seat.hands.length > 0 ? [{ id: Math.random().toString(), cards: [], bet: seat.hands[0].bet, status: 'playing', isSplit: false, doubled: false }] : [],
           activeHandIndex: 0,
           sideBets: {},
           sideBetResults: []
         };
      });
      
      if (s.needsShuffle) {
        s.shoe = shuffle([...s.shoe, ...s.discard]);
        s.discard = [];
        s.needsShuffle = false;
      }
      return s;
    }
    case 'ADD_BANKROLL': {
      return { ...state, bankroll: state.bankroll + action.amount };
    }
  }
  return state;
}

function moveToNextInsuranceHand(state: GameState): GameState {
  let nextIdx = state.activeSeatIndex + 1;
  while (nextIdx < state.seats.length) {
    if (state.seats[nextIdx].isActive && state.seats[nextIdx].hands.length > 0) {
      return { ...state, activeSeatIndex: nextIdx };
    }
    nextIdx++;
  }
  return gameReducer(state, { type: 'END_INSURANCE' });
}

function checkSkipPlayerTurn(state: GameState): GameState {
   let s = { ...state };
   let allDone = true;
   s.seats.forEach(seat => {
     if (seat.isActive && seat.hands.length > 0) {
       seat.hands.forEach(h => {
         if (h.status === 'playing') allDone = false;
       });
     }
   });
   if (allDone) {
     s.phase = 'DEALER_TURN';
   }
   return s;
}

function moveToNextHand(state: GameState): GameState {
  const s = { ...state };
  const seat = s.seats[s.activeSeatIndex];
  
  if (seat && seat.activeHandIndex < seat.hands.length - 1) {
    s.seats = [...s.seats];
    s.seats[s.activeSeatIndex] = { ...seat, activeHandIndex: seat.activeHandIndex + 1 };
    const nh = s.seats[s.activeSeatIndex].hands[s.seats[s.activeSeatIndex].activeHandIndex];
    if (calculateHandValue(nh.cards).total >= 21) {
       return moveToNextHand(s);
    }
    return s;
  }
  
  let nextIdx = s.activeSeatIndex + 1;
  while (nextIdx < s.seats.length) {
    if (s.seats[nextIdx].isActive && s.seats[nextIdx].hands.length > 0) {
      s.activeSeatIndex = nextIdx;
      const nh = s.seats[nextIdx].hands[0];
      if (calculateHandValue(nh.cards).total >= 21) {
         return moveToNextHand(s); 
      }
      return s;
    }
    nextIdx++;
  }
  
  s.phase = 'DEALER_TURN';
  return s;
}
