import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@workspace/db';
import { playerSessionsTable } from '@workspace/db/schema';

export const SESSION_COOKIE = 'royal_ace_session';
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function playerIdFromRequest(req: Request) {
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

export async function requirePlayer(req: Request, res: Response) {
  const playerId = await playerIdFromRequest(req);
  if (!playerId) {
    res.status(401).json({ code: 'SESSION_REQUIRED', message: 'Create or restore a player session first.' });
    return null;
  }
  return playerId;
}
