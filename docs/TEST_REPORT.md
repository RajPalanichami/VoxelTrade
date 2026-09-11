# Test Report — Voxel Trading

**Date:** 2026-09-10  
**Environment:** local Windows, Next.js dest at `http://127.0.0.1:3000`  
**Overall status:** **PASS WITH ISSUES**

This report is based on repository inspection plus executed TypeScript, lint, Vitest, Playwright, live `/api/v1` calls, and Playwright MCP browser sessions. Tests that were not executed are marked **BLOCKED** or **NOT RUN**, not PASS.

## 1. Executive Summary

Voxel Trading is a single Next.js 14 App Router application. Market engines run in-process behind `/api/v1`. Supabase is **auth only** and is **not configured** in this checkout (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are empty). Application data is a local JSON file, not Supabase Postgres.

Production build, TypeScript, lint, unit tests, live Signal Analyzer / Mag7 / sector APIs, and Playwright (after dest compiled) succeeded. Live OAuth and email authentication against a real Supabase project were **not** executed.

## 2. Modules Tested

| Module | Tested | Status | Issues |
|---|---|---|---|
| Authentication UI (Google / Facebook / Instagram / X / email forms) | Yes | PASS | Live provider login BLOCKED |
| OAuth callback open-redirect guard | Yes | PASS | External `next=` rejected |
| Live Google / Facebook / Instagram / X login | Attempted UI only | **BLOCKED** | Supabase env empty; no provider secrets in this environment |
| Email signup / login / reset against Supabase | UI + validation only | **BLOCKED** | Same missing Supabase config |
| Signal Analyzer (`/signals` + `/api/v1/stocks/{sym}/analysis`) | Yes | PASS | Deterministic engine tests + live AAPL/MSFT |
| Magnificent Seven (`/mag7` + `/api/v1/market/mag7`) | Yes | PASS | All 7 symbols present |
| Sector index (`/sectors`) | Yes | PASS | 12 sectors rendered |
| Sector dashboards (all 12 APIs + Technology UI) | Yes | PASS | Other 11 sector **pages** not each clicked in MCP |
| Homepage / Market Pulse | Yes | PASS | |
| Search / ticker filter | Yes | PASS | Search requires `q`; Signal Analyzer ticker switch in Playwright |
| Charts (Signal Analyzer + Options payoff) | Yes | PASS | |
| Options Visualizer | Yes | PASS | |
| Watchlist UI + JSON CRUD | Yes | PASS | Not user-scoped (P2) |
| Alerts JSON CRUD | Yes | PASS | Not user-scoped (P2) |
| News | Yes | PASS | Page loads; live article quality depends on providers |
| Alerts page | Yes | PASS | |
| Settings | Yes | PASS | Unprotected when Supabase unset (by design) |
| Backtesting | Yes | PASS | Page load only; no full live backtest run in MCP |
| Fundamentals | Yes | PASS | Page load |
| Dashboard / Technical / Multi-Timeframe | Partial | PASS WITH ISSUES | Dashboard/signals share SignalDashboard; technical/MTF not separately E2E’d |
| Health / providers | Yes | PASS | Yahoo available |
| Database (local JSON) | Yes | PASS | Insert/read/delete watchlist + alerts |
| Supabase RLS | N/A | **BLOCKED** | No application tables |
| Responsive (desktop / tablet / mobile) | Yes | PASS | Tablet Playwright uses Chromium 768×1024 (WebKit not installed) |
| Accessibility | Partial | PASS WITH ISSUES | No Axe package; login labels present; no full a11y suite |
| Security review | Yes | PASS WITH ISSUES | No secrets in source; shared JSON store |
| Production build | Yes | PASS | Pre-existing `PayoffChart` hook warning |

## 3. Static Analysis

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS with warning (`components/options/PayoffChart.tsx` react-hooks/exhaustive-deps) |
| `npm run build` | PASS (Next.js 14.2.35) |

## 4. Unit / Integration (Vitest)

`npm test` → **12 files, 76 tests, all passed**.

