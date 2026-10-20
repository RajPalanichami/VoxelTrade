import { buildExplainableDecision, compactTfScore } from "@/src/engines/stockDecisionScore";
import type { Indicators, OHLCVBar, Quote, SRLevels } from "@/src/types/domain";
import type { TickerMarketContext } from "@/lib/extendedHours";
import {
  STOCK_DECISION_TF_LABEL,
  type StockDecisionAction,
  type StockDecisionConfidence,
  type StockDecisionDirection,
  type StockDecisionLevel,
  type StockDecisionMap,
  type StockDecisionMtfRow,
  type StockDecisionScore,
  type StockDecisionSetup,
  type StockDecisionStructure,
  type StockDecisionMtfScore,
  type StockDecisionTimeframe,
  type StockDecisionWeekDay,
} from "@/lib/stockDecision";

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function nn(n: number | null | undefined): number | null {
  return n == null || !Number.isFinite(n) ? null : n;
}

function completed(bars: OHLCVBar[]) {
  if (bars.length >= 2) return bars[bars.length - 2];
  return bars[bars.length - 1] || null;
}

function completedRvol(bars: OHLCVBar[], fallback: number | null | undefined) {
  const done = bars.length >= 21 ? bars.slice(0, -1) : bars;
  if (done.length >= 6) {
    const last = done[done.length - 1];
    const window = done.slice(-20);
    const avg = window.reduce((sum, b) => sum + (Number.isFinite(b.volume) ? b.volume : 0), 0) / window.length;
    if (avg > 0 && Number.isFinite(last.volume)) return last.volume / avg;
  }
  const value = nn(fallback);
  return value === 0 ? null : value;
}

export function volumePriceMatrix(changePct: number | null, rvol: number | null) {
  const flat = changePct == null || Math.abs(changePct) < 0.15;
  const up = changePct != null && changePct >= 0.15;
  const down = changePct != null && changePct <= -0.15;
  const high = rvol != null && rvol >= 1.2;
  const low = rvol != null && rvol < 0.85;
  if (up && high) return { key: "UP_HIGH", text: "Price is up with high participation. That is potential accumulation, not a buy order." };
  if (up && low) return { key: "UP_LOW", text: "Price is up on low participation. That is a potential weak bounce, not confirmed buying." };
  if (down && high) return { key: "DOWN_HIGH", text: "Price is down with high participation. That is potential distribution / strong selling pressure." };
  if (down && low) return { key: "DOWN_LOW", text: "Price is down on low participation. That can be a low-participation pullback, not an independent sell forecast." };
  if (flat && high) return { key: "FLAT_HIGH", text: "Price is flat with high volume. That is potential absorption or two-way conflict." };
  if (flat && low) return { key: "FLAT_LOW", text: "Price is consolidating on low volume. Lower participation does not independently establish direction." };
  return { key: "MIXED", text: "Volume-price relationship is mixed or incomplete on this snapshot." };
}

export function estimateBarFlow(bars: OHLCVBar[]) {
  const window = bars.slice(-40);
  let buy = 0;
  let sell = 0;
  const deltaSeries: number[] = [];
  const cvdSeries: number[] = [];
  let cvd = 0;
  for (const b of window) {
    if (!Number.isFinite(b.volume)) continue;
    const up = b.close > b.open;
    const down = b.close < b.open;
    const d = up ? b.volume : down ? -b.volume : 0;
    if (up) buy += b.volume;
    else if (down) sell += b.volume;
    cvd += d;
    deltaSeries.push(d);
    cvdSeries.push(cvd);
  }
  const delta = buy - sell;
  const ratio = sell > 0 ? buy / sell : buy > 0 ? null : null;
  return {
    estimatedBuy: buy || null,
    estimatedSell: sell || null,
    delta: buy || sell ? delta : null,
    cvd: cvdSeries.length ? cvd : null,
    ratio,
    deltaSeries,
    cvdSeries,
  };
}

export function classifyStructure(ind: Indicators): { label: StockDecisionStructure; detail: string } {
  if (ind.higher_highs && ind.higher_lows) {
    return { label: "BULLISH", detail: "Completed swings show higher highs and higher lows. No future bar was used." };
  }
  if (ind.lower_highs && ind.lower_lows) {
    return { label: "BEARISH", detail: "Completed swings show lower highs and lower lows." };
  }
  if ((ind.higher_highs || ind.higher_lows) && (ind.lower_highs || ind.lower_lows)) {
    return { label: "TRANSITION", detail: "Structure is mixed — one side of HH/HL conflicts with LH/LL." };
  }
  if (ind.higher_highs || ind.higher_lows || ind.lower_highs || ind.lower_lows) {
    return { label: "RANGE", detail: "Partial structure only. Treat as range until both sides confirm." };
  }
  return { label: "INSUFFICIENT_DATA", detail: "Not enough completed candles to classify structure." };
}

