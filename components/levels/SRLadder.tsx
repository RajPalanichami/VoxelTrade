"use client";

import { Levels } from "@/lib/types";
import { usd } from "@/lib/format";

export function SRLadder({ levels, price, insight }: { levels: Levels; price?: number | null; insight?: string }) {
  const rows = [
    { k: "R3", v: levels.r3, c: "text-bear" },
    { k: "R2", v: levels.r2, c: "text-bear" },
    { k: "R1", v: levels.r1, c: "text-bear" },
    { k: "PX", v: price, c: "text-white" },
    { k: "S1", v: levels.s1, c: "text-bull" },
    { k: "S2", v: levels.s2, c: "text-bull" },
    { k: "S3", v: levels.s3, c: "text-bull" },
  ];
  return (
    <div className="panel p-4">
      <div className="text-[11px] tracking-[0.2em] text-slate-500 mb-3">SUPPORT & RESISTANCE</div>
      <div className="space-y-1.5 font-mono text-sm">
        {rows.map((r) => (
          <div
            key={r.k}
            className={`flex items-center gap-2 ${r.k === "PX" ? "bg-accent/10 border border-accent/30 rounded px-2 py-1" : ""}`}
          >
            <span className={`w-8 ${r.c}`}>{r.k}</span>
            <span className="flex-1 border-t border-dashed border-slate-700" />
            <span className={`tick ${r.c}`}>{usd(r.v)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-slate-400">
        Pivot {usd(levels.pivot)} · methods: {(levels.methods_used || []).join(", ") || "—"}
      </div>
      {insight && <div className="mt-3 text-xs text-slate-300 bg-white/5 rounded p-2">{insight}</div>}
    </div>
  );
}
