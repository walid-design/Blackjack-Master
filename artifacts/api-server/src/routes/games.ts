import { Router, type Request, type Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import {
  gameRequestsTable,
  gameSessionsTable,
  playersTable,
  walletTransactionsTable,
} from '@workspace/db/schema';
import type { GameState, SideBets } from '@workspace/blackjack-engine';
import { requirePlayer } from '../auth/player';
import {
  GameRuleError,
  applyServerAction,
  createServerGame,
  startServerRound,
  toPublicGameEvents,
  toPublicGameState,
  type PlayerGameAction,
  type SeatBet,
} from '../game/engine';

const router = Router();

class HttpGameError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpGameError';
  }
}

function requestId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) {
    throw new HttpGameError(400, 'INVALID_REQUEST_ID', 'requestId must be 8-100 URL-safe characters.');
  }
  return value;
}

function expectedVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new HttpGameError(400, 'INVALID_VERSION', 'expectedVersion must be a non-negative integer.');
  }
  return value as number;
}

function parseBets(value: unknown): SeatBet[] {
  if (!Array.isArray(value)) throw new HttpGameError(400, 'INVALID_BETS', 'bets must be an array.');
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new HttpGameError(400, 'INVALID_BETS', 'Each bet must be an object.');
    const record = raw as Record<string, unknown>;
    if (typeof record.seatId !== 'number' || typeof record.main !== 'number') {
      throw new HttpGameError(400, 'INVALID_BETS', 'Each bet requires numeric seatId and main values.');
    }
    const sideBets: Partial<SideBets> = {};
    if (record.sideBets !== undefined) {
      if (!record.sideBets || typeof record.sideBets !== 'object' || Array.isArray(record.sideBets)) {
        throw new HttpGameError(400, 'INVALID_BETS', 'sideBets must be an object.');
      }
      for (const [key, amount] of Object.entries(record.sideBets as Record<string, unknown>)) {
        if (typeof amount !== 'number') throw new HttpGameError(400, 'INVALID_BETS', 'Side bets must use numeric chip amounts.');
        (sideBets as Record<string, number>)[key] = amount;
      }
    }
    return { seatId: record.seatId, main: record.main, sideBets };
  });
}

function parseAction(value: unknown): PlayerGameAction {
  if (!value || typeof value !== 'object') throw new HttpGameError(400, 'INVALID_ACTION', 'action must be an object.');
  const action = value as Record<string, unknown>;
  const type = action.type;
  if (type === 'insurance' || type === 'decline_insurance') {
    if (typeof action.seatId !== 'number') throw new HttpGameError(400, 'INVALID_ACTION', 'seatId is required.');
    return { type, seatId: action.seatId };
  }
  if (type === 'hit' || type === 'stand' || type === 'double' || type === 'split' || type === 'surrender') {
    if (typeof action.seatId !== 'number' || typeof action.handId !== 'string') {
      throw new HttpGameError(400, 'INVALID_ACTION', 'seatId and handId are required.');
    }
    return { type, seatId: action.seatId, handId: action.handId };
  }
  throw new HttpGameError(400, 'INVALID_ACTION', 'Unknown blackjack action.');
}

async function walletBalance(executor: Pick<typeof db, 'select'>, playerId: string) {
  const [row] = await executor
    .select({ balance: sql<string>`coalesce(sum(${walletTransactionsTable.amount}), 0)` })
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.playerId, playerId));
  return Number(row?.balance ?? 0);
}

function storedState(value: Record<string, unknown>) {
  return value as unknown as GameState;
}

function gameResponse(
  session: { id: string; tableId: string; currentRound: number; version: number },
  state: GameState,
  balance: number,
  events: ReturnType<typeof toPublicGameEvents>,
) {
  return {
    sessionId: session.id,
    tableId: session.tableId,
    round: session.currentRound,
    version: session.version,
    balance,
    game: toPublicGameState(state),
    events,
  };
}

function responseRecord(value: unknown) {
  return value as Record<string, unknown>;
}

function sendError(res: Response, error: unknown) {
  if (error instanceof HttpGameError) {
    res.status(error.status).json({ code: error.code, message: error.message, ...error.details });
    return;
  }
  if (error instanceof GameRuleError) {
    const conflict = ['ACTION_NOT_ALLOWED', 'ROUND_IN_PROGRESS', 'INSUFFICIENT_CHIPS'].includes(error.code);
    res.status(conflict ? 409 : 400).json({ code: error.code, message: error.message });
    return;
  }
  throw error;
}