Includes: `auth`, `apiRouter`, `engines`, `mag7`, `movers`, `optionsPayoff`, `regime`, `sectors`, `settings`, `signalAnalyzer`, `timeframes`, `yfinanceBars`.

Deterministic Mag7 checks (not live prices): bullish trend stack = 25, bearish = 0, performance points cap 20, YTD calendar-year math, ranking 0–100.

Deterministic Signal Analyzer checks: React Query keys include symbol+timeframe, stale-selection guard, cached ISO timestamp revival, unsupported `2h` → 400.

## 5. API Tests (live dest)

| Endpoint | Method | Result |
|---|---|---|
| `/api/health` | GET | 200 `{ ok:true, service:"pro-trader-api" }` |
| `/api/v1/health` | GET | 200 |
| `/api/v1/search?q=AAPL` | GET | 200 AAPL in universe |
| `/api/v1/search` | GET | 400 `q is required` |
| `/api/v1/market/status` | GET | 200 OPEN/CLOSED clock |
| `/api/v1/market/overview` | GET | 200 |
| `/api/v1/market/sectors` | GET | 200 12 sectors |
| `/api/v1/market/sector/{slug}` (all 12) | GET | 200, 8 stocks each |
| `/api/v1/market/sector/not-a-sector` | GET | 404 |
| `/api/v1/market/mag7?timeframe=1d&range=1Y` | GET | 200, symbols AAPL,META,MSFT,TSLA,NVDA,AMZN,GOOGL |
| `/api/v1/stocks/AAPL/analysis?timeframe=1h` | GET | 200 symbol=AAPL tf=1h signal=WAIT score=67 bars=300 |
| `/api/v1/stocks/AAPL/analysis?timeframe=5m` | GET | 200 |
| `/api/v1/stocks/MSFT/analysis?timeframe=1h` | GET | 200 signal=WEAK score=56 |
| `/api/v1/stocks/AAPL/analysis?timeframe=2h` | GET | 400 unsupported timeframe |
| `/api/v1/stocks/INVALIDXYZ/analysis?timeframe=1d` | GET | 502 no invented data |
| `/api/v1/stocks/AAPL/signal?timeframe=1d` | GET | 200 |
| `/api/v1/stocks/AAPL/levels?timeframe=1h` | GET | 200 pivot/S/R present |
| `/api/v1/options/payoff` | POST | 200 max_loss=-250 (spot 100 / 2.5 premium) |
| `/api/v1/watchlist/VOXLTEST` | POST | 200 |
| `/api/v1/watchlist/VOXLTEST` | DELETE | 200 |
| `/api/v1/watchlist/VOXLTEST` | PUT | 404 (no PUT in this API) |
| `/api/v1/alerts` | POST/GET/DELETE | 200 create/list/delete |
| `/api/v1/health/providers` | GET | 200 yfinance ok |

There is no PUT/PATCH resource API in `src/server/apiRouter.ts`.

## 6. Playwright E2E

Config: `playwright.config.ts`. Base URL `http://localhost:3000`.

| Project | Tests executed | Passed | Failed |
|---|---|---|---|
| desktop-1920 (final, serial, dest compiled) | 10 | 10 | 0 |
| tablet-768 Chromium 768×1024 (auth) | 4 | 4 | 0 |
| mobile-390 (auth) | 4 | 4 | 0 |
| desktop-1440 / desktop-1280 full suite | 0 | — | **NOT RUN** |
| tablet WebKit (`devices['iPad Mini']`) | 0 | — | **BLOCKED** — Playwright WebKit binary not installed |

Final desktop-1920 cases:

- login providers + email form
- signup mismatch / unconfigured Supabase message
- forgot-password navigation
- `/auth/callback?next=https://evil.example` stays on-site
- Market Pulse tiles one lane + overflow ≤ 1
- header Login modal
- watchlist Add ticker opens auth modal
- auth deep links
- Options Visualizer payoff chart
- Signal Analyzer timeframes + AAPL search

