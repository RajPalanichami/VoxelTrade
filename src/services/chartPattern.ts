import { PATTERN_TIMEFRAME_LABELS, getSettings } from "@/src/config/env";
import { isPatternSwingTimeframe, type PatternTimeframe } from "@/src/config/timeframes";
import {
  buildTradeLevels,
  overviewDecisionFor,
  pickPrimaryPattern,
  resampleToMonthly,
  tradeDecisionFor,
  type OverviewDecision,
  type PatternBias,
  type PatternTradeStyle,
  type TradeDecision,
} from "@/src/engines/chartPatterns";
import { HttpError } from "@/src/lib/errors";
import { analysis } from "@/src/services/analysis";
import type { OHLCVBar, Quote } from "@/src/types/domain";

const TRADE_HEADING: Record<PatternTimeframe, string> = {
  "5m": "5-Minute Day Trading",
  "15m": "15-Minute Day Trading",
  "30m": "30-Minute Day Trading",
  "1h": "1-Hour Day Trading",
  "4h": "4-Hour Day Trading",
  "1d": "Daily Swing Trading",
  "1w": "Weekly Swing Trading",
  "1M": "Monthly Swing Trading",
};

const BAR_COUNT: Record<PatternTimeframe, number> = {
  "5m": 280,
  "15m": 280,
  "30m": 280,
  "1h": 320,
  "4h": 220,
  "1d": 420,
  "1w": 180,
  "1M": 1400,
};

export type PatternSnapshot = {
  timeframe: PatternTimeframe;
  timeframe_label: string;
  pattern_name: string;
  market_structure: string;
  bias: PatternBias;
  status: string;
  decision: OverviewDecision;
};

export type PatternTradePlan = {
  style: PatternTradeStyle;
  style_label: string;
  timeframe: PatternTimeframe;
  timeframe_label: string;
  heading: string;
  pattern_name: string;
  bias: PatternBias;
  status: string;
  market_structure: string;
  entry: string | null;
  entry_zone: string | null;
  preferred_entry: string | null;
  stop: string | null;
  target_1: string | null;
  target_2: string | null;
  target_3: string | null;
  decision: TradeDecision;
};

export type ChartPatternAnalysis = {
  symbol: string;
  name: string;
  price: number;
  change_percent: number | null;
  overview: {
    daily: PatternSnapshot;
    weekly: PatternSnapshot;
    monthly: PatternSnapshot;
  };
  trade: PatternTradePlan;
  freshness: Quote["freshness"] & { algorithm_version: string };
};

