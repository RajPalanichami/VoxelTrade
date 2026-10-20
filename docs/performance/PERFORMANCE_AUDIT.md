# Voxel Trading performance audit

Measured on the local Next.js dev server (`http://localhost:3000`) on 2026-10-20. Dev timings include on-demand compilation, so they are not production LCP numbers. There is no database. Market data comes from Yahoo Finance, FRED, BLS, and the existing provider chain. Authentication is Supabase and only `/settings` is middleware-protected.

## Stack

Next.js 14 App Router, React 18, TypeScript, TanStack Query, lightweight-charts, in-memory server cache (`src/lib/cache.ts`). No Pages Router.

## Route inventory

38 `app/**/page.tsx` routes. Shared shell: `app/layout.tsx` → theme, auth, query client, `AppShell`. API surface is `src/server/apiRouter.ts` under `/api/v1/*` (quotes, bars, indicators, analysis, pulse, movers, options, watchlist, alerts, crypto, sectors).

| Route | Purpose |
| --- | --- |
| `/` | Overview pulse, tiles, events |
| `/dashboard`, `/signals` | Signal analyzer |
| `/scalp-analyzer` | Scalp analyzer |
| `/trade-your-plan`, `/trade-your-plan/[symbol]` | Trade plan |
| `/stock-decision`, `/stock-decision/[symbol]` | Stock decision |
| `/patterns` | Chart patterns |
| `/stock-buying-engine`, `/stock-buying-engine/[symbol]` | Buying engine |
| `/breakout-potential` | Breakout scanner |
| `/opportunity` | Opportunity monitor |
| `/options`, `/option-analyzer` | Options |
| `/swing` | Swing trading |
| `/crypto` | Crypto |
| `/compare`, `/comparison`, `/mag7-compare` | Comparisons |
| `/multi-timeframe` | Multi-timeframe |
| `/watchlist`, `/news`, `/alerts`, `/settings` | Account and lists |
| `/mag7` | Magnificent Seven |
| `/sector/[slug]`, `/sectors` | Sector pages |
| `/tools`, `/technical`, `/fundamentals` | Tools and analysis |
| `/markets`, `/market` | Market views |
| `/login`, `/signup`, `/forgot-password`, `/auth/update-password` | Auth |
| `/backtesting` | Backtesting |

## Baseline (before this change)

Browser, cold dev compile, 1440×900, 2.5s after DOMContentLoaded. Script: `node scripts/perf-baseline.mjs`.

| Route | TTFB | FCP | DOM | Requests |
| --- | --- | --- | --- | --- |
| `/` | 4005 ms | 4340 ms | 4098 ms | 12 |
| `/dashboard` | 2609 ms | 2736 ms | 2690 ms | 14 |
| `/signals` | 6714 ms | 6844 ms | 6756 ms | 14 |
| `/technical` | 1107 ms | 1232 ms | 1178 ms | 18 |
| `/crypto` | 2328 ms | 2464 ms | 2376 ms | 18 |
| `/login` | 1282 ms | 1400 ms | 1344 ms | 12 |

INP and CLS were not measured. These TTFB numbers are dominated by the dev compiler.

API:

| Call | Time | Bytes |
| --- | --- | --- |
| `GET /api/v1/stocks/MSFT/quote` cold | 477 ms | 741 |
| same quote again | 104 ms | 737 |
| `GET /api/v1/market/pulse?range=1D` cold | 40854 ms | 45956 |
| same pulse again | 162 ms | 45956 |
| `GET /api/v1/market/pulse?range=1W` cold | 41870 ms | 39643 |

Phase log for the 1W cold build:

| Phase | Finished at |
| --- | --- |
| Market gauge | 1091 ms |
| Movers | 1408 ms |
| CPI | 2581 ms |
| News | 3943 ms |
| Sectors | 4827 ms |
| Index cards | 6719 ms |
| Performance series | 6745 ms |
| FRED treasury | 40775 ms |

The overview waited on four treasury series. Each series downloaded the full FRED CSV twice (once inside `FredProvider.series` and once beside it), two at a time.

## Changes

1. Treasury history downloads each FRED series once, requests the last four years (`cosd`) instead of the full history back to the 1960s, and caches that CSV for the existing macro TTL (10 minutes). The yield math is still `fromYields` on those observations. US 10-year after the change: 5.117 on 2026-10-20T19:25:18Z.
2. Identical in-flight market-data calls share one promise (`singleFlight`) in the analysis failover path, the Yahoo session handshake, and pulse builds.
3. After the 10-minute pulse cache expires, the previous payload is returned immediately and refreshed in the background. `last_updated` stays the timestamp of that payload.
4. Sidebar links no longer prefetch every route on load. A link is prefetched when it is hovered or focused. Navigation is still `next/link`.
5. Terminal and auth context values are memoized. Opening the mobile menu no longer rerenders the page through the terminal context.

## After

| Call | Before | After |
| --- | --- | --- |
| Cold pulse | 40854 ms (1D) and 41870 ms (1W) | 20759 ms (1Y) and 23635 ms (3M) |
| Warm pulse | 162 ms (1D) | 266 ms (3M, immediate repeat) |

Cold overview data is about 20 seconds faster. The remaining cold time is the parallel Yahoo quote and history fan-out for the index cards. Warm responses stay under 300 ms. Dev-page TTFB was not remeasured because it is compiler time, not this data path.

## Not measured

Production LCP, INP, CLS, and bundle size. `npx next build` still stops on the existing type error in `components/opportunity/OpportunityMonitor.tsx` line 309, so a production trace was not collected. No database indexes apply.
