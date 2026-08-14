export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  /** Unique for one physical card in one shoe. */
  id: string;
  /** Identifies the fresh shoe this card belongs to. */
  shoeId: string;
  /** Zero-based source deck within a multi-deck shoe. */
  deckIndex: number;
  suit: Suit;
  rank: Rank;
  value: number; // 11 for Ace initially
}

export type HandStatus = 'playing' | 'stood' | 'busted' | 'blackjack' | 'surrendered' | 'settled';

export interface Hand {
  id: string;
  cards: Card[];
  bet: number;
  status: HandStatus;
  isSplit: boolean;
  doubled: boolean;
  result?: 'win' | 'lose' | 'push' | 'blackjack_win' | 'bust' | 'surrender';
  payout?: number;
}

export interface SideBets {
  insurance?: number;
  perfectPairs?: number;
  twentyOnePlusThree?: number;
  luckyLadies?: number;
  superSevens?: number;
  luckyLucky?: number;
  royalMatch?: number;
  bustIt?: number;
}

export interface SideBetResult {
  betName: string;
  win: boolean;
  payout: number;
  message: string;
}

export interface Seat {
  id: number; // 0 to N-1
  isActive: boolean; // Is player sitting here
  hands: Hand[];
  activeHandIndex: number;
  sideBets: SideBets;
  sideBetResults: SideBetResult[];
}

export type GamePhase = 'SEAT_SELECTION' | 'BETTING' | 'DEALING' | 'SPLIT_DEALING' | 'INSURANCE' | 'PLAYER_TURN' | 'DEALER_TURN' | 'SETTLEMENT' | 'SHUFFLING';

export interface TableConfig {
  id: string;
  name: string;
  decks: number;
  minBet: number;
  maxBet: number;
  seats: number;
  sideBets: string[];
  rules: TableRules;
}

export interface TableRules {
  dealerHitsSoft17: boolean;
  blackjackPayout: number;
  doubleOnFirstTwoOnly: boolean;
  doubleAfterSplit: boolean;
  splitByValue: boolean;
  maxSplitHands: number;
  resplitAces: boolean;
  hitSplitAces: boolean;
  lateSurrender: boolean;
  /** Fraction of the shoe dealt before the cut card appears. */
  penetration: [number, number];
  burnCards: number;
}

const STANDARD_RULES: Omit<TableRules, 'penetration'> = {
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  doubleOnFirstTwoOnly: true,
  doubleAfterSplit: true,
  splitByValue: true,
  maxSplitHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  lateSurrender: true,
  burnCards: 1,
};

export const TABLES: TableConfig[] = [
  { id: 'classic',      name: 'Classic',         decks: 1, minBet: 10,  maxBet: 500,  seats: 5, sideBets: ['insurance', 'perfectPairs'], rules: { ...STANDARD_RULES, doubleAfterSplit: false, penetration: [0.58, 0.65] } },
  { id: 'high-roller',  name: 'High Roller',     decks: 6, minBet: 100, maxBet: 5000, seats: 7, sideBets: ['insurance', 'perfectPairs', 'twentyOnePlusThree', 'luckyLadies'], rules: { ...STANDARD_RULES, penetration: [0.72, 0.78] } },
  { id: 'vip',          name: 'VIP Suite',       decks: 8, minBet: 250, maxBet: 10000,seats: 3, sideBets: ['insurance', 'perfectPairs', 'twentyOnePlusThree', 'luckyLadies', 'superSevens', 'luckyLucky'], rules: { ...STANDARD_RULES, penetration: [0.74, 0.80] } },
  { id: 'downtown',     name: 'Downtown',        decks: 2, minBet: 5,   maxBet: 200,  seats: 7, sideBets: ['insurance', 'royalMatch'], rules: { ...STANDARD_RULES, penetration: [0.62, 0.70] } },
  { id: 'speed',        name: 'Speed Table',     decks: 4, minBet: 25,  maxBet: 1000, seats: 5, sideBets: ['insurance', 'perfectPairs', 'twentyOnePlusThree'], rules: { ...STANDARD_RULES, penetration: [0.68, 0.76] } },
  { id: 'vegas-strip',  name: 'Vegas Strip',     decks: 6, minBet: 50,  maxBet: 2500, seats: 6, sideBets: ['insurance', 'perfectPairs', 'twentyOnePlusThree', 'luckyLucky', 'bustIt'], rules: { ...STANDARD_RULES, penetration: [0.72, 0.78] } },
];