export function classifyBreakout(price: number | null, close: number | null, resistance: number | null, rvol: number | null) {
  if (price == null || resistance == null || close == null) {
    return { status: "INSUFFICIENT_DATA", closeConfirmed: false, volumeConfirmed: false, strength: null, note: "Resistance or close is unavailable, so breakout is not scored." };
  }
  const closeOk = close > resistance;
  const wickOnly = price > resistance && close <= resistance;
  const volOk = rvol != null && rvol >= 1.2;
  const dist = ((close - resistance) / resistance) * 100;
  if (wickOnly) {
    return { status: "NOT_CONFIRMED", closeConfirmed: false, volumeConfirmed: volOk, strength: 15, note: `Price traded through ${r2(resistance)} but the completed close did not hold above it. A wick is not confirmation.` };
  }
  if (closeOk && volOk) {
    return { status: "BREAKOUT_CONFIRMED", closeConfirmed: true, volumeConfirmed: true, strength: clamp(55 + dist * 8), note: `Completed close above ${r2(resistance)} with relative volume ${rvol?.toFixed(2)}. Follow-through is still required.` };
  }
  if (closeOk && !volOk) {
    return { status: "BREAKOUT_PENDING", closeConfirmed: true, volumeConfirmed: false, strength: 40, note: `Close is above ${r2(resistance)}, but volume has not confirmed. NOT CONFIRMED.` };
  }
  if (price >= resistance * 0.995) {
    return { status: "BREAKOUT_PENDING", closeConfirmed: false, volumeConfirmed: volOk, strength: 28, note: `Price is testing ${r2(resistance)}. Close confirmation: NO.` };
  }
  return { status: "NOT_CONFIRMED", closeConfirmed: false, volumeConfirmed: false, strength: 10, note: `Price remains below resistance ${r2(resistance)}.` };
}

export function interpretVolume(changePct: number | null, rvol: number | null) {
  const matrix = volumePriceMatrix(changePct, rvol);
  return {
    matrix: matrix.key,
    interpretation: matrix.text,
    state:
      matrix.key === "UP_HIGH"
        ? "EXPANDING PARTICIPATION"
        : matrix.key === "FLAT_LOW" || matrix.key === "DOWN_LOW"
          ? "BELOW RECENT AVERAGE"
          : matrix.key === "DOWN_HIGH"
            ? "HEAVY PARTICIPATION ON DECLINE"
            : "MIXED / NORMAL",
  };
}

function scoreTrend(ind: Indicators, price: number | null): StockDecisionScore {
  if (price == null || ind.ema21 == null) return { id: "trend", label: "Trend", value: null, why: "Moving averages are incomplete." };
  let n = 50;
  if (ind.ema9 != null && price > ind.ema9) n += 8;
  if (price > ind.ema21) n += 10;
  if (ind.ema50 != null && price > ind.ema50) n += 10;
  if (ind.ema200 != null && price > ind.ema200) n += 12;
  if ((ind.ema21_slope || 0) > 0) n += 6;
  if (ind.higher_highs && ind.higher_lows) n += 8;
  if (ind.lower_highs && ind.lower_lows) n -= 20;
  return { id: "trend", label: "Trend", value: clamp(n), why: "Price versus EMA 9/21/50/200 and slope on completed bars." };
}

function scoreStructure(structure: StockDecisionStructure): StockDecisionScore {
  const map: Record<StockDecisionStructure, number> = {
    BULLISH: 78,
    BEARISH: 22,
    RANGE: 50,
    TRANSITION: 42,
    INSUFFICIENT_DATA: 0,
  };
  return { id: "structure", label: "Market structure", value: structure === "INSUFFICIENT_DATA" ? null : map[structure], why: "HH/HL versus LH/LL on completed swings only." };
}

function scoreMomentum(ind: Indicators): StockDecisionScore {
  if (ind.rsi == null && ind.macd_hist == null) return { id: "momentum", label: "Momentum", value: null, why: "RSI and MACD are unavailable." };
  let n = 50;
  if (ind.rsi != null) n += (ind.rsi - 50) * 0.7;
  if (ind.macd_hist != null) n += ind.macd_hist > 0 ? 10 : -10;
  if (ind.macd_hist != null && ind.macd_hist_prev != null && ind.macd_hist > ind.macd_hist_prev) n += 6;
  return { id: "momentum", label: "Momentum", value: clamp(n), why: "RSI(14) and MACD histogram on completed bars." };
}

