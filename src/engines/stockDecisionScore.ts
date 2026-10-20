import type { Indicators, OHLCVBar } from "@/src/types/domain";
import { ema, last, slope } from "@/src/engines/indicators";
import {
  STOCK_DECISION_TF_LABEL,
  STOCK_DECISION_TF_ROLE,
  type DataQualityGrade,
  type FactorTone,
  type StockDecisionConfidence,
  type StockDecisionFactor,
  type StockDecisionLabel,
  type StockDecisionMtfScore,
  type StockDecisionSummary,
  type StockDecisionTimeframe,
  type StockDecisionTone,
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

function pct(n: number | null, digits = 2) {
  if (n == null) return "unavailable";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function labelFromScore(score: number): StockDecisionLabel {
  if (score >= 80) return "STRONG BULLISH";
  if (score >= 65) return "BULLISH";
  if (score >= 55) return "CAUTIOUSLY BULLISH";
  if (score >= 45) return "NEUTRAL";
  if (score >= 35) return "CAUTION";
  if (score >= 20) return "BEARISH";
  return "STRONG BEARISH";
}

export function toneFromLabel(label: StockDecisionLabel): StockDecisionTone {
  if (label === "STRONG BULLISH" || label === "BULLISH" || label === "CAUTIOUSLY BULLISH") return "Bullish";
  if (label === "BEARISH" || label === "STRONG BEARISH") return "Bearish";
  if (label === "CAUTION" || label === "CONFLICTING") return "Caution";
  return "Neutral";
}

export function factorTone(stance: string, available: boolean): FactorTone {
  if (!available) return "nodata";
  const s = stance.toLowerCase();
  if (s.includes("watch")) return "caution";
  if (s.includes("caution") || s.includes("overextend") || s.includes("conflict")) return "caution";
  if (s.includes("bear")) return "bearish";
  if (s.includes("bull") || s.includes("strong")) return "bullish";
  return "neutral";
}

function factor(partial: Omit<StockDecisionFactor, "tone" | "contribution"> & { contribution?: number | null }): StockDecisionFactor {
  const available = partial.available && partial.score != null;
  const contribution = available && partial.score != null ? r2((partial.score / 100) * partial.weight * 100) : null;
  return {
    ...partial,
    tone: factorTone(partial.stance, available),
    contribution,
  };
}

export function classifyRsi(rsi: number | null, prev: number | null) {
  if (rsi == null) return { stance: "No Data", score: null, why: "RSI(14) is unavailable.", overextended: false };
  const slopeUp = prev != null && rsi > prev;
  const slopeDown = prev != null && rsi < prev;
  if (rsi > 70) {
    return {
      stance: "Bullish + Caution",
      score: slopeDown ? 58 : 68,
      why: `RSI ${r2(rsi)} is overbought. Strong trends can stay overbought; this reduces confidence rather than reversing the trend.`,
      overextended: true,
    };
  }
  if (rsi >= 55 && rsi <= 70 && (slopeUp || prev == null)) {
    return { stance: "Strong Bullish", score: 82, why: `RSI ${r2(rsi)} is in the 55–70 bullish zone with non-negative slope.`, overextended: false };
  }
  if (rsi >= 50 && rsi < 55) return { stance: "Bullish", score: 68, why: `RSI ${r2(rsi)} is above 50.`, overextended: false };
  if (rsi >= 45 && rsi < 50) return { stance: "Neutral", score: 50, why: `RSI ${r2(rsi)} is mid-range.`, overextended: false };
  if (rsi >= 30 && rsi < 45) return { stance: "Bearish", score: 34, why: `RSI ${r2(rsi)} is below 45.`, overextended: false };
  return {
    stance: slopeDown || prev == null ? "Strong Bearish" : "Bearish",
    score: slopeDown ? 16 : 24,
    why: `RSI ${r2(rsi)} is oversold. Continuing negative slope keeps this strong bearish.`,
    overextended: false,
  };
}

export function classifyMacd(line: number | null, signal: number | null, hist: number | null, histPrev: number | null) {
  if (line == null || signal == null || hist == null) {
    return { stance: "No Data", score: null, why: "MACD is unavailable.", event: "none" as const };
  }
  const rising = histPrev != null && hist > histPrev;
  const falling = histPrev != null && hist < histPrev;
  const crossUp = histPrev != null && histPrev <= 0 && hist > 0;
  const crossDown = histPrev != null && histPrev >= 0 && hist < 0;
  let event: "bullish-cross" | "bearish-cross" | "accel" | "decel" | "none" = "none";
  if (crossUp) event = "bullish-cross";
  else if (crossDown) event = "bearish-cross";
  else if (rising) event = "accel";
  else if (falling) event = "decel";
  if (line > signal && hist > 0 && rising && line > 0) {
    return { stance: "Strong Bullish", score: 88, why: "MACD is above signal, histogram is positive and rising, and MACD is above zero.", event };
  }
  if (line > signal && hist > 0) {
    return { stance: "Bullish", score: 72, why: "MACD is above signal with a positive histogram.", event };
  }
  if (line < signal && hist < 0 && line < 0) {
    return { stance: "Strong Bearish", score: 14, why: "MACD is below signal, histogram is negative, and MACD is below zero.", event };
  }
  if (line < signal && hist < 0) {
    return { stance: "Bearish", score: 28, why: "MACD is below signal with a negative histogram.", event };
  }
  return { stance: "Neutral", score: 50, why: "MACD is near signal or the histogram is near zero.", event };
}

export function classifyRvol(rvol: number | null) {
  if (rvol == null) return { stance: "No Data", score: null, label: "unavailable", why: "Relative volume is unavailable." };
  if (rvol >= 2) return { stance: "Strong Bullish", score: 86, label: "Very strong participation", why: `RVOL ${r2(rvol)} is at least 2.0.` };
  if (rvol >= 1.5) return { stance: "Bullish", score: 74, label: "Strong participation", why: `RVOL ${r2(rvol)} is 1.5–1.99.` };
  if (rvol >= 1) return { stance: "Neutral", score: 58, label: "Healthy participation", why: `RVOL ${r2(rvol)} is 1.0–1.49.` };
  if (rvol >= 0.75) return { stance: "Neutral", score: 46, label: "Below normal", why: `RVOL ${r2(rvol)} is 0.75–0.99.` };
  return { stance: "Caution", score: 32, label: "Weak participation", why: `RVOL ${r2(rvol)} is below 0.75.` };
}

export function classifyVolumePrice(changePct: number | null, rvol: number | null) {
  if (changePct == null || rvol == null) {
    return { stance: "No Data", score: null, why: "Price change or relative volume is unavailable. Volume confirmation unavailable." };
  }
  const up = changePct >= 0.15;
  const down = changePct <= -0.15;
  const strong = rvol >= 1.2;
  const weak = rvol < 0.85;
  if (up && strong) return { stance: "Bullish", score: 84, why: "Price is advancing with expanding volume — bullish accumulation." };
  if (up && weak) return { stance: "Caution", score: 56, why: "Price is advancing, but participation is declining. Confirmation is weak." };
  if (down && strong) return { stance: "Bearish", score: 18, why: "Price is declining with expanding volume — distribution / strong selling pressure." };
  if (down && weak) return { stance: "Bearish", score: 38, why: "Price is declining on declining volume. Selling pressure may be weakening; this is not automatically bullish." };
  return { stance: "Neutral", score: 50, why: "Price and volume are mixed or near-flat on this snapshot." };
}

export function classifyMaAlignment(price: number | null, emas: { e9: number | null; e20: number | null; e50: number | null; e100: number | null; e200: number | null }) {
  const { e9, e20, e50, e100, e200 } = emas;
  const chain = [price, e9, e20, e50, e100, e200];
  if (price == null || e20 == null || e50 == null) {
    return { stance: "No Data", score: null, why: "Moving-average stack is incomplete.", stacked: 0, extended: false };
  }
  let bull = 0;
  let bear = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    if (a == null || b == null) continue;
    if (a > b) bull += 1;
    else if (a < b) bear += 1;
  }
  const dist20 = e20 ? ((price - e20) / e20) * 100 : 0;
  const extended = Math.abs(dist20) >= 8;
  if (bull >= 4 && bear === 0) {
    return {
      stance: extended ? "Bullish + Caution" : "Strong Bullish",
      score: extended ? 70 : 90,
      why: extended
        ? `Price > 9 > 20 > 50 alignment is intact, but price is ${r2(dist20)}% from the 20 EMA — overextension penalty applied.`
        : "Price is stacked above 9/20/50/100/200.",
      stacked: bull,
      extended,
    };
  }
  if (bear >= 4 && bull === 0) {
    return { stance: "Strong Bearish", score: 12, why: "Price is stacked below the moving-average chain.", stacked: -bear, extended };
  }
  if (bull > bear) return { stance: "Bullish", score: 68, why: "Partial bullish moving-average alignment.", stacked: bull - bear, extended };
  if (bear > bull) return { stance: "Bearish", score: 32, why: "Partial bearish moving-average alignment.", stacked: bull - bear, extended };
  return { stance: "Neutral", score: 50, why: "Moving averages are mixed / compressed.", stacked: 0, extended };
}

export function classifyBreakoutStatus(price: number | null, close: number | null, resistance: number | null, rvol: number | null) {
  if (price == null || close == null || resistance == null) {
    return { stance: "No Data", score: null, status: "INSUFFICIENT_DATA", why: "Resistance or close is unavailable." };
  }
  const closeOk = close > resistance;
  const wickOnly = price > resistance && close <= resistance;
  const volOk = rvol != null && rvol >= 1.5;
  if (wickOnly) return { stance: "Watch", score: 42, status: "NOT_CONFIRMED", why: "Intrabar spike through resistance without a completed close is not a confirmed breakout." };
  if (closeOk && volOk) return { stance: "Bullish", score: 86, status: "BREAKOUT_CONFIRMED", why: `Completed close above ${r2(resistance)} with RVOL ${rvol?.toFixed(2)} (≥ 1.5).` };
  if (closeOk) return { stance: "Watch", score: 58, status: "BREAKOUT_PENDING", why: "Close is above resistance, but volume has not confirmed (≥ 1.5 RVOL required)." };
  if (price >= resistance * 0.995) return { stance: "Watch", score: 48, status: "BREAKOUT_PENDING", why: `Price is testing ${r2(resistance)}. Close confirmation: no.` };
  return { stance: "Neutral", score: 46, status: "NOT_CONFIRMED", why: `Price remains below resistance ${r2(resistance)}.` };
}

export function sessionTodRvol(bars: OHLCVBar[], now = new Date()) {
  if (bars.length < 30) return { rvol: null, method: "unavailable" as const };
  const dayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  const groups = new Map<string, OHLCVBar[]>();
  for (const b of bars) {
    const ts = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    const key = dayKey(ts);
    const list = groups.get(key) || [];
    list.push(b);
    groups.set(key, list);
  }
  const days = [...groups.values()].filter((d) => d.length);
  if (days.length < 4) return { rvol: null, method: "unavailable" as const };
  const current = days[days.length - 1];
  const idx = Math.min(current.length, days.slice(0, -1).reduce((m, d) => Math.max(m, d.length), 0)) - 1;
  if (idx < 0) return { rvol: null, method: "unavailable" as const };
  const cum = (day: OHLCVBar[], at: number) => day.slice(0, at + 1).reduce((s, b) => s + (Number.isFinite(b.volume) ? b.volume : 0), 0);
  const here = cum(current, Math.min(idx, current.length - 1));
  const priors = days.slice(0, -1).map((d) => cum(d, Math.min(idx, d.length - 1))).filter((v) => v > 0);
  if (!priors.length || here <= 0) return { rvol: null, method: "unavailable" as const };
  const avg = priors.reduce((a, b) => a + b, 0) / priors.length;
  void now;
  return { rvol: avg > 0 ? here / avg : null, method: "time-of-day" as const };
}

export function anchoredVwap(bars: OHLCVBar[], start: Date) {
  let num = 0;
  let den = 0;
  for (const b of bars) {
    const ts = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    if (ts < start) continue;
    const typical = (b.high + b.low + b.close) / 3;
    if (!Number.isFinite(typical) || !Number.isFinite(b.volume) || b.volume <= 0) continue;
    num += typical * b.volume;
    den += b.volume;
  }
  return den > 0 ? num / den : null;
}

function completedBars(bars: OHLCVBar[]) {
  return bars.length >= 2 ? bars.slice(0, -1) : bars;
}

export function buildFactors(input: {
  timeframe: StockDecisionTimeframe;
  price: number | null;
  changePct: number | null;
  indicators: Indicators;
  bars: OHLCVBar[];
  dailyBars: OHLCVBar[];
  rvol: number | null;
  support: number | null;
  resistance: number | null;
  market: { spy: number | null; qqq: number | null; vix: number | null };
  floatShares: number | null;
}): StockDecisionFactor[] {
  const ind = input.indicators;
  const price = input.price;
  const done = completedBars(input.bars);
  const close = done[done.length - 1]?.close ?? ind.last_close ?? price;
  const closes = done.map((b) => b.close);
  const e100 = last(ema(closes, 100));
  const e100Slope = slope(ema(closes, 100));
  const e9 = nn(ind.ema9);
  const e20 = nn(ind.ema20 ?? ind.ema21);
  const e50 = nn(ind.ema50);
  const e200 = nn(ind.ema200);
  const hh = Boolean(ind.higher_highs);
  const hl = Boolean(ind.higher_lows);
  const lh = Boolean(ind.lower_highs);
  const ll = Boolean(ind.lower_lows);
  const intraday = input.timeframe === "5m" || input.timeframe === "15m" || input.timeframe === "30m" || input.timeframe === "1h";
  const tod = intraday ? sessionTodRvol(input.bars) : { rvol: null, method: "unavailable" as const };
  const rvol = tod.rvol ?? input.rvol;
  const rvolMethod = tod.rvol != null ? "time-of-day cumulative vs historical sessions" : "20-bar equivalent-volume average";

  const shortBull = hh && hl && price != null && e9 != null && price > e9 && (ind.ema9_slope || 0) > 0;
  const shortBear = lh && ll && price != null && e9 != null && price < e9 && (ind.ema9_slope || 0) < 0;
  const short = factor({
    id: "shortTrend",
    label: "Short-Term Trend",
    stance: shortBull ? "Bullish" : shortBear ? "Bearish" : price == null || e9 == null ? "No Data" : "Neutral",
    value: shortBull ? "HH + HL" : shortBear ? "LH + LL" : hh || hl || lh || ll ? "Mixed structure" : "Insufficient swings",
    interpretation: shortBull
      ? "Higher highs + higher lows, price above short EMA, EMA rising."
      : shortBear
        ? "Lower highs + lower lows, price below short EMA, EMA declining."
        : "Mixed or incomplete short-term structure.",
    raw: { ema9: e9, slope: nn(ind.ema9_slope), hh, hl, lh, ll },
    threshold: "HH/HL + price > short EMA + rising slope",
    score: shortBull ? 84 : shortBear ? 18 : e9 == null ? null : 50,
    weight: 0.07,
    calculation: "Price vs 9 EMA, 9 EMA slope, completed swing highs/lows.",
    explanation: "Short-term trend uses completed swings only. A single in-progress candle cannot flip this.",
    available: e9 != null && price != null,
  });

  const midBull = price != null && e20 != null && e50 != null && price > e20 && e20 > e50 && (ind.ema20_slope || ind.ema21_slope || 0) > 0 && (ind.ema50_slope || 0) > 0;
  const midBear = price != null && e20 != null && e50 != null && price < e20 && e20 < e50 && (ind.ema20_slope || ind.ema21_slope || 0) < 0 && (ind.ema50_slope || 0) < 0;
  const medium = factor({
    id: "mediumTrend",
    label: "Medium-Term Trend",
    stance: midBull ? "Bullish" : midBear ? "Bearish" : e20 == null || e50 == null ? "No Data" : "Neutral",
    value: e20 != null && e50 != null ? `20 EMA ${r2(e20)} / 50 EMA ${r2(e50)}` : "unavailable",
    interpretation: midBull ? "Price above 20/50 EMA with both slopes positive." : midBear ? "Price below 20/50 EMA with both slopes negative." : "Mixed 20/50 EMA location or slope.",
    raw: { ema20: e20, ema50: e50, ema20Slope: nn(ind.ema20_slope ?? ind.ema21_slope), ema50Slope: nn(ind.ema50_slope) },
    threshold: "Price > 20 EMA > 50 EMA and both slopes > 0",
    score: midBull ? 86 : midBear ? 16 : e20 == null ? null : 50,
    weight: 0.08,
    calculation: "Price vs 20 EMA vs 50 EMA and 3-bar slopes.",
    explanation: "Medium-term trend is the 20/50 stack. Mixed slopes stay Neutral/Caution, not bullish.",
    available: e20 != null && e50 != null && price != null,
  });

  const longBull = price != null && e200 != null && price > e200 && (e100 == null || (ind.ema200_slope || 0) >= 0 || (e100Slope || 0) >= 0);
  const longBear = price != null && e200 != null && price < e200 && ((ind.ema200_slope || 0) < 0 || (e100Slope || 0) < 0);
  const long = factor({
    id: "longTrend",
    label: "Long-Term Trend",
    stance: e200 == null ? "No Data" : longBull ? "Bullish" : longBear ? "Bearish" : "Neutral",
    value: e200 == null ? "unavailable" : `Price vs 200 MA ${pct(price != null ? ((price - e200) / e200) * 100 : null)}`,
    interpretation: longBull ? "Price above 200 MA with a non-negative higher-MA trend." : longBear ? "Price below 200 MA with a declining higher-MA trend." : "Long-term location is mixed or the 200 MA is missing.",
    raw: { ema100: e100, ema200: e200, ema200Slope: nn(ind.ema200_slope), ema100Slope: e100Slope },
    threshold: "Price above 200 MA and 100/200 trend not declining",
    score: e200 == null ? null : longBull ? 80 : longBear ? 20 : 50,
    weight: 0.05,
    calculation: "Price vs 200 EMA/SMA and 100 EMA computed on completed bars.",
    explanation: "A stock below a declining 200 MA cannot be called a clean long-term bull.",
    available: e200 != null && price != null,
  });

  const ma = classifyMaAlignment(price, { e9, e20, e50, e100, e200 });
  const movingAverages = factor({
    id: "movingAverages",
    label: "Moving Averages",
    stance: ma.stance,
    value: [e9, e20, e50, e100, e200].every((v) => v != null) ? "Full stack available" : "Partial stack",
    interpretation: ma.why,
    raw: { ema9: e9, ema20: e20, ema50: e50, ema100: e100, ema200: e200, stacked: ma.stacked, extended: ma.extended },
    threshold: "Price > 9 > 20 > 50 > 100 > 200 for strong bullish",
    score: ma.score,
    weight: 0.1,
    calculation: "Count of adjacent MA inequalities plus distance-from-20 overextension penalty at 8%.",
    explanation: "Alignment is not the same as a buy. Extreme extension from the 20 EMA reduces the score.",
    available: ma.score != null,
  });

  const macd = classifyMacd(nn(ind.macd), nn(ind.macd_signal), nn(ind.macd_hist), nn(ind.macd_hist_prev));
  const macdFactor = factor({
    id: "macd",
    label: "MACD",
    stance: macd.stance,
    value: ind.macd == null ? "unavailable" : `MACD ${r2(ind.macd)} / signal ${ind.macd_signal == null ? "—" : r2(ind.macd_signal)}`,
    interpretation: macd.why,
    raw: { macd: nn(ind.macd), signal: nn(ind.macd_signal), hist: nn(ind.macd_hist), histPrev: nn(ind.macd_hist_prev), event: macd.event },
    threshold: "MACD > signal, histogram > 0, rising, MACD > 0",
    score: macd.score,
    weight: 0.08,
    calculation: "Standard 12/26/9 MACD on completed bars.",
    explanation: macd.event === "bullish-cross" ? "A bullish crossover just printed." : macd.event === "bearish-cross" ? "A bearish crossover just printed." : macd.why,
    available: macd.score != null,
  });

  const rsi = classifyRsi(nn(ind.rsi), nn(ind.rsi_prev));
  const rsiFactor = factor({
    id: "rsi",
    label: "RSI",
    stance: rsi.stance,
    value: ind.rsi == null ? "unavailable" : r2(ind.rsi).toFixed(1),
    interpretation: rsi.why,
    raw: { rsi: nn(ind.rsi), rsiPrev: nn(ind.rsi_prev), overextended: rsi.overextended },
    threshold: "55–70 with non-negative slope = strong bullish; >70 = overbought caution, not auto-bearish",
    score: rsi.score,
    weight: 0.07,
    calculation: "RSI(14) and prior-bar slope. No look-ahead.",
    explanation: rsi.why,
    available: rsi.score != null,
  });

  const vp = classifyVolumePrice(input.changePct, rvol);
  const volume = factor({
    id: "volume",
    label: "Volume",
    stance: vp.stance,
    value: rvol == null ? "unavailable" : `RVOL ${r2(rvol)} · ${rvolMethod}`,
    interpretation: vp.why,
    raw: { changePct: input.changePct, rvol, method: rvolMethod },
    threshold: "Advance + RVOL ≥ 1.2 = accumulation; decline + RVOL ≥ 1.2 = distribution",
    score: vp.score,
    weight: 0.06,
    calculation: "Signed price change paired with normalized volume. Absolute share count is never used alone.",
    explanation: vp.why,
    available: vp.score != null,
  });

  const rv = classifyRvol(rvol);
  const rvolFactor = factor({
    id: "rvol",
    label: "Relative Volume",
    stance: rv.stance,
    value: rvol == null ? "unavailable" : r2(rvol).toFixed(2),
    interpretation: rv.why,
    raw: { rvol, method: rvolMethod },
    threshold: "≥2.0 very strong · 1.5–1.99 strong · 1.0–1.49 healthy · <0.75 weak",
    score: rv.score,
    weight: 0.04,
    calculation: intraday
      ? "Cumulative session volume versus the same time-of-day cumulative average across prior sessions when enough history exists; otherwise 20-bar RVOL."
      : "Current completed-bar volume / 20-bar average for this timeframe.",
    explanation: rv.why,
    available: rv.score != null,
  });

  const lastVol = nn(ind.last_volume);
  const avgVol = nn(ind.volume_sma20);
  const turnover = input.floatShares && lastVol != null && input.floatShares > 0 ? lastVol / input.floatShares : null;
  const dailyVols = completedBars(input.dailyBars).map((b) => b.volume).filter((v) => Number.isFinite(v) && v > 0);
  const dailyTurnovers = input.floatShares && input.floatShares > 0 ? dailyVols.map((v) => v / input.floatShares!) : [];
  const percentile =
    turnover != null && dailyTurnovers.length >= 8
      ? r2((dailyTurnovers.filter((t) => t <= turnover).length / dailyTurnovers.length) * 100)
      : null;
  const floatFactor = factor({
    id: "floatTurnover",
    label: "Float Turnover",
    stance: turnover == null ? "No Data" : turnover >= 0.08 ? "Caution" : turnover >= 0.03 ? "Neutral" : "Neutral",
    value: turnover == null ? "unavailable" : `${(turnover * 100).toFixed(2)}% of float`,
    interpretation:
      turnover == null
        ? "Public float is unavailable. Float turnover is not invented."
        : percentile != null
          ? `Turnover is at the ${percentile.toFixed(0)}th percentile of recent daily turnovers.`
          : "Turnover uses current volume / public float.",
    raw: { float: input.floatShares, currentVolume: lastVol, averageVolume: avgVol, turnover, percentile },
    threshold: "Displayed for comparison across tickers. Missing float reduces confidence, not faked.",
    score: turnover == null ? null : percentile == null ? 50 : clamp(percentile),
    weight: 0,
    calculation: "Current (or session) volume / public float. Intraday uses the same shares figure; it is not annualized.",
    explanation: "Float turnover normalizes META vs a high-float name. It is informational when float is missing.",
    available: turnover != null,
  });

  const vwapVal = nn(ind.vwap);
  const vwapDist = price != null && vwapVal ? ((price - vwapVal) / vwapVal) * 100 : null;
  const monthStart = input.dailyBars.length ? new Date(input.dailyBars[input.dailyBars.length - 1].timestamp) : null;
  if (monthStart) monthStart.setUTCDate(1);
  const qStart = monthStart ? new Date(monthStart) : null;
  if (qStart) qStart.setUTCMonth(Math.floor(qStart.getUTCMonth() / 3) * 3, 1);
  const monthlyAvwap = !intraday && monthStart ? anchoredVwap(input.dailyBars, monthStart) : null;
  const quarterlyAvwap = !intraday && qStart ? anchoredVwap(input.dailyBars, qStart) : null;
  const vwapRef = vwapVal ?? monthlyAvwap ?? quarterlyAvwap;
  const vwapRising = (ind.ema9_slope || 0) > 0 && vwapRef != null && price != null && price > vwapRef;
  const vwapFactor = factor({
    id: "vwap",
    label: "VWAP",
    stance:
      vwapRef == null || price == null
        ? "No Data"
        : price > vwapRef && (rvol || 0) >= 1.2 && vwapRising
          ? "Strong Bullish"
          : price > vwapRef
            ? "Bullish"
            : price < vwapRef
              ? "Bearish"
              : "Neutral",
    value: vwapRef == null ? "unavailable" : `${r2(vwapRef)}${vwapDist != null ? ` (${pct(vwapDist)})` : ""}`,
    interpretation:
      vwapRef == null
        ? "VWAP is unavailable."
        : price != null && price > vwapRef
          ? "Price is above VWAP."
          : "Price is below VWAP.",
    raw: { vwap: vwapVal, monthlyAnchored: monthlyAvwap, quarterlyAnchored: quarterlyAvwap, distancePct: vwapDist },
    threshold: intraday ? "Price > session VWAP and VWAP rising" : "Price vs session / monthly / quarterly anchored VWAP",
    score: vwapRef == null || price == null ? null : price > vwapRef ? ((rvol || 0) >= 1.2 ? 84 : 70) : 30,
    weight: 0.07,
    calculation: intraday ? "Session VWAP from typical price × volume." : "Session VWAP plus monthly/quarterly anchored VWAP from daily bars.",
    explanation: "Being above VWAP is location, not a standalone buy.",
    available: vwapRef != null && price != null,
  });

  const structurePhrase = hh && hl ? "HH → HL" : lh && ll ? "LL → LH" : "Overlapping / mixed";
  const structure = factor({
    id: "structure",
    label: "Market Structure",
    stance: hh && hl ? "Bullish" : lh && ll ? "Bearish" : "Neutral",
    value: structurePhrase,
    interpretation: hh && hl ? "Bullish HH → HL → HH → HL structure." : lh && ll ? "Bearish LL → LH → LL → LH structure." : "Overlapping or ranging structure.",
    raw: { hh, hl, lh, ll },
    threshold: "Completed HH+HL = bullish; LL+LH = bearish",
    score: hh && hl ? 82 : lh && ll ? 18 : 50,
    weight: 0.1,
    calculation: "Completed-swing flags from the existing indicator engine. No future bar is used.",
    explanation: "Structure is the backbone. Isolated oscillators cannot override a broken structure without a confirmed breakout.",
    available: true,
  });

  const roc = closes.length >= 6 && closes[closes.length - 6] ? ((closes[closes.length - 1] - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : null;
  const momScore =
    roc == null && ind.macd_hist == null && ind.rsi == null
      ? null
      : clamp(50 + (roc || 0) * 2 + (ind.macd_hist && ind.macd_hist > 0 ? 8 : ind.macd_hist && ind.macd_hist < 0 ? -8 : 0) + (ind.rsi != null ? (ind.rsi - 50) * 0.4 : 0));
  const momentum = factor({
    id: "momentum",
    label: "Momentum",
    stance: momScore == null ? "No Data" : momScore >= 70 ? "Strong Bullish" : momScore >= 58 ? "Bullish" : momScore <= 30 ? "Strong Bearish" : momScore <= 42 ? "Bearish" : "Neutral",
    value: roc == null ? "unavailable" : `${pct(roc)} rate of change`,
    interpretation: momScore == null ? "Momentum inputs are missing." : momScore >= 58 ? "Positive momentum." : momScore <= 42 ? "Negative momentum." : "Neutral momentum.",
    raw: { roc, macdHist: nn(ind.macd_hist), rsi: nn(ind.rsi) },
    threshold: "ROC + MACD histogram + RSI slope combined",
    score: momScore,
    weight: 0.05,
    calculation: "5-bar rate of change on completed closes, plus MACD histogram sign and RSI vs 50.",
    explanation: "Momentum says whether the move is accelerating, not whether to buy.",
    available: momScore != null,
  });

  const distRes = price != null && input.resistance ? ((input.resistance - price) / price) * 100 : null;
  const distSup = price != null && input.support ? ((price - input.support) / price) * 100 : null;
  const nearRes = distRes != null && distRes <= 0.8 && distRes >= -0.15;
  const support = factor({
    id: "support",
    label: "Support",
    stance: input.support == null ? "No Data" : distSup != null && distSup <= 0.8 ? "Bullish" : "Neutral",
    value: input.support == null ? "unavailable" : `${r2(input.support)}${distSup != null ? ` (${r2(distSup)}% below)` : ""}`,
    interpretation: input.support == null ? "Nearest support is unavailable." : "Nearby support identified from the existing level map.",
    raw: { support: input.support, distancePct: distSup },
    threshold: "Prior day/week lows, swings, VWAP, and moving averages",
    score: input.support == null ? null : 62,
    weight: 0.025,
    calculation: "Nearest demand from completed swings / prior day-week / VWAP.",
    explanation: "Support is a location, not a bid wall.",
    available: input.support != null,
  });
  const resistance = factor({
    id: "resistance",
    label: "Resistance",
    stance: input.resistance == null ? "No Data" : nearRes ? "Caution" : "Neutral",
    value: input.resistance == null ? "unavailable" : `${r2(input.resistance)}${distRes != null ? ` (${r2(distRes)}% above)` : ""}`,
    interpretation: nearRes
      ? "Price is approaching major resistance — caution even if the trend is bullish."
      : input.resistance == null
        ? "Nearest resistance is unavailable."
        : "Resistance is identified and not immediately overhead.",
    raw: { resistance: input.resistance, distancePct: distRes, near: nearRes },
    threshold: "Within 0.8% of major resistance adds Caution",
    score: input.resistance == null ? null : nearRes ? 38 : 58,
    weight: 0.025,
    calculation: "Distance from last price to nearest resistance (prior high / swing / R1).",
    explanation: "A bullish trend 0.5% under major resistance is Bullish / Caution, not a breakout.",
    available: input.resistance != null,
  });

  const brk = classifyBreakoutStatus(price, close ?? null, input.resistance, rvol);
  const breakout = factor({
    id: "breakout",
    label: "Breakout Status",
    stance: brk.stance,
    value: brk.status.replaceAll("_", " "),
    interpretation: brk.why,
    raw: { status: brk.status, close, resistance: input.resistance, rvol },
    threshold: "Close > resistance AND RVOL ≥ 1.5 AND no immediate rejection",
    score: brk.score,
    weight: 0.08,
    calculation: "Completed close versus resistance plus volume. Wicks do not confirm.",
    explanation: brk.why,
    available: brk.score != null,
  });

  const atr = nn(ind.atr);
  const atrPct = atr != null && price ? (atr / price) * 100 : null;
  const volatility = factor({
    id: "volatility",
    label: "Volatility",
    stance: atrPct == null ? "No Data" : atrPct >= 5 ? "Caution" : atrPct >= 3.5 ? "Neutral" : "Neutral",
    value: atrPct == null ? "unavailable" : `ATR ${r2(atr!)} (${r2(atrPct)}%)`,
    interpretation:
      atrPct == null
        ? "ATR is unavailable."
        : atrPct >= 5
          ? "Extremely elevated ATR% — risk/caution penalty."
          : "ATR is within a usable range for this timeframe.",
    raw: { atr, atrPct },
    threshold: "ATR% ≥ 5 is an elevated-volatility caution on most liquid US names",
    score: atrPct == null ? null : atrPct >= 5 ? 36 : 56,
    weight: 0.05,
    calculation: "ATR(14) / price. Expansion plus a confirmed breakout is already scored in the breakout factor.",
    explanation: "Volatility is a risk input. High ATR does not equal bullish.",
    available: atrPct != null,
  });

  const spy = input.market.spy;
  const qqq = input.market.qqq;
  const vix = input.market.vix;
  const supportive = (spy != null && spy > 0) || (qqq != null && qqq > 0);
  const hostile = (spy != null && spy < -0.4 && qqq != null && qqq < -0.4) || (vix != null && vix >= 25 && (spy || 0) < 0);
  const market = factor({
    id: "marketContext",
    label: "Market Context",
    stance: spy == null && qqq == null ? "No Data" : hostile ? "Bearish" : supportive ? "Bullish" : "Neutral",
    value: `SPY ${pct(spy)} · QQQ ${pct(qqq)} · VIX ${vix == null ? "unavailable" : r2(vix)}`,
    interpretation: hostile
      ? "Benchmarks are weak or VIX is elevated. Ticker-level structure still leads."
      : supportive
        ? "SPY/QQQ are supportive."
        : "Market context is mixed or incomplete.",
    raw: { spy, qqq, vix },
    threshold: "Supportive if SPY or QQQ is green; hostile if both are down and VIX is elevated",
    score: spy == null && qqq == null ? null : hostile ? 28 : supportive ? 70 : 50,
    weight: 0.05,
    calculation: "Same-session SPY/QQQ change and VIX level. Context cannot fully override ticker structure.",
    explanation: "A bullish ticker in a falling tape keeps its structure, but confidence is reduced.",
    available: spy != null || qqq != null,
  });

  return [
    short,
    medium,
    long,
    movingAverages,
    macdFactor,
    rsiFactor,
    volume,
    rvolFactor,
    floatFactor,
    vwapFactor,
    structure,
    momentum,
    support,
    resistance,
    breakout,
    volatility,
    market,
  ];
}

function bucketScore(factors: StockDecisionFactor[], ids: string[]) {
  const rows = factors.filter((f) => ids.includes(f.id) && f.score != null && f.weight > 0);
  if (!rows.length) return null;
  const w = rows.reduce((s, f) => s + f.weight, 0);
  const v = rows.reduce((s, f) => s + (f.score || 0) * f.weight, 0);
  return w > 0 ? r2(v / w) : null;
}

export function applyHardOverrides(input: {
  score: number;
  label: StockDecisionLabel;
  factors: StockDecisionFactor[];
  price: number | null;
  ema50: number | null;
  ema50Slope: number | null;
  ema200: number | null;
}): { score: number; label: StockDecisionLabel; decision: StockDecisionTone; override: string | null } {
  const structure = input.factors.find((f) => f.id === "structure");
  const breakout = input.factors.find((f) => f.id === "breakout");
  const rvol = input.factors.find((f) => f.id === "rvol");
  const below200 = input.price != null && input.ema200 != null && input.price < input.ema200;
  const ema50Down = (input.ema50Slope || 0) < 0;
  const bearStructure = structure?.tone === "bearish";
  if (below200 && ema50Down && bearStructure && (input.label === "STRONG BULLISH" || input.label === "BULLISH")) {
    return {
      score: Math.min(input.score, 44),
      label: "CONFLICTING",
      decision: "Caution",
      override: "Score was capped. Price is below the 200 MA, the 50 MA is declining, and market structure is bearish — this is Caution / Conflicting Signals, not Strong Bullish.",
    };
  }
  const confirmed = String(breakout?.raw.status || "") === "BREAKOUT_CONFIRMED";
  const rvolVal = typeof breakout?.raw.rvol === "number" ? breakout.raw.rvol : typeof rvol?.raw.rvol === "number" ? rvol.raw.rvol : null;
  if (confirmed && (rvolVal || 0) >= 2 && input.score >= 60 && (structure?.tone === "bullish" || structure?.tone === "neutral")) {
    const score = Math.max(input.score, 70);
    const label = labelFromScore(score);
    return {
      score,
      label,
      decision: toneFromLabel(label),
      override: "Breakout engine confirmed a close through resistance with at least 2× RVOL. Structural confirmation upgraded the decision.",
    };
  }
  return { score: input.score, label: input.label, decision: toneFromLabel(input.label), override: null };
}

export function confidenceFrom(input: {
  factors: StockDecisionFactor[];
  score: number;
  mtfAlignmentPct: number | null;
  dataQuality: DataQualityGrade;
  override: string | null;
}): { pct: number; rank: StockDecisionConfidence; why: string } {
  const available = input.factors.filter((f) => f.available);
  const bull = available.filter((f) => f.tone === "bullish").length;
  const bear = available.filter((f) => f.tone === "bearish").length;
  const caution = available.filter((f) => f.tone === "caution").length;
  const missing = input.factors.filter((f) => !f.available).length;
  let pct = 48 + (bull - bear) * 3.2 - caution * 2.2 - missing * 3;
  if (input.mtfAlignmentPct != null) pct += (input.mtfAlignmentPct - 50) * 0.22;
  if (input.dataQuality === "Poor") pct -= 16;
  if (input.dataQuality === "Partial") pct -= 8;
  if (input.override?.includes("Conflicting")) pct -= 12;
  if (input.override?.includes("upgraded")) pct += 6;
  pct = clamp(r2(pct));
  const rank: StockDecisionConfidence = pct >= 75 ? "HIGH" : pct >= 55 ? "MEDIUM" : "LOW";
  const why = `${bull}/${available.length || 0} available factors are bullish, ${caution} caution, ${bear} bearish, ${missing} missing.${
    input.mtfAlignmentPct != null ? ` MTF alignment ${Math.round(input.mtfAlignmentPct)}%.` : ""
  } Confidence is agreement, not a copy of the 0–100 score.`;
  return { pct, rank, why };
}

export function compactTfScore(timeframe: StockDecisionTimeframe, ind: Indicators | null, price: number | null): StockDecisionMtfScore {
  if (!ind || price == null) {
    return {
      timeframe,
      label: STOCK_DECISION_TF_LABEL[timeframe],
      role: STOCK_DECISION_TF_ROLE[timeframe],
      decision: "Neutral",
      labelFull: "NEUTRAL",
      score: null,
      available: false,
    };
  }
  const e20 = nn(ind.ema20 ?? ind.ema21);
  const e50 = nn(ind.ema50);
  const e200 = nn(ind.ema200);
  let n = 50;
  if (e20 != null) n += price > e20 ? 8 : -8;
  if (e50 != null) n += price > e50 ? 8 : -8;
  if (e200 != null) n += price > e200 ? 6 : -6;
  if (ind.higher_highs && ind.higher_lows) n += 10;
  if (ind.lower_highs && ind.lower_lows) n -= 10;
  if (ind.macd_hist != null) n += ind.macd_hist > 0 ? 6 : -6;
  if (ind.rsi != null) n += (ind.rsi - 50) * 0.25;
  const score = clamp(r2(n));
  const label = labelFromScore(score);
  return {
    timeframe,
    label: STOCK_DECISION_TF_LABEL[timeframe],
    role: STOCK_DECISION_TF_ROLE[timeframe],
    decision: toneFromLabel(label),
    labelFull: label,
    score,
    available: true,
  };
}

export function buildExplainableDecision(input: {
  timeframe: StockDecisionTimeframe;
  price: number | null;
  changePct: number | null;
  indicators: Indicators;
  bars: OHLCVBar[];
  dailyBars: OHLCVBar[];
  rvol: number | null;
  support: number | null;
  resistance: number | null;
  market: { spy: number | null; qqq: number | null; vix: number | null };
  floatShares: number | null;
  mtf: StockDecisionMtfScore[];
  stale: boolean;
  barCount: number;
}): StockDecisionSummary {
  const factors = buildFactors(input);
  const weighted = factors.filter((f) => f.weight > 0 && f.score != null);
  const weightSum = weighted.reduce((s, f) => s + f.weight, 0);
  const rawScore = weightSum > 0 ? weighted.reduce((s, f) => s + (f.score || 0) * f.weight, 0) / weightSum : 50;
  const missing = factors.filter((f) => !f.available && f.weight > 0);
  const quality: DataQualityGrade = input.stale || input.barCount < 20 || weightSum < 0.45 ? "Poor" : missing.length >= 3 ? "Partial" : missing.length > 0 ? "Partial" : "Good";
  const mtfAvail = input.mtf.filter((r) => r.available && r.score != null);
  const bullishMtf = mtfAvail.filter((r) => r.decision === "Bullish").length;
  const mtfAlignmentPct = mtfAvail.length ? r2((bullishMtf / mtfAvail.length) * 100) : null;
  const preLabel = labelFromScore(rawScore);
  const applied = applyHardOverrides({
    score: r2(rawScore),
    label: preLabel,
    factors,
    price: input.price,
    ema50: nn(input.indicators.ema50),
    ema50Slope: nn(input.indicators.ema50_slope),
    ema200: nn(input.indicators.ema200),
  });
  const conf = confidenceFrom({
    factors,
    score: applied.score,
    mtfAlignmentPct,
    dataQuality: quality,
    override: applied.override,
  });
  const whyPlus = factors.filter((f) => f.tone === "bullish").map((f) => `${f.label}: ${f.interpretation}`);
  const whyMinus = factors.filter((f) => f.tone === "bearish" || f.tone === "caution").map((f) => `${f.label}: ${f.interpretation}`);
  const whyMissing = factors.filter((f) => !f.available).map((f) => `${f.label}: ${f.interpretation}`);
  const float = factors.find((f) => f.id === "floatTurnover");
  const headline =
    applied.decision === "Bullish"
      ? `${applied.label.replaceAll("_", " ")} because trend, moving averages, and structure agree more than they conflict.`
      : applied.decision === "Bearish"
        ? `${applied.label.replaceAll("_", " ")} because structure and/or momentum are aligned to the downside.`
        : applied.label === "CONFLICTING"
          ? "Signals conflict. The score is not allowed to print a clean bullish label."
          : "The tape is mixed. Wait for structure or volume to resolve.";
  return {
    decision: applied.decision,
    label: applied.label,
    score: applied.score,
    confidence: conf.rank,
    confidencePct: conf.pct,
    confidenceWhy: conf.why,
    dataQuality: quality,
    dataQualityNote:
      quality === "Good"
        ? "Required OHLCV and quote fields are present. Missing book/tape still does not invent values."
        : quality === "Partial"
          ? `Some factors are unavailable (${whyMissing.length}). Those rows stay gray and confidence is reduced.`
          : "Data quality is poor or stale. The engine will not fabricate missing prints.",
    timeframeRole: STOCK_DECISION_TF_ROLE[input.timeframe],
    trendScore: bucketScore(factors, ["shortTrend", "mediumTrend", "longTrend", "movingAverages"]),
    momentumScore: bucketScore(factors, ["macd", "rsi", "momentum"]),
    volumeScore: bucketScore(factors, ["volume", "rvol"]),
    structureScore: bucketScore(factors, ["structure", "vwap", "breakout"]),
    riskScore: bucketScore(factors, ["resistance", "support", "volatility"]),
    marketScore: bucketScore(factors, ["marketContext"]),
    override: applied.override,
    factors,
    whyPlus,
    whyMinus,
    whyMissing,
    headline,
    mtf: input.mtf,
    mtfAligned: bullishMtf,
    mtfAvailable: mtfAvail.length,
    mtfAlignmentPct,
    mtfNote:
      mtfAvail.length < 3
        ? "Not enough timeframes returned to score alignment."
        : mtfAlignmentPct != null && mtfAlignmentPct >= 70
          ? `MTF Alignment: ${bullishMtf}/${mtfAvail.length} bullish.`
          : `MTF Conflict — lower confidence (${bullishMtf}/${mtfAvail.length} bullish).`,
    float: {
      shares: typeof float?.raw.float === "number" ? float.raw.float : null,
      averageVolume: typeof float?.raw.averageVolume === "number" ? float.raw.averageVolume : null,
      currentVolume: typeof float?.raw.currentVolume === "number" ? float.raw.currentVolume : null,
      turnover: typeof float?.raw.turnover === "number" ? float.raw.turnover : null,
      percentile: typeof float?.raw.percentile === "number" ? float.raw.percentile : null,
      note: float?.interpretation || "Float turnover unavailable.",
    },
  };
}
