"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createSupabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

interface AuthCtx {
  configured: boolean;
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const C = createContext<AuthCtx>({ configured: false, user: null, session: null, loading: true });

export function useAuth() {
  return useContext(C);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const supabase = createSupabaseBrowser();
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (event === "SIGNED_IN") {
        void import("@/lib/auth/log").then(({ logAuth }) => {
          logAuth("AUTH_LOGIN_SUCCESS", { via: "session" });
        });
      }
      if (event === "SIGNED_OUT") {
        void import("@/lib/auth/log").then(({ logAuth }) => {
          logAuth("AUTH_LOGOUT");
        });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  return <C.Provider value={{ configured, user, session, loading }}>{children}</C.Provider>;
}
