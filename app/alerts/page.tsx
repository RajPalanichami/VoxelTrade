"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTerminal } from "@/components/layout/AppShell";
import { useAuth } from "@/components/providers/AuthProvider";
import { useAuthUi } from "@/components/providers/AuthUiProvider";
import { takePendingAuthAction } from "@/lib/pendingAuth";

const TYPES = [
  { type: "BUY", label: "BUY alert when score crosses 75" },
  { type: "STRONG_BUY", label: "STRONG BUY when score crosses 85" },
  { type: "BREAKOUT", label: "Breakout: price > R1 and volume > 1.5x" },
  { type: "SUPPORT", label: "Price approaches S1" },
  { type: "EMA_CROSS", label: "EMA9 crosses EMA21" },
  { type: "VWAP", label: "Price reclaims VWAP" },
];

export default function AlertsPage() {
  const { symbol } = useTerminal();
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const { requireAccount } = useAuthUi();
  const { data } = useQuery({ queryKey: ["alerts"], queryFn: api.alerts });
  const create = useMutation({
    mutationFn: (body: unknown) => api.createAlert(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const rows = (data?.data || []) as { id: string; symbol: string; type: string; enabled: boolean }[];

  function createIfAllowed(type: string, forSymbol: string) {
    if (loading) return;
    if (!user) {
      requireAccount({
        title: "Create Alert",
        message: "Please log in to create an alert.",
        next: "/alerts",
        pending: { kind: "create-alert", type, symbol: forSymbol },
      });
      return;
    }
    create.mutate({ symbol: forSymbol, type, config: { symbol: forSymbol, type } });
  }

  useEffect(() => {
    if (!user) return;
    const pending = takePendingAuthAction();
    if (pending?.kind === "create-alert") {
      create.mutate({
        symbol: pending.symbol,
        type: pending.type,
        config: { symbol: pending.symbol, type: pending.type },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Alerts</h1>
      <div className="grid sm:grid-cols-2 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.type}
            onClick={() => createIfAllowed(t.type, symbol)}
            className="panel p-3 text-left text-sm hover:border-accent/50"
          >
            <div className="text-white font-medium">{t.type.replace("_", " ")}</div>
            <div className="text-xs text-slate-500">{t.label} · {symbol}</div>
          </button>
        ))}
      </div>
      <div className="panel divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <span className="text-white font-semibold">{r.symbol}</span>{" "}
              <span className="text-slate-400">{r.type}</span>
            </div>
            <button
              className="text-bear text-xs"
              onClick={() => {
                if (!loading && !user) {
                  requireAccount({
                    title: "Create Alert",
                    message: "Please log in to create an alert.",
                    next: "/alerts",
                  });
                  return;
                }
                del.mutate(r.id);
              }}
            >
              Delete
            </button>
          </div>
        ))}
        {!rows.length && <div className="p-6 text-slate-500 text-sm">No alerts configured.</div>}
      </div>
    </div>
  );
}
