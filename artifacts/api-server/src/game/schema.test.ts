import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  gameRequestsTable,
  gameSessionsTable,
  walletTransactionKind,
  walletTransactionsTable,
} from '@workspace/db/schema';

function uniqueIndexNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).indexes
    .filter(index => index.config.unique)
    .map(index => index.config.name);
}

test('game retries and session creation have database uniqueness boundaries', () => {
  assert.ok(uniqueIndexNames(gameRequestsTable).includes('game_requests_session_request_unique'));
  assert.ok(uniqueIndexNames(gameSessionsTable).includes('game_sessions_player_request_unique'));
  assert.ok(uniqueIndexNames(walletTransactionsTable).includes('wallet_transactions_idempotency_unique'));
});

test('wallet ledger supports separate game wagers and payouts', () => {
  assert.ok(walletTransactionKind.enumValues.includes('game_wager'));
  assert.ok(walletTransactionKind.enumValues.includes('game_payout'));
});
