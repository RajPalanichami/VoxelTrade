import type { Impact, OptionDecision, StrategyFactor } from "@/src/engines/optionStrategyDecision";
import { usd } from "@/lib/format";

function impactClass(impact: Impact) {
  if (impact === "positive") return "text-bull";
  if (impact === "negative") return "text-bear";
  if (impact === "caution") return "text-warn";
  return "text-slate-400";
}

function impactWord(impact: Impact) {
  if (impact === "positive") return "Positive";
  if (impact === "negative") return "Negative";
  if (impact === "caution") return "Caution";
  if (impact === "neutral") return "Neutral";
  return "N/A";
}

function greek(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return `${n >= 0 ? "+" : ""}${n.toFixed(3)}`;
}

function Row({ row }: { row: StrategyFactor }) {
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="sticky left-0 z-[1] bg-panel px-3 py-2 text-left font-medium text-slate-200">
        <span title={row.tooltip} className="underline decoration-dotted decoration-slate-600 underline-offset-2 cursor-help">
          {row.factor}
        </span>
      </th>
      <td className="px-3 py-2 tick whitespace-nowrap">{row.value}</td>
      <td className={`px-3 py-2 font-semibold whitespace-nowrap ${impactClass(row.impact)}`}>{impactWord(row.impact)}</td>
      <td className="px-3 py-2 text-slate-300 min-w-[220px]">{row.interpretation}</td>
      <td className={`px-3 py-2 font-semibold whitespace-nowrap ${impactClass(row.impact)}`}>{row.status}</td>
    </tr>
  );
}