async function lockOwnedSession(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  gameId: string,
  playerId: string,
) {
  await tx.execute(sql`
    select ${gameSessionsTable.id}
    from ${gameSessionsTable}
    where ${gameSessionsTable.id} = ${gameId}
      and ${gameSessionsTable.playerId} = ${playerId}
    for update
  `);
  const [session] = await tx.select().from(gameSessionsTable).where(and(
    eq(gameSessionsTable.id, gameId),
    eq(gameSessionsTable.playerId, playerId),
  )).limit(1);
  if (!session) throw new HttpGameError(404, 'GAME_NOT_FOUND', 'That game session was not found.');
  return session;
}

async function replayedResponse(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  gameId: string,
  id: string,
) {
  const [replay] = await tx.select({ response: gameRequestsTable.response })
    .from(gameRequestsTable)
    .where(and(eq(gameRequestsTable.gameSessionId, gameId), eq(gameRequestsTable.requestId, id)))
    .limit(1);
  return replay?.response ?? null;
}

async function lockPlayerWallet(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  playerId: string,
) {
  await tx.execute(sql`
    select ${playersTable.id}
    from ${playersTable}
    where ${playersTable.id} = ${playerId}
    for update
  `);
}

router.post('/games/sessions', async (req, res) => {
  try {
    const playerId = await requirePlayer(req, res);
    if (!playerId) return;
    const id = requestId(req.body?.requestId);
    const tableId = typeof req.body?.tableId === 'string' ? req.body.tableId : '';

    const result = await db.transaction(async tx => {
      const [existing] = await tx.select().from(gameSessionsTable).where(and(
        eq(gameSessionsTable.playerId, playerId),
        eq(gameSessionsTable.clientRequestId, id),
      )).limit(1);
      if (existing) {
        const state = storedState(existing.state);
        return { created: false, response: gameResponse(existing, state, await walletBalance(tx, playerId), []) };
      }

      const balance = await walletBalance(tx, playerId);
      const state = createServerGame(tableId, balance);
      const [created] = await tx.insert(gameSessionsTable).values({
        playerId,
        tableId,
        clientRequestId: id,
        state: responseRecord(state),
      }).onConflictDoNothing().returning();
      if (created) return { created: true, response: gameResponse(created, state, balance, []) };
      const [raced] = await tx.select().from(gameSessionsTable).where(and(
        eq(gameSessionsTable.playerId, playerId),
        eq(gameSessionsTable.clientRequestId, id),
      )).limit(1);
      if (!raced) throw new Error('Idempotent game session creation failed.');
      return { created: false, response: gameResponse(raced, storedState(raced.state), balance, []) };
    });
    res.status(result.created ? 201 : 200).json(result.response);
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/games/sessions/:gameId', async (req, res) => {
  try {
    const playerId = await requirePlayer(req, res);
    if (!playerId) return;
    const gameId = String(req.params.gameId);
    const [session] = await db.select().from(gameSessionsTable).where(and(
      eq(gameSessionsTable.id, gameId),
      eq(gameSessionsTable.playerId, playerId),
    )).limit(1);
    if (!session) throw new HttpGameError(404, 'GAME_NOT_FOUND', 'That game session was not found.');
    const state = storedState(session.state);
    res.json(gameResponse(session, state, await walletBalance(db, playerId), []));
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/games/:gameId/rounds', async (req, res) => {
  try {
    const playerId = await requirePlayer(req, res);
    if (!playerId) return;
    const gameId = String(req.params.gameId);
    const id = requestId(req.body?.requestId);
    const version = expectedVersion(req.body?.expectedVersion);
    const bets = parseBets(req.body?.bets);

    const response = await db.transaction(async tx => {
      const session = await lockOwnedSession(tx, gameId, playerId);
      const replay = await replayedResponse(tx, gameId, id);
      if (replay) return replay;
      if (session.version !== version) {
        throw new HttpGameError(409, 'STALE_GAME_VERSION', 'The game changed before this request arrived.', {
          version: session.version,
          game: toPublicGameState(storedState(session.state)),
        });
      }

      await lockPlayerWallet(tx, playerId);
      const balance = await walletBalance(tx, playerId);
      const result = startServerRound(storedState(session.state), bets, balance);
      const round = session.currentRound + 1;
      await tx.insert(walletTransactionsTable).values({
        playerId,
        kind: 'game_wager',
        amount: -result.wager,
        idempotencyKey: `game:${gameId}:round:${round}:initial-wager`,
        metadata: { gameId, round, tableId: session.tableId },
      });

      const credit = result.state.bankroll - (balance - result.wager);
      if (credit < 0 || !Number.isSafeInteger(credit)) {
        throw new Error('Game engine produced an invalid initial payout delta.');
      }
      if (credit > 0) {
        await tx.insert(walletTransactionsTable).values({
          playerId,
          kind: 'game_payout',
          amount: credit,
          idempotencyKey: `game:${gameId}:round:${round}:initial-payout`,
          metadata: { gameId, round, stage: 'initial_deal' },
        });
      }

      const nextVersion = session.version + 1;
      const [updated] = await tx.update(gameSessionsTable).set({
        state: responseRecord(result.state),
        status: result.state.settled ? 'settled' : 'active',
        currentRound: round,
        roundWager: result.wager,
        version: nextVersion,
        updatedAt: new Date(),
      }).where(eq(gameSessionsTable.id, gameId)).returning();

      const body = gameResponse(
        updated,
        result.state,
        balance - result.wager + credit,
        toPublicGameEvents(result.events, result.state),
      );
      await tx.insert(gameRequestsTable).values({
        gameSessionId: gameId,
        playerId,
        requestId: id,
        action: 'start_round',
        response: responseRecord(body),
      });
      return body;
    });
    res.json(response);
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/games/:gameId/actions', async (req, res) => {
  try {
    const playerId = await requirePlayer(req, res);
    if (!playerId) return;
    const gameId = String(req.params.gameId);
    const id = requestId(req.body?.requestId);
    const version = expectedVersion(req.body?.expectedVersion);
    const action = parseAction(req.body?.action);

    const response = await db.transaction(async tx => {
      const session = await lockOwnedSession(tx, gameId, playerId);
      const replay = await replayedResponse(tx, gameId, id);
      if (replay) return replay;
      if (session.version !== version) {
        throw new HttpGameError(409, 'STALE_GAME_VERSION', 'The game changed before this request arrived.', {
          version: session.version,
          game: toPublicGameState(storedState(session.state)),
        });
      }
      if (session.status !== 'active') {
        throw new HttpGameError(409, 'ROUND_NOT_ACTIVE', 'Start a new round before sending a player action.');
      }

      await lockPlayerWallet(tx, playerId);
      const previous = storedState(session.state);
      const result = applyServerAction(previous, action);
      const balanceBefore = await walletBalance(tx, playerId);
      if (result.additionalWager > balanceBefore) {
        throw new HttpGameError(409, 'INSUFFICIENT_CHIPS', 'The wallet cannot cover this action.');
      }
      if (result.additionalWager > 0) {
        await tx.insert(walletTransactionsTable).values({
          playerId,
          kind: 'game_wager',
          amount: -result.additionalWager,
          idempotencyKey: `game:${gameId}:round:${session.currentRound}:wager:${id}`,
          metadata: { gameId, round: session.currentRound, action: action.type },
        });
      }

      const credit = result.state.bankroll - (previous.bankroll - result.additionalWager);
      if (credit < 0 || !Number.isSafeInteger(credit)) {
        throw new Error('Game engine produced an invalid action payout delta.');
      }
      if (credit > 0) {
        await tx.insert(walletTransactionsTable).values({
          playerId,
          kind: 'game_payout',
          amount: credit,
          idempotencyKey: `game:${gameId}:round:${session.currentRound}:payout:${id}`,
          metadata: { gameId, round: session.currentRound, action: action.type, settled: result.state.settled },
        });
      }

      const nextVersion = session.version + 1;
      const [updated] = await tx.update(gameSessionsTable).set({
        state: responseRecord(result.state),
        status: result.state.settled ? 'settled' : 'active',
        roundWager: session.roundWager + result.additionalWager,
        version: nextVersion,
        updatedAt: new Date(),
      }).where(eq(gameSessionsTable.id, gameId)).returning();
      const body = gameResponse(
        updated,
        result.state,
        balanceBefore - result.additionalWager + credit,
        toPublicGameEvents(result.events, result.state),
      );
      await tx.insert(gameRequestsTable).values({
        gameSessionId: gameId,
        playerId,
        requestId: id,
        action: action.type,
        response: responseRecord(body),
      });
      return body;
    });
    res.json(response);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
