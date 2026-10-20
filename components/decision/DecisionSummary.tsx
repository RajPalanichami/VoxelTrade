"use client";

import { useState } from "react";
import { compact, pct, usd } from "@/lib/format";
import type { FactorTone, StockDecisionFactor, StockDecisionMap } from "@/lib/stockDecision";

const TONE: Record<FactorTone, string> = {
  bullish: "text-bull",
  bearish: "text-bear",
  caution: "text-warn",
  neutral: "text-warn",
  nodata: "text-slate-500",
};

const PILL: Record<string, string> = {
  Bullish: "bg-bull/15 text-bull border-bull/40",
  Bearish: "bg-bear/15 text-bear border-bear/40",
  Caution: "bg-warn/15 text-warn border-warn/40",
  Neutral: "bg-warn/15 text-warn border-warn/40",
};

function barColor(tone: FactorTone) {
  if (tone === "bullish") return "bg-bull";
  if (tone === "bearish") return "bg-bear";
  if (tone === "nodata") return "bg-slate-600";
  return "bg-warn";
}

function FactorRow({ factor }: { factor: StockDecisionFactor }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line/30 last:border-0">
      <button
        type="button"
        className="w-full grid grid-cols-[1.1fr_0.7fr_1.4fr] gap-2 text-left py-2 px-1 items-start"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`decision-factor-${factor.id}`}
      >
        <span className="text-[12px] text-slate-300">{factor.label}</span>
        <span className={`text-[12px] font-semibold ${TONE[factor.tone]}`}>{factor.available ? factor.stance : "No Data"}</span>
        <span className="text-[12px] text-slate-400">{factor.interpretation}</span>
      </button>
      {open ? (
        <div className="pb-3 px-1 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded bg-panel2 overflow-hidden">
              <div className={`h-full ${barColor(factor.tone)}`} style={{ width: `${factor.score ?? 0}%` }} />
            </div>
            <span className="tick w-16 text-right">{factor.score == null ? "—" : `${Math.round(factor.score)}/100`}</span>
          </div>
          <div>Value: {factor.value}</div>
          <div>Threshold: {factor.threshold}</div>
          <div>
            Weight {(factor.weight * 100).toFixed(1)}% · Contribution{" "}
            {factor.contribution == null ? "unavailable" : factor.contribution.toFixed(1)}
          </div>
          <div>Calculation: {factor.calculation}</div>
          <div>Explanation: {factor.explanation}</div>
        </div>
      ) : null}
    </div>
  );
}

