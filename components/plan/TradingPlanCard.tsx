"use client";

import { Plan } from "@/lib/types";
import { usd } from "@/lib/format";

export function TradingPlanCard({ plan, title }: { plan: Plan; title: string }) {
  const bull = plan.bias === "BULLISH";
  return (
    <div className={`panel p-4 ${bull ? "border-bull/20" : "border-bear/20"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] tracking-[0.2em] text-slate-500">{title}</div>
        <span className={`text-xs font-bold ${bull ? "text-bull" : "text-bear"}`}>{plan.bias}</span>
      </div>
      <div className="text-xs text-slate-400 mb-3">{plan.setup}</div>
      <Grid label="ENTRY ZONE" value={`${usd(plan.entry_low)} – ${usd(plan.entry_high)}`} />
      <Grid label="IDEAL ENTRY" value={usd(plan.ideal_entry)} />
      <Grid label="STOP / INVALIDATION" value={usd(plan.stop)} danger />
      <Grid label="TP1" value={usd(plan.target1)} />
      <Grid label="TP2" value={usd(plan.target2)} />
      <Grid label="TP3" value={usd(plan.target3)} />
      <Grid label="RISK / REWARD" value={plan.risk_reward ? `1 : ${plan.risk_reward.toFixed(1)}` : "—"} />
      {!plan.trade_allowed && (
        <div className="mt-3 text-xs text-warn bg-warn/10 border border-warn/20 rounded p-2">
          NO TRADE / WAIT — {plan.block_reason || "Hard filter blocked this setup."}
        </div>
      )}
      {plan.notes?.map((n) => (
        <div key={n} className="text-[11px] text-slate-500 mt-2">
          {n}
        </div>
      ))}
    </div>
  );
}

function Grid({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-[10px] tracking-widest text-slate-500">{label}</span>
      <span className={`tick ${danger ? "text-bear" : "text-white"}`}>{value}</span>
    </div>
  );
}