let fallbackIdCounter = 0;

export function createGameId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

export function buildShoe(decks: number, shoeId = createGameId('shoe')): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const shoe: Card[] = [];
  
  for (let d = 0; d < decks; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        let value = parseInt(rank);
        if (['J', 'Q', 'K'].includes(rank)) value = 10;
        if (rank === 'A') value = 11;
        shoe.push({
          id: `${shoeId}-d${d}-${suit}-${rank}`,
          shoeId,
          deckIndex: d,
          suit,
          rank,
          value,
        });
      }
    }
  }
  return shoe;
}

export function shuffle(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Return an unbiased integer in [0, maxExclusive) using Web Crypto. */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x100000000) {
    throw new RangeError(`Invalid secure random range: ${maxExclusive}`);
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure random generation is unavailable in this browser.');
  }

  const range = 0x100000000;
  const rejectionLimit = range - (range % maxExclusive);
  const value = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(value);
  } while (value[0] >= rejectionLimit);
  return value[0] % maxExclusive;
}

export function randomPenetration([minimum, maximum]: [number, number]): number {
  const min = Math.round(minimum * 10_000);
  const max = Math.round(maximum * 10_000);
  return (min + secureRandomInt(max - min + 1)) / 10_000;
}

export function calculateHandValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  
  for (const card of cards) {
    if (!card) continue;
    total += card.value;
    if (card.rank === 'A') aces += 1;
  }
  
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  
  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && calculateHandValue(cards).total === 21;
}

// -- Side Bet Evaluators --

export function evaluatePerfectPairs(cards: Card[], multiDeck: boolean): { payout: number; msg: string } {
  if (cards.length < 2) return { payout: 0, msg: '' };
  const [c1, c2] = cards;
  if (c1.rank !== c2.rank) return { payout: 0, msg: '' };
  
  if (c1.suit === c2.suit && multiDeck) return { payout: 25, msg: 'Perfect Pair' };
  
  const c1Red = c1.suit === 'hearts' || c1.suit === 'diamonds';
  const c2Red = c2.suit === 'hearts' || c2.suit === 'diamonds';
  
  if (c1Red === c2Red) return { payout: 12, msg: 'Colored Pair' };
  return { payout: 6, msg: 'Mixed Pair' };
}

export function evaluate21Plus3(playerCards: Card[], dealerUpcard: Card, multiDeck: boolean): { payout: number; msg: string } {
  if (playerCards.length < 2 || !dealerUpcard) return { payout: 0, msg: '' };
  const cards = [playerCards[0], playerCards[1], dealerUpcard];
  
  const suits = cards.map(c => c.suit);
  const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
  
  const rankValues = cards.map(c => {
    if (c.rank === 'A') return 14; 
    if (c.rank === 'K') return 13;
    if (c.rank === 'Q') return 12;
    if (c.rank === 'J') return 11;
    return parseInt(c.rank);
  }).sort((a, b) => a - b);
  
  const isStraightLow = rankValues[0] === 2 && rankValues[1] === 3 && rankValues[2] === 14; 
  const isStraight = (rankValues[1] === rankValues[0] + 1 && rankValues[2] === rankValues[1] + 1) || isStraightLow;
  
  const isThreeOfKind = cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank;
  
  if (isThreeOfKind && isFlush && multiDeck) return { payout: 100, msg: 'Suited Three of a Kind' };
  if (isStraight && isFlush) return { payout: 40, msg: 'Straight Flush' };
  if (isThreeOfKind) return { payout: 30, msg: 'Three of a Kind' };
  if (isStraight) return { payout: 10, msg: 'Straight' };
  if (isFlush) return { payout: 5, msg: 'Flush' };
  
  return { payout: 0, msg: '' };
}

