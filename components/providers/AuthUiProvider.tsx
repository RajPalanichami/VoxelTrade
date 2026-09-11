"use client";

import { createContext, useCallback, useContext, useMemo, useState, ReactNode, Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PendingAuthAction, setPendingAuthAction } from "@/lib/pendingAuth";
import { AuthForm, AuthFormMode } from "@/components/auth/AuthForm";

type Gate = { title: string; message: string };

type AuthUi = {
  openLogin: (next?: string) => void;
  openSignup: (next?: string) => void;
  requireAccount: (opts: {
    title: string;
    message: string;
    next: string;
    pending?: PendingAuthAction;
  }) => void;
  close: () => void;
  view: AuthFormMode | "gate" | null;
  gate: Gate | null;
  nextPath: string;
  setView: (v: AuthFormMode) => void;
};

const C = createContext<AuthUi | null>(null);

export function useAuthUi() {
  const v = useContext(C);
  if (!v) throw new Error("useAuthUi");
  return v;
}

export function AuthUiProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [view, setViewState] = useState<AuthFormMode | "gate" | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [nextPath, setNextPath] = useState("/");

  const close = useCallback(() => {
    setViewState(null);
    setGate(null);
  }, []);

  const openLogin = useCallback(
    (next?: string) => {
      setNextPath(next || pathname || "/");
      setGate(null);
      setViewState("login");
    },
    [pathname],
  );

  const openSignup = useCallback(
    (next?: string) => {
      setNextPath(next || pathname || "/");
      setGate(null);
      setViewState("signup");
    },
    [pathname],
  );

  const requireAccount = useCallback(
    (opts: { title: string; message: string; next: string; pending?: PendingAuthAction }) => {
      if (opts.pending) setPendingAuthAction(opts.pending);
      setNextPath(opts.next);
      setGate({ title: opts.title, message: opts.message });
      setViewState("gate");
    },
    [],
  );

  const setView = useCallback((v: AuthFormMode) => setViewState(v), []);

  const value = useMemo(
    () => ({ openLogin, openSignup, requireAccount, close, view, gate, nextPath, setView }),
    [openLogin, openSignup, requireAccount, close, view, gate, nextPath, setView],
  );

  return (
    <C.Provider value={value}>
      {children}
      {view && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={close} />
          <div className="relative w-full max-w-md" data-testid="auth-modal">
            {view === "gate" && gate && (
              <div className="panel p-5 space-y-4">
                <div className="text-lg font-semibold">{gate.title}</div>
                <p className="text-sm text-slate-400">{gate.message}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 bg-accent text-white rounded-md py-2 text-sm"
                    onClick={() => setViewState("login")}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    className="flex-1 border border-line rounded-md py-2 text-sm text-slate-300 hover:text-white"
                    onClick={() => setViewState("signup")}
                  >
                    Sign Up
                  </button>
                </div>
              </div>
            )}
            {view !== "gate" && (
              <Suspense fallback={<div className="panel p-5 text-sm text-slate-400">Loading…</div>}>
                <AuthForm
                  mode={view}
                  embedded
                  nextPath={nextPath}
                  onMode={setView}
                  onAuthenticated={() => {
                    const dest = nextPath || "/";
                    close();
                    if (dest !== pathname) router.push(dest);
                    else router.refresh();
                  }}
                />
              </Suspense>
            )}
          </div>
        </div>
      )}
    </C.Provider>
  );
}
