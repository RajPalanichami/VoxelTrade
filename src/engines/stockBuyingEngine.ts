import { lastNum, sma } from "@/src/lib/series";
import { SECTORS } from "@/src/data/sectors";
import {
  BEGINNER_GLOSSARY,
  type BuyingDecision,
  type BuyingEvidence,
  type BuyingHorizon,
  type BuyingLevel,
  type BuyingState,
  type EvidenceTone,
} from "@/lib/stockBuying";
import type { AnalysisBundle, Candle, Indicators, Levels, Plan, Quote } from "@/lib/types";

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function completedBar(bars: Candle[]): Candle | null {
  if (!bars.length) return null;
  return bars.length >= 2 ? bars[bars.length - 2] : bars[bars.length - 1];
}

function lastBar(bars: Candle[]): Candle | null {
  return bars.length ? bars[bars.length - 1] : null;
}

export function movingAveragesFromCloses(closes: number[]) {
  return {
    sma20: lastNum(sma(closes, 20)),
    sma50: lastNum(sma(closes, 50)),
    sma200: lastNum(sma(closes, 200)),
  };
}

export function classifyBreakout(price: number | null, completed: Candle | null, levels: Levels, volumeRatio: number | null): BuyingState | null {
  const resistance = levels.r1 ?? levels.swing_high ?? null;
  if (price == null || resistance == null || !completed) return null;
  const close = completed.close;
  const prior = close >= resistance;
  const nowAbove = price >= resistance;
  const volOk = volumeRatio != null && volumeRatio >= 1.2;
  const near = Math.abs(price - resistance) / resistance <= 0.012;
  if (prior && !nowAbove) return "FAILED";
  if (prior && nowAbove && volOk) return "BREAKOUT_CONFIRMED";
  if (prior && nowAbove && !volOk) return "BREAKOUT_PENDING";
  if (!prior && nowAbove && !volOk) return "BREAKOUT_PENDING";
  if (!prior && near) return "BREAKOUT_PENDING";
  if (prior && nowAbove && price < resistance * 1.004) return "RETEST_PENDING";
  return null;
}

export function classifyStructure(ind: Indicators): { label: string; detail: string } {
  if (ind.higher_highs && ind.higher_lows) {
    return { label: "BULLISH", detail: "Higher high and higher low on completed candles. No future bars were used." };
  }
  if (ind.higher_highs === false && ind.higher_lows === false) {
    return { label: "BEARISH", detail: "Lower high and lower low on completed candles." };
  }
  if (ind.higher_highs || ind.higher_lows) {
    return { label: "MIXED", detail: "Partial structure only — one side of HH/HL is present. Treat as unconfirmed." };
  }
  return { label: "INSUFFICIENT_DATA", detail: "Not enough completed candles to classify market structure." };
}

function ev(
  id: string,
  label: string,
  tone: EvidenceTone,
  condition: string,
  current: string,
  expected: string,
  status: BuyingEvidence["status"],
  explanation: string,
): BuyingEvidence {
  return { id, label, tone, condition, current, expected, status, explanation };
}

function mapSignalToState(signal: string, plan: Plan, breakout: BuyingState | null, stale: boolean, hasPrice: boolean): BuyingState {
  if (!hasPrice || stale && signal === "NO_TRADE") {
    if (!hasPrice) return "INSUFFICIENT_DATA";
  }
  if (!hasPrice) return "INSUFFICIENT_DATA";
  if (signal === "NO_TRADE") return "NO_TRADE";
  if (breakout === "FAILED") return "FAILED";
  if (breakout === "BREAKOUT_CONFIRMED" && plan.trade_allowed) return "BREAKOUT_CONFIRMED";
  if (breakout === "BREAKOUT_PENDING") return "BREAKOUT_PENDING";
  if (breakout === "RETEST_PENDING") return "RETEST_PENDING";
  if (signal === "STRONG_BUY" && plan.trade_allowed) return "LONG_SETUP";
  if (signal === "BUY" && plan.trade_allowed) return "LONG_SETUP";
  if (signal === "BUY" || signal === "STRONG_BUY") return "WATCH";
  if (signal === "WAIT") return "WAIT";
  if (signal === "WEAK") return "WATCH";
  if (signal === "SELL") return "NO_TRADE";
  return "WAIT";
}

