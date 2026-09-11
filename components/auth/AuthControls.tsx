"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useAuthUi } from "@/components/providers/AuthUiProvider";
import { createSupabaseBrowser } from "@/lib/supabase";

export function AuthControls() {
  const { configured, user, loading } = useAuth();
  const { openLogin } = useAuthUi();
  if (loading && configured) return <span className="hidden sm:inline text-[10px] text-slate-500">…</span>;
  if (!user) {
    return (
      <button
        type="button"
        data-testid="header-login"
        className="px-2 py-1.5 rounded-md border border-line text-slate-300 hover:text-white text-xs"
        onClick={() => openLogin()}
      >
        Login
      </button>
    );
  }
  return (
    <button
      type="button"
      className="px-2 py-1.5 rounded-md border border-line text-slate-300 hover:text-white text-xs"
      onClick={async () => {
        const sb = createSupabaseBrowser();
        await sb?.auth.signOut();
      }}
    >
      Logout
    </button>
  );
}
