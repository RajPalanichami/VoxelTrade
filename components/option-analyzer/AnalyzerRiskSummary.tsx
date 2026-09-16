"use client";

import { usd } from "@/lib/format";
import { formatZone, type AnalyzerPayoff } from "@/src/engines/optionAnalyzerPayoff";

function moneyOrUnlimited(n: number | null) {
  return n == null ? "UNLIMITED" : usd(n);
}

export function AnalyzerRiskSummary({ analysis }: { analysis: AnalyzerPayoff }) {
  const unlimited = analysis.max_loss_status === "UNLIMITED";
  const premium = analysis.net_credit > 0 ? analysis.net_credit : analysis.premium_received || analysis.net_debit || analysis.premium_paid;
  const premiumLabel = analysis.net_credit > 0 || analysis.option_premium > 0 ? "Premium / Credit Received" : "Premium / Debit Paid";
  const ratio = analysis.loss_to_premium_ratio;
  const creditBar = 42;
  const lossBar = unlimited ? 100 : ratio != null ? Math.min(100, Math.max(creditBar, creditBar * ratio)) : 70;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-3" data-testid="analyzer-risk-summary">
      <div className={`panel p-4 border ${unlimited ? "border-bear/50" : "border-line"}`}>
        <div className="text-[10px] tracking-widest text-slate-500 mb-3">RISK SUMMARY</div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label={premiumLabel} value={usd(premium)} />
          <Row label="Maximum Profit" value={moneyOrUnlimited(analysis.max_profit)} />
          <Row label="Maximum Loss" value={moneyOrUnlimited(analysis.max_loss)} danger={unlimited || (analysis.risk_beyond_credit || 0) > 0} />
          <Row
            label="Risk Beyond Credit"
            value={unlimited ? "UNLIMITED" : analysis.risk_beyond_credit != null ? usd(analysis.risk_beyond_credit) : "N/A"}
          />
          <Row
            label="Breakeven"
            value={analysis.breakevens.length ? analysis.breakevens.map((b) => usd(b)).join(" · ") : "N/A"}
          />
          <Row label="Maximum Loss Region" value={analysis.max_loss_region || "N/A"} />
          {unlimited ? <Row label="Risk Status" value="HIGH RISK — unbounded upside loss" danger /> : null}
          {unlimited ? <Row label="Loss Direction" value="↑ as the underlying rises" danger /> : null}
          {analysis.side_losses ? (
            <>
              <Row label="Put-Side Maximum Loss" value={usd(analysis.side_losses.putSideMaxLoss)} />
              <Row label="Call-Side Maximum Loss" value={usd(analysis.side_losses.callSideMaxLoss)} />
              <Row label="Overall Maximum Loss" value={usd(analysis.side_losses.overallMaxLoss)} danger />
            </>
          ) : null}
        </dl>
      </div>

      <div className="panel p-4 space-y-3" data-testid="analyzer-loss-comparison">
        <div className="text-[10px] tracking-widest text-slate-500">PREMIUM VS MAXIMUM LOSS</div>
        <Bar label={premiumLabel} value={usd(premium)} width={creditBar} tone="bg-sky-400" />
        <Bar
          label="Maximum Loss"
          value={moneyOrUnlimited(analysis.max_loss)}
          width={lossBar}
          tone={unlimited ? "bg-bear" : "bg-rose-400"}
        />
        <p className="text-sm text-slate-300">
          {unlimited
            ? "Maximum loss is unbounded and cannot be expressed as a multiple of the premium."
            : ratio != null
              ? `Maximum Loss is ${ratio.toFixed(2)}× the ${analysis.net_credit > 0 ? "Credit Received" : "Premium Paid"}`
              : "Premium is zero, so a loss-to-premium ratio is not available."}
        </p>
        <div className="text-xs text-slate-500 space-y-1">
          <div>Profit zone: {analysis.profit_zones.map(formatZone).join("; ") || "N/A"}</div>
          <div>Loss zone: {analysis.loss_zones.map(formatZone).join("; ") || "N/A"}</div>
          <div>Max profit zone: {analysis.max_profit_zones.map(formatZone).join("; ") || analysis.max_profit_region || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`tick text-right ${danger ? "text-bear font-semibold" : "text-white"}`}>{value}</dd>
    </>
  );
}

function Bar({ label, value, width, tone }: { label: string; value: string; width: number; tone: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span className="tick text-white">{value}</span>
      </div>
      <div className="h-2 rounded bg-white/10 overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
