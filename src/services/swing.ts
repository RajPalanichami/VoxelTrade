import { TIMEFRAME_LABELS, getSettings } from "@/src/config/env";
import { isSwingTimeframe, swingHigherTimeframe, type SwingTimeframe } from "@/src/config/timeframes";
import { computeAll } from "@/src/engines/indicators";
import { calculateLevels } from "@/src/engines/supportResistance";
import { runAllSwingStrategies, summarizeSwing, type SwingContext, type SwingStrategyResult } from "@/src/engines/swingStrategies";
import { HttpError } from "@/src/lib/errors";
import { toFrame } from "@/src/providers/base";
import { analysis, asDate } from "@/src/services/analysis";
import type { Indicators, OHLCVBar, Quote, SRLevels } from "@/src/types/domain";

export type SwingSummary = ReturnType<typeof summarizeSwing>;

export type SwingAnalysis = {
  symbol: string;
  timeframe: SwingTimeframe;
  timeframe_label: string;
  quote: Quote;
  indicators: Indicators;
  levels: SRLevels;
  bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  strategies: SwingStrategyResult[];
  summary: SwingSummary;
  higher_timeframe: SwingTimeframe;
  higher_trend: SwingContext["higherTrend"];
  freshness: Quote["freshness"] & { algorithm_version: string };
};

function chartBars(bars: OHLCVBar[]) {
  const unique = new Map<number, { time: number; open: number; high: number; low: number; close: number; volume: number }>();
  const ordered = [...bars].sort((a, b) => asDate(a.timestamp).getTime() - asDate(b.timestamp).getTime());
  for (const b of ordered) {
    unique.set(Math.floor(asDate(b.timestamp).getTime() / 1000), {
      time: Math.floor(asDate(b.timestamp).getTime() / 1000),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    });
  }
  return [...unique.values()].sort((a, b) => a.time - b.time).slice(-300);
}

export function assembleSwingAnalysis(input: {
  symbol: string;
  timeframe: SwingTimeframe;
  quote: Quote;
  bars: OHLCVBar[];
  indicators: Indicators;
  levels: SRLevels;
  higherTrend: SwingContext["higherTrend"];
  source: string;
  latencyMs: number;
}): SwingAnalysis {
  const frame = computeAll(toFrame(input.bars));
  const ctx: SwingContext = {
    symbol: input.symbol.toUpperCase(),
    timeframe: input.timeframe,
    timeframeLabel: TIMEFRAME_LABELS[input.timeframe] || input.timeframe,
    price: input.quote.price || input.indicators.last_close || 0,
    quote: input.quote,
    bars: input.bars,
    frame,
    indicators: input.indicators,
    levels: input.levels,
    higherTrend: input.higherTrend,
    higherLabel: TIMEFRAME_LABELS[swingHigherTimeframe(input.timeframe)] || swingHigherTimeframe(input.timeframe),
  };
  const strategies = runAllSwingStrategies(ctx);
  const summary = summarizeSwing(strategies, ctx);
  return {
    symbol: ctx.symbol,
    timeframe: input.timeframe,
    timeframe_label: ctx.timeframeLabel,
    quote: input.quote,
    indicators: input.indicators,
    levels: input.levels,
    bars: chartBars(input.bars),
    strategies,
    summary,
    higher_timeframe: swingHigherTimeframe(input.timeframe),
    higher_trend: input.higherTrend,
    freshness: {
      source: input.source,
      timestamp: new Date().toISOString(),
      data_status: input.quote.freshness.data_status,
      latency_ms: input.latencyMs,
      algorithm_version: getSettings().algorithmVersion,
    },
  };
}

async function higherTrendFor(symbol: string, timeframe: SwingTimeframe, local: Indicators): Promise<SwingContext["higherTrend"]> {
  const higher = swingHigherTimeframe(timeframe);
  const read = (ind: Indicators): SwingContext["higherTrend"] => {
    if (ind.ema20 != null && ind.ema50 != null) return ind.ema20 >= ind.ema50 ? "BULLISH" : "BEARISH";
    return "NEUTRAL";
  };
  if (higher === timeframe) return read(local);
  try {
    const [hind] = await analysis.indicators(symbol, higher);
    return read(hind);
  } catch {
    return read(local);
  }
}

export async function buildSwingAnalysis(symbol: string, timeframe: string): Promise<SwingAnalysis> {
  if (!isSwingTimeframe(timeframe)) {
    throw new HttpError(400, `Unsupported swing timeframe '${timeframe}'.`);
  }
  const t0 = Date.now();
  const quote = await analysis.quote(symbol);
  const [ind, bars, source] = await analysis.indicators(symbol, timeframe);
  const levels = calculateLevels(toFrame(bars), ind, ind.last_close || quote.price);
  const higherTrend = await higherTrendFor(symbol, timeframe, ind);
  return assembleSwingAnalysis({
    symbol,
    timeframe,
    quote,
    bars,
    indicators: ind,
    levels,
    higherTrend,
    source,
    latencyMs: Date.now() - t0,
  });
}
