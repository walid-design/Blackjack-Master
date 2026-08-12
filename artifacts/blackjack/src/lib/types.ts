import { Card, GamePhase, Seat, HandStatus, SideBets } from './blackjack';

export interface GameState {
  phase: GamePhase;
  shoe: Card[];
  discard: Card[];
  seats: Seat[];
  dealerCards: Card[];
  dealerStatus: HandStatus;
  activeSeatIndex: number;
  cutCardIndex: number;
  needsShuffle: boolean;
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
  | { type: 'CARD_DEALT'; to: 'player' | 'dealer'; seatId?: number }
  | { type: 'CHECK_DEALER_BJ' }
  | { type: 'START_PLAYER_TURN' }
  | { type: 'HIT' }
  | { type: 'STAND' }
  | { type: 'DOUBLE' }
  | { type: 'SPLIT' }
  | { type: 'SPLIT_CARD' }
  | { type: 'SURRENDER' }
  | { type: 'INSURANCE' }
  | { type: 'DECLINE_INSURANCE' }
  | { type: 'NEXT_HAND' }
  | { type: 'DEALER_TURN' }
  | { type: 'DEALER_PLAY' }
  | { type: 'PERFORM_SETTLEMENT' }
  | { type: 'SETTLEMENT' }
  | { type: 'NEXT_ROUND' }
  | { type: 'ADD_BANKROLL'; amount: number }
  | { type: 'REPEAT_BET' };
