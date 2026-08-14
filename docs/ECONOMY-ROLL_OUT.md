# Royal Ace economy rollout

## What exists now

- New guest profiles receive one fixed 10,000-chip starter grant.
- A 2,000-chip daily reward can be claimed once per UTC calendar day.
- The lobby shows chip balance, daily streak, rounds played, level, and XP.
- The old arbitrary `Change Stack` control has been removed.
- A polished chip shop provides four server-owned product SKUs and a two-step checkout preview.
- Local development can complete a clearly labelled, no-charge sandbox purchase.
- Production builds fail closed with `Checkout unavailable` unless a future provider integration replaces the disabled checkout adapter.
- The PostgreSQL schema includes players, hashed sessions, an append-only wallet ledger, daily claims, and purchase orders.
- The API can create guest sessions, return wallet state and history, grant an idempotent daily reward, return the product catalog, and reject checkout while payments are unconfigured.

## Non-negotiable product boundary

Royal Ace chips are virtual play credits. They cannot be withdrawn, transferred, resold, exchanged for money, crypto, goods, services, physical prizes, or anything else of value. All user-facing surfaces must continue to show `Play chips · no cash value`.

## Economy modes

### Local demo

Vite development mode enables the sandbox cashier. It does not ask for card details and records only a local `demo_purchase` ledger entry. Browser data remains editable, so this mode is for experience testing only.

### Public build

The normal production build disables checkout. `VITE_ENABLE_DEMO_CHECKOUT` must remain unset or `false` for anything public. Never deploy a public build with the demo flag enabled.

### Future live mode

Live checkout requires all of the following before it can be enabled:

1. A payment provider approves the business and supplies sandbox credentials.
2. A provider adapter creates pending orders from server-owned SKUs.
3. The API verifies signed provider webhooks using the provider's official signing procedure.
4. Webhook handling is idempotent on the provider order ID.
5. The verified webhook and only the verified webhook inserts the positive `purchase` wallet transaction.
6. Refund and chargeback webhooks create reversing ledger entries.
7. The browser game is replaced by a server-authoritative game session for wagers and payouts.
8. Rate limits, monitoring, support tooling, spend controls, terms, privacy policy, age gating, and country availability are approved for launch.

The current checkout route intentionally returns `503 PAYMENTS_NOT_CONFIGURED`. Do not change that to a successful response until the gates above are complete.

## Database and API setup

1. Provision PostgreSQL and set `DATABASE_URL`.
2. Set `WEB_ORIGIN` to the exact HTTPS web origin. The production API refuses to start without it.
3. Apply the schema with `pnpm --filter @workspace/db run push` in a development database. Use reviewed migrations for production.
4. Start the API with `PORT=5000 pnpm --filter @workspace/api-server run dev`.
5. Build the web app with `PORT=4173 BASE_PATH=/ pnpm --filter @workspace/blackjack run build`.

## API map

- `POST /api/economy/session` — create or restore a guest session and grant starter chips once.
- `GET /api/economy/me` — profile, authoritative ledger balance, and daily availability.
- `POST /api/economy/daily-reward` — claim once per player and UTC date.
- `GET /api/economy/products` — server-owned catalog and payment availability.
- `GET /api/economy/transactions` — latest 50 ledger entries.
- `POST /api/economy/checkout` — intentionally disabled until a provider is configured.

## Important next external decisions

- Choose a company/legal entity and initial launch countries.
- Obtain written approval from a payment provider for non-redeemable social-casino chips.
- Decide whether guest accounts will be upgraded with email magic links, Google/Apple sign-in, or both.
- Decide whether web launch comes before native mobile applications.
