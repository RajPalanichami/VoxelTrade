"use client";

import { usd, toneClass } from "@/lib/format";
import type { Candle, SwingStrategyResult, SwingTimeframe } from "@/lib/types";
import { SwingChart } from "./SwingChart";

function signalWords(signal: SwingStrategyResult["signal"]) {
  if (signal === "BULLISH") return "Bullish";
  if (signal === "BEARISH") return "Bearish";
  if (signal === "NEUTRAL") return "Neutral";
  return "NO TRADE";
}

export function SwingStrategyCard({
  strategy,
  symbol,
  timeframe,
  timeframeLabel,
  bars,
  onTimeframe,
}: {
  strategy: SwingStrategyResult;
  symbol: string;
  timeframe: SwingTimeframe;
  timeframeLabel: string;
  bars: Candle[];
  onTimeframe: (tf: SwingTimeframe) => void;
}) {
  const { plan } = strategy;
  const noTrade = strategy.signal === "NO_TRADE" || !plan.allowed;
  return (
    <section className="space-y-3" data-testid={`swing-strategy-${strategy.id}`} id={`swing-${strategy.id}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{strategy.name}</h2>
          <p className={`text-sm ${toneClass(strategy.signal)}`}>
            {strategy.score} / 100 — {signalWords(strategy.signal)}
          </p>
        </div>
        <div className="text-xs text-slate-400 max-w-xl">{strategy.scoreWhy}</div>
      </div>

      <div className="panel p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
        <Metric label={`${timeframeLabel.toUpperCase()} ENTRY`} value={noTrade ? "NO TRADE" : usd(plan.entry)} />
        <Metric label="ENTRY ZONE" value={noTrade ? "—" : `${usd(plan.entryLow)}–${usd(plan.entryHigh)}`} />
        <Metric label="STOP LOSS" value={noTrade ? "—" : usd(plan.stop)} />
        <Metric label="TARGET 1" value={noTrade ? "—" : usd(plan.target1)} />
        <Metric label="TARGET 2" value={noTrade ? "—" : usd(plan.target2)} />
        <Metric label="TARGET 3" value={noTrade ? "—" : usd(plan.target3)} />
        <Metric label="R:R" value={noTrade || plan.riskReward == null ? "—" : `1:${plan.riskReward.toFixed(1)}`} />
        <Metric label="INVALIDATION" value={noTrade ? "—" : usd(plan.invalidation)} />
      </div>

      <SwingChart
        symbol={symbol}
        timeframe={timeframe}
        onTimeframe={onTimeframe}
        strategyId={strategy.id}
        bars={bars}
        overlays={strategy.overlays}
        plan={plan}
      />

      <div className="panel p-4 space-y-3 text-sm leading-relaxed text-slate-300">
        {noTrade ? (
          <p className="text-warn font-medium">
            NO TRADE — {strategy.noTradeReason || strategy.whenEnter}
          </p>
        ) : (
          <p className="text-white">{strategy.whenEnter}</p>
        )}
        <p>
          <span className="text-slate-500">What this is saying: </span>
          {strategy.why}
        </p>
        <p>
          <span className="text-slate-500">When to exit: </span>
          {strategy.whenExit}
        </p>
        <p>
          <span className="text-slate-500">Why this score: </span>
          {strategy.scoreWhy}
        </p>
        <p>
          <span className="text-slate-500">Risks / warnings: </span>
          {strategy.risks}
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.16em] text-slate-500">{label}</div>
      <div className="text-white tick mt-1">{value}</div>
    </div>
  );
}
