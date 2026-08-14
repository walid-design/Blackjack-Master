import assert from 'node:assert/strict';
import test from 'node:test';
import type { Card, GameState, Rank, Suit } from '@workspace/blackjack-engine';
import {
  GameRuleError,
  applyServerAction,
  createServerGame,
  startServerRound,
  toPublicGameEvents,
  toPublicGameState,
} from './engine.ts';

type DesiredCard = { rank: Rank; suit: Suit };

function withDrawOrder(state: GameState, desired: DesiredCard[]) {
  const available = [...state.shoe];
  const drawCards: Card[] = desired.map(target => {
    let index = available.findIndex(card => card.rank === target.rank && card.suit === target.suit);
    // A fresh shoe burns one random card. The rank is what matters for these
    // rule tests, so use another suit if the requested physical card was burned.
    if (index === -1) index = available.findIndex(card => card.rank === target.rank);
    assert.notEqual(index, -1, `Missing rank ${target.rank}`);
    return available.splice(index, 1)[0];
  });
  return { ...state, shoe: [...available, ...drawCards.reverse()] };
}

test('server deals a complete opening hand and hides the dealer hole card', () => {
  const state = withDrawOrder(createServerGame('classic', 1_000), [
    { rank: '5', suit: 'clubs' },
    { rank: '10', suit: 'hearts' },
    { rank: '6', suit: 'diamonds' },
    { rank: '7', suit: 'spades' },
  ]);

  const result = startServerRound(state, [{ seatId: 2, main: 10 }], 1_000);
  const publicState = toPublicGameState(result.state);
  const publicEvents = toPublicGameEvents(result.events, result.state);

  assert.equal(result.wager, 10);
  assert.equal(result.state.phase, 'PLAYER_TURN');
  assert.equal(result.state.seats[2].hands[0].cards.length, 2);
  assert.equal(result.state.dealerCards.length, 2);
  assert.equal(publicState.dealerCards[1].hidden, true);
  assert.equal(publicState.dealerCards[1].value, 0);
  assert.equal(publicState.dealerCards[1].id, 'dealer-hole-hidden');
  assert.equal(publicState.dealerCards[1].shoeId, 'hidden');
  assert.equal('shoe' in publicState, false);
  assert.equal('discard' in publicState, false);
  const holeEvent = publicEvents.find(event => event.type === 'card_dealt' && event.to === 'dealer' && event.hole);
  assert.ok(holeEvent && holeEvent.type === 'card_dealt');
  assert.equal(holeEvent.card.value, 0);
  assert.equal(result.state.cardIntegrity.valid, true);
});

test('server pays a natural blackjack without drawing out the dealer hand', () => {
  const state = withDrawOrder(createServerGame('classic', 1_000), [
    { rank: 'A', suit: 'clubs' },
    { rank: '6', suit: 'hearts' },
    { rank: 'K', suit: 'diamonds' },
    { rank: '9', suit: 'spades' },
    { rank: '10', suit: 'clubs' },
  ]);

  const result = startServerRound(state, [{ seatId: 2, main: 10 }], 1_000);
  const dealerCardsDealt = result.events.filter(
    event => event.type === 'card_dealt' && event.to === 'dealer',
  );

  assert.equal(result.state.phase, 'SETTLEMENT');
  assert.equal(result.state.settled, true);
  assert.equal(result.state.dealerCards.length, 2);
  assert.equal(dealerCardsDealt.length, 2);
  assert.equal(result.events.some(event => event.type === 'dealer_hole_revealed'), false);
  assert.equal(result.state.seats[2].hands[0].result, 'blackjack_win');
  assert.equal(result.state.bankroll, 1_015);
});

test('dealer draws one card at a time and settlement is the final game event', () => {
  const state = withDrawOrder(createServerGame('classic', 1_000), [
    { rank: '10', suit: 'clubs' },
    { rank: '6', suit: 'hearts' },
    { rank: '7', suit: 'diamonds' },
    { rank: '5', suit: 'spades' },
    { rank: '2', suit: 'clubs' },
    { rank: '3', suit: 'hearts' },
    { rank: 'A', suit: 'diamonds' },
  ]);
  const opening = startServerRound(state, [{ seatId: 1, main: 10 }], 1_000);
  const handId = opening.state.seats[1].hands[0].id;
  const result = applyServerAction(opening.state, { type: 'stand', seatId: 1, handId });

  const dealerDraws = result.events.filter(event => event.type === 'card_dealt' && event.to === 'dealer');
  assert.deepEqual(dealerDraws.map(event => event.type === 'card_dealt' ? event.card.rank : null), ['2', '3', 'A']);
  assert.equal(result.events[0].type, 'dealer_hole_revealed');
  assert.equal(result.events.at(-2)?.type, 'settled');
  assert.equal(result.events.at(-1)?.type, 'phase_changed');
  assert.equal(result.state.phase, 'SETTLEMENT');
  assert.equal(result.state.settled, true);
});

test('double charges exactly one extra wager and credits only the server payout', () => {
  const state = withDrawOrder(createServerGame('classic', 1_000), [
    { rank: '5', suit: 'clubs' },
    { rank: '10', suit: 'hearts' },
    { rank: '6', suit: 'diamonds' },
    { rank: '7', suit: 'spades' },
    { rank: '10', suit: 'clubs' },
  ]);
  const opening = startServerRound(state, [{ seatId: 3, main: 10 }], 1_000);
  const handId = opening.state.seats[3].hands[0].id;
  const result = applyServerAction(opening.state, { type: 'double', seatId: 3, handId });

  assert.equal(result.additionalWager, 10);
  assert.equal(result.state.seats[3].hands[0].bet, 20);
  assert.equal(result.state.seats[3].hands[0].cards.length, 3);
  assert.equal(result.state.seats[3].hands[0].result, 'win');
  assert.equal(result.state.bankroll, 1_020);
  assert.equal(result.state.settled, true);

  assert.throws(
    () => applyServerAction(result.state, { type: 'double', seatId: 3, handId }),
    (error: unknown) => error instanceof GameRuleError && error.code === 'ACTION_NOT_ALLOWED',
  );
});

test('server rejects table limits, duplicate seats and browser-injected side bets', () => {
  const state = createServerGame('classic', 1_000);
  assert.throws(
    () => startServerRound(state, [{ seatId: 0, main: 1 }], 1_000),
    (error: unknown) => error instanceof GameRuleError && error.code === 'BET_OUT_OF_RANGE',
  );
  assert.throws(
    () => startServerRound(state, [{ seatId: 0, main: 10 }, { seatId: 0, main: 10 }], 1_000),
    (error: unknown) => error instanceof GameRuleError && error.code === 'DUPLICATE_SEAT',
  );
  assert.throws(
    () => startServerRound(state, [{ seatId: 0, main: 10, sideBets: { luckyLadies: 5 } }], 1_000),
    (error: unknown) => error instanceof GameRuleError && error.code === 'SIDE_BET_NOT_ALLOWED',
  );
});
