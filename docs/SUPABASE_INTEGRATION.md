# Supabase Integration Guide

This document describes **how Voxel Trading uses Supabase in this repository**. It is not generic Supabase documentation.

Supabase is used for **authentication only**. The application does not query Supabase Postgres tables, does not use Supabase Storage, and does not use a service-role client.

## 1. Architecture Overview

```text
Browser
  |
  v
Next.js 14 App Router (UI + /api/v1 Route Handlers)
  |
  +------------------+------------------+
  |                                     |
  v                                     v
Supabase Auth                     Local JSON store
(@supabase/ssr cookies)           data/protrader.json
  |                                     |
  +-- Google                            +-- watchlist
  +-- Facebook                          +-- alerts
  +-- X (OAuth 2.0, provider `x`)       +-- signal snapshots
  +-- Instagram (Custom OAuth
      `custom:instagram`)
  +-- Email / password
  |
  v
Users / Sessions (auth.users)
```

Market data does **not** go through Supabase. Quotes, bars, Mag7, sectors, and the Signal Analyzer call `/api/v1/*`, which uses Yahoo / Twelve Data / Alpha Vantage / Finnhub / FRED.

| Concern | Where it happens | Credentials |
|---|---|---|
| Supabase init (browser) | `lib/supabase.ts` → `createBrowserClient` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Supabase init (server) | `lib/supabaseServer.ts` | Same public URL + anon key |
| Session refresh / `/settings` gate | `middleware.ts` | Same public URL + anon key |
| OAuth code exchange | `app/auth/callback/route.ts` | Same public URL + anon key |
| Login / signup / OAuth buttons | `components/auth/AuthForm.tsx` | Browser client |
| Session state | `components/providers/AuthProvider.tsx` | Browser client |
| Application data | `src/repositories/store.ts` | **Not Supabase** — `DATABASE_URL=file:./data/protrader.json` |

There is **no** `supabase.from(...)` call in source. There is **no** `SUPABASE_SERVICE_ROLE_KEY` usage.

If the two public env vars are empty, `isSupabaseConfigured()` is false, auth UI shows a configuration error, and middleware skips the `/settings` login redirect.

## 2. Supabase Project Setup

