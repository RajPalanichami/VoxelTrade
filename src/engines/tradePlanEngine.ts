import { classicPivots, last, macd, rsi } from "@/src/engines/indicators";
import { fibonacciRetracements, recentSwingExtremes } from "@/src/engines/swingStrategies";
import { isoDateEastern } from "@/src/lib/easternTime";
import type { Frame } from "@/src/lib/series";
import type { Indicators, OHLCVBar, Quote, SRLevels } from "@/src/types/domain";
import type { TickerMarketContext } from "@/lib/extendedHours";
import {
  TRADE_PLAN_TF_LABEL,
  type TradePlanLevel,
  type TradePlanMap,
  type TradePlanOptionIdea,
  type TradePlanTimeframe,
  type TradePlanTone,
  type TradePlanZone,
} from "@/lib/tradePlan";

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function lvl(
  id: string,
  label: string,
  price: number | null,
  meaning: string,
  tone: TradePlanTone,
  extra: { starred?: boolean; zone?: TradePlanZone; onChart?: boolean } = {},
): TradePlanLevel {
  return {
    id,
    label,
    price: price == null ? null : r2(price),
    meaning,
    tone,
    starred: extra.starred,
    zone: extra.zone,
    onChart: extra.onChart,
  };
}

function finiteNums(xs: Array<number | null | undefined>): number[] {
  return xs.filter((n): n is number => n != null && Number.isFinite(n));
}

function distinctFrom(cands: Array<number | null | undefined>, used: number[], _ref?: number): number | null {
  for (const n of finiteNums(cands)) {
    if (used.some((u) => r2(u) === r2(n))) continue;
    return r2(n);
  }
  return null;
}

function orderedAhead(price: number | null, levels: Array<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const n of finiteNums(levels).sort((a, b) => a - b)) {
    if (price != null && n < price - 0.01) continue;
    if (out.some((u) => Math.abs(u - n) < 0.01)) continue;
    out.push(r2(n));
  }
  return out;
}

function previousCompletedDay(bars: OHLCVBar[]) {
  const byDay = new Map<string, OHLCVBar[]>();
  for (const b of bars) {
    const key = isoDateEastern(b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp));
    const list = byDay.get(key) || [];
    list.push(b);
    byDay.set(key, list);
  }
  const days = [...byDay.keys()].sort();
  if (days.length < 2) return null;
  const prior = byDay.get(days[days.length - 2]) || [];
  if (!prior.length) return null;
  return {
    high: Math.max(...prior.map((b) => b.high)),
    low: Math.min(...prior.map((b) => b.low)),
    close: prior[prior.length - 1].close,
    open: prior[0].open,
  };
}

export function fibonacciExtensions(high: number, low: number) {
  const range = high - low;
  if (!(range > 0)) {
    return { ext100: null, ext127: null, ext162: null };
  }
  return {
    ext100: r2(high),
    ext127: r2(low + range * 1.272),
    ext162: r2(low + range * 1.618),
  };
}

export function fibonacciDownsideExtensions(high: number, low: number) {
  const range = high - low;
  if (!(range > 0)) {
    return { ext110: null, ext127: null, ext162: null };
  }
  return {
    ext110: r2(low - range * 0.1),
    ext127: r2(low - range * 0.272),
    ext162: r2(low - range * 0.618),
  };
}

