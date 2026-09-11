# Voxel Trading

Single-repository, single-deployment Next.js application. The UI and market engines both run inside Next.js — there is no Python, FastAPI, or separate backend process.

Open **http://localhost:3000**. APIs are served from the same origin at `/api/...`.

## Prerequisites

- Node.js 20+
- npm (this repository’s package manager)

Python is not required.

## Environment

```bash
cp .env.example .env
```

Fill optional market-data keys if you have them. The app works without paid keys by falling back to Yahoo public endpoints.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Browser | Leave empty to use same-origin `/api` |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | Optional auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Optional auth (anon key only) |
| `DATABASE_URL` | Server | Local JSON store, default `file:./data/protrader.json` |
| `TWELVE_DATA_API_KEY` | Server | Optional quote/bars provider |
| `ALPHA_VANTAGE_API_KEY` | Server | Optional fallback |
| `FINNHUB_API_KEY` | Server | Optional fallback |
| `FRED_API_KEY` | Server | Optional macro data |
| `SEC_USER_AGENT` | Server | Required in deployed environments |
| `CORS_ORIGINS` | Server | Required in deployed environments |
| `ENVIRONMENT` | Server | `development` locally; `production` / `qa` when deployed |

Never put service-role keys, API secrets, or passwords in `NEXT_PUBLIC_*`.

### Authentication

Supabase Auth is the only identity layer (Google, Facebook, X, Instagram via Custom OAuth, and email/password). Provider client secrets stay in the Supabase dashboard.

- [docs/authentication.md](docs/authentication.md) — operator setup, redirect URLs, account linking
- [docs/SUPABASE_INTEGRATION.md](docs/SUPABASE_INTEGRATION.md) — exact file locations, env vars, client vs server
- [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md) — Vercel build, env, and serverless limits
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md) — latest verification results

## Development

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3000/api/v1/...`
- Health: `http://localhost:3000/api/health`

## Production

```bash
npm run build
npm start
```

Docker (one Node.js image, no Python):

```bash
docker compose up --build
```

## Project structure

```text
app/                 Next.js App Router pages and /api route handlers
components/          React UI
lib/                 Frontend helpers (API client, auth, config)
src/config/          Typed environment
src/engines/         Indicators, scoring, plans, options, backtests
src/services/        Analysis, pulse, MAG7, movers, sectors
src/providers/       Twelve Data, Alpha Vantage, Finnhub, Yahoo, FRED, SEC
src/repositories/    Local watchlist / alerts / snapshots store
src/server/          API dispatcher used by /app/api/v1
public/              Static assets
tests/               Vitest unit tests
```

## API architecture

Route handlers live under `app/api/`. Business logic is in TypeScript services — handlers do not call a second server.

Important endpoints (same contracts as the previous FastAPI app):

- `GET /api/health`
- `GET /api/v1/search`
- `GET /api/v1/stocks/{symbol}/{quote,bars,indicators,levels,signal,trading-plan,multi-timeframe,analysis,fundamentals,news}`
- `GET /api/v1/market/{pulse,overview,status,mag7,sectors,sector/{slug}}`
- `GET/POST/DELETE /api/v1/watchlist`
- `GET/POST/DELETE /api/v1/alerts`
- `GET /api/v1/options/{symbol}/chain`
- `POST /api/v1/options/payoff`
- `POST /api/v1/backtests`
- `GET /api/v1/health/providers`

The original API did not expose PUT/PATCH resource updates.

## Testing

```bash
npm test
npm run test:e2e
```

## Deployment

See [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md). Deploy this folder as one Next.js application (Node.js 20). Do not start a Python process, uvicorn, Flask, or FastAPI.

UI routes: `/`, `/dashboard`, `/signals`, `/options`, `/mag7`, `/sectors`, `/watchlist`, `/news`, `/alerts`, `/backtesting`, `/settings`.