function toneFromStatus(status?: string): EvidenceTone {
  if (status === "BULLISH") return "BULLISH";
  if (status === "BEARISH") return "BEARISH";
  if (status === "CAUTION") return "UNCONFIRMED";
  return "NEUTRAL";
}

export function sectorForSymbol(symbol: string, sectorName?: string | null) {
  const u = symbol.toUpperCase();
  for (const meta of Object.values(SECTORS)) {
    if (meta.members.some(([t]) => t === u)) return meta;
  }
  if (sectorName) {
    const hit = Object.values(SECTORS).find((s) => s.name.toLowerCase() === sectorName.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export function relativeStrengthNote(stock: number | null, sector: number | null, spy: number | null) {
  if (stock == null || spy == null) {
    return "Relative strength versus SPY is unavailable for this snapshot.";
  }
  const vsSpy = stock - spy;
  const vsSector = sector != null ? stock - sector : null;
  const parts = [
    vsSpy > 0 ? `Stock is outperforming SPY by ${fmt(vsSpy)} percentage points on this session change.` : `Stock is lagging SPY by ${fmt(Math.abs(vsSpy))} percentage points on this session change.`,
  ];
  if (vsSector != null) {
    parts.push(
      vsSector > 0
        ? `It is also ahead of its sector by ${fmt(vsSector)} points.`
        : `It is behind its sector by ${fmt(Math.abs(vsSector))} points.`,
    );
  }
  parts.push("This is same-session change comparison, not a multi-year alpha model.");
  return parts.join(" ");
}

function valuationLine(quote: Quote, fund: Record<string, unknown> | null) {
  const pe = quote.pe ?? (typeof fund?.pe === "number" ? fund.pe : null);
  const fwd = quote.forward_pe ?? (typeof fund?.forward_pe === "number" ? fund.forward_pe : null);
  if (pe == null && fwd == null) return "Valuation multiples are unavailable for this ticker.";
  if (pe != null && fwd != null && fwd < pe) {
    return `Current P/E ${fmt(pe)} is above forward P/E ${fmt(fwd)}. That is a growth-discounted multiple, not a buy signal.`;
  }
  if (pe != null) return `Current P/E ${fmt(pe)}. Historical 1Y/3Y/5Y ranges are not published by the free providers used here.`;
  return `Forward P/E ${fmt(fwd)}. A low multiple is not treated as a buy.`;
}

function catalystLine(earn: Record<string, unknown> | null, newsCount: number) {
  const days = typeof earn?.days_to_earnings === "number" ? earn.days_to_earnings : null;
  if (days != null && days >= 0 && days <= 7) return "NEAR-TERM EARNINGS";
  if (days != null && days > 7) return "SCHEDULED EARNINGS";
  if (newsCount) return "NEWS PRESENT";
  return "NEUTRAL / UNCONFIRMED";
}

export function assembleBuyingDecision(bundle: AnalysisBundle, horizon: BuyingHorizon): BuyingDecision {
  const quote = bundle.quote;
  const ind = bundle.indicators || {};
  const levels = bundle.levels || {};
  const plan = bundle.long_plan;
  const signal = String(bundle.signal?.signal || "WAIT");
  const bars = bundle.bars || [];
  const price = quote?.price ?? ind.last_close ?? null;
  const completed = completedBar(bars);
  const latest = lastBar(bars);
  const stale = bundle.freshness?.data_status === "STALE";
  const breakout = classifyBreakout(price, completed, levels, ind.volume_ratio ?? quote?.volume_ratio ?? null);
  const structure = classifyStructure(ind);
  const state = stale && !price ? "INSUFFICIENT_DATA" : mapSignalToState(signal, plan, breakout, stale, price != null);
  const cats = bundle.signal?.categories || [];
  const evidence: BuyingEvidence[] = cats.slice(0, 10).map((c) =>
    ev(
      String(c.id ?? c.name),
      c.name,
      toneFromStatus(c.status),
      c.details || c.name,
      String(c.raw_score ?? "—"),
      "See methodology: category score 0–10 from completed-bar indicators.",
      c.status === "BULLISH" ? "MET" : c.status === "BEARISH" ? "NOT_MET" : "UNKNOWN",
      c.details || "Category comes from the existing Signal Analyzer engine.",
    ),
  );

  if (ind.vwap != null && price != null) {
    evidence.unshift(
      ev(
        "vwap",
        "VWAP",
        price >= ind.vwap ? "BULLISH" : "BEARISH",
        "Price versus session VWAP",
        `Price ${fmt(price)} / VWAP ${fmt(ind.vwap)}`,
        "Above VWAP for long bias on this session",
        price >= ind.vwap ? "MET" : "NOT_MET",
        BEGINNER_GLOSSARY.VWAP,
      ),
    );
  }

  const whyMap: Record<BuyingState, string> = {
    LONG_SETUP: "The existing signal engine allows a long plan and hard filters did not block it.",
    WATCH: "Evidence is mixed or a buy label is present but the plan is not fully allowed.",
    WAIT: "The signal engine is in WAIT — conditions are not a high-quality new entry.",
    NO_TRADE: "Hard filters or a bearish label blocked a new long. This is not a short recommendation.",
    INSUFFICIENT_DATA: "Price or bars are missing. Values are not invented.",
    BREAKOUT_PENDING: "Price is at or through resistance, but a completed close plus volume confirmation is incomplete.",
    BREAKOUT_CONFIRMED: "A completed candle closed through resistance with elevated relative volume.",
    RETEST_PENDING: "Price is back at the broken level. Hold/fail is not yet decided.",
    RETEST_CONFIRMED: "Broken resistance held as support on a completed candle.",
    FAILED: "Price traded through resistance and then closed back below it on completed data.",
    INVALIDATED: "The working level no longer holds on completed candles.",
  };

  const whatNext =
    state === "BREAKOUT_PENDING"
      ? ["Completed close above resistance", "Volume at or above 1.2× average", "Follow-through on the next completed candle", "Optional retest hold"]
      : state === "LONG_SETUP"
        ? ["Stay inside the published entry zone", "Invalidation is the stop from the trading plan", "Do not chase if price stretches beyond ATR"]
        : ["Do not force a new long", "Watch the listed confirmation items", "Re-check after the next completed candle"];

  const levelsOut: BuyingLevel[] = [
    { label: "Support S1", price: levels.s1 ?? null, why: "Pivot support from the existing level engine." },
    { label: "Resistance R1", price: levels.r1 ?? null, why: "Pivot resistance. A wick through this is not confirmation." },
    { label: "Swing low", price: levels.swing_low ?? null, why: "Last swing low on completed bars only." },
    { label: "Swing high", price: levels.swing_high ?? null, why: "Last swing high on completed bars only." },
    { label: "VWAP", price: ind.vwap ?? levels.vwap ?? null, why: "Session volume-weighted average price." },
    { label: "52-week high", price: quote?.week52_high ?? null, why: "Quoted 52-week high from the quote provider." },
    { label: "52-week low", price: quote?.week52_low ?? null, why: "Quoted 52-week low from the quote provider." },
  ];

  const matrix = [
    { name: "Price vs VWAP", current: ind.vwap != null && price != null ? `${fmt(((price - ind.vwap) / ind.vwap) * 100)}%` : "—", status: price != null && ind.vwap != null ? (price >= ind.vwap ? "Above" : "Below") : "Unavailable", explanation: BEGINNER_GLOSSARY.VWAP },
    { name: "RSI", current: fmt(ind.rsi, 1), status: ind.rsi == null ? "Unavailable" : ind.rsi >= 70 ? "Elevated" : ind.rsi <= 30 ? "Depressed" : "Neutral band", explanation: BEGINNER_GLOSSARY.RSI },
    { name: "MACD hist", current: fmt(ind.macd_hist), status: ind.macd_hist == null ? "Unavailable" : ind.macd_hist > 0 ? "Positive" : "Negative", explanation: BEGINNER_GLOSSARY.MACD },
    { name: "RVOL", current: ind.volume_ratio != null ? `${fmt(ind.volume_ratio)}x` : "—", status: ind.volume_ratio == null ? "Unavailable" : ind.volume_ratio >= 1.2 ? "Expanding" : "Average / quiet", explanation: BEGINNER_GLOSSARY.RVOL },
    { name: "EMA 20", current: fmt(ind.ema20), status: price != null && ind.ema20 != null ? (price >= ind.ema20 ? "Above" : "Below") : "Unavailable", explanation: BEGINNER_GLOSSARY.EMA },
    { name: "EMA 50", current: fmt(ind.ema50), status: price != null && ind.ema50 != null ? (price >= ind.ema50 ? "Above" : "Below") : "Unavailable", explanation: BEGINNER_GLOSSARY.EMA },
    { name: "EMA 200", current: fmt(ind.ema200), status: price != null && ind.ema200 != null ? (price >= ind.ema200 ? "Above" : "Below") : "Unavailable", explanation: BEGINNER_GLOSSARY.EMA },
    { name: "ATR", current: fmt(ind.atr), status: "Range measure", explanation: BEGINNER_GLOSSARY.ATR },
  ];

  const beginner = [
    { term: "RSI", what: BEGINNER_GLOSSARY.RSI, current: `RSI ${fmt(ind.rsi, 1)}`, meaning: ind.rsi == null ? "Unavailable." : "Momentum reading only — not a reversal timer." },
    { term: "VWAP", what: BEGINNER_GLOSSARY.VWAP, current: `VWAP ${fmt(ind.vwap)}`, meaning: price != null && ind.vwap != null ? (price >= ind.vwap ? "Price is above VWAP." : "Price is below VWAP.") : "Unavailable." },
    { term: "Breakout", what: BEGINNER_GLOSSARY.BREAKOUT, current: breakout || "No active breakout state", meaning: "Uses the last completed candle, not a forming wick." },
    { term: "Relative strength", what: BEGINNER_GLOSSARY.RS, current: quote?.change_percent != null ? `${fmt(quote.change_percent)}% today` : "—", meaning: "Compared with SPY in the relative-strength panel." },
  ];

  const fund = bundle.fundamentals;
  const thesis =
    horizon === "LONG_TERM"
      ? [
          `Business: revenue growth ${fmt(num(fund?.revenue_growth))}%, EPS growth ${fmt(num(fund?.eps_growth))}%.`,
          `Profitability: gross margin ${fmt(num(fund?.gross_margin))}%, operating margin ${fmt(num(fund?.operating_margin))}%.`,
          `Balance: cash ${fmt(num(fund?.total_cash), 0)}, debt ${fmt(num(fund?.total_debt), 0)}.`,
          valuationLine(quote, fund),
          "This is a structured snapshot, not an unconditional investment recommendation.",
        ]
      : [`Horizon is ${horizon.replace("_", " ")}. Long-term thesis fields stay available in Advanced when fundamentals loaded.`];

  const scenarios =
    horizon === "DAY_TRADE" || horizon === "SCALP"
      ? [
          { id: "A", title: "Breakout + volume", detail: "Completed close through R1 with RVOL ≥ 1.2×. Scenario, not a prediction." },
          { id: "B", title: "Resistance rejection", detail: "Failed hold above R1 on a completed candle returns state to FAILED / WAIT." },
          { id: "C", title: "VWAP loss", detail: "A completed close back through VWAP weakens the long case for this session." },
          { id: "D", title: "Range / no trade", detail: "If RVOL is quiet and structure is mixed, the engine stays WAIT or NO TRADE." },
        ]
      : [
          { id: "A", title: "Trend continuation", detail: "Higher-timeframe trend stays aligned and the plan remains allowed." },
          { id: "B", title: "Level rejection", detail: "A failed breakout or lost support invalidates the working long plan." },
        ];

  const regime = bundle.market?.spx_change_pct == null ? "UNAVAILABLE" : bundle.market.spx_change_pct >= 0 ? "RISK-ON BIAS" : "DEFENSIVE BIAS";
  const momentum = ind.rsi == null ? "UNAVAILABLE" : ind.rsi >= 55 ? "POSITIVE" : ind.rsi <= 45 ? "NEGATIVE" : "NEUTRAL";
  const volume = ind.volume_ratio == null ? "UNAVAILABLE" : ind.volume_ratio >= 1.2 ? "CONFIRMING" : "QUIET";

  return {
    symbol: quote?.symbol || "",
    name: quote?.name || "",
    horizon,
    timeframe: bundle.signal?.timeframe as BuyingDecision["timeframe"],
    state,
    why: whyMap[state] + (bundle.signal?.explanation ? ` ${bundle.signal.explanation}` : ""),
    what: `${quote?.symbol || "Ticker"} is in ${state.replaceAll("_", " ")} on the ${horizon.replaceAll("_", " ")} horizon.`,
    soWhat: horizonFocus(horizon),
    whatNext,
    whatChanges: {
      confirm: whatNext,
      caution: plan.block_reason ? [plan.block_reason] : ["Loss of VWAP on a completed candle", "RVOL fading while price extends"],
      invalidate: [plan.invalidation != null ? `Break below ${fmt(plan.invalidation)}` : "Break of the published stop / swing low", "Failed breakout back below R1"],
    },
    regime,
    trend: structure.label,
    momentum,
    volume,
    structure: breakout || structure.label,
    catalyst: catalystLine(bundle.earnings, bundle.news?.length || 0),
    valuation: valuationLine(quote, fund),
    riskReward: plan.risk_reward ?? null,
    evidence,
    levels: levelsOut,
    matrix,
    beginner,
    thesis,
    scenarios,
    quality: [
      { label: "Price", value: freshnessLabelSafe(bundle.freshness?.data_status) },
      { label: "Source", value: bundle.freshness?.source || "unavailable" },
      { label: "Bars", value: String(bars.length) },
      { label: "Last completed bar", value: completed ? String(completed.time) : "—" },
      { label: "Forming bar", value: latest && completed && latest.time !== completed.time ? "Excluded from confirmation" : "Single bar only" },
      { label: "Fundamentals", value: fund ? "Latest reported snapshot" : "Unavailable" },
      { label: "News", value: bundle.news?.length ? `${bundle.news.length} headlines` : "None from provider" },
    ],
    sources: [
      bundle.freshness?.source || "market-data",
      "Signal Analyzer scoring / trading-plan engines",
      "Existing fundamentals, news, and market-overview providers",
    ],
  };
}

function horizonFocus(horizon: BuyingHorizon) {
  if (horizon === "LONG_TERM") return "Weight fundamentals, valuation context, and the daily trend more than a 5-minute wick.";
  if (horizon === "SWING") return "Weight daily/4h structure, relative strength, and R:R more than tape noise.";
  if (horizon === "DAY_TRADE") return "Weight session VWAP, opening range context, RVOL, and SPY/QQQ more than quarterly earnings.";
  return "Weight liquidity, VWAP, and 5-minute completed structure. Execution risk is high; this is not a longer-term thesis.";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function freshnessLabelSafe(status?: string) {
  if (status === "LIVE") return "Provider live/delayed quote — see freshness badge";
  if (status === "DELAYED") return "Delayed";
  if (status === "EOD") return "End-of-day";
  if (status === "STALE") return "Stale";
  return "Unavailable";
}