function scoreVolume(rvol: number | null, matrix: string): StockDecisionScore {
  if (rvol == null) return { id: "volume", label: "Volume", value: null, why: "Relative volume is unavailable." };
  let n = 40 + Math.min(rvol, 2.5) * 18;
  if (matrix === "UP_LOW" || matrix === "FLAT_LOW") n -= 8;
  return { id: "volume", label: "Volume", value: clamp(n), why: "RVOL versus the 20-bar average. High volume is participation, not direction." };
}

function scoreFlow(delta: number | null, buy: number | null, sell: number | null): StockDecisionScore {
  if (delta == null || buy == null || sell == null) return { id: "orderFlow", label: "Order flow", value: null, why: "Bar-level flow estimate is incomplete." };
  const total = buy + sell;
  const share = total > 0 ? buy / total : 0.5;
  return { id: "orderFlow", label: "Order flow", value: clamp(share * 100), why: "Estimated from completed up/down bars — not tick classification." };
}

function scoreVwap(price: number | null, vwap: number | null): StockDecisionScore {
  if (price == null || vwap == null) return { id: "vwap", label: "VWAP", value: null, why: "VWAP is unavailable." };
  const dist = ((price - vwap) / vwap) * 100;
  const n = 50 + clamp(dist * 12, -30, 30);
  return { id: "vwap", label: "VWAP", value: clamp(n), why: `Distance from session VWAP is ${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%. Above VWAP is location, not a buy.` };
}

function scoreRs(stock: number | null, bench: number | null): StockDecisionScore {
  if (stock == null || bench == null) return { id: "rs", label: "Relative strength", value: null, why: "Benchmark comparison is unavailable." };
  const diff = stock - bench;
  return { id: "rs", label: "Relative strength", value: clamp(50 + diff * 8), why: `Same-session change versus QQQ is ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} points.` };
}

function scoreBreakout(status: string, strength: number | null): StockDecisionScore {
  if (status === "INSUFFICIENT_DATA") return { id: "breakout", label: "Breakout", value: null, why: "Breakout cannot be scored." };
  return { id: "breakout", label: "Breakout", value: strength, why: "Requires a completed close beyond resistance plus volume. Wicks do not count." };
}

function scoreRr(rr: number | null): StockDecisionScore {
  if (rr == null) return { id: "rr", label: "Risk/reward", value: null, why: "Entry and stop are not both defined." };
  if (rr < 1) return { id: "rr", label: "Risk/reward", value: 18, why: `${rr.toFixed(2)}:1 is not treated as a strong setup.` };
  if (rr < 1.8) return { id: "rr", label: "Risk/reward", value: 42, why: `${rr.toFixed(2)}:1 is modest. The engine will not upgrade this to a buy on R:R alone.` };
  return { id: "rr", label: "Risk/reward", value: clamp(55 + (rr - 1.8) * 12), why: `${rr.toFixed(2)}:1 from structure/ATR levels.` };
}

function scoreQuality(status: string, bars: number): StockDecisionScore {
  if (status === "STALE") return { id: "quality", label: "Data quality", value: 25, why: "Quote is stale. Live conclusions are withheld." };
  if (bars < 30) return { id: "quality", label: "Data quality", value: 35, why: "Bar history is short for this timeframe." };
  return { id: "quality", label: "Data quality", value: status === "LIVE" ? 82 : 60, why: "OHLCV and quote are available. Tick/order-book feeds are not." };
}

export function decideAction(input: {
  quality: number | null;
  structure: StockDecisionStructure;
  stale: boolean;
  bars: number;
  breakout: string;
  rvol: number | null;
  vwapState: string;
  rr: number | null;
  eventHigh: boolean;
  noTrade: string[];
}): { action: StockDecisionAction; setup: StockDecisionSetup; direction: StockDecisionDirection; confidence: StockDecisionConfidence } {
  if (input.stale || input.bars < 15 || input.quality == null || input.quality < 30 || input.structure === "INSUFFICIENT_DATA") {
    return { action: "INSUFFICIENT_DATA", setup: "NO_SETUP", direction: "NEUTRAL", confidence: "LOW" };
  }
  const direction: StockDecisionDirection =
    input.structure === "BULLISH" ? "BULLISH" : input.structure === "BEARISH" ? "BEARISH" : "NEUTRAL";
  if (input.noTrade.length >= 2) {
    return { action: "NO_TRADE", setup: "NO_SETUP", direction, confidence: "MEDIUM" };
  }
  if (input.eventHigh) {
    return { action: "WAIT", setup: input.breakout === "BREAKOUT_CONFIRMED" ? "BREAKOUT" : "RANGE", direction, confidence: "LOW" };
  }
  if (input.structure === "BEARISH" && input.breakout !== "BREAKOUT_CONFIRMED") {
    return { action: "NO_TRADE", setup: "NO_SETUP", direction: "BEARISH", confidence: "MEDIUM" };
  }
  if (input.breakout === "BREAKOUT_CONFIRMED" && input.structure === "BULLISH" && (input.rvol || 0) >= 1.2) {
    return { action: "BUY_SETUP", setup: "BREAKOUT", direction: "BULLISH", confidence: input.rr != null && input.rr >= 1.8 ? "HIGH" : "MEDIUM" };
  }
  if (input.breakout === "BREAKOUT_PENDING") {
    return { action: "WATCH", setup: "BREAKOUT", direction, confidence: "LOW" };
  }
  if (input.structure === "BULLISH" && input.vwapState === "BELOW") {
    return { action: "WATCH", setup: "PULLBACK", direction: "BULLISH", confidence: "MEDIUM" };
  }
  if (input.structure === "BULLISH") {
    return { action: "WATCH", setup: "RANGE", direction: "BULLISH", confidence: "MEDIUM" };
  }
  if (input.structure === "RANGE" || input.structure === "TRANSITION") {
    return { action: "WAIT", setup: "RANGE", direction: "NEUTRAL", confidence: "LOW" };
  }
  return { action: "WAIT", setup: "NO_SETUP", direction, confidence: "LOW" };
}

