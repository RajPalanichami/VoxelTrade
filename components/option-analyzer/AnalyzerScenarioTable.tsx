"use client";

import { useMemo, useState } from "react";
import { usd } from "@/lib/format";
import { pnlAt, type AnalyzerPayoff, type ScenarioStatus } from "@/src/engines/optionAnalyzerPayoff";

function pnlClass(n: number) {
  return n > 0 ? "text-bull" : n < 0 ? "text-bear" : "text-slate-400";
}

function signed(n: number) {
  if (n > 0) return `+${usd(n)}`;
  if (n < 0) return `−${usd(Math.abs(n))}`;
  return usd(0);
}

function statusOf(pnl: number, analysis: AnalyzerPayoff): ScenarioStatus {
  if (analysis.max_loss != null && Math.abs(pnl + analysis.max_loss) <= 0.51) return "Maximum Loss";
  if (analysis.max_profit != null && Math.abs(pnl - analysis.max_profit) <= 0.51) return "Maximum Profit";
  if (Math.abs(pnl) <= 0.5) return "Breakeven";
  return pnl > 0 ? "Profit" : "Loss";
}

export function AnalyzerScenarioTable({
  analysis,
  legs,
}: {
  analysis: AnalyzerPayoff;
  legs: AnalyzerPayoff["legs"];
}) {
  const [whatIf, setWhatIf] = useState("");
  const parsed = Number(whatIf);
  const extra = useMemo(() => {
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const pnl = pnlAt(
      legs,
      parsed,
      analysis.stock,
      analysis.residual
        ? { farExpiration: analysis.far_expiration || "", years: analysis.residual_years }
        : null,
    );
    const denom = Math.abs(analysis.option_premium);
    return {
      price: parsed,
      pnl,
      status: statusOf(pnl, analysis),
      returnPct: denom > 0 ? (pnl / denom) * 100 : null,
    };
  }, [parsed, legs, analysis]);

  return (
    <div className="panel overflow-hidden" data-testid="analyzer-strike-table">
      <div className="px-4 py-2 text-[10px] tracking-widest text-slate-500">STRIKE-LEVEL EXPIRATION SCENARIOS</div>
      <div className="px-4 pb-3">
        <label className="text-xs text-slate-500">
          What if {analysis.symbol} ={" "}
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={whatIf}
            onChange={(e) => setWhatIf(e.target.value)}
            placeholder={analysis.spot.toFixed(2)}
            className="ml-1 bg-panel2 border border-line rounded px-2 py-1 text-sm text-white w-28"
            data-testid="analyzer-what-if"
          />
        </label>
        {extra && (
          <div className="mt-2 text-sm" data-testid="analyzer-what-if-result">
            Expiration P/L {signed(extra.pnl)}
            {extra.returnPct != null ? ` · ${extra.returnPct.toFixed(0)}%` : ""} · {extra.status}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-xs">
            <tr>
              <th className="text-left px-4 py-2">Underlying at Expiration</th>
              <th className="text-right px-4 py-2">P/L</th>
              <th className="text-right px-4 py-2">Return</th>
              <th className="text-right px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {analysis.strike_rows.map((row) => (
              <tr key={row.price} className="border-t border-line">
                <td className="px-4 py-1.5 tick">{usd(row.price)}</td>
                <td className={`px-4 py-1.5 text-right tick ${pnlClass(row.pnl)}`}>{signed(row.pnl)}</td>
                <td className={`px-4 py-1.5 text-right tick ${pnlClass(row.returnPct || 0)}`}>
                  {row.returnPct == null ? "N/A" : `${row.returnPct > 0 ? "+" : ""}${row.returnPct.toFixed(0)}%`}
                </td>
                <td className="px-4 py-1.5 text-right text-xs text-slate-300">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
