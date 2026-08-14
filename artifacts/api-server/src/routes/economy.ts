import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import {
  dailyRewardClaimsTable,
  playersTable,
  playerSessionsTable,
  walletTransactionsTable,
} from '@workspace/db/schema';
import { CHIP_PRODUCTS, DAILY_CHIPS, STARTER_CHIPS, findChipProduct } from '../economy/catalog';

const router = Router();
const SESSION_COOKIE = 'royal_ace_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function cleanDisplayName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ').slice(0, 32);
  return name.length >= 2 ? name : null;
}

async function playerIdFromRequest(req: Request) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length < 20) return null;
  const [session] = await db
    .select({ playerId: playerSessionsTable.playerId })
    .from(playerSessionsTable)
    .where(and(
      eq(playerSessionsTable.tokenHash, tokenHash(token)),
      gt(playerSessionsTable.expiresAt, new Date()),
    ))
    .limit(1);
  return session?.playerId ?? null;
}

async function walletBalance(playerId: string) {
  const [row] = await db
    .select({ balance: sql<string>`coalesce(sum(${walletTransactionsTable.amount}), 0)` })
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.playerId, playerId));
  return Number(row?.balance ?? 0);
}

async function requirePlayer(req: Request, res: Response) {
  const playerId = await playerIdFromRequest(req);
  if (!playerId) {
    res.status(401).json({ code: 'SESSION_REQUIRED', message: 'Create or restore a player session first.' });
    return null;
  }
  return playerId;
}

router.get('/economy/products', (_req, res) => {
  res.json({
    currency: 'USD',
    products: CHIP_PRODUCTS,
    paymentsEnabled: false,
    disclosure: 'Virtual play chips only. No cash value, withdrawal or transfer.',
  });
});

router.post('/economy/session', async (req, res) => {
  const displayName = cleanDisplayName(req.body?.displayName);
  if (!displayName) {
    res.status(400).json({ code: 'INVALID_DISPLAY_NAME', message: 'Display name must contain at least two characters.' });
    return;
  }

  const existingPlayerId = await playerIdFromRequest(req);
  if (existingPlayerId) {
    const [player] = await db.update(playersTable)
      .set({ displayName, lastSeenAt: new Date() })
      .where(eq(playersTable.id, existingPlayerId))
      .returning();
    res.json({ player, balance: await walletBalance(existingPlayerId), created: false });
    return;
  }

  const token = randomBytes(32).toString('base64url');
  const result = await db.transaction(async tx => {
    const [player] = await tx.insert(playersTable).values({ displayName }).returning();
    await tx.insert(playerSessionsTable).values({
      playerId: player.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + SESSION_MS),
    });
    await tx.insert(walletTransactionsTable).values({
      playerId: player.id,
      kind: 'starter_grant',
      amount: STARTER_CHIPS,
      idempotencyKey: `starter:${player.id}`,
      metadata: { source: 'account_creation' },
    });
    return player;
  });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
    path: '/',
  });
  res.status(201).json({ player: result, balance: STARTER_CHIPS, created: true });
});

router.get('/economy/me', async (req, res) => {
  const playerId = await requirePlayer(req, res);
  if (!playerId) return;
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId)).limit(1);
  if (!player) {
    res.status(404).json({ code: 'PLAYER_NOT_FOUND' });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const [claim] = await db.select({ id: dailyRewardClaimsTable.id })
    .from(dailyRewardClaimsTable)
    .where(and(eq(dailyRewardClaimsTable.playerId, playerId), eq(dailyRewardClaimsTable.rewardDate, today)))
    .limit(1);
  res.json({ player, balance: await walletBalance(playerId), dailyRewardAvailable: !claim });
});

router.post('/economy/daily-reward', async (req, res) => {
  const playerId = await requirePlayer(req, res);
  if (!playerId) return;
  const today = new Date().toISOString().slice(0, 10);

  const granted = await db.transaction(async tx => {
    const inserted = await tx.insert(dailyRewardClaimsTable).values({
      playerId,
      rewardDate: today,
      amount: DAILY_CHIPS,
    }).onConflictDoNothing().returning({ id: dailyRewardClaimsTable.id });
    if (inserted.length === 0) return false;
    await tx.insert(walletTransactionsTable).values({
      playerId,
      kind: 'daily_reward',
      amount: DAILY_CHIPS,
      idempotencyKey: `daily:${playerId}:${today}`,
      metadata: { rewardDate: today },
    });
    return true;
  });

  if (!granted) {
    res.status(409).json({ code: 'DAILY_REWARD_ALREADY_CLAIMED', balance: await walletBalance(playerId) });
    return;
  }
  res.json({ granted: DAILY_CHIPS, balance: await walletBalance(playerId) });
});

router.get('/economy/transactions', async (req, res) => {
  const playerId = await requirePlayer(req, res);
  if (!playerId) return;
  const transactions = await db.select({
    id: walletTransactionsTable.id,
    kind: walletTransactionsTable.kind,
    amount: walletTransactionsTable.amount,
    createdAt: walletTransactionsTable.createdAt,
  }).from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.playerId, playerId))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(50);
  res.json({ balance: await walletBalance(playerId), transactions });
});

router.post('/economy/checkout', async (req, res) => {
  const playerId = await requirePlayer(req, res);
  if (!playerId) return;
  const product = findChipProduct(String(req.body?.sku ?? ''));
  if (!product) {
    res.status(400).json({ code: 'INVALID_PRODUCT' });
    return;
  }

  // Intentionally fail closed. A provider adapter will create a pending order here.
  // Only a verified, idempotent provider webhook may insert a `purchase` ledger entry.
  res.status(503).json({
    code: 'PAYMENTS_NOT_CONFIGURED',
    orderReference: randomUUID(),
    message: 'Checkout activates after payment-provider underwriting and webhook configuration.',
  });
});

export default router;
