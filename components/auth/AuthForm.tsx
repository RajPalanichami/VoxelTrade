"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { oauthIntent } from "@/lib/auth/account-linking";
import { mapAuthError } from "@/lib/auth/errors";
import { logAuth } from "@/lib/auth/log";
import { isSocialProviderId, socialProviders, type SocialProviderId } from "@/lib/auth/providers";
import { safeInternalPath } from "@/lib/auth/redirects";
import { createSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export type AuthFormMode = "login" | "signup" | "forgot";

export function AuthForm({
  mode,
  embedded,
  nextPath,
  onMode,
  onAuthenticated,
}: {
  mode: AuthFormMode;
  embedded?: boolean;
  nextPath?: string;
  onMode?: (mode: AuthFormMode) => void;
  onAuthenticated?: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const next = safeInternalPath(nextPath || params.get("next") || "/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<SocialProviderId | null>(null);

  const configured = isSupabaseConfigured();
  const locked = busy || Boolean(oauthBusy);

  useEffect(() => {
    const oauthError = params.get("error");
    const oauthDesc = params.get("error_description");
    if (oauthError || oauthDesc) {
      setError(mapAuthError(oauthDesc || oauthError));
    }
  }, [params]);

  function go(target: AuthFormMode) {
    if (onMode) {
      onMode(target);
      return;
    }
    const q = `?next=${encodeURIComponent(next)}`;
    if (target === "login") router.push(`/login${q}`);
    else if (target === "signup") router.push(`/signup${q}`);
    else router.push(`/forgot-password${q}`);
  }

  async function oauth(id: SocialProviderId) {
    if (locked || !isSocialProviderId(id)) return;
    setError("");
    setInfo("");
    const spec = socialProviders().find((p) => p.id === id);
    if (!spec) return;
    const sb = createSupabaseBrowser();
    if (!sb) {
      setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setOauthBusy(id);
    const intent = oauthIntent(Boolean(user));
    logAuth("AUTH_LOGIN_STARTED", { provider: id, mode: intent });
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error: err } =
      intent === "link"
        ? await sb.auth.linkIdentity({ provider: spec.supabaseProvider, options: { redirectTo } })
        : await sb.auth.signInWithOAuth({ provider: spec.supabaseProvider, options: { redirectTo } });
    if (err) {
      logAuth("AUTH_LOGIN_FAILED", { provider: id, reason: err.name });
      setError(mapAuthError(err.message));
      setOauthBusy(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (locked) return;
    setError("");
    setInfo("");
    if (!configured) {
      setError("Supabase is not configured. Add the project URL and anon key to .env, then restart the UI.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    const sb = createSupabaseBrowser();
    if (!sb) return;
    setBusy(true);
    try {
      if (mode === "forgot") {
        logAuth("AUTH_PASSWORD_RESET", { started: true });
        const { error: err } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });
        if (err) setError(mapAuthError(err.message));
        else setInfo("Check your email for the reset link.");
        return;
      }
      if (mode === "signup") {
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        if (password !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        logAuth("AUTH_LOGIN_STARTED", { provider: "email", mode: "signup" });
        const { error: err } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (err) {
          logAuth("AUTH_LOGIN_FAILED", { provider: "email", reason: err.name });
          setError(mapAuthError(err.message));
        } else {
          setInfo("Account created. Check your email if confirmation is required, then log in.");
          go("login");
        }
        return;
      }
      logAuth("AUTH_LOGIN_STARTED", { provider: "email", mode: "login" });
      const { error: err } = await sb.auth.signInWithPassword({ email, password });
      if (err) {
        logAuth("AUTH_LOGIN_FAILED", { provider: "email", reason: err.name });
        setError(mapAuthError(err.message));
      } else if (onAuthenticated) onAuthenticated();
      else router.push(next);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signup" ? "Sign Up" : mode === "forgot" ? "Reset password" : "Sign In";
  const submitLabel = mode === "signup" ? "Create Account" : mode === "forgot" ? "Send reset email" : "Sign In";

  return (
    <div className={embedded ? "" : "max-w-md mx-auto p-4"}>
      <div className="panel p-5 space-y-4">
        <div className="text-lg font-semibold">{title}</div>
        {mode !== "forgot" && (
          <>
            <div className="space-y-2">
              {socialProviders().map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  disabled={locked}
                  aria-busy={oauthBusy === provider.id}
                  onClick={() => oauth(provider.id)}
                  className="w-full border border-line rounded-md py-2 text-sm hover:bg-white/5 disabled:opacity-60 focus:outline-none focus:border-accent/70"
                >
                  {oauthBusy === provider.id ? "Signing in..." : provider.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[10px] tracking-[0.2em] text-slate-500">
              <span className="flex-1 h-px bg-line" />
              OR
              <span className="flex-1 h-px bg-line" />
            </div>
          </>
        )}
        <form onSubmit={onSubmit} className="space-y-3" aria-busy={busy}>
          <label className="block text-xs text-slate-500" htmlFor="auth-email">
            Email
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-panel2 border border-line rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/70"
              required
            />
          </label>
          {mode !== "forgot" && (
            <label className="block text-xs text-slate-500" htmlFor="auth-password">
              Password
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full bg-panel2 border border-line rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/70"
                required
                minLength={mode === "signup" ? 8 : 1}
              />
            </label>
          )}
          {mode === "signup" && (
            <label className="block text-xs text-slate-500" htmlFor="auth-confirm">
              Confirm Password
              <input
                id="auth-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full bg-panel2 border border-line rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/70"
                required
                minLength={8}
              />
            </label>
          )}
          <div aria-live="polite">
            {error && <div className="text-sm text-bear">{error}</div>}
            {info && <div className="text-sm text-bull">{info}</div>}
          </div>
          <button
            type="submit"
            disabled={locked}
            className="w-full bg-accent text-white rounded-md py-2 text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {busy ? "Please wait…" : submitLabel}
          </button>
        </form>
        <div className="text-xs text-slate-500 space-y-1">
          {mode === "login" && (
            <>
              <div>
                Don&apos;t have an account?{" "}
                {onMode ? (
                  <button type="button" className="text-accent" onClick={() => go("signup")}>
                    Create account
                  </button>
                ) : (
                  <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent">
                    Create account
                  </Link>
                )}
              </div>
              <div>
                {onMode ? (
                  <button type="button" className="text-accent" onClick={() => go("forgot")}>
                    Forgot password?
                  </button>
                ) : (
                  <Link href={`/forgot-password?next=${encodeURIComponent(next)}`} className="text-accent">
                    Forgot password?
                  </Link>
                )}
              </div>
            </>
          )}
          {mode !== "login" && (
            <div>
              {onMode ? (
                <button type="button" className="text-accent" onClick={() => go("login")}>
                  Back to Sign In
                </button>
              ) : (
                <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent">
                  Back to Sign In
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
