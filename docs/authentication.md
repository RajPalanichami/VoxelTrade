# Authentication

Voxel Trading uses **Supabase Auth** as the only authentication authority. Google, Facebook, X, Instagram, and email/password all create the same cookie session.

## Architecture

```text
Supabase Auth
    |
    +-- Google OAuth          (native)
    +-- Facebook OAuth        (native)
    +-- X OAuth 2.0           (native, provider id `x`)
    +-- Instagram             (Custom OAuth: `custom:instagram`)
    +-- Email / password      (native)
    |
  Session (SSR cookies via @supabase/ssr)
    |
  Application (AuthProvider)
```

Do not add a second auth platform. Do not store passwords in application tables. Provider client secrets stay in the Supabase dashboard, not in this repository.

## Application environment

Copy `.env.example` to `.env` / `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_INSTAGRAM_PROVIDER=custom:instagram
```

Google, Facebook, X, and Instagram **app secrets are not application environment variables**. Configure them under Supabase → Authentication → Sign In / Providers (and Custom Providers for Instagram).

Never put `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*`, client components, or git.

## Redirect URLs

Add these to Supabase → Authentication → URL Configuration:

| Environment | Site URL | Redirect allow list |
|---|---|---|
| Local | `http://localhost:3000` | `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/update-password` |
| Staging | `https://<staging-host>` | `https://<staging-host>/auth/callback`, `https://<staging-host>/auth/update-password` |
| Production | `https://<production-host>` | `https://<production-host>/auth/callback`, `https://<production-host>/auth/update-password` |

The app callback is `/auth/callback`. It only accepts a relative `next` path (open redirects are rejected).

Each OAuth provider’s **authorized redirect URI in the provider console** must be the Supabase Auth callback, not the Next.js route:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Local Supabase CLI (if used): `http://localhost:54321/auth/v1/callback`.

## Google

1. Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Providers → Google → enable → paste Client ID and Client Secret.
4. App code: `signInWithOAuth({ provider: 'google' })`.

## Facebook

1. Meta for Developers → Facebook Login.
2. Valid OAuth Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Providers → Facebook → enable → App ID and App Secret.
4. App code: `signInWithOAuth({ provider: 'facebook' })`.

Facebook Login is Meta’s consumer identity product. Existing Facebook users are unchanged.

## X (formerly Twitter)

Use **X / Twitter (OAuth 2.0)**, not the legacy OAuth 1.0a `twitter` provider.

1. [X Developer Portal](https://developer.x.com/en/portal/dashboard) → create a project/app.
2. User authentication settings → Web App → turn on **Request email from users**.
3. Callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Copy the OAuth 2.0 **Client ID** and **Client Secret** (not the API Key / API Secret used for OAuth 1.0a).
5. Supabase → Providers → **X / Twitter (OAuth 2.0)** → enable → paste those values.
6. App code: `signInWithOAuth({ provider: 'x' })`.

## Instagram (not a native Supabase provider)

Supabase’s built-in social list does **not** include Instagram. Instagram Basic Display (consumer login) is deprecated. Current official Meta Instagram OAuth ([Business Login / Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)) is an OAuth 2.0 identity flow for **Instagram professional/creator accounts**. It is not Graph publishing unless you request extra scopes.

This app treats Instagram as **authentication**, not Instagram Graph API authorization. Request only the minimum identity scope (typically `instagram_business_basic`). Do not request publish, insight, or messaging scopes for sign-in.

### Configure a Supabase Custom OAuth provider

1. Meta App Dashboard → Instagram product → Instagram Login / Business Login.
2. Add the Supabase callback as a valid OAuth redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Sign In / Providers → **Custom Providers** → New Provider → OAuth 2.0 (not OIDC; Instagram does not publish an OIDC discovery document).
4. Suggested settings:

   | Field | Value |
   |---|---|
   | Identifier | `custom:instagram` |
   | Authorization URL | `https://www.instagram.com/oauth/authorize` |
   | Token URL | `https://api.instagram.com/oauth/access_token` |
   | Userinfo URL | `https://graph.instagram.com/me?fields=id,username` |
   | Scopes | `instagram_business_basic` |
   | Email optional | enabled (Instagram often has no verified email) |
   | PKCE | follow Meta’s current app type requirements |

5. Map `id` → subject and `username` → name. Do not auto-merge accounts on an unverified email.
6. Keep `NEXT_PUBLIC_SUPABASE_INSTAGRAM_PROVIDER=custom:instagram` unless you chose a different identifier.

The UI always shows **Continue with Instagram**. If the custom provider is missing, Supabase returns an error and the UI shows a configuration message. That is expected until the dashboard is configured.

Personal (non-professional) Instagram accounts cannot complete this official flow. Those users should use Google, Facebook, X, or email.

## Email / password

Already implemented:

- Sign up: `signUp()` with optional email confirmation (`emailRedirectTo` → `/auth/callback`).
- Sign in: `signInWithPassword()`.
- Reset: `resetPasswordForEmail()` → `/auth/update-password` → `updateUser({ password })`.

If confirmation is enabled, unconfirmed users see a specific “confirm your email” message instead of a generic credential error.

## Account linking

- Automatic linking only happens when Supabase considers the identity safe (typically a **verified** email already on the user).
- Unverified emails are never merged by this application.
- If the user is already signed in, provider buttons call `linkIdentity()` instead of creating a second user.
- If an identity is already attached to another user, the UI reports that and does not overwrite either account.

## Session

- Browser and server clients use `@supabase/ssr` cookies.
- `AuthProvider` is the single session model (`user` + `session`).
- Middleware refreshes the session on `/settings` and redirects anonymous users to `/login`.
- Logout: `supabase.auth.signOut()`.

There is no application `profiles` table. Auth identity lives in `auth.users`. Watchlist/alerts use the local JSON store and do not duplicate passwords or OAuth tokens.

## Troubleshooting

| Symptom | Check |
|---|---|
| “Supabase is not configured” | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then restart the Next.js development server |
| Google/Facebook/X redirect loop | Site URL + redirect allow list + provider callback = `.../auth/v1/callback` |
| Instagram “not enabled” | Custom provider identifier matches `NEXT_PUBLIC_SUPABASE_INSTAGRAM_PROVIDER` |
| X `invalid_client` | You pasted OAuth 1.0a API keys instead of OAuth 2.0 Client ID/Secret |
| Email login after signup fails | Confirmation email not clicked |
| Unexpected second account | Provider email was unverified; sign in with the original method and use `linkIdentity` |

## Local run

```bash
cp .env.example .env
# fill NEXT_PUBLIC_SUPABASE_*
npm install
npm run dev
```

Open `http://localhost:3000/login`.
