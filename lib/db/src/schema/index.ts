import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const walletTransactionKind = pgEnum('wallet_transaction_kind', [
  'starter_grant',
  'daily_reward',
  'purchase',
  'game_wager',
  'game_payout',
  'admin_adjustment',
  'refund',
]);

export const purchaseStatus = pgEnum('purchase_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
]);

export const playersTable = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const playerSessionsTable = pgTable('player_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull().references(() => playersTable.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('player_sessions_token_hash_unique').on(table.tokenHash),
  index('player_sessions_player_idx').on(table.playerId),
]);

export const walletTransactionsTable = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull().references(() => playersTable.id, { onDelete: 'restrict' }),
  kind: walletTransactionKind('kind').notNull(),
  amount: integer('amount').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  externalReference: text('external_reference'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('wallet_transactions_idempotency_unique').on(table.idempotencyKey),
  index('wallet_transactions_player_created_idx').on(table.playerId, table.createdAt),
]);

export const dailyRewardClaimsTable = pgTable('daily_reward_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull().references(() => playersTable.id, { onDelete: 'cascade' }),
  rewardDate: date('reward_date', { mode: 'string' }).notNull(),
  amount: integer('amount').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('daily_reward_player_date_unique').on(table.playerId, table.rewardDate),
]);

export const purchasesTable = pgTable('purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull().references(() => playersTable.id, { onDelete: 'restrict' }),
  sku: text('sku').notNull(),
  chipAmount: integer('chip_amount').notNull(),
  priceMinor: integer('price_minor').notNull(),
  currency: text('currency').notNull(),
  provider: text('provider').notNull(),
  providerOrderId: text('provider_order_id'),
  status: purchaseStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [
  uniqueIndex('purchases_provider_order_unique').on(table.provider, table.providerOrderId),
  index('purchases_player_created_idx').on(table.playerId, table.createdAt),
]);

export type Player = typeof playersTable.$inferSelect;
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
export type Purchase = typeof purchasesTable.$inferSelect;