export function buildDecisionLadder(input: {
  price: number | null;
  vwap: number | null;
  fib618: number | null;
  fib500: number | null;
  fib786: number | null;
  pivot: number | null;
  breakout: number | null;
  majorResistance: number | null;
  priorSessionHigh: number | null;
  r1: number | null;
  r2: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  rangeLow: number | null;
  priorSessionLow: number | null;
  down110: number | null;
}): TradePlanLevel[] {
  const used: number[] = [];
  const take = (cands: Array<number | null | undefined>) => {
    const n = distinctFrom(cands, used);
    if (n != null) used.push(n);
    return n;
  };

  const breakout = take([input.breakout, input.r2, input.r1, input.majorResistance]);
  const resBelowBreak = finiteNums(
    [input.majorResistance, input.priorSessionHigh, input.r1, input.fib500].map((n) =>
      n == null || breakout == null || n < breakout - 0.01 ? n : null,
    ),
  ).sort((a, b) => b - a);
  const majorRes = take(resBelowBreak);
  const vwap = take([input.vwap]);
  const fib618 = take([input.fib618]);
  const pivot = take([input.pivot, input.fib500]);
  const ceiling = pivot ?? vwap ?? input.price;
  const below = (n: number | null | undefined) =>
    n != null && ceiling != null ? n < ceiling - 0.01 : n != null;

  const supportCands = finiteNums([
    below(input.s1) ? input.s1 : null,
    below(input.fib786) ? input.fib786 : null,
    below(input.s2) ? input.s2 : null,
    input.rangeLow,
    input.priorSessionLow,
    input.s3,
    input.down110,
  ]).sort((a, b) => b - a);
  const support1 = take(supportCands);
  const support2 = take(supportCands.filter((n) => support1 == null || n < support1 - 0.01));
  const majorSup = take(supportCands.filter((n) => {
    const cap = support2 ?? support1;
    return cap == null || n < cap - 0.01;
  }));

  return [
    lvl("l1", "1 · Breakout", breakout, "Breakout above this resistance zone. Opens room for continuation.", "BULLISH", { zone: "ABOVE", onChart: true }),
    lvl("l2", "2 · Major resistance", majorRes, "Heavier resistance. Expect a reaction here — a wick is not confirmation.", "BEARISH", { zone: "ABOVE", onChart: true }),
    lvl("l3", "3 · VWAP", vwap, "Session pivot. Reclaim on a completed close = early strength.", "PIVOT", { zone: "PIVOT", onChart: true, starred: true }),
    lvl("l4", "4 · Fib 61.8%", fib618, "Key Fibonacci level and first major decision line of the working swing.", "PIVOT", { zone: "PIVOT", onChart: true, starred: true }),
    lvl("l5", "5 · Pivot", pivot, "Classic prior-session pivot, or 50% of the working swing if the prior day is missing.", "PIVOT", { zone: "PIVOT", onChart: true }),
    lvl("l6", "6 · Support 1", support1, "First downside magnet if the pivot zone fails on a completed close.", "BULLISH", { zone: "BELOW", onChart: true }),
    lvl("l7", "7 · Support 2", support2, "Next support cluster below Support 1.", "BULLISH", { zone: "BELOW", onChart: true }),
    lvl("l8", "8 · Major support", majorSup, "Major lower support from the prior swing or session low.", "BEARISH", { zone: "BELOW", onChart: true, starred: true }),
  ];
}

export function describeStructure(ind: Indicators, swingHigh: number | null, swingLow: number | null, price: number | null) {
  if (price == null || swingHigh == null || swingLow == null) {
    return { label: "INSUFFICIENT DATA", detail: "Not enough completed swings to describe structure.", rangeLow: swingLow, rangeHigh: swingHigh };
  }
  if (ind.higher_highs && ind.higher_lows) {
    return { label: "HIGHER HIGH / HIGHER LOW", detail: "Completed swings show higher highs and higher lows.", rangeLow: swingLow, rangeHigh: swingHigh };
  }
  if (ind.lower_highs && ind.lower_lows) {
    return { label: "LOWER HIGH / LOWER LOW", detail: "Completed swings show lower highs and lower lows.", rangeLow: swingLow, rangeHigh: swingHigh };
  }
  return {
    label: "RANGE",
    detail: `Working range is ${r2(swingLow)} to ${r2(swingHigh)} on completed swings. A close through either side decides the next impulse.`,
    rangeLow: swingLow,
    rangeHigh: swingHigh,
  };
}

function nearestStrike(strikes: number[], price: number) {
  if (!strikes.length) return null;
  return [...strikes].sort((a, b) => Math.abs(a - price) - Math.abs(b - price))[0];
}