function money(n: number) {
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : 4;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function formatEntry(n: number, hint: "above" | "below" | "at") {
  if (hint === "above") return `Above ${money(n)}`;
  if (hint === "below") return `Below ${money(n)}`;
  return money(n);
}

function emptySnapshot(tf: PatternTimeframe, reason: string): PatternSnapshot {
  return {
    timeframe: tf,
    timeframe_label: PATTERN_TIMEFRAME_LABELS[tf],
    pattern_name: "Unavailable",
    market_structure: reason,
    bias: "NEUTRAL",
    status: "Watching",
    decision: "AVOID",
  };
}

async function loadPatternBars(symbol: string, timeframe: PatternTimeframe): Promise<[OHLCVBar[], string, number]> {
  if (timeframe === "1M") {
    const [daily, source, latency] = await analysis.bars(symbol, "1d", BAR_COUNT["1M"]);
    const monthly = resampleToMonthly(daily).map((bar) => ({ ...bar, symbol, timeframe: "1M" }));
    return [monthly, source, latency];
  }
  return analysis.bars(symbol, timeframe, BAR_COUNT[timeframe]);
}

function snapshotFromBars(bars: OHLCVBar[], timeframe: PatternTimeframe): PatternSnapshot {
  const primary = pickPrimaryPattern(bars);
  return {
    timeframe,
    timeframe_label: PATTERN_TIMEFRAME_LABELS[timeframe],
    pattern_name: primary.name,
    market_structure: primary.market_structure,
    bias: primary.bias,
    status: primary.status,
    decision: overviewDecisionFor(primary.bias, primary.status),
  };
}

function tradeFromBars(bars: OHLCVBar[], timeframe: PatternTimeframe): PatternTradePlan {
  const style: PatternTradeStyle = isPatternSwingTimeframe(timeframe) ? "swing" : "day";
  const style_label = style === "swing" ? "Swing Trading" : "Day Trading";
  const timeframe_label = PATTERN_TIMEFRAME_LABELS[timeframe];
  const primary = pickPrimaryPattern(bars);
  const levels = buildTradeLevels(bars, primary);
  const decision = tradeDecisionFor(primary.status, style);
  return {
    style,
    style_label,
    timeframe,
    timeframe_label,
    heading: TRADE_HEADING[timeframe],
    pattern_name: primary.name,
    bias: primary.bias,
    status: primary.status,
    market_structure: primary.market_structure,
    entry: style === "day" ? formatEntry(levels.entry, levels.entryHint) : null,
    entry_zone: style === "swing" ? `${money(levels.entryLow)} – ${money(levels.entryHigh)}` : null,
    preferred_entry: style === "swing" ? money(levels.preferred) : null,
    stop: money(levels.stop),
    target_1: money(levels.target1),
    target_2: money(levels.target2),
    target_3: money(levels.target3),
    decision,
  };
}

async function analyzeTimeframe(symbol: string, timeframe: PatternTimeframe): Promise<{ snapshot: PatternSnapshot; bars: OHLCVBar[]; source: string; latency: number }> {
  const minBars = timeframe === "1M" ? 18 : 40;
  const [bars, source, latency] = await loadPatternBars(symbol, timeframe);
  if (bars.length < minBars) {
    throw new HttpError(422, `Unable to retrieve enough market data to read a chart pattern for ${symbol} on ${PATTERN_TIMEFRAME_LABELS[timeframe]}.`);
  }
  return { snapshot: snapshotFromBars(bars, timeframe), bars, source, latency };
}

async function tryAnalyze(symbol: string, timeframe: PatternTimeframe) {
  try {
    return await analyzeTimeframe(symbol, timeframe);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Not enough market data";
    return {
      snapshot: emptySnapshot(timeframe, reason.includes("enough market data") ? "Not enough market data" : "Unavailable"),
      bars: [] as OHLCVBar[],
      source: "none",
      latency: 0,
      error: err,
    };
  }
}

export async function buildChartPatternAnalysis(symbol: string, timeframe: PatternTimeframe = "1d"): Promise<ChartPatternAnalysis> {
  const ticker = symbol.toUpperCase();
  const quote = await analysis.quote(ticker);

  const selectedKey = timeframe === "1d" ? "daily" : timeframe === "1w" ? "weekly" : timeframe === "1M" ? "monthly" : "other";
  const [dailyRes, weeklyRes, monthlyRes, extraRes] = await Promise.all([
    tryAnalyze(ticker, "1d"),
    tryAnalyze(ticker, "1w"),
    tryAnalyze(ticker, "1M"),
    selectedKey === "other" ? tryAnalyze(ticker, timeframe) : Promise.resolve(null),
  ]);

  const selected =
    timeframe === "1d" ? dailyRes : timeframe === "1w" ? weeklyRes : timeframe === "1M" ? monthlyRes : extraRes!;

  if (!selected.bars.length) {
    const detail = "error" in selected && selected.error instanceof Error ? selected.error.message : `Unable to retrieve enough market data to read a chart pattern for ${ticker}.`;
    throw selected && "error" in selected && selected.error instanceof HttpError ? selected.error : new HttpError(422, detail);
  }

  const latency = Math.max(dailyRes.latency, weeklyRes.latency, monthlyRes.latency, selected.latency);
  const source = selected.source !== "none" ? selected.source : dailyRes.source;

  return {
    symbol: ticker,
    name: quote.name || ticker,
    price: quote.price || selected.bars[selected.bars.length - 1].close,
    change_percent: quote.change_percent ?? null,
    overview: {
      daily: dailyRes.snapshot,
      weekly: weeklyRes.snapshot,
      monthly: monthlyRes.snapshot,
    },
    trade: tradeFromBars(selected.bars, timeframe),
    freshness: {
      ...quote.freshness,
      source,
      latency_ms: latency,
      algorithm_version: getSettings().algorithmVersion,
    },
  };
}
