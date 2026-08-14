# Royal Ace Blackjack

A social-blackjack web game with realistic shoe dealing, multiple casino table themes, virtual play chips, daily rewards, progression, and a payment-safe chip-shop foundation.

## Run and verify

- `PORT=4173 BASE_PATH=/ pnpm --filter @workspace/blackjack run dev` — web app.
- `PORT=5000 DATABASE_URL=... WEB_ORIGIN=http://localhost:4173 pnpm --filter @workspace/api-server run dev` — API.
- `pnpm run test` — game-engine and economy tests.
- `pnpm run typecheck` — full workspace type check.
- `pnpm run build` — production builds.
- `pnpm --filter @workspace/db run push` — push schema to a development PostgreSQL database.

Required production environment:

- `DATABASE_URL` — PostgreSQL connection string.
- `WEB_ORIGIN` — exact HTTPS frontend origin; required in production.
- `PORT` — process port.
- `BASE_PATH` — frontend base path, normally `/`.

Never enable `VITE_ENABLE_DEMO_CHECKOUT` in a public build.

## Stack and source map

- Web: React 19, Vite, TypeScript, Tailwind CSS, Framer Motion.
- API: Express 5, signed-cookie-style opaque guest sessions, Zod-ready API workspace.
- Database: PostgreSQL and Drizzle ORM.
- Game rules and state: `artifacts/blackjack/src/lib`.
- Economy UI/state: `artifacts/blackjack/src/economy/EconomyContext.tsx`.
- Chip shop: `artifacts/blackjack/src/components/ShopModal.tsx`.
- Economy API: `artifacts/api-server/src/routes/economy.ts`.
- Database schema: `lib/db/src/schema/index.ts`.
- Rollout and safety gates: `docs/ECONOMY-ROLL_OUT.md`.
- QA coverage: `docs/QA-ECONOMY.md`.

## Architecture decisions

- A wallet is an append-only transaction ledger; the displayed balance is the sum of its entries.
- Server-owned SKUs determine price and chip grants. Browser-provided chip amounts are never trusted.
- Starter and daily grants use unique idempotency keys and database uniqueness constraints.
- Session tokens are random, stored only as hashes, sent as HTTP-only cookies, and expire after 30 days.
- Credentialed CORS fails closed in production if `WEB_ORIGIN` is missing.
- Checkout fails closed until payment-provider underwriting and signed webhook verification exist.
- The local economy is deliberately labelled as a demo and is not suitable for paid credits.

## Product boundary

Chips have no cash value and cannot be withdrawn, transferred, resold, exchanged, or used to obtain anything of value. Real-money gaming, prizes, cash-out, and transferable value are outside this product.

## Known go-live gate

Do not accept real payments yet. The payment provider and server-authoritative game-session layer must be completed before purchased chips are enabled. See `docs/ECONOMY-ROLL_OUT.md`.