function ageLabel(ts: string | undefined) {
  if (!ts) return "timestamp unavailable";
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "timestamp unavailable";
  if (ms < 2000) return `${(ms / 1000).toFixed(1)} sec ago`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} sec ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  return `${Math.round(ms / 3_600_000)} hr ago`;
}

function weekRows(daily: OHLCVBar[]): StockDecisionWeekDay[] {
  const last = daily.slice(-6);
  const vols = last.map((b) => b.volume).filter((n) => Number.isFinite(n));
  const avg = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;
  return last.map((b, i) => {
    const prev = i > 0 ? last[i - 1] : null;
    const chg = prev && prev.close ? ((b.close - prev.close) / prev.close) * 100 : null;
    const dir: StockDecisionWeekDay["direction"] = chg == null ? "UNKNOWN" : chg > 0.15 ? "UP" : chg < -0.15 ? "DOWN" : "FLAT";
    const rvol = avg && avg > 0 ? b.volume / avg : null;
    const note =
      dir === "UP" && (rvol || 0) >= 1.2
        ? "High-volume advance — participation expanded. Not labeled buying unless trades are classified."
        : dir === "DOWN" && (rvol || 0) >= 1.2
          ? "High-volume decline — participation expanded on the down day."
          : dir === "DOWN" && (rvol || 0) < 0.85
            ? "Low-volume pullback. This is not an independent sell forecast."
            : "Normal or mixed participation.";
    return {
      date: (b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp)).toISOString().slice(0, 10),
      close: r2(b.close),
      changePct: chg == null ? null : r2(chg),
      volume: b.volume,
      averageVolume: avg == null ? null : r2(avg),
      rvol: rvol == null ? null : r2(rvol),
      direction: dir,
      note,
    };
  });
}

