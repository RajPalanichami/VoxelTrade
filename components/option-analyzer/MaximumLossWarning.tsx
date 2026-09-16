"use client";

import type { AnalyzerPayoff } from "@/src/engines/optionAnalyzerPayoff";

export function MaximumLossWarning({ analysis }: { analysis: AnalyzerPayoff }) {
  const { warning } = analysis;
  const unlimited = warning.kind === "unlimited";
  const caution = warning.kind === "exceeds_credit" || warning.kind === "exceeds_premium" || warning.kind === "stock_plus_option";
  const tone = unlimited
    ? "border-bear/60 bg-bear/15 text-bear"
    : caution
      ? "border-warn/50 bg-warn/10 text-warn"
      : "border-line bg-panel2 text-slate-300";
  const icon = unlimited ? "🔴" : caution ? "⚠️" : "";
  return (
    <div className={`panel p-4 border ${tone}`} data-testid="analyzer-max-loss-warning">
      <div className="text-sm font-semibold tracking-wide">
        {icon} {warning.title}
      </div>
      <p className="text-sm mt-1 text-slate-200">{warning.body}</p>
    </div>
  );
}