export function StrategyDecisionPanel({ decision, symbol, strategy, expiration }: { decision: OptionDecision; symbol: string; strategy: string; expiration: string }) {
  const scoreClass = decision.score == null ? "text-slate-300" : decision.score >= 65 ? "text-bull" : decision.score >= 50 ? "text-warn" : "text-bear";
  return (
    <div className="space-y-3" data-testid="strategy-decision">
      <section className="panel p-4" data-testid="strategy-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] tracking-widest text-slate-500">STRATEGY SUMMARY</div>
            <h2 className="text-xl font-semibold mt-1">
              {symbol} · {strategy}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Expiration {expiration}
              {decision.focus ? ` · ${decision.focus.right.toUpperCase()} ${usd(decision.focus.strike)} · ${decision.focus.moneyness}` : ""}
            </p>
          </div>
          <div className="text-right" data-testid="analyzer-strategy-score">
            <div className="text-[10px] tracking-widest text-slate-500">STRATEGY SCORE</div>
            <div className={`text-3xl font-semibold tick ${scoreClass}`}>{decision.score == null ? "N/A" : `${decision.score} / 100`}</div>
            <div className={`text-sm font-semibold ${scoreClass}`}>{decision.scoreLabel}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm">
          <div>
            <div className="text-[10px] text-slate-500">BIAS</div>
            <div className={decision.bias === "Bullish" ? "text-bull" : decision.bias === "Bearish" ? "text-bear" : "text-warn"}>{decision.bias}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] text-slate-500">PRIMARY THESIS</div>
            <p>{decision.thesis}</p>
          </div>
          <div className="md:col-span-3">
            <div className="text-[10px] text-slate-500">MAIN RISK</div>
            <p className="text-bear" data-testid="analyzer-main-risk">
              {decision.mainRisk}
            </p>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden" data-testid="strategy-factor-table">
        <div className="px-4 py-2 text-[10px] tracking-widest text-slate-500">STRATEGY DECISION FACTORS</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-[10px] tracking-widest text-slate-500">
              <tr>
                <th scope="col" className="sticky left-0 z-[1] bg-panel text-left px-3 py-2">Factor</th>
                <th scope="col" className="text-left px-3 py-2">Current Value</th>
                <th scope="col" className="text-left px-3 py-2">Strategy Impact</th>
                <th scope="col" className="text-left px-3 py-2">Interpretation</th>
                <th scope="col" className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {decision.factors.map((row) => (
                <Row key={row.factor} row={row} />
              ))}
              <tr className="border-t border-line">
                <th scope="row" className="sticky left-0 bg-panel px-3 py-2 text-left">Overall Strategy Score</th>
                <td className="px-3 py-2 tick">{decision.score == null ? "N/A" : `${decision.score}/100`}</td>
                <td className={`px-3 py-2 font-semibold ${scoreClass}`}>{decision.scoreLabel}</td>
                <td className="px-3 py-2 text-slate-300">Weighted from the factors this strategy can score with the data on hand. Missing inputs are left out instead of treated as zero.</td>
                <td className={`px-3 py-2 font-semibold ${scoreClass}`}>{decision.scoreLabel}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel overflow-hidden" data-testid="strategy-greeks">
        <div className="px-4 py-2">
          <div className="text-[10px] tracking-widest text-slate-500">GREEKS · MODEL ESTIMATE</div>
          <p className="text-xs text-slate-500 mt-1">
            Contract Greeks are calculated from listed IV. Position Greeks flip sign when the leg is sold. They are theoretical sensitivities, not a P&L forecast. Rho is de-emphasized because rate sensitivity is usually small for shorter-dated equity options.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] tracking-widest text-slate-500">
              <tr>
                {["Leg", "Delta", "Gamma", "Vega", "Theta", "Rho"].map((h) => (
                  <th key={h} scope="col" className="text-left px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {decision.greeks.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th scope="row" className="px-3 py-2 text-left font-medium">{row.label}</th>
                  <td className="px-3 py-2 tick">{greek(row.delta)}</td>
                  <td className="px-3 py-2 tick">{greek(row.gamma)}</td>
                  <td className="px-3 py-2 tick">{greek(row.vega)}</td>
                  <td className="px-3 py-2 tick">{greek(row.theta)}</td>
                  <td className="px-3 py-2 tick text-slate-500">{greek(row.rho)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-4" data-testid="strategy-iv">
        <div className="text-[10px] tracking-widest text-slate-500">IV / VOLATILITY</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-sm">
          <Stat k="Current IV" v={decision.iv.current == null ? "N/A" : `${(decision.iv.current * 100).toFixed(1)}%`} />
          <Stat k="IV Rank" v="N/A" />
          <Stat k="52W IV Percentile" v="N/A" />
          <Stat k="Historical Volatility" v={decision.iv.hv == null ? "N/A" : `${(decision.iv.hv * 100).toFixed(1)}%`} />
          <Stat k="IV vs HV" v={decision.iv.vsHv == null ? "N/A" : `${decision.iv.vsHv >= 0 ? "+" : ""}${(decision.iv.vsHv * 100).toFixed(1)} pts`} />
          <Stat k="Expected move" v={decision.expectedMove ? `±${usd(decision.expectedMove.dollars)} (${decision.expectedMove.percent.toFixed(1)}%)` : "N/A"} />
          <Stat k="Expected range" v={decision.expectedMove ? `${usd(decision.expectedMove.lower)} – ${usd(decision.expectedMove.upper)}` : "N/A"} />
        </div>
        <p className="text-sm text-slate-400 mt-3">{decision.iv.note}</p>
        <p className="text-xs text-slate-500 mt-1">IV percentile is not a probability of future movement. A reading of 80 would mean the current IV was higher than about 80% of past readings, not an 80% chance of a move.</p>
      </section>

      <section className="panel overflow-hidden" data-testid="strategy-scenarios">
        <div className="px-4 py-2">
          <div className="text-[10px] tracking-widest text-slate-500">WHAT IF?</div>
          <p className="text-xs text-slate-500">Scenario estimate — not a guaranteed P&L forecast. Reprices listed IV with the same model used for Greeks.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] tracking-widest text-slate-500">
              <tr>
                <th scope="col" className="text-left px-3 py-2">Scenario</th>
                <th scope="col" className="text-right px-3 py-2">Estimated P&L</th>
              </tr>
            </thead>
            <tbody>
              {decision.scenarios.map((row) => (
                <tr key={row.label} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal text-slate-300">{row.label}</th>
                  <td className={`px-3 py-1.5 text-right tick ${row.pnl == null ? "text-slate-500" : row.pnl > 0 ? "text-bull" : row.pnl < 0 ? "text-bear" : "text-slate-300"}`}>
                    {row.pnl == null ? "N/A" : `${row.pnl > 0 ? "+" : row.pnl < 0 ? "−" : ""}${usd(Math.abs(row.pnl))}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500">{k}</div>
      <div className="tick">{v}</div>
    </div>
  );
}