export function buildOptionIdeas(
  price: number | null,
  chain: { expiration?: string; calls?: Array<{ strike: number }>; puts?: Array<{ strike: number }> } | null,
  targets: { up: number | null; down: number | null },
): { bullish: TradePlanOptionIdea[]; bearish: TradePlanOptionIdea[] } {
  const unavailable = (title: string): TradePlanOptionIdea => ({
    title,
    detail: "Listed option strikes for this idea are not available from the chain provider.",
    risk: "MODERATE",
    available: false,
  });
  if (price == null || !chain?.calls?.length || !chain.puts?.length) {
    return {
      bullish: [unavailable("Calls"), unavailable("Call debit"), unavailable("Call calendar")],
      bearish: [unavailable("Puts"), unavailable("Put debit"), unavailable("Put calendar")],
    };
  }
  const calls = chain.calls.map((c) => c.strike).filter((n) => Number.isFinite(n));
  const puts = chain.puts.map((p) => p.strike).filter((n) => Number.isFinite(n));
  const atmCall = nearestStrike(calls, price);
  const atmPut = nearestStrike(puts, price);
  const callWing = targets.up != null ? nearestStrike(calls.filter((s) => s > (atmCall ?? price)), targets.up) : nearestStrike(calls.filter((s) => s > price * 1.015), price * 1.02);
  const putWing = targets.down != null ? nearestStrike(puts.filter((s) => s < (atmPut ?? price)), targets.down) : nearestStrike(puts.filter((s) => s < price * 0.985), price * 0.98);
  const exp = chain.expiration ? `Expiration ${chain.expiration}` : "Nearest listed expiration";
  return {
    bullish: [
      {
        title: "Buy calls (directional)",
        detail: atmCall != null ? `${exp}. ATM-area call ${r2(atmCall)}. High reward / defined only by premium paid.` : "No call strike near spot.",
        risk: "HIGH",
        available: atmCall != null,
      },
      {
        title: "Call debit spread",
        detail: atmCall != null && callWing != null ? `Buy ${r2(atmCall)} call / sell ${r2(callWing)} call. Defined risk.` : "Need two listed call strikes above spot.",
        risk: "MODERATE",
        available: atmCall != null && callWing != null,
      },
      {
        title: "Call calendar",
        detail: "Same-strike calendar needs a second expiration from the chain. Only the front month is loaded here, so this idea is not priced.",
        risk: "LOWER",
        available: false,
      },
    ],
    bearish: [
      {
        title: "Buy puts (directional)",
        detail: atmPut != null ? `${exp}. ATM-area put ${r2(atmPut)}.` : "No put strike near spot.",
        risk: "HIGH",
        available: atmPut != null,
      },
      {
        title: "Put debit spread",
        detail: atmPut != null && putWing != null ? `Buy ${r2(atmPut)} put / sell ${r2(putWing)} put. Defined risk.` : "Need two listed put strikes below spot.",
        risk: "MODERATE",
        available: atmPut != null && putWing != null,
      },
      {
        title: "Put calendar",
        detail: "Same-strike put calendar is not priced because only one expiration is fetched.",
        risk: "LOWER",
        available: false,
      },
    ],
  };
}