1. Create a project at [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Copy **Project URL** and **anon / public key** (Settings → API). Do not copy the service-role key into this app.
3. Authentication → URL Configuration:
   - Site URL: `http://localhost:3000` locally; production host in production.
   - Redirect allow list: `{origin}/auth/callback` and `{origin}/auth/update-password`.
4. Authentication → Sign In / Providers:
   - Enable **Google**, **Facebook**, **X / Twitter (OAuth 2.0)**.
   - Add a **Custom OAuth 2.0** provider with identifier `custom:instagram` (Instagram is not a native GoTrue provider). See `docs/authentication.md`.
5. Enable email/password. Decide whether email confirmation is required.
6. Database / Storage: no application tables or buckets are required for the current runtime.
7. RLS: no application tables are queried, so there are no app-owned RLS policies to apply. Auth schema remains owned by Supabase.

Provider client secrets (Google, Facebook, X, Instagram) stay in the **Supabase dashboard**, not in Voxel env files.

## 3. Environment Variables

Only these Supabase-related variables are read by application source:

| Variable | Client safe? | Server only? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No | Project URL; inlined at build time |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | No | Anon key; inlined at build time |
| `NEXT_PUBLIC_SUPABASE_INSTAGRAM_PROVIDER` | Yes | No | Optional. Defaults to `custom:instagram` |

`SUPABASE_SERVICE_ROLE_KEY` is **not used** and must not be added to `NEXT_PUBLIC_*` or client bundles.

Read in:

- `lib/config.ts` (`config.supabaseUrl`, `config.supabaseAnonKey`, `config.instagramProvider`)
- `lib/supabase.ts`, `lib/supabaseServer.ts`, `middleware.ts` (via `lib/config.ts`)

## 4. Exact File Locations

| File | Purpose | Client/Server | Supabase usage |
|---|---|---|---|
| `lib/config.ts` | Env binding | Both | Reads public URL/anon/Instagram id |
| `lib/supabase.ts` | Browser client factory | Client | `createBrowserClient` |
| `lib/supabaseServer.ts` | Server client factory | Server | `createServerClient` + cookies |
| `middleware.ts` | Session + `/settings` protection | Server | `getUser()`, cookie refresh |
| `app/auth/callback/route.ts` | OAuth / email callback | Server | `exchangeCodeForSession` |
| `app/auth/update-password/page.tsx` | Password reset completion | Client | `updateUser({ password })` |
| `app/login/page.tsx` | Login page | Client | Renders `AuthForm` |
| `app/signup/page.tsx` | Signup page | Client | Renders `AuthForm` |
| `app/forgot-password/page.tsx` | Reset request | Client | Renders `AuthForm` |
| `components/auth/AuthForm.tsx` | Email + OAuth UI | Client | `signInWithOAuth`, `linkIdentity`, `signInWithPassword`, `signUp`, `resetPasswordForEmail` |
| `components/auth/AuthControls.tsx` | Header Login/Logout | Client | `signOut` |
| `components/providers/AuthProvider.tsx` | Session context | Client | `getSession`, `onAuthStateChange` |
| `components/providers/AuthUiProvider.tsx` | Auth modal | Client | No direct SDK; hosts `AuthForm` |
| `lib/auth/providers.ts` | Provider list | Both | Maps UI ids to Supabase provider ids |
| `lib/auth/redirects.ts` | Open-redirect guard | Both | Used by callback + forms |
| `lib/auth/errors.ts` | User-facing error map | Both | No SDK |
| `lib/auth/account-linking.ts` | `link` vs `sign-in` | Both | No SDK |
| `lib/auth/log.ts` | Safe auth logs | Both | No tokens |
| `app/watchlist/page.tsx` | Gate some actions | Client | `useAuth` only |
| `app/alerts/page.tsx` | Gate some actions | Client | `useAuth` only |
| `docs/authentication.md` | Operator setup | — | Dashboard checklist |

## 5. Supabase Client Architecture

| Client | Factory | Credential | Used for |
|---|---|---|---|
| Browser | `createSupabaseBrowser()` | Anon key | Login, logout, session subscription |
| Server (Route Handler) | `createSupabaseServer()` | Anon key | OAuth code exchange |
| Middleware | inline `createServerClient` | Anon key | `getUser()` on `/settings` |
| Admin / service-role | **Does not exist** | — | — |
| Database / Storage client | **Does not exist** | — | — |

All three live clients use the **same anon key**. There is no competing second Supabase project or custom auth server.

## 6. Authentication

```text
Application (AuthForm)
    ↓
supabase.auth.signInWithOAuth / signInWithPassword / signUp / linkIdentity
    ↓
OAuth provider or email
    ↓
/auth/callback  (code exchange, safe `next` path)
    ↓
Supabase session cookies (@supabase/ssr)
    ↓
AuthProvider + application
```

| Mechanism | Supabase provider id | Status in this repo |
|---|---|---|
| Google | `google` | Native; UI button present |
| Facebook | `facebook` | Native; UI button present |
| X | `x` (OAuth 2.0, not legacy `twitter`) | Native; UI button present |
| Instagram | `custom:instagram` | Not native; Custom OAuth required in dashboard |
| Email/password | email | `signUp` / `signInWithPassword` / reset |

| Flow | Route / action |
|---|---|
| Login | `/login` or header modal |
| Signup | `/signup` |
| Forgot password | `/forgot-password` → email → `/auth/update-password` |
| Callback | `GET /auth/callback` |
| Logout | Header **Logout** → `signOut()` |
| Session | Cookie session; `onAuthStateChange` |
| Account linking | If `user` is already set, OAuth buttons call `linkIdentity()` |
| Protected page | `/settings` only (`middleware.ts`) |

`next` query parameters are restricted to same-origin relative paths (`lib/auth/redirects.ts`).

## 7. Database Integration

**This application does not use Supabase tables at runtime.**

Runtime application data lives in `data/protrader.json` via `src/repositories/store.ts`:

| Collection | Purpose | CRUD |
|---|---|---|
| `watchlist` | Saved tickers | list / add / delete |
| `alerts` | Price/signal alerts | list / create / delete |
| `snapshots` | Persisted signal snapshots (capped at 500) | insert on analysis |

A leftover `database/schema.sql` (SQLAlchemy/Postgres) was removed during repository cleanup. It was never executed by Next.js.

Because no Supabase tables are queried:

- There are no application table names, columns, or relationships to document for Supabase.
- User ownership of watchlist/alerts is **not** `auth.uid()`; the JSON store is process-local and shared.

## 8. Row Level Security

| Item | Reality in this repo |
|---|---|
| Application tables in Supabase | None |
| App RLS policies | None |
| `auth.uid()` used for data access | No |
| Anonymous market APIs | Yes — `/api/v1/stocks/*` and market routes do not require a session |
| Settings page | Requires a session **only if** Supabase env is configured |

Do not disable RLS on a future Supabase data migration to “make it work.” If watchlist/alerts are later moved to Postgres, add `auth.uid()` policies before go-live.

## 9. Supabase Storage

Supabase Storage is **not currently used** by this application. There are no buckets, upload paths, or storage policies in source.

## 10. API Integration

```text
UI (React Query via lib/api.ts)
    ↓
Next.js Route Handlers  /api/v1/[[...path]]
    ↓
src/server/apiRouter.ts
    ↓
src/services/* + src/providers/*   (Yahoo, Twelve Data, …)
    ↓
src/repositories/store.ts          (local JSON — not Supabase)
```

Supabase is **not** on this market-data path. Auth-gated UI (watchlist/alerts “require account” modal) still writes to the local JSON API after login.

## 11. Local Development

Package manager: **npm** (`package-lock.json`).

```bash
cp .env.example .env
# set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dest
```

Open `http://localhost:3000/login`.

The app **runs without** Supabase (market pages and APIs still work). Auth buttons then report that Supabase is not configured.

## 12. Production Configuration

Set on the host (Vercel / Docker):

| Public (safe in browser bundle) | Secret (never public) |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | OAuth client secrets — **Supabase dashboard only** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Do **not** set `SUPABASE_SERVICE_ROLE_KEY` in this app |
| `NEXT_PUBLIC_SUPABASE_INSTAGRAM_PROVIDER` (optional) | |

`NEXT_PUBLIC_*` values are compiled into the client bundle. Rebuild after changing them.

Also add production URLs to the Supabase redirect allow list (section 6 and `docs/VERCEL_DEPLOYMENT.md`).

## 13. Troubleshooting

| Symptom | Cause in this codebase |
|---|---|
| “Supabase is not configured” | Empty `NEXT_PUBLIC_SUPABASE_*`; restart after editing env |
| OAuth returns to `/login?error=…` | Callback failed or user cancelled; see `app/auth/callback/route.ts` |
| Redirect mismatch | Provider console must use `https://<project-ref>.supabase.co/auth/v1/callback`, not `/auth/callback` |
| Instagram “not enabled” | Custom provider identifier missing or not `custom:instagram` |
| X `invalid_client` | OAuth 1.0a API keys used instead of OAuth 2.0 Client ID/Secret |
| `/settings` not protected | Env empty → middleware no-ops |
| Session missing after OAuth | Allow-list missing `{origin}/auth/callback` |
| “Database connection failure” | Not a Supabase DB issue here — check `DATABASE_URL` JSON file path |
| RLS denied | Not applicable to current app tables (there are none) |

## 14. Supabase Security Checklist

- [x] No service-role key in client or server source
- [x] `.env` / `.env.local` listed in `.gitignore`
- [x] No `supabase.from()` that could leak data without RLS
- [x] OAuth `next` parameter allowlisted to relative paths
- [x] Auth logs strip token/secret-like fields (`lib/auth/log.ts`)
- [ ] Operator must keep production anon keys and dashboard secrets out of git
- [ ] Operator must configure OAuth redirect URLs per environment
- [ ] If data is later moved to Supabase Postgres, enable RLS before launch
