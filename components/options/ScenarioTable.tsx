"use client";

import { usd } from "@/lib/format";
import { DayRow, ScenarioKind } from "@/lib/optionsProjection";

function pnlClass(n: number) {
  return n > 0 ? "text-bull" : n < 0 ? "text-bear" : "text-slate-400";
}

function signed(n: number) {
  if (n > 0) return `+${usd(n)}`;
  if (n < 0) return `−${usd(Math.abs(n))}`;
  return usd(0);
}

export function ScenarioTable({
  rows,
  kind,
  onKind,
  startingInvestment,
  currentValue,
  todayChange,
  totalPnl,
  returnPct,
  premiumPerShare,
  totalPremium,
}: {
  rows: DayRow[];
  kind: ScenarioKind;
  onKind: (k: ScenarioKind) => void;
  startingInvestment: number;
  currentValue: number;
  todayChange: number;
  totalPnl: number;
  returnPct: number;
  premiumPerShare: number;
  totalPremium: number;
}) {
  return (
    <div className="panel">
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="text-[10px] tracking-widest text-slate-500">DAY-BY-DAY MONEY PATH</div>
        <p className="text-xs text-slate-500 mt-1">
          Today uses the live listed premium. Later rows are theoretical estimates (time + a simple price path) — not guaranteed returns.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {(
            [
              ["up", "Stock goes up"],
              ["flat", "Stock stays about the same"],
              ["down", "Stock goes down"],
            ] as [ScenarioKind, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => onKind(id)}
              className={`px-2.5 py-1 rounded text-xs border ${
                kind === id ? "border-accent/50 bg-accent/15 text-white" : "border-line text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 text-xs">
          <Mini label="Starting investment" value={usd(startingInvestment)} />
          <Mini label="Current value" value={usd(currentValue)} />
          <Mini label="Today's change" value={signed(todayChange)} tone={todayChange} />
          <Mini label="Total P/L" value={signed(totalPnl)} tone={totalPnl} />
          <Mini label="Return" value={`${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%`} tone={returnPct} />
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          Premium {usd(Math.abs(premiumPerShare))}/share · multiplier 100 · total premium {usd(Math.abs(totalPremium))}
        </div>
      </div>
      <div className="border-t border-white/5">
        <table className="w-full text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left px-3 py-1.5">Day</th>
              <th className="text-right px-3 py-1.5">Stock price</th>
              <th className="text-right px-3 py-1.5">Option value</th>
              <th className="text-right px-3 py-1.5">Daily P/L</th>
              <th className="text-right px-3 py-1.5">Total P/L</th>
              <th className="text-left px-3 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.day}-${r.dayIndex}`} className="border-t border-white/5">
                <td className="px-3 py-1.5">{r.day}</td>
                <td className="px-3 py-1.5 text-right tick">{usd(r.stockPrice)}</td>
                <td className="px-3 py-1.5 text-right tick">{usd(r.optionValue)}</td>
                <td className={`px-3 py-1.5 text-right tick ${pnlClass(r.dailyPnl)}`}>{signed(r.dailyPnl)}</td>
                <td className={`px-3 py-1.5 text-right tick ${pnlClass(r.cumulativePnl)}`}>{signed(r.cumulativePnl)}</td>
                <td className="px-3 py-1.5 text-slate-500">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className={`tick font-semibold ${tone == null ? "text-white" : pnlClass(tone)}`}>{value}</div>
    </div>
  );
}