export function evaluateLuckyLadies(playerCards: Card[], dealerCards: Card[], multiDeck: boolean): { payout: number; msg: string } {
  if (playerCards.length < 2) return { payout: 0, msg: '' };
  const [c1, c2] = playerCards;
  const val = calculateHandValue([c1, c2]).total;
  
  if (val !== 20) return { payout: 0, msg: '' };
  
  const isMatchedQ = c1.rank === 'Q' && c1.suit === 'hearts' && c2.rank === 'Q' && c2.suit === 'hearts';
  if (isMatchedQ && multiDeck) {
    if (isBlackjack(dealerCards)) return { payout: 1000, msg: 'Lucky Ladies + Dealer BJ' };
    return { payout: 200, msg: 'Matched Queens of Hearts' };
  }
  
  const sameRankSuit = c1.rank === c2.rank && c1.suit === c2.suit;
  if (sameRankSuit && multiDeck) return { payout: 25, msg: 'Matched 20' };
  
  if (c1.suit === c2.suit) return { payout: 10, msg: 'Suited 20' };
  
  return { payout: 4, msg: '20' };
}

export function evaluateSuperSevens(cards: Card[]): { payout: number; msg: string } {
  if (cards.length === 0 || cards[0].rank !== '7') return { payout: 0, msg: '' };
  
  if (cards.length >= 3 && cards[0].rank === '7' && cards[1].rank === '7' && cards[2].rank === '7') {
    if (cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit) return { payout: 5000, msg: 'Suited 7-7-7' };
    return { payout: 500, msg: 'Unsuited 7-7-7' };
  }
  
  if (cards.length >= 2 && cards[0].rank === '7' && cards[1].rank === '7') {
    if (cards[0].suit === cards[1].suit) return { payout: 100, msg: 'Suited 7-7' };
    return { payout: 50, msg: 'Unsuited 7-7' };
  }
  
  return { payout: 3, msg: 'First card 7' };
}

export function evaluateLuckyLucky(playerCards: Card[], dealerUpcard: Card): { payout: number; msg: string } {
  if (playerCards.length < 2 || !dealerUpcard) return { payout: 0, msg: '' };
  const cards = [playerCards[0], playerCards[1], dealerUpcard];
  const val = calculateHandValue(cards).total;
  
  const suits = cards.map(c => c.suit);
  const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
  
  const is777 = cards[0].rank === '7' && cards[1].rank === '7' && cards[2].rank === '7';
  
  const rankValues = cards.map(c => {
    if (['J','Q','K'].includes(c.rank)) return 10;
    if (c.rank === 'A') return 1;
    return parseInt(c.rank);
  }).sort((a,b) => a-b);
  
  const is678 = rankValues[0] === 6 && rankValues[1] === 7 && rankValues[2] === 8;
  
  if (is777 && isFlush) return { payout: 200, msg: 'Suited 7-7-7' };
  if (is678 && isFlush) return { payout: 100, msg: 'Suited 6-7-8' };
  if (is777) return { payout: 50, msg: '7-7-7' };
  if (is678) return { payout: 30, msg: '6-7-8' };
  
  if (val === 21 && isFlush) return { payout: 15, msg: 'Suited 21' };
  if (val === 21) return { payout: 3, msg: '21' };
  if (val === 20) return { payout: 2, msg: '20' };
  if (val === 19) return { payout: 2, msg: '19' };
  
  return { payout: 0, msg: '' };
}

export function evaluateRoyalMatch(cards: Card[]): { payout: number; msg: string } {
  if (cards.length < 2) return { payout: 0, msg: '' };
  const [c1, c2] = cards;
  
  if (c1.suit !== c2.suit) return { payout: 0, msg: '' };
  
  const isRoyal = (c1.rank === 'K' && c2.rank === 'Q') || (c1.rank === 'Q' && c2.rank === 'K');
  if (isRoyal) return { payout: 25, msg: 'Royal Match' };
  
  return { payout: 2.5, msg: 'Suited Match' };
}

export function evaluateBustIt(dealerCards: Card[]): { payout: number; msg: string } {
  const v = calculateHandValue(dealerCards).total;
  if (v <= 21) return { payout: 0, msg: '' };
  
  const count = dealerCards.length;
  if (count === 3) return { payout: 1, msg: 'Busted with 3' };
  if (count === 4) return { payout: 2, msg: 'Busted with 4' };
  if (count === 5) return { payout: 9, msg: 'Busted with 5' };
  if (count === 6) return { payout: 50, msg: 'Busted with 6' };
  if (count >= 7) return { payout: 100, msg: 'Busted with 7+' };
  
  return { payout: 0, msg: '' };
}