export function assembleTradePlan(input: {
  symbol: string;
  name: string;
  timeframe: TradePlanTimeframe;
  quote: Quote;
  bars: OHLCVBar[];
  frame: Frame;
  indicators: Indicators;
  levels: SRLevels;
  context: TickerMarketContext | null;
  optionChain?: { expiration?: string; calls?: Array<{ strike: number }>; puts?: Array<{ strike: number }> } | null;
}): TradePlanMap {
  const price = input.quote.price ?? input.indicators.last_close ?? null;
  const swings = recentSwingExtremes(input.frame);
  const highs = [...swings.highs].sort((a, b) => a.price - b.price);
  const priorMajorHigh = highs.length ? highs[highs.length - 1].price : swings.swingHigh;
  const latestHigh = swings.lastHigh?.price ?? swings.swingHigh;
  const bWave = swings.highs.length >= 2 ? swings.highs[swings.highs.length - 1].price : latestHigh;
  const priorHigh = swings.highs.length >= 2 ? swings.highs[swings.highs.length - 2].price : priorMajorHigh;
  const waveA = swings.lastLow?.price ?? swings.swingLow;
  const rangeHigh = Math.max(priorHigh ?? latestHigh, latestHigh);
  const rangeLow = waveA;
  const fib = rangeHigh != null && rangeLow != null && rangeHigh > rangeLow ? fibonacciRetracements(rangeHigh, rangeLow) : null;
  const ext = rangeHigh != null && rangeLow != null && rangeHigh > rangeLow ? fibonacciExtensions(rangeHigh, rangeLow) : { ext100: null, ext127: null, ext162: null };
  const downExt = rangeHigh != null && rangeLow != null && rangeHigh > rangeLow ? fibonacciDownsideExtensions(rangeHigh, rangeLow) : { ext110: null, ext127: null, ext162: null };
  const priorDay = previousCompletedDay(input.bars);
  const pivots = priorDay ? classicPivots(priorDay.high, priorDay.low, priorDay.close) : null;
  const pre = input.context?.sessions.preMarket;
  const prePrice = pre?.available ? pre.last ?? pre.close ?? pre.high ?? null : null;
  const vwap = input.indicators.vwap ?? input.levels.vwap ?? null;
  const structure = describeStructure(input.indicators, rangeHigh, rangeLow, price);
  const closes = input.frame.get("close");
  const rsi14Series = rsi(closes, 14);
  const rsi7Series = rsi(closes, 7);
  const rsi7 = last(rsi7Series);
  const [fastMacd, fastSig, fastHist] = macd(closes, 6, 13, 5);
  const [, , stdHist] = macd(closes, 12, 26, 9);
  const compact = (xs: Array<number | null>) => xs.filter((n): n is number => n != null && Number.isFinite(n)).slice(-36);
  const supportBelowLow = distinctFrom(
    [input.levels.s1, input.levels.s2, input.levels.s3, priorDay?.low].map((n) =>
      n != null && waveA != null && n < waveA - 0.01 ? n : null,
    ),
    [],
    price ?? waveA ?? 100,
  );

  const chartLevels: TradePlanLevel[] = [
    lvl("major-high", "Prior major high", priorMajorHigh, "Highest completed swing high in the working window.", "BEARISH", { starred: true, onChart: true, zone: "ABOVE" }),
    lvl("b-wave", "Latest swing high", bWave, "Most recent completed swing high. Labeled B only when a prior impulse high exists.", "NEUTRAL", { starred: true, onChart: true, zone: "ABOVE" }),
    lvl("y-high", "Prior-session high", priorDay?.high ?? null, "High of the last completed ET session — not a forming day.", "NEUTRAL", { starred: true, onChart: true, zone: "ABOVE" }),
    lvl("fib236", "Fib 23.6%", fib?.r236 ?? null, "Shallow 23.6% retracement of the working swing.", "NEUTRAL", { zone: "ABOVE" }),
    lvl("fib382", "Fib 38.2%", fib?.r382 ?? null, "38.2% retracement of the working swing.", "NEUTRAL", { zone: "PIVOT" }),
    lvl("fib500", "Fib 50%", fib?.r500 ?? null, "Midpoint of the working swing range.", "PIVOT", { zone: "PIVOT" }),
    lvl("fib618", "Fib 61.8%", fib?.r618 ?? null, "61.8% retracement — first major decision line.", "PIVOT", { starred: true, onChart: true, zone: "PIVOT" }),
    lvl("fib786", "Fib 78.6%", fib?.r786 ?? null, "78.6% retracement of the working swing range.", "NEUTRAL", { zone: "PIVOT" }),
    lvl("fib886", "Fib 88.6%", fib && rangeHigh != null && rangeLow != null ? r2(rangeHigh - (rangeHigh - rangeLow) * 0.886) : null, "Deep 88.6% retracement — last defense before the swing low.", "NEUTRAL", { zone: "BELOW" }),
    lvl("pre", "Premarket last", prePrice, pre?.available ? "Last pre-market print from the extended-hours feed." : "Premarket tape not available for this snapshot.", "NEUTRAL"),
    lvl("vwap", "VWAP", vwap, "Session volume-weighted average from completed bars in this timeframe.", "PIVOT", { starred: true, onChart: true, zone: "PIVOT" }),
    lvl("wave-a", "Working swing low", waveA, "Most recent completed swing low.", "BULLISH", { starred: true, onChart: true, zone: "BELOW" }),
    lvl("ext110", "1.1 extension target", downExt.ext110, "110% of the working swing projected below the low. A map, not a forecast.", "BEARISH", { onChart: true, zone: "BELOW" }),
    lvl("ext127", "1.272 extension", ext.ext127, "Upside extension of the same swing range. Not a prediction.", "BULLISH", { zone: "ABOVE" }),
    lvl("ext162", "1.618 extension", ext.ext162, "Further upside extension of the same swing range.", "BULLISH", { zone: "ABOVE" }),
    lvl("s1", "Support 1", supportBelowLow ?? (waveA != null && price != null && (input.levels.s1 ?? 0) < price ? input.levels.s1 : null), "First support that actually sits below the working swing low or spot.", "BULLISH", { zone: "BELOW" }),
    lvl("s2", "Support 2", input.levels.s2 != null && (waveA == null || input.levels.s2 < waveA) ? input.levels.s2 : priorDay?.low ?? null, "Next support cluster below Support 1.", "BULLISH", { zone: "BELOW" }),
    lvl("major-sup", "Major support", input.levels.s3 ?? priorDay?.low ?? rangeLow, "Lower support from pivots or the prior-session low.", "BEARISH", { zone: "BELOW" }),
  ];

  const upside = orderedAhead(price, [bWave, priorDay?.high ?? null, priorMajorHigh]);
  const stepNames = ["First strength", "Next resistance", "Major resistance"] as const;
  const bullishRoadmap = (upside.length ? upside.slice(0, 3) : finiteNums([priorDay?.high ?? null, bWave, priorMajorHigh]).slice(0, 3)).map((p, i) =>
    lvl(`br-${i}`, stepNames[i] || "Resistance", p, i === 0 ? "First sign of strength if reclaimed on a completed close." : "A completed close through this is continuation evidence, not certainty.", "BULLISH", { starred: i === 0 }),
  );
  const bearishRoadmap = [
    lvl("be-a", "Working swing low", waveA, "Loss of this low on a completed close is the first downside confirmation.", "BEARISH", { starred: true }),
    lvl("be-s1", "Next demand / Fib 100%", supportBelowLow ?? waveA, "Next demand if the swing low fails — never a level above that low.", "BEARISH"),
    lvl("be-ext", "1.1 extension target", downExt.ext110 ?? input.levels.s2 ?? null, "110% of the working swing projected below the low. A target, not a promise.", "BEARISH"),
  ];

  const aboveVwap = price != null && vwap != null && price >= vwap;
  const inRange = price != null && rangeLow != null && rangeHigh != null && price >= rangeLow && price <= rangeHigh;
  const bigPicture = inRange
    ? `${input.symbol} is inside the completed-swing range ${rangeLow != null ? r2(rangeLow) : "—"} to ${rangeHigh != null ? r2(rangeHigh) : "—"}. A close through either side is what decides the next impulse.`
    : price != null && rangeHigh != null && price > rangeHigh
      ? `${input.symbol} is trading above the working swing high ${r2(rangeHigh)}. Follow-through still needs a completed close and volume — a wick is not confirmation.`
      : price != null && rangeLow != null && price < rangeLow
        ? `${input.symbol} is trading below the working swing low ${r2(rangeLow)}. That is breakdown evidence until a completed reclaim.`
        : "Price relative to the working swing range is unavailable.";

  const rsi14 = input.indicators.rsi ?? null;
  const rsiNote =
    rsi14 == null
      ? "RSI unavailable."
      : rsi14 > 70
        ? `RSI(14) ${rsi14.toFixed(1)} is elevated. That is momentum, not an automatic reversal.`
        : rsi14 < 30
          ? `RSI(14) ${rsi14.toFixed(1)} is depressed. That is weakness, not an automatic bounce.`
          : `RSI(14) ${rsi14.toFixed(1)} is mid-range. Momentum is ${rsi14 >= 50 ? "positive" : "soft"}, not overbought.`;

  const hist = input.indicators.macd_hist;
  const macdNote =
    hist == null
      ? "MACD unavailable."
      : hist > 0
        ? "Standard MACD histogram is above zero — shorter EMA is stronger than the longer EMA on completed bars."
        : "Standard MACD histogram is below zero — shorter-term momentum is weaker than the longer average.";

  const watch = [
    priorDay?.high != null && (price == null || price < priorDay.high)
      ? { tone: "BULLISH" as const, text: `Completed close above ${r2(priorDay.high)} (prior-session high) would be the first strength print.` }
      : upside[0] != null
        ? { tone: "BULLISH" as const, text: `Spot is through the nearest completed highs. Next unused resistance is ${r2(upside[0])}.` }
        : { tone: "BULLISH" as const, text: "No unused resistance remains above spot on this swing map." },
    bWave != null && (price == null || price < bWave)
      ? { tone: "BULLISH" as const, text: `A close through ${r2(bWave)} (latest swing high) would challenge the larger resistance zone.` }
      : { tone: "BULLISH" as const, text: priorMajorHigh != null ? `Latest swing high is already behind price. ${r2(priorMajorHigh)} is the larger resistance.` : "Latest swing high unavailable." },
    { tone: "BEARISH" as const, text: waveA != null ? `A close below ${r2(waveA)} (working swing low) confirms downside and opens the next support.` : "Working swing low unavailable." },
    { tone: "CAUTION" as const, text: vwap != null ? `VWAP ${r2(vwap)} is the session pivot. Losing it on a completed close weakens longs; reclaiming it weakens shorts.` : "VWAP unavailable." },
  ];

  const ladder = buildDecisionLadder({
    price,
    vwap,
    fib618: fib?.r618 ?? null,
    fib500: fib?.r500 ?? null,
    fib786: fib?.r786 ?? null,
    pivot: pivots?.pivot ?? fib?.r500 ?? null,
    breakout: priorMajorHigh,
    majorResistance: bWave != null && priorMajorHigh != null && bWave !== priorMajorHigh ? Math.min(bWave, priorMajorHigh) : null,
    priorSessionHigh: priorDay?.high ?? null,
    r1: input.levels.r1,
    r2: input.levels.r2,
    s1: input.levels.s1,
    s2: input.levels.s2,
    s3: input.levels.s3,
    rangeLow,
    priorSessionLow: priorDay?.low ?? null,
    down110: downExt.ext110,
  });

  const options = buildOptionIdeas(price, input.optionChain || null, { up: priorMajorHigh, down: waveA });
  const layout = input.timeframe === "4h" ? "DECISION_LADDER" : "CHART_MAP";

  return {
    symbol: input.symbol.toUpperCase(),
    name: input.name,
    timeframe: input.timeframe,
    timeframeLabel: TRADE_PLAN_TF_LABEL[input.timeframe],
    layout,
    price,
    changePercent: input.quote.change_percent ?? null,
    premarketPrice: prePrice,
    premarketChangePct: pre?.changePercent ?? null,
    vwap,
    session: input.context?.session ?? input.quote.market_state ?? null,
    freshness: {
      source: input.quote.freshness?.source || "market-data",
      dataStatus: input.quote.freshness?.data_status || "UNAVAILABLE",
      timestamp: input.quote.freshness?.timestamp || new Date().toISOString(),
    },
    structure,
    fib: {
      high: fib?.high ?? rangeHigh,
      low: fib?.low ?? rangeLow,
      r236: fib?.r236 ?? null,
      r382: fib?.r382 ?? null,
      r500: fib?.r500 ?? null,
      r618: fib?.r618 ?? null,
      r786: fib?.r786 ?? null,
      r886: fib && rangeHigh > rangeLow ? r2(rangeHigh - (rangeHigh - rangeLow) * 0.886) : null,
      ext100: ext.ext100,
      ext110: downExt.ext110,
      ext127: ext.ext127,
      ext162: ext.ext162,
      note: fib
        ? "Retracements use the last completed swing high/low only. Extensions are the same range projected forward. They are maps, not forecasts."
        : "A valid swing range is not available, so Fibonacci values are omitted.",
    },
    chartLevels,
    bullishRoadmap,
    bearishRoadmap,
    bigPicture,
    keyLevelsSummary: [
      ...bullishRoadmap,
      lvl("ks-a", "Working swing low", waveA, "Invalidates the immediate long map on a completed breakdown.", "BEARISH"),
      bearishRoadmap[2],
    ].filter((x): x is TradePlanLevel => Boolean(x)),
    tradePlan: {
      bullish: [
        aboveVwap ? "Price is at or above VWAP — longs want a hold or reclaim, not a chase through resistance." : "Price is below VWAP — a completed reclaim is the first long condition.",
        upside.length
          ? `Look for a completed close above ${upside.map((n) => r2(n)).join(", then ")}.`
          : "No unused resistance remains above spot on this swing map.",
        priorMajorHigh != null ? `Only a completed close through ${r2(priorMajorHigh)} is continuation evidence.` : "Major high unavailable.",
      ],
      bearish: [
        waveA != null ? `A completed close below ${r2(waveA)} is the first short confirmation.` : "Swing low unavailable.",
        downExt.ext110 != null ? `If that low fails, the 1.1 extension ${r2(downExt.ext110)} is the mapped downside target.` : "Manage risk at the next listed support — do not assume a free-fall.",
        "This is a plan if price confirms, not a standing order to sell.",
      ],
    },
    rsi: { rsi14, rsi7, note: rsiNote, series: compact(rsi14Series) },
    macd: {
      line: input.indicators.macd ?? null,
      signal: input.indicators.macd_signal ?? null,
      hist: hist ?? null,
      fastLine: last(fastMacd),
      fastSignal: last(fastSig),
      fastHist: last(fastHist),
      note: macdNote,
      histSeries: compact(stdHist),
    },
    whatToWatch: watch,
    ladder,
    howToUse: [
      "Start at the current price and work outward — do not skip levels.",
      "Watch price action plus volume at each listed level.",
      vwap != null ? `Use VWAP ${r2(vwap)} as the session pivot.` : "VWAP is unavailable this snapshot.",
      fib?.r618 != null ? `${r2(fib.r618)} (61.8%) is the make-or-break retracement.` : "61.8% is unavailable without a swing range.",
      "If the pivot zone fails on a completed close, look down the ladder. If it holds, look up.",
    ],
    currentRead: [
      price != null ? `Price ${r2(price)}${vwap != null ? ` · VWAP ${r2(vwap)}` : ""}` : "Price unavailable.",
      rsiNote,
      macdNote,
      `${fib?.r618 != null ? r2(fib.r618) : "The 61.8% line"} is the decision pivot for this map.`,
    ],
    bullishScenario: [
      fib?.r618 != null ? `Hold above ${r2(fib.r618)}–${pivots?.pivot != null ? r2(pivots.pivot) : r2(fib.r500 ?? fib.r618)}.` : "Need a completed swing range to define the hold zone.",
      vwap != null ? `Reclaim VWAP ${r2(vwap)} if it has been lost.` : "VWAP reclaim cannot be scored.",
      bWave != null ? `Break above ${r2(bWave)} on a completed close.` : "Latest swing high unavailable.",
      priorMajorHigh != null ? `Close above ${r2(priorMajorHigh)} for continuation evidence.` : "Major high unavailable.",
    ],
    bearishScenario: [
      vwap != null ? `Reject / fail to reclaim VWAP ${r2(vwap)}.` : "VWAP rejection cannot be scored.",
      fib?.r618 != null ? `Break below ${r2(fib.r618)} and the pivot.` : "Pivot break cannot be scored.",
      waveA != null ? `Move toward ${r2(waveA)} and the next support.` : "Swing low unavailable.",
      "A failed level is confirmation only after a completed candle — not a wick.",
    ],
    bullishOptions: options.bullish,
    bearishOptions: options.bearish,
    reminders: [
      "Always use a stop. This page maps levels; it does not place orders.",
      "Confirm with volume. A thin break is not the same as an accepted break.",
      "Respect the higher-timeframe map when it conflicts with a lower one.",
      "No level is guaranteed. Plan the trade, then let a completed candle confirm.",
      "Not financial advice. Educational decision map only.",
    ],
    methodology:
      "Swings use completed pivot bars (left/right confirmation) so they do not repaint. Fibonacci is the last completed swing high-to-low. VWAP is the session cumulative typical-price × volume. RSI(14) and MACD(12,26,9) match the rest of Voxel; RSI(7) and MACD(6,13,5) are extra readings shown on the reference boards. Option ideas use listed strikes only.",
    bars: input.bars.slice(-220).map((b) => ({
      time: Math.floor((b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp)).getTime() / 1000),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })),
  };
}
