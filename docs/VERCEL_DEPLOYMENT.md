# Vercel Deployment Guide

How to deploy **this** Voxel Trading repository to Vercel. Values below come from `package.json`, `next.config.mjs`, `Dockerfile`, and source — not generic Vercel templates.

## 1. Application Architecture

```text
User
  |
  v
Vercel (Next.js 14 serverless / Node runtime)
  |
  +-- Static / SSR pages   (app/*)
  +-- Route Handlers       /api/health, /api/v1/[[...path]]
  +-- Middleware           /settings only
  |
  +------------------+---------------------------+
  |                                              |
  v                                              v
Supabase Auth                            External market APIs
(cookie session, anon key)               Yahoo (always)
                                         Twelve Data, Alpha Vantage,
                                         Finnhub, FRED (optional keys)
  |
  v
Local JSON store  (see compatibility warning)
src/repositories/store.ts → DATABASE_URL file:./data/protrader.json
```

There is no separate Python, FastAPI, Express, or WebSocket server.

## 2. Vercel Compatibility Audit

| Component | Compatible? | Notes |
|---|---|---|
| Next.js App Router UI | Yes | Standard Vercel Next.js |
| `/api/health`, `/api/v1/*` | Yes | `runtime = "nodejs"`, `dynamic = "force-dynamic"` |
| `middleware.ts` | Yes | Edge middleware; only matches `/settings` |
| Supabase Auth | Yes | `@supabase/ssr` cookie flow |
| Yahoo / HTTP market providers | Yes | Outbound HTTPS |
| In-memory cache (`src/lib/cache.ts`) | Partial | Per-instance; not shared across lambdas |
| **JSON file store** (`store.ts`) | **Writable, not durable** | On Vercel/Lambda the store writes `/tmp/voxel-trading/protrader.json` (writable). `/var/task` is read-only and must not be used. Data is still ephemeral across instances. |
| Long-running Node/Python process | Not required | Do not deploy as a traditional always-on server on Vercel |
| Cron / queues / WebSockets | None in repo | |
| Native binaries / Docker-on-Vercel | Not required | Docker is an **alternative** deploy (`Dockerfile`) |
| Playwright / Vitest | CI only | Not part of the production server |

**Production implication:** watchlist, alerts, and signal snapshots will reset or diverge across Vercel instances. Docker + volume (`docker-compose.yml` mounts `/app/data`) is the current design for durable local state. Moving that store to Postgres/Supabase is a future change; it is not implemented.

`getSettings().validateRuntime()` requires `CORS_ORIGINS` and `SEC_USER_AGENT` when `ENVIRONMENT` is `production`, `qa`, `staging`, `performance`, or `perf`. Set those on Vercel if you set `ENVIRONMENT` to one of those values. `NODE_ENV=production` alone does **not** trigger that check.

## 3. Build Configuration

From this repository:

| Setting | Value |
|---|---|
| Framework | Next.js 14 (`next` `^14.2.18`) |
| Package manager | **npm** (`package-lock.json`; no pnpm/yarn lockfile) |
| Install command | `npm ci` (or Vercel default `npm install`) |
| Build command | `npm run build` → `next build` |
| Start (non-Vercel) | `npm start` → `next start` |
| Output | Next.js default (no `output: 'export'`) |
| Node version | **20** (`Dockerfile` uses `node:20-bookworm-slim`) |
| `vercel.json` | **Not present** — Vercel auto-detects Next.js |

## 4. Environment Variables

| Variable | Required | Public/Secret | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | For auth | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For auth | Public | Anon key |
| `NEXT_PUBLIC_SUPABASE_INSTAGRAM_PROVIDER` | No | Public | Default `custom:instagram` |
| `NEXT_PUBLIC_API_URL` | No | Public | Leave empty for same-origin `/api` |
| `NEXT_PUBLIC_BRAND_SITE_URL` | No | Public | Brand link |
| `ENVIRONMENT` | Recommended | Secret/config | `production` enables extra validation |
| `CORS_ORIGINS` | If `ENVIRONMENT` is deployed | Config | Comma-separated origins |
| `SEC_USER_AGENT` | If `ENVIRONMENT` is deployed | Config | Required by `validateRuntime()` |
| `DATABASE_URL` | No | Config | Default `file:./data/protrader.json` (ephemeral on Vercel) |
| `TWELVE_DATA_API_KEY` | No | Secret | Optional quotes/movers |
| `ALPHA_VANTAGE_API_KEY` | No | Secret | Optional fallback |
| `FINNHUB_API_KEY` | No | Secret | Optional fallback |
| `FRED_API_KEY` | No | Secret | Optional macro |
| `PRIMARY_PROVIDER` / `FALLBACK_PROVIDERS` | No | Config | Defaults include Yahoo last |
| `ALGORITHM_VERSION` | No | Config | Health payload |
| Google/Facebook/X/Instagram client secrets | Dashboard | Secret | **Not Vercel env vars** |

Do not add `SUPABASE_SERVICE_ROLE_KEY` to Vercel for this app.

## 5. Supabase + Vercel Integration

```text
Vercel Project → Settings → Environment Variables
    ↓
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
    ↓
next build  (inlines NEXT_PUBLIC_* into the client)
    ↓
Browser + middleware + /auth/callback
    ↓
Supabase Auth
```

Set the same two public values on **Development**, **Preview**, and **Production** if they share one Supabase project, **or** use separate Supabase projects per environment.

After changing `NEXT_PUBLIC_*`, trigger a **new deployment** (rebuild). Redeploying without rebuild will keep old inlined keys.

Add each Vercel URL to Supabase redirect allow list (section 9).

## 6. Vercel Project Creation