Locator tests were aligned with the actual UI (`Market Pulse` exact, `Butterfly` exact, Options heading `WHAT IF AT EXPIRATION`). Tablet project no longer requires WebKit.

**Note:** A 10-worker first compile storm timed out `page.goto`. That was dest compile contention, not a product defect. Re-run with `--workers=1` after compile succeeded.

## 7. Playwright MCP Browser

Exercised: `/`, `/signals`, `/mag7`, `/sectors`, `/sector/technology`, `/login`, `/options`, `/dashboard`, `/news`, `/alerts`, `/settings`, `/backtesting`, `/fundamentals`.

| Page | Result |
|---|---|
| Homepage | Market Pulse, 15 tiles, Login control, overflow 0 |
| Signal Analyzer | MSFT 1 Hour SIGNAL 56/100 WEAK; 10-signal table; chart; no DATA UNAVAILABLE; overflow 0 |
| Mag7 | NVDA, AAPL, MSFT, AMZN, GOOGL, META, TSLA ranked; overflow 0 |
| Sectors | All 12 names + ETFs |
| Technology sector | AAPL/MSFT/CRM ranked; overflow 0 |
| Login | Four social buttons + Email/Password labels; Google click → “Supabase is not configured…” |
| Options | PAYOFF AT EXPIRATION + `payoff-chart` + Max loss |
| Settings | Loads (middleware skips protect when env empty) |
| Tablet 768 / mobile 390 homepage | overflow 0; Login + Market Pulse visible |

Console: after dest restart, current-page error streams for Mag7 / Signals / Technology were empty. Session-wide `all: true` also contained **stale** errors from an earlier broken `.next` (404 chunks) and dest overload (MSFT/META 500/502). Those are **not** current failures; live MSFT analysis later returned 200.

Legitimate remaining console issue: header clock hydration (server vs client minute). Classified P3.

## 8. Authentication Detail

| Flow | Result |
|---|---|
| Google / Facebook / Instagram / X buttons visible | PASS |
| Google click without env | PASS — configuration error, no redirect to provider |
| Email form + labels | PASS |
| Signup password mismatch (or unconfigured message) | PASS (Playwright) |
| Forgot-password page | PASS |
| Callback open redirect | PASS |
| Full OAuth to Google/Facebook/Instagram/X | **BLOCKED** — no live Supabase/provider credentials |
| Email signup confirmation | **BLOCKED** |
| Valid/invalid password login | **BLOCKED** |
| Logout of a real session | **BLOCKED** |
| Account linking | **NOT RUN** — requires an existing session |

Do not treat UI presence as a passed OAuth login.

## 9. Signal Analyzer Validation

- Live analysis returns matching `symbol`, `timeframe`, numeric `score`, classification (`WAIT`/`WEAK`/etc.), and bar count > 20.
- Invalid ticker → 502, no fabricated candles.
- Unsupported timeframe → 400.
- Playwright: 30m / 1h / 4h / Daily + AAPL search completed without DATA UNAVAILABLE.
- MCP: 10-signal framework, EMA/VWAP/S-R chart, hard-filter text present.
- Unit tests cover cache Date revival (the previous `toISOString` production bug).

Scoring formulas were not changed to make tests pass.

## 10. Magnificent Seven Validation

Universe in `src/engines/mag7Score.ts`: NVDA, MSFT, META, AAPL, AMZN, GOOGL, TSLA.

Live API returned all seven. UI ranked strongest → weakest with scores, prices, and 1W/1M/3M/1Y. Deterministic engine tests passed on synthetic frames.

## 11. Sector Dashboards

Slugs: technology, semiconductors, communication, financials, energy, healthcare, discretionary, industrials, staples, materials, utilities, real-estate.

All 12 `/api/v1/market/sector/{slug}` calls returned 200 with 8 members. Technology UI verified in MCP. Remaining sector **pages** were not each opened in the browser (API coverage is complete).

## 12. Database / RLS

