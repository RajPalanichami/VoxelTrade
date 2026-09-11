/**
 * Central frontend configuration. Values come from Next.js env
 * (NextJSApps/.env.local, .env.development, parent .env, or the host environment).
 * NEXT_PUBLIC_* is inlined at build time — rebuild after changing it.
 * Access env with static `process.env.NEXT_PUBLIC_*` so Next can inline
 * the same values on server and client (dynamic `process.env[name]` does not).
 */

function trimEnv(value: string | undefined): string {
  return (value || "").trim();
}

function requireValue(name: string, value: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  /** Same-origin /api when empty; otherwise an optional public API origin. */
  apiBaseUrl: trimEnv(process.env.NEXT_PUBLIC_API_URL),
  supabaseUrl: trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  instagramProvider: trimEnv(process.env.NEXT_PUBLIC_SUPABASE_INSTAGRAM_PROVIDER) || "custom:instagram",
  brandSiteUrl: trimEnv(process.env.NEXT_PUBLIC_BRAND_SITE_URL),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  return {
    url: requireValue("NEXT_PUBLIC_SUPABASE_URL", trimEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)),
    anonKey: requireValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", trimEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
  };
}

export function apiUrl(path: string): string {
  return `${config.apiBaseUrl}${path}`;
}
