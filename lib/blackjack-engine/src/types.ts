import type { Card, GamePhase, Seat, HandStatus, SideBets, TableConfig } from './blackjack.ts';

export interface CardIntegrity {
  valid: boolean;
  total: number;
  expected: number;
  duplicateIds: string[];
}

export interface GameState {
  phase: GamePhase;
  table: TableConfig;
  shoe: Card[];
  discard: Card[];
  seats: Seat[];
  dealerCards: Card[];
  dealerStatus: HandStatus;
  settled: boolean;
  activeSeatIndex: number;
  cutCardIndex: number;
  /** Actual fraction selected for this fresh shoe. */
  penetration: number;
  needsShuffle: boolean;
  shoeNumber: number;
  shuffleStage?: 'collecting' | 'shuffling' | 'burning';
  lastBurnCardId?: string;
  cardIntegrity: CardIntegrity;
  /** Identifies the active initial-deal sequence so stale timed actions are ignored. */
  dealSequence: number;
  /** True while a turn-ending HIT/DOUBLE card is still flying to the hand. */
  pendingTurnAdvance?: boolean;
  /** Blocks repeat actions until a newly dealt player card lands. */
  actionLocked: boolean;
  bankroll: number;
  bettingSeatId?: number;
  /** Set during SPLIT_DEALING — which hand index within activeSeatIndex gets the next card */
  splitCardTarget?: number;
  /** Snapshot of bets placed at DEAL time — used for Repeat Bet */
  lastBets?: {
    main: Record<number, number>;
    side: Record<number, Record<string, number>>;
  };
}

export type GameAction =
  | { type: 'SIT'; seatId: number }
  | { type: 'LEAVE'; seatId: number }
  | { type: 'SELECT_BET_SEAT'; seatId: number }
  | { type: 'PLACE_BET'; seatId: number; amount: number }
  | { type: 'REMOVE_LAST_BET'; seatId: number }
  | { type: 'PLACE_SIDE_BET'; seatId: number; betType: keyof SideBets; amount: number }
  | { type: 'CLEAR_BETS' }
  | { type: 'DEAL' }
  | { type: 'CARD_DEALT'; to: 'player' | 'dealer'; seatId?: number; dealSequence: number }
  | { type: 'CHECK_DEALER_BJ'; dealSequence: number }
  | { type: 'START_PLAYER_TURN' }
  | { type: 'HIT'; seatId: number; handId: string }
  | { type: 'STAND'; seatId: number; handId: string }
  | { type: 'DOUBLE'; seatId: number; handId: string }
  | { type: 'SPLIT'; seatId: number; handId: string }
  | { type: 'SPLIT_CARD' }
  | { type: 'PLAYER_CARD_LANDED'; seatId: number; handId: string; cardId: string }
  | { type: 'SURRENDER'; seatId: number; handId: string }
  | { type: 'INSURANCE'; seatId: number }
  | { type: 'DECLINE_INSURANCE'; seatId: number }
  | { type: 'NEXT_HAND' }
  | { type: 'DEALER_TURN' }
  | { type: 'DEALER_PLAY' }
  | { type: 'PERFORM_SETTLEMENT' }
  | { type: 'SETTLEMENT' }
  | { type: 'NEXT_ROUND' }
  | { type: 'RESHUFFLE' }
  | { type: 'SHUFFLE_COMPLETE' }
  | { type: 'ADD_BANKROLL'; amount: number }
  | { type: 'REPEAT_BET' };