export function assembleStockDecision(input: {
  symbol: string;
  name: string;
  timeframe: StockDecisionTimeframe;
  quote: Quote;
  bars: OHLCVBar[];
  indicators: Indicators;
  levels: SRLevels;
  context: TickerMarketContext | null;
  dailyBars: OHLCVBar[];
  market: { spy: number | null; qqq: number | null; iwm: number | null; vix: number | null };
  mtf: StockDecisionMtfRow[];
  mtfScores?: StockDecisionMtfScore[];
  floatShares?: number | null;
  eventRisk: { label: string; detail: string };
}): StockDecisionMap {
  const price = input.quote.price ?? input.indicators.last_close ?? null;
  const done = completed(input.bars);
  const structure = classifyStructure(input.indicators);
  const flow = estimateBarFlow(input.bars);
  const rvol = completedRvol(input.bars, input.indicators.volume_ratio);
  const completedDaily = input.dailyBars.length >= 2 ? input.dailyBars.slice(0, -1) : input.dailyBars;
  const priorDay = completedDaily[completedDaily.length - 1] || null;
  const priorWeek = completedDaily.slice(-5);
  const priorWeekHigh = priorWeek.length ? Math.max(...priorWeek.map((b) => b.high)) : null;
  const priorWeekLow = priorWeek.length ? Math.min(...priorWeek.map((b) => b.low)) : null;
  const lastFive = completedDaily.slice(-5);
  const avg5 = lastFive.length ? lastFive.reduce((a, b) => a + b.volume, 0) / lastFive.length : null;
  const lastDailyVol = (input.dailyBars[input.dailyBars.length - 1] || priorDay)?.volume;
  const vs5 = avg5 && avg5 > 0 && lastDailyVol != null ? lastDailyVol / avg5 : null;
  const vol = interpretVolume(input.quote.change_percent ?? null, nn(rvol));
  const vwap = nn(input.indicators.vwap ?? input.levels.vwap);
  const vwapDist = price != null && vwap != null && vwap !== 0 ? ((price - vwap) / vwap) * 100 : null;
  const vwapState = price != null && vwap != null ? (price >= vwap ? "ABOVE" : "BELOW") : "UNAVAILABLE";
  const resistance = nn(input.levels.r1 ?? input.levels.swing_high);
  const support = nn(input.levels.s1 ?? input.levels.swing_low);
  const brk = classifyBreakout(price, done?.close ?? null, resistance, nn(rvol));
  const atr = nn(input.indicators.atr);
  const entryLo = support != null && vwap != null ? Math.min(support, vwap) : support ?? vwap;
  const entryHi = support != null && vwap != null ? Math.max(support, vwap) : entryLo;
  const stop = support != null && atr != null ? support - atr : support != null ? support * 0.985 : null;
  const t1 = resistance;
  const t2 = input.levels.r2 ?? (resistance != null && atr != null ? resistance + atr : null);
  const t3 = input.levels.r3 ?? (t2 != null && atr != null ? t2 + atr : null);
  const risk = price != null && stop != null ? price - stop : null;
  const reward = t1 != null && price != null ? t1 - price : null;
  const rr = risk != null && risk > 0 && reward != null ? reward / risk : null;

  const noTrade: string[] = [];
  if ((rvol || 0) > 0 && (rvol || 0) < 0.5) noTrade.push("Participation is extremely thin on this timeframe.");
  if (vwapDist != null && vwapDist > 4) noTrade.push("Price is extended more than 4% above VWAP.");
  if (rr != null && rr < 1) noTrade.push("Mapped R:R is below 1.0:1.");
  if (input.mtf.filter((r) => r.available && r.structure.includes("Bear")).length >= 3 && structure.label === "BULLISH") {
    noTrade.push("Higher-timeframe structure conflicts with the local bullish map.");
  }

  const scores: StockDecisionScore[] = [];
  const trend = scoreTrend(input.indicators, price);
  const structS = scoreStructure(structure.label);
  const mom = scoreMomentum(input.indicators);
  const volS = scoreVolume(nn(rvol), vol.matrix);
  const flowS = scoreFlow(flow.delta, flow.estimatedBuy, flow.estimatedSell);
  const vwapS = scoreVwap(price, vwap);
  const rsS = scoreRs(input.quote.change_percent ?? null, input.market.qqq);
  const brkS = scoreBreakout(brk.status, brk.strength);
  const rrS = scoreRr(rr);
  const qS = scoreQuality(input.quote.freshness?.data_status || "UNAVAILABLE", input.bars.length);
  scores.push(trend, structS, mom, volS, flowS, vwapS, rsS, brkS, rrS, qS);

  const decided = decideAction({
    quality: qS.value,
    structure: structure.label,
    stale: input.quote.freshness?.data_status === "STALE",
    bars: input.bars.length,
    breakout: brk.status,
    rvol: nn(rvol),
    vwapState,
    rr,
    eventHigh: /HIGH/i.test(input.eventRisk.label),
    noTrade,
  });

  const supports: StockDecisionLevel[] = [
    { label: "Nearest support", price: support, strength: "STRONG", why: "First demand from the existing level engine / completed swing." },
    { label: "VWAP", price: vwap, strength: "MODERATE", why: "Session volume-weighted average. A hold is location, not a signal." },
    { label: "Major support", price: nn(input.levels.s2 ?? input.levels.s3 ?? input.levels.swing_low), strength: "MAJOR", why: "Lower cluster from pivots or the prior swing low." },
    { label: "Prior day low", price: priorDay?.low ?? null, strength: "MODERATE", why: "Completed prior regular session low. Not a live bid wall." },
    { label: "Prior week low", price: priorWeekLow, strength: "MAJOR", why: "Lowest completed daily low across the last five sessions." },
  ];
  const resistances: StockDecisionLevel[] = [
    { label: "Nearest resistance", price: resistance, strength: "STRONG", why: "First supply. A close through it is required for breakout confirmation." },
    { label: "Upper resistance", price: nn(input.levels.r2 ?? input.levels.swing_high), strength: "MODERATE", why: "Next supply cluster." },
    { label: "Major resistance", price: nn(input.levels.r3), strength: "MAJOR", why: "Further extension of the same level map." },
    { label: "Prior day high", price: priorDay?.high ?? null, strength: "MODERATE", why: "Completed prior regular session high. A wick through it is not confirmation." },
    { label: "Prior week high", price: priorWeekHigh, strength: "MAJOR", why: "Highest completed daily high across the last five sessions." },
  ];

  const vsQqq =
    input.quote.change_percent != null && input.market.qqq != null ? r2(input.quote.change_percent - input.market.qqq) : null;
  const vsSpy =
    input.quote.change_percent != null && input.market.spy != null ? r2(input.quote.change_percent - input.market.spy) : null;

  const reasons = [
    `Structure is ${structure.label.replaceAll("_", " ")}.`,
    vwap != null && price != null ? `Price is ${vwapState.toLowerCase()} VWAP ${r2(vwap)}.` : "VWAP location is unavailable.",
    `Breakout status: ${brk.status.replaceAll("_", " ")}.`,
    vol.interpretation,
    flow.delta != null ? `Estimated bar-level delta is ${flow.delta > 0 ? "+" : ""}${Math.round(flow.delta)}.` : "Bar-level flow estimate is incomplete.",
  ];
  const invalidations = [
    support != null ? `A completed close below ${r2(support)} with expanding down-bar volume weakens this map.` : "Nearest support is undefined.",
    "A high-volume breakdown through VWAP would downgrade a bullish structure read.",
    "A failed breakout that closes back inside the range is invalidation, not a new long.",
  ];

  const structurePhrase =
    structure.label === "BULLISH"
      ? "in a completed-swing bullish structure"
      : structure.label === "BEARISH"
        ? "in a completed-swing bearish structure"
        : "not in a clean HH/HL or LH/LL";
  const why = `${input.symbol} is ${structurePhrase}. ${brk.note} ${vol.interpretation} The engine state is ${decided.action.replaceAll("_", " ")} because structure, location, and participation were evaluated separately — they were not averaged into a single buy/sell score.`;

  const beginnerWhy =
    decided.action === "WATCH"
      ? `The larger structure is still ${structure.label.toLowerCase().replaceAll("_", " ")}, but price has not confirmed a breakout and volume is not showing aggressive participation. Waiting for confirmation is the honest read.`
      : decided.action === "BUY_SETUP"
        ? `A completed close is through resistance and volume expanded. That is a setup, not a guarantee. Use the mapped stop and wait for follow-through.`
        : decided.action === "NO_TRADE"
          ? `Conditions conflict or quality is too weak to act. The engine is allowed to say no trade.`
          : decided.action === "INSUFFICIENT_DATA"
            ? `There is not enough trustworthy data on this timeframe to publish a decision.`
            : `Evidence is mixed. Wait for a completed candle to resolve structure or breakout.`;

  const prev = input.bars.length >= 2 ? input.bars[input.bars.length - 2] : null;
  const last = input.bars[input.bars.length - 1];
  const volChg = prev && last && prev.volume ? ((last.volume - prev.volume) / prev.volume) * 100 : null;

  const flowState =
    flow.delta == null
      ? "UNAVAILABLE"
      : Math.abs(flow.delta) < (flow.estimatedBuy || 0) * 0.08
        ? "BALANCED"
        : flow.delta > 0
          ? "BALANCED → SLIGHT BUYER ADVANTAGE"
          : "BALANCED → SLIGHT SELLER ADVANTAGE";

  const location =
    price == null
      ? "Location cannot be scored."
      : resistance != null && price >= resistance * 0.995
        ? `Price is at/near resistance ${r2(resistance)}.`
        : support != null && price <= support * 1.005
          ? `Price is at/near support ${r2(support)}.`
          : vwap != null
            ? `Price is ${vwapState.toLowerCase()} VWAP ${r2(vwap)}${vwapDist != null ? ` (${vwapDist >= 0 ? "+" : ""}${vwapDist.toFixed(2)}%)` : ""}.`
            : "VWAP and nearby levels are incomplete.";

  return {
    symbol: input.symbol.toUpperCase(),
    name: input.name,
    timeframe: input.timeframe,
    timeframeLabel: STOCK_DECISION_TF_LABEL[input.timeframe],
    price,
    change: input.quote.change ?? null,
    changePercent: input.quote.change_percent ?? null,
    session: input.context?.session ?? input.quote.market_state ?? null,
    freshness: {
      source: input.quote.freshness?.source || "market-data",
      dataStatus: input.quote.freshness?.data_status || "UNAVAILABLE",
      timestamp: input.quote.freshness?.timestamp || new Date().toISOString(),
      ageLabel: ageLabel(input.quote.freshness?.timestamp),
    },
    dataTier: 1,
    dataQuality: {
      bars: input.bars.length ? "LIVE" : "UNAVAILABLE",
      quote: (input.quote.freshness?.data_status as "LIVE") || "UNAVAILABLE",
      orderFlow: flow.delta != null ? "ESTIMATED" : "UNAVAILABLE",
      orderBook: "UNAVAILABLE",
      timeAndSales: "UNAVAILABLE",
      historicalBook: "UNAVAILABLE",
      note: "Tier 1 OHLCV is active. Order flow is estimated from completed bar direction.",
    },
    marketState: structure.label,
    currentSetup: decided.setup.replaceAll("_", " "),
    orderFlowState: flowState,
    volumeState: vol.state,
    breakoutState: brk.status.replaceAll("_", " "),
    action: decided.action,
    direction: decided.direction,
    confidence: decided.confidence,
    setup: decided.setup,
    why,
    reasons,
    invalidations,
    beginnerWhy,
    scores,
    structure: {
      label: structure.label,
      hh: Boolean(input.indicators.higher_highs),
      hl: Boolean(input.indicators.higher_lows),
      lh: Boolean(input.indicators.lower_highs),
      ll: Boolean(input.indicators.lower_lows),
      detail: structure.detail,
    },
    location,
    participation: vol.interpretation,
    volume: {
      last: nn(input.indicators.last_volume),
      average20: nn(input.indicators.volume_sma20),
      rvol: nn(rvol),
      vs5,
      upVolume: flow.estimatedBuy,
      downVolume: flow.estimatedSell,
      trend: vol.state,
      matrix: vol.matrix,
      interpretation: vol.interpretation,
    },
    orderFlow: {
      estimatedBuy: flow.estimatedBuy,
      estimatedSell: flow.estimatedSell,
      delta: flow.delta,
      cvd: flow.cvd,
      ratio: flow.ratio,
      state: flowState,
      available: flow.delta != null,
      disclaimer:
        "Every executed trade has a buyer and a seller. These figures are estimated aggressive buy/sell volume from completed up and down bars, not tick-level aggressor flags and not a full national book.",
    },
    orderBook: {
      available: false,
      reason: "No depth-of-book provider is configured. A Level-1 quote is not treated as TotalView or any full book.",
      disclaimer: "Resting order-book liquidity represents displayed orders, not guaranteed future execution. Orders can be modified or canceled.",
    },
    vwap: {
      value: vwap,
      distancePct: vwapDist,
      state: vwapState === "UNAVAILABLE" ? "UNAVAILABLE" : `${vwapState} VWAP`,
      note: "VWAP is combined with structure and volume. Being above VWAP is not automatically bullish.",
    },
    breakout: {
      status: brk.status,
      resistance,
      price,
      closeConfirmed: brk.closeConfirmed,
      volumeConfirmed: brk.volumeConfirmed,
      strength: brk.strength,
      note: brk.note,
    },
    supports,
    resistances,
    mtf: input.mtf,
    weekVolume: weekRows(input.dailyBars),
    whatChanged: [
      { label: "Volume vs prior bar", value: volChg == null ? "unavailable" : `${volChg >= 0 ? "+" : ""}${volChg.toFixed(1)}%` },
      { label: "Price", value: input.quote.change_percent == null ? "unavailable" : `${input.quote.change_percent >= 0 ? "+" : ""}${input.quote.change_percent.toFixed(2)}%` },
      { label: "Estimated delta", value: flow.delta == null ? "unavailable" : `${flow.delta >= 0 ? "+" : ""}${Math.round(flow.delta)}` },
      { label: "VWAP", value: vwapState },
      { label: "Structure", value: structure.label },
      { label: "Resistance", value: brk.status === "NOT_CONFIRMED" ? "not broken" : brk.status.replaceAll("_", " ").toLowerCase() },
    ],
    whatChangedNote: vol.interpretation,
    context: {
      spy: input.market.spy,
      qqq: input.market.qqq,
      iwm: input.market.iwm,
      vix: input.market.vix,
      vsQqq,
      vsSpy,
      note:
        vsQqq == null
          ? "Relative strength versus QQQ is unavailable."
          : `${input.symbol} ${input.quote.change_percent != null ? `${input.quote.change_percent >= 0 ? "+" : ""}${input.quote.change_percent.toFixed(2)}%` : "—"} vs QQQ ${input.market.qqq != null ? `${input.market.qqq >= 0 ? "+" : ""}${input.market.qqq.toFixed(2)}%` : "—"} (${vsQqq >= 0 ? "+" : ""}${vsQqq.toFixed(2)} points). Same-session change only.`,
    },
    eventRisk: input.eventRisk,
    sessions: {
      premarket: {
        price: input.context?.sessions.preMarket.last ?? input.context?.sessions.preMarket.close ?? null,
        high: input.context?.sessions.preMarket.high ?? null,
        low: input.context?.sessions.preMarket.low ?? null,
        volume: input.context?.sessions.preMarket.volume ?? input.context?.volumes.preMarket ?? null,
        vwap: input.context?.sessions.preMarket.vwap ?? null,
        available: Boolean(input.context?.sessions.preMarket.available),
      },
      afterHours: {
        price: input.context?.sessions.afterHours.last ?? input.context?.sessions.afterHours.close ?? null,
        high: input.context?.sessions.afterHours.high ?? null,
        low: input.context?.sessions.afterHours.low ?? null,
        volume: input.context?.sessions.afterHours.volume ?? input.context?.volumes.afterHours ?? null,
        vwap: input.context?.sessions.afterHours.vwap ?? null,
        available: Boolean(input.context?.sessions.afterHours.available),
      },
    },
    pattern: {
      name: "Not classified from structure",
      bias: decided.direction,
      status: "INSUFFICIENT_DATA",
      note: "Pattern (flag, wedge, H&S) is kept separate from HH/HL structure. This snapshot does not invent a named pattern from swings alone.",
    },
    plan: {
      entryZone: entryLo != null && entryHi != null ? `${r2(entryLo)}–${r2(entryHi)}` : "unavailable",
      confirmation: "Completed close back above VWAP plus a higher low on this timeframe. A wick is not enough.",
      stop: stop != null ? `${r2(stop)} (structure / ATR)` : "unavailable",
      target1: t1 != null ? String(r2(t1)) : "unavailable",
      target2: t2 != null ? String(r2(t2)) : "unavailable",
      target3: t3 != null ? String(r2(t3)) : "unavailable",
      rr,
      rrNote: rr == null ? "R:R cannot be published without entry and stop." : rr < 1 ? `${rr.toFixed(2)}:1 is not treated as a strong setup.` : `${rr.toFixed(2)}:1 from the mapped levels.`,
      invalidation: support != null ? `Completed close below ${r2(support)} with expanding down-bar volume.` : "Invalidation cannot be published without support.",
    },
    noTradeReasons: noTrade,
    overlays: {
      ema9: nn(input.indicators.ema9),
      ema21: nn(input.indicators.ema21),
      sma50: nn(input.indicators.ema50),
      sma200: nn(input.indicators.ema200),
      rsi: nn(input.indicators.rsi),
      macdHist: nn(input.indicators.macd_hist),
      atr: nn(input.indicators.atr),
    },
    bars: input.bars.slice(-180).map((b) => ({
      time: Math.floor((b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp)).getTime() / 1000),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })),
    deltaSeries: flow.deltaSeries.slice(-60),
    cvdSeries: flow.cvdSeries.slice(-60),
    methodology:
      "Swings and breakouts use completed candles only. Volume is total share volume; up/down volume is estimated from bar direction and is not aggressor-side data. Order-book depth is never inferred from a Level-1 quote. The top summary uses a weighted 0–100 model with hard structural overrides. Independent component scores below are not averaged into a buy/sell button.",
    summary: buildExplainableDecision({
      timeframe: input.timeframe,
      price,
      changePct: input.quote.change_percent ?? null,
      indicators: input.indicators,
      bars: input.bars,
      dailyBars: input.dailyBars,
      rvol: nn(rvol),
      support,
      resistance,
      market: { spy: input.market.spy, qqq: input.market.qqq, vix: input.market.vix },
      floatShares: input.floatShares ?? null,
      mtf:
        input.mtfScores && input.mtfScores.length
          ? input.mtfScores
          : input.mtf.map((row) =>
              compactTfScore(row.timeframe, row.timeframe === input.timeframe ? input.indicators : null, price),
            ),
      stale: input.quote.freshness?.data_status === "STALE",
      barCount: input.bars.length,
    }),
  };
}

export function mtfFromIndicators(
  timeframe: StockDecisionTimeframe,
  ind: Indicators | null,
): StockDecisionMtfRow {
  if (!ind) {
    return { timeframe, label: STOCK_DECISION_TF_LABEL[timeframe], trend: "—", structure: "—", vwap: "—", volume: "—", orderFlow: "—", available: false };
  }
  const structure = classifyStructure(ind);
  const price = ind.last_close;
  const trend = price != null && ind.ema21 != null ? (price >= ind.ema21 ? "Bullish" : "Bearish") : "Neutral";
  const vwap = price != null && ind.vwap != null ? (price >= ind.vwap ? "Above" : "Below") : "—";
  const volume = ind.volume_ratio == null ? "—" : ind.volume_ratio >= 1.2 ? "Strong" : ind.volume_ratio < 0.85 ? "Weak" : "Normal";
  return {
    timeframe,
    label: STOCK_DECISION_TF_LABEL[timeframe],
    trend,
    structure: structure.label.replaceAll("_", " "),
    vwap,
    volume,
    orderFlow: "Estimated only",
    available: true,
  };
}
