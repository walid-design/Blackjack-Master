# Economy QA inventory

## User-visible claims and checks

| Claim or control | Functional check | Visual state |
| --- | --- | --- |
| New profile receives 10,000 chips once | Create profile and verify lobby balance | Welcome and post-entry lobby at 1920×1080 |
| Daily reward grants 2,000 once | Double-click claim; verify 12,000 total and disabled claimed state | Post-claim lobby |
| Chip terminology has no cash implication | Inspect lobby, table limits, balance, wager, and disclosures | Lobby, table, shop |
| Shop is a no-charge sandbox locally | Open shop and inspect badge/disclosure | Desktop and 390×844 mobile modal |
| Shop uses confirmation rather than one-click purchase | Select a pack and verify order-summary step | Order summary |
| Rapid confirmation cannot double grant | Double-click confirmation; verify a single 40,000-chip grant | Success state and lobby balance |
| Table cashier synchronizes the active balance | Buy 12,000 from inside table and verify table balance increases once | Mobile table |
| Production build cannot grant chips | Open production preview and verify disabled checkout | Product confirmation |
| Progression records completed play | Finish a round, leave table, verify 1 round and 25 XP | Post-round lobby |
| Existing game remains usable | Sit, wager, deal, stand, settle | Initial, player-turn, and settled table |
| Large desktop fit | Verify no horizontal/vertical table overflow at 1920×1080 | Empty and settled table |
| Mobile fit | Verify no horizontal overflow at 390×844 | Lobby, shop, table |

## Exploratory cases

- Double-click daily reward and checkout confirmation.
- Enter the table directly without first opening the lobby.
- Open and close the shop from both lobby and table.
- Complete a losing round and confirm wallet persistence and progression.
- Check browser console errors in development and production preview.

## Automated checks

- Complete-shoe integrity, shuffle, burn, discard, action locks, split sequencing, double-down validation, S17, and reshuffle tests.
- Unique server product SKUs, positive prices/grants, and rejection of invented browser SKUs.
- Full TypeScript workspace type check.
- Blackjack web production build and API production bundle.