| Check | Result |
|---|---|
| Watchlist add/delete | PASS (local JSON) |
| Alerts create/list/delete | PASS (local JSON) |
| User ownership via `auth.uid()` | **Does not exist** |
| Cross-user isolation | **FAIL as a security property** — one process-wide store |
| Supabase RLS policies | **N/A** — no `supabase.from()` |

This is a P2 authorization gap if the app is treated as multi-user.

## 13. Accessibility / Performance / Security

**Accessibility:** Login Email/Password labels exist; menu button has `aria-label="Open menu"`. Axe is not installed. Full keyboard/screen-reader pass **NOT RUN**.

**Performance:** Homepage pulse ~5s first compile then cached; analysis 0.7–4s when Yahoo is warm. No Lighthouse config. Duplicate `/api/v1/market/status` on homepage (React Query + header) is a P3.

**Security search (source, not `node_modules`):** no `SUPABASE_SERVICE_ROLE_KEY` usage, no hardcoded JWT/service keys. `.env` / `.env.local` gitignored. Callback `next` allowlisted.

| Item | Status |
|---|---|
| Secrets exposed in git/source | **NO** |
| Service-role key exposed | **NO** |
| RLS concerns | **YES** — no app RLS; shared JSON store |
| Authentication concerns | **YES** — live IdP flows unverified here; `/settings` unprotected when env empty |

## 14. Defect Classification

### P0 — Critical

None found in this run.

### P1 — High

None found in this run.

### P2 — Medium

1. **Watchlist/alerts/snapshots are not per-user.** `src/repositories/store.ts` is a shared file. Any client can GET/POST/DELETE `/api/v1/watchlist` and `/api/v1/alerts`.
2. **Vercel filesystem is ephemeral** for that JSON store. Documented in `docs/VERCEL_DEPLOYMENT.md`.
3. **Live OAuth/email auth BLOCKED** in this environment — cannot certify production login.

### P3 — Low

1. Header clock hydration mismatch (`America/New_York` time rendered on server and client).
2. `PayoffChart` exhaustive-deps lint warning (pre-existing).
3. `/favicon.ico` 404 (app has `icon.svg` instead).
4. Unused leftovers: `SecProvider` class never instantiated; `REDIS_URL` / `OPENAI_API_KEY` read but unused.
5. Dest first-compile + 10 Playwright workers can time out `page.goto`.

## 15. Blocked Tests (do not treat as PASS)

| Test | Why |
|---|---|
| Real Google/Facebook/Instagram/X OAuth | `NEXT_PUBLIC_SUPABASE_*` empty; provider dashboards not available |
| Email signup confirmation / login / logout | Same |
| Password reset email delivery | Same |
| Supabase RLS / multi-tenant DB | No Supabase tables |
| Axe accessibility | Package not installed |
| Lighthouse | Not configured |
| Playwright desktop-1440 / 1280 full matrix | Not executed this run |
| WebKit iPad project | Browser binary missing; replaced with Chromium tablet viewport |

## 16. Final Architecture (after cleanup)

```text
Browser
  |
  v
Next.js 14 App Router
  |
  +-- Pages (App Router)
  +-- /api/health  /api/v1/[[...path]]
  +-- middleware.ts  (/settings only, if Supabase env set)
  |
  +------------------+---------------------------+
  |                                              |
  v                                              v
Supabase Auth (optional)                  Market providers
  Google / Facebook / X                   Yahoo (default fallback)
  Instagram custom:instagram              Twelve Data / AV / Finnhub / FRED
  Email/password
  |
  v
No application Postgres / Storage

Local JSON  data/protrader.json
  watchlist / alerts / snapshots
```

## 17. Counts

| Metric | Value |
|---|---|
| Modules in inventory | 20 |
| Vitest tests | 76 passed |
| Playwright tests executed (final) | 18 passed (10 desktop + 4 tablet + 4 mobile) |
| Live API checks | 24+ (including 12 sectors) |
| MCP pages exercised | 13 |
| Failed automated tests (final) | 0 |
| Blocked auth/IdP tests | 6+ |
| P0 / P1 | 0 |
| P2 | 3 |
| P3 | 5 |
