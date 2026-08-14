import assert from 'node:assert/strict';
import test from 'node:test';
import type { Card } from './blackjack.ts';
import type { GameState } from './types.ts';
import { buildShoe, createGameId, shuffle, TABLES } from './blackjack.ts';
import { createInitialState, gameReducer } from './reducer.ts';

const classic = TABLES.find(table => table.id === 'classic')!;

function takeCard(cards: Card[], rank: Card['rank']): Card {
  const index = cards.findIndex(card => card.rank === rank);
  assert.notEqual(index, -1, `Expected a ${rank} in the shoe`);
  return cards.splice(index, 1)[0];
}

function stateWithHand(playerRanks: Card['rank'][], dealerRanks: Card['rank'][] = ['10', '7']): GameState {
  const initial = createInitialState(classic, 1000);
  const shoe = [...initial.shoe];
  const playerCards = playerRanks.map(rank => takeCard(shoe, rank));
  const dealerCards = dealerRanks.map(rank => takeCard(shoe, rank));
  return {
    ...initial,
    phase: 'PLAYER_TURN',
    activeSeatIndex: 0,
    shoe,
    dealerCards,
    seats: initial.seats.map((seat, index) => index === 0
      ? {
          ...seat,
          isActive: true,
          hands: [{
            id: createGameId('test-hand'),
            cards: playerCards,
            bet: 10,
            status: 'playing',
            isSplit: false,
            doubled: false,
          }],
        }
      : seat),
  };
}

test('builds and securely shuffles a complete shoe without changing card identity', () => {
  const cards = buildShoe(6, 'test-shoe');
  assert.equal(cards.length, 312);
  assert.equal(new Set(cards.map(card => card.id)).size, 312);
  assert.deepEqual(
    new Set(shuffle(cards).map(card => card.id)),
    new Set(cards.map(card => card.id)),
  );
});

test('starts with one burned card and a valid full physical shoe', () => {
  const state = createInitialState(classic, 1000);
  assert.equal(state.shoe.length, 51);
  assert.equal(state.discard.length, 1);
  assert.equal(state.cardIntegrity.valid, true);
  assert.equal(state.cardIntegrity.total, 52);
});

test('returns dealer and player cards to the discard tray at round end', () => {
  let state = stateWithHand(['8', '9']);
  state = { ...state, phase: 'SETTLEMENT', settled: true };
  const dealerIds = state.dealerCards.map(card => card.id);
  const playerIds = state.seats[0].hands[0].cards.map(card => card.id);

  state = gameReducer(state, { type: 'NEXT_ROUND' });

  assert.equal(state.phase, 'BETTING');
  assert.equal(state.dealerCards.length, 0);
  assert.equal(state.cardIntegrity.valid, true);
  for (const id of [...dealerIds, ...playerIds]) {
    assert.equal(state.discard.some(card => card.id === id), true, `${id} must be discarded`);
  }
});

test('locks repeated hits until the flying card lands', () => {
  let state = stateWithHand(['2', '3']);
  const shoe = [...state.shoe];
  const hitCard = takeCard(shoe, '4');
  state = { ...state, shoe: [...shoe, hitCard] };
  const hand = state.seats[0].hands[0];
  const action = { type: 'HIT' as const, seatId: 0, handId: hand.id };

  state = gameReducer(state, action);
  assert.equal(state.seats[0].hands[0].cards.length, 3);
  assert.equal(state.actionLocked, true);

  state = gameReducer(state, action);
  assert.equal(state.seats[0].hands[0].cards.length, 3);

  const lastCard = state.seats[0].hands[0].cards.at(-1)!;
  state = gameReducer(state, { type: 'PLAYER_CARD_LANDED', seatId: 0, handId: hand.id, cardId: lastCard.id });
  assert.equal(state.actionLocked, false);
  assert.equal(state.cardIntegrity.valid, true);
});

test('rejects double down after the first two cards', () => {
  const state = stateWithHand(['2', '3', '4']);
  const hand = state.seats[0].hands[0];
  const result = gameReducer(state, { type: 'DOUBLE', seatId: 0, handId: hand.id });
  assert.equal(result, state);
  assert.equal(result.bankroll, 1000);
});

test('deals split hands sequentially and allows equal-value ten cards', () => {
  let state = stateWithHand(['10', 'K']);
  const originalHand = state.seats[0].hands[0];
  state = gameReducer(state, { type: 'SPLIT', seatId: 0, handId: originalHand.id });
  assert.equal(state.phase, 'SPLIT_DEALING');
  assert.equal(state.splitCardTarget, 0);
  assert.deepEqual(state.seats[0].hands.map(hand => hand.cards.length), [1, 1]);

  state = gameReducer(state, { type: 'SPLIT_CARD' });
  assert.equal(state.phase, 'PLAYER_TURN');
  assert.deepEqual(state.seats[0].hands.map(hand => hand.cards.length), [2, 1]);

  const firstHand = state.seats[0].hands[0];
  const lastCard = firstHand.cards.at(-1)!;
  state = gameReducer(state, { type: 'PLAYER_CARD_LANDED', seatId: 0, handId: firstHand.id, cardId: lastCard.id });
  state = gameReducer(state, { type: 'STAND', seatId: 0, handId: firstHand.id });
  assert.equal(state.phase, 'SPLIT_DEALING');
  assert.equal(state.splitCardTarget, 1);
  assert.deepEqual(state.seats[0].hands.map(hand => hand.cards.length), [2, 1]);
  assert.equal(state.cardIntegrity.valid, true);
});

test('stands on soft 17 under the advertised S17 rule', () => {
  let state = stateWithHand(['8', '9'], ['A', '6']);
  state = { ...state, phase: 'DEALER_TURN' };
  const shoeLength = state.shoe.length;
  state = gameReducer(state, { type: 'DEALER_PLAY' });
  assert.equal(state.shoe.length, shoeLength);
  assert.equal(state.phase, 'SETTLEMENT');
  assert.equal(state.dealerStatus, 'stood');
});

test('replaces the complete shoe, randomizes the cut, and burns one card after reshuffle', () => {
  let state = stateWithHand(['8', '9']);
  state = { ...state, phase: 'SETTLEMENT', settled: true, needsShuffle: true };
  state = gameReducer(state, { type: 'NEXT_ROUND' });
  assert.equal(state.phase, 'SHUFFLING');
  assert.equal(state.shuffleStage, 'collecting');
  assert.equal(state.cardIntegrity.valid, true);

  state = gameReducer(state, { type: 'RESHUFFLE' });
  assert.equal(state.shuffleStage, 'shuffling');
  state = gameReducer(state, { type: 'RESHUFFLE' });
  assert.equal(state.shuffleStage, 'burning');
  assert.equal(state.shoeNumber, 2);
  assert.equal(state.shoe.length, 51);
  assert.equal(state.discard.length, 1);
  assert.equal(state.cardIntegrity.valid, true);

  state = gameReducer(state, { type: 'SHUFFLE_COMPLETE' });
  assert.equal(state.phase, 'BETTING');
  assert.equal(state.actionLocked, false);
});