export function DecisionSummary({ map }: { map: StockDecisionMap }) {
  const s = map.summary;
  const pill = PILL[s.decision] || PILL.Neutral;
  return (
    <section className="panel overflow-hidden" data-testid="decision-summary">
      <div className="p-4 border-b border-line/40">
        <div className="text-[11px] tracking-[0.2em] text-slate-500">STOCK DECISION</div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {map.symbol} — {map.timeframeLabel} Decision
            </h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {s.timeframeRole} · Price {map.price == null ? "unavailable" : usd(map.price)}
              {map.changePercent != null ? ` · ${pct(map.changePercent)}` : ""}
            </p>
          </div>
          <div className={`px-3 py-1.5 rounded-md border text-lg font-semibold ${pill}`} data-testid="decision-overall">
            {s.decision}
          </div>
        </div>
        <p className="text-sm text-slate-300 mt-3 leading-relaxed" data-testid="decision-headline">
          {s.headline}
        </p>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 text-[12px]">
          <Metric label="Score" value={`${Math.round(s.score)}/100`} />
          <Metric label="Confidence" value={`${s.confidence} · ${Math.round(s.confidencePct)}%`} />
          <Metric label="Trend" value={s.trendScore == null ? "—" : String(Math.round(s.trendScore))} tone={toneOf(s.trendScore)} />
          <Metric label="Momentum" value={s.momentumScore == null ? "—" : String(Math.round(s.momentumScore))} tone={toneOf(s.momentumScore)} />
          <Metric label="Volume" value={s.volumeScore == null ? "—" : String(Math.round(s.volumeScore))} tone={toneOf(s.volumeScore)} />
          <Metric label="Structure" value={s.structureScore == null ? "—" : String(Math.round(s.structureScore))} tone={toneOf(s.structureScore)} />
          <Metric label="Data quality" value={s.dataQuality} />
        </div>
        {s.override ? <p className="text-[12px] text-warn mt-2">{s.override}</p> : null}
      </div>

      <div className="px-4 py-2 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 text-[11px] border-b border-line/40">
        {[
          ["Trend", s.trendScore],
          ["Momentum", s.momentumScore],
          ["Volume", s.volumeScore],
          ["Structure", s.structureScore],
          ["Risk", s.riskScore],
          ["Market", s.marketScore],
        ].map(([k, v]) => (
          <div key={String(k)}>
            <div className="text-slate-500">{k}</div>
            <div className={TONE[toneOf(typeof v === "number" ? v : null)]}>
              {typeof v === "number" ? labelBucket(v) : "No Data"}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pt-3">
        <div className="grid grid-cols-[1.1fr_0.7fr_1.4fr] gap-2 text-[10px] tracking-[0.14em] text-slate-500 px-1">
          <span>FACTOR</span>
          <span>VALUE</span>
          <span>INTERPRETATION</span>
        </div>
        {s.factors.map((f) => (
          <FactorRow key={f.id} factor={f} />
        ))}
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4 border-t border-line/40">
        <div data-testid="decision-why-summary">
          <div className="text-[11px] tracking-[0.16em] text-slate-500 mb-2">WHY?</div>
          <ul className="space-y-1 text-[12px]">
            {s.whyPlus.map((line) => (
              <li key={line} className="text-bull">
                ✓ {line}
              </li>
            ))}
            {s.whyMinus.map((line) => (
              <li key={line} className="text-warn">
                − {line}
              </li>
            ))}
            {s.whyMissing.map((line) => (
              <li key={line} className="text-slate-500">
                ○ {line}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-slate-400 mt-3">{s.confidenceWhy}</p>
        </div>
        <div>
          <div className="text-[11px] tracking-[0.16em] text-slate-500 mb-2">MULTI-TIMEFRAME</div>
          <table className="w-full text-[12px]" data-testid="decision-mtf-scores">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left py-1">TF</th>
                <th className="text-left">Decision</th>
                <th className="text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {s.mtf.map((row) => (
                <tr key={row.timeframe} className="border-t border-line/20">
                  <td className="py-1">{row.label}</td>
                  <td className={row.available ? TONE[row.decision === "Bullish" ? "bullish" : row.decision === "Bearish" ? "bearish" : "caution"] : "text-slate-500"}>
                    {row.available ? row.decision : "No Data"}
                  </td>
                  <td className="text-right tick">{row.score == null ? "—" : Math.round(row.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[12px] text-slate-400 mt-2">{s.mtfNote}</p>
          <div className="text-[11px] text-slate-500 mt-3">
            Float {s.float.shares == null ? "unavailable" : compact(s.float.shares)} · Turnover{" "}
            {s.float.turnover == null ? "unavailable" : `${(s.float.turnover * 100).toFixed(2)}%`} · {s.float.note}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Data quality: {s.dataQuality}. {s.dataQualityNote}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: FactorTone }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.14em] text-slate-500">{label.toUpperCase()}</div>
      <div className={`font-semibold ${tone ? TONE[tone] : "text-slate-200"}`}>{value}</div>
    </div>
  );
}

function toneOf(score: number | null): FactorTone {
  if (score == null) return "nodata";
  if (score >= 58) return "bullish";
  if (score <= 42) return "bearish";
  return "caution";
}

function labelBucket(score: number) {
  if (score >= 65) return "Bullish";
  if (score <= 35) return "Bearish";
  if (score < 45 || score > 55) return "Caution";
  return "Neutral";
}