1. Push this repo to GitHub.
2. [vercel.com](https://vercel.com) → Add New → Project → import the repo.
3. Framework Preset: **Next.js**.
4. Root directory: repository root (this folder contains `package.json` and `app/`).
5. Install: `npm ci` / Build: `npm run build`.
6. Add environment variables from section 4.
7. Deploy.

## 7. GitHub Integration

| Item | Recommendation for this repo |
|---|---|
| Production branch | `main` (or your default) |
| Preview | Every pull request gets a `*.vercel.app` URL |
| Production | Pushes to the production branch |

There is no GitHub Actions workflow in this repository. Vercel Git integration is the documented CI deploy path.

## 8. Custom Domain

Vercel → Project → Settings → Domains → add `example.com` and `www.example.com`.

Then add matching origins to:

- Supabase Site URL / redirect allow list
- `CORS_ORIGINS` if `ENVIRONMENT` is a deployed value

## 9. Authentication Redirect URLs

Application callback (this repo):

```text
https://<vercel-production-domain>/auth/callback
https://<vercel-preview-domain>/auth/callback
http://localhost:3000/auth/callback
```

Password reset landing:

```text
https://<domain>/auth/update-password
```

**Provider consoles** (Google, Facebook, X, Instagram/Meta) must use the **Supabase** callback, not the Next.js route:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

These strings must match exactly (scheme, host, path, no extra slash mismatch).

## 10. Server / Function Configuration

| Function | Runtime | Dynamic | Notes |
|---|---|---|---|
| `app/api/health/route.ts` | `nodejs` | `force-dynamic` | Fast JSON health |
| `app/api/v1/[[...path]]/route.ts` | `nodejs` | `force-dynamic` | Entire v1 API; may call Yahoo and take several seconds |
| `app/auth/callback/route.ts` | Node (default) | Request | Code exchange |
| `middleware.ts` | Edge | `/settings` only | |

Vercel default function timeout (Hobby ~10s, Pro higher) can be tight for `/api/v1/stocks/{sym}/analysis` (multi-timeframe + provider failover). If analysis times out, raise the function max duration in Vercel or keep using Docker/`next start` for long requests.

No region or memory is hardcoded in the repo.

## 11. Cron Jobs

This repository has **no cron jobs**, no `vercel.json` crons, and no scheduled API. Do not invent a scheduler.

## 12. External API Dependencies

| API | Used by | Env | Required in production? |
|---|---|---|---|
| Yahoo Finance chart/quote | `src/providers/yfinance.ts` | none | Effective default fallback |
| Twelve Data | `twelveData.ts`, movers | `TWELVE_DATA_API_KEY` | No |
| Alpha Vantage | `alphaVantage.ts` | `ALPHA_VANTAGE_API_KEY` | No |
| Finnhub | `finnhub.ts` | `FINNHUB_API_KEY` | No |
| FRED | `macro.ts` | `FRED_API_KEY` | No (CSV fallback exists) |
| BLS / World Bank | `inflation.ts` | URLs in settings | No |

Yahoo rate limits (422/429/401) are handled as provider failures; the UI shows data-unavailable rather than inventing prices.

## 13. Deployment Commands

```bash
# Local
npm install
npm run dest

# Validate
npx tsc --noEmit
npm run lint
npm test
npm run test:e2e
npm run build

# Vercel CLI (optional)
npx vercel
npx vercel --prod
```

Package manager is **npm**.

## 14. Deployment Verification

After deploy, hit the production host:

1. `/` homepage and Market Pulse tiles
2. `/login` — all four social buttons + email form (OAuth only if keys are set)
3. `/auth/callback?next=/` — must not redirect off-site
4. `/api/health` → `{ ok: true, service: "pro-trader-api" }`
5. `/api/v1/stocks/AAPL/analysis?timeframe=1h` → signal + bars
6. `/api/v1/market/mag7?timeframe=1d&range=1Y`
7. `/signals`, `/mag7`, `/sectors`, `/sector/technology`
8. Search, timeframe control, charts
9. Mobile and desktop widths

Watchlist persistence on Vercel is **not** a pass criterion until a durable store exists.

## 15. Production Troubleshooting

| Failure | What to check in this app |
|---|---|
| Build fail | `npm run build` locally; TypeScript / missing `NEXT_PUBLIC_*` at build |
| Missing env | Vercel env scope (Production vs Preview) |
| Supabase connection | URL/anon set **before** build |
| OAuth mismatch | Section 9 URLs |
| API timeout | Analysis route duration vs Vercel limit; Yahoo latency |
| Function 500 | `ENVIRONMENT` deployed without `CORS_ORIGINS` / `SEC_USER_AGENT` |
| CORS | Only matters if `NEXT_PUBLIC_API_URL` points at another origin |
| Watchlist vanished | Expected on serverless JSON store |
| External API fail | Provider chain; Yahoo 422/429 |

## 16. Production Checklist

- [ ] GitHub repo connected
- [ ] Production branch configured
- [ ] `NEXT_PUBLIC_SUPABASE_*` set for Production and Preview
- [ ] `ENVIRONMENT` / `CORS_ORIGINS` / `SEC_USER_AGENT` set if using a deployed environment name
- [ ] Optional market-data keys set
- [ ] Supabase providers + redirect URLs configured
- [ ] Custom domain + matching OAuth allow list
- [ ] `npm run build` succeeds
- [ ] Production URL loads
- [ ] `/api/health` and a sample `/api/v1` analysis succeed
- [ ] Auth tested with a non-production user
- [ ] Signal Analyzer and Mag7 pages load
- [ ] No service-role key in Vercel or git
- [ ] Team understands watchlist JSON is ephemeral on Vercel
