import { NextResponse } from "next/server";
import { mapOAuthCallbackError } from "@/lib/auth/errors";
import { logAuth } from "@/lib/auth/log";
import { safeInternalPath } from "@/lib/auth/redirects";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthDescription = url.searchParams.get("error_description");
  const next = safeInternalPath(url.searchParams.get("next"));
  const origin = url.origin;

  if (oauthError) {
    logAuth("AUTH_OAUTH_CALLBACK_FAILED", { reason: oauthError });
    const login = new URL("/login", origin);
    login.searchParams.set("error", mapOAuthCallbackError(oauthError, oauthDescription));
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  if (code) {
    const supabase = createSupabaseServer();
    if (!supabase) {
      logAuth("AUTH_OAUTH_CALLBACK_FAILED", { reason: "supabase_unconfigured" });
      const login = new URL("/login", origin);
      login.searchParams.set("error", "Authentication is not configured.");
      return NextResponse.redirect(login);
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logAuth("AUTH_OAUTH_CALLBACK_FAILED", { reason: error.name });
      const login = new URL("/login", origin);
      login.searchParams.set("error", mapOAuthCallbackError(error.name, error.message));
      login.searchParams.set("next", next);
      return NextResponse.redirect(login);
    }
    logAuth("AUTH_LOGIN_SUCCESS", { via: "oauth_callback" });
  }

  return NextResponse.redirect(new URL(next, origin));
}
