"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const sb = createSupabaseBrowser();
    if (!sb) {
      setError("Supabase is not configured.");
      return;
    }
    setBusy(true);
    const { error: err } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else router.push("/login");
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <form onSubmit={onSubmit} className="panel p-5 space-y-3">
        <div className="text-lg font-semibold">Set a new password</div>
        <label className="block text-xs text-slate-500" htmlFor="new-password">
          New password
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full bg-panel2 border border-line rounded-md px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs text-slate-500" htmlFor="confirm-password">
          Confirm password
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full bg-panel2 border border-line rounded-md px-3 py-2 text-sm"
          />
        </label>
        <div aria-live="polite">{error && <div className="text-sm text-bear">{error}</div>}</div>
        <button type="submit" disabled={busy} className="w-full bg-accent text-white rounded-md py-2 text-sm">
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
