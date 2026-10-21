import { sma, lastNum, rollingStd } from "@/src/lib/series";
import {
  atr,
  bollinger,
  classicPivots,
  ema,
  last,
  macd,
  rsi,
  slope,
  structureFlags,
  vwap,
} from "@/src/engines/indicators";
import {
  accDist,
  awesomeOsc,
  betaOf,
  choppiness,
  cmf,
  cci,
  dmi,
  donchian,
  easeOfMovement,
  forceIndex,
  hv,
  keltner,
  lastVal,
  mfi,
  momentum,
  obv,
  pearson,
  ppo,
  ret,
  roc,
  rollingCorrelation,
  stoch,
  trix,
  ultimateOsc,
  volumeOsc,
  williamsR,
  ytdReturn,
} from "@/src/engines/compareMath";
import {
  CATEGORY_WEIGHTS,
  type CompareCell,
  type CompareIndicatorRow,
  type CompareRelative,
  type CompareSignal,
  type CompareTickerCard,
} from "@/lib/compare";
import type { OHLCVBar } from "@/src/types/domain";

export type SeriesSnap = {
  symbol: string;
  name: string;
  bars: number;
  missing: number;
  latest: string;
  close: number[];
  open: number[];
  high: number[];
  low: number[];
  volume: number[];
  stamps: Date[];
  values: Record<string, number | null>;
  notes: Record<string, string>;
};

function px(v: number | null | undefined, digits = 2) {
  if (v == null || !Number.isFinite(v)) return "INSUFFICIENT DATA";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function pct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "INSUFFICIENT DATA";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export function classifyOscillator(v: number | null, high = 70, low = 30, mid = 50): CompareSignal {
  if (v == null) return "INSUFFICIENT DATA";
  if (v >= 80) return "OVEREXTENDED";
  if (v >= high) return "MIXED";
  if (v >= mid + 5) return "BULLISH";
  if (v >= mid - 5) return "NEUTRAL";
  if (v > low) return "BEARISH";
  if (v > 20) return "MIXED";
  return "OVEREXTENDED";
}

export function classifyTrend(v: number | null, bullWhenPositive = true): CompareSignal {
  if (v == null) return "INSUFFICIENT DATA";
  const x = bullWhenPositive ? v : -v;
  if (x > 3) return "STRONG BULLISH";
  if (x > 1) return "BULLISH";
  if (x > 0.15) return "MODERATELY BULLISH";
  if (x > -0.15) return "NEUTRAL";
  if (x > -1) return "MODERATELY BEARISH";
  if (x > -3) return "BEARISH";
  return "STRONG BEARISH";
}

export function classifyBoolean(flag: boolean | null, bullish: boolean): CompareSignal {
  if (flag == null) return "INSUFFICIENT DATA";
  if (!flag) return "NEUTRAL";
  return bullish ? "BULLISH" : "BEARISH";
}

function cell(
  value: number | string | null,
  display: string,
  signal: CompareSignal,
  interpretation: string,
  validBars: number,
  required: number,
): CompareCell {
  const ok = value != null && value !== "INSUFFICIENT DATA" && display !== "INSUFFICIENT DATA";
  const completeness = validBars >= required ? 1 : validBars / Math.max(required, 1);
  return {
    value: ok ? value : null,
    display: ok ? display : "INSUFFICIENT DATA",
    signal: ok ? signal : "INSUFFICIENT DATA",
    interpretation: ok ? interpretation : `Needs ${required} bars; ${validBars} available.`,
    confidence: ok ? Math.round(55 + 45 * Math.min(1, completeness)) : null,
    validBars,
  };
}

function candleBody(o: number, c: number) {
  return Math.abs(c - o);
}

export function buildSnapshot(symbol: string, name: string, bars: OHLCVBar[]): SeriesSnap {
  const close = bars.map((b) => b.close);
  const open = bars.map((b) => b.open);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume || 0);
  const stamps = bars.map((b) => (b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp)));
  const n = close.length;
  const lastC = close[n - 1];
  const prevC = n > 1 ? close[n - 2] : null;
  const sma10 = sma(close, 10);
  const sma20 = sma(close, 20);
  const sma50 = sma(close, 50);
  const sma100 = sma(close, 100);
  const sma200 = sma(close, 200);
  const ema9 = ema(close, 9);
  const ema21 = ema(close, 21);
  const ema20 = ema(close, 20);
  const ema50 = ema(close, 50);
  const ema100 = ema(close, 100);
  const ema200 = ema(close, 200);
  const rsi7 = rsi(close, 7);
  const rsi14 = rsi(close, 14);
  const rsi21 = rsi(close, 21);
  const [macdLine, macdSig, macdHist] = macd(close);
  const atr14 = atr(high, low, close, 14);
  const [bbU, bbM, bbL] = bollinger(close, 20, 2);
  const st = stoch(high, low, close);
  const dmiSet = dmi(high, low, close);
  const kel = keltner(high, low, close);
  const don = donchian(high, low);
  const ppoSet = ppo(close);
  const lastBar = bars[n - 1];
  const prevBar = n > 1 ? bars[n - 2] : lastBar;
  const piv = lastBar ? classicPivots(prevBar.high, prevBar.low, prevBar.close) : null;
  const struct = structureFlags(high, low, Math.min(20, n));
  const swingLook = Math.min(40, n);
  const hh20 = n >= 20 ? Math.max(...high.slice(-20)) : null;
  const ll20 = n >= 20 ? Math.min(...low.slice(-20)) : null;
  const hh52 = n >= 5 ? Math.max(...high.slice(-Math.min(n, 252))) : null;
  const ll52 = n >= 5 ? Math.min(...low.slice(-Math.min(n, 252))) : null;
  const weekSlice = bars.slice(-5);
  const monthSlice = bars.slice(-21);
  const values: Record<string, number | null> = {
    price: lastC ?? null,
    open: lastBar?.open ?? null,
    high: lastBar?.high ?? null,
    low: lastBar?.low ?? null,
    prev_close: prevC,
    gap_pct: prevC && lastBar ? ((lastBar.open - prevC) / prevC) * 100 : null,
    ret_1: prevC && lastC ? ((lastC - prevC) / prevC) * 100 : null,
    ret_5: ret(close, 5),
    ret_10: ret(close, 10),
    ret_20: ret(close, 20),
    ret_21: ret(close, 21),
    ret_63: ret(close, 63),
    ret_126: ret(close, 126),
    ret_ytd: ytdReturn(close, stamps),
    ret_252: ret(close, 252),
    sma10: lastVal(sma10),
    sma20: lastVal(sma20),
    sma50: lastVal(sma50),
    sma100: lastVal(sma100),
    sma200: lastVal(sma200),
    ema9: lastVal(ema9),
    ema20: lastVal(ema20),
    ema21: lastVal(ema21),
    ema50: lastVal(ema50),
    ema100: lastVal(ema100),
    ema200: lastVal(ema200),
    rsi7: lastVal(rsi7),
    rsi14: lastVal(rsi14),
    rsi21: lastVal(rsi21),
    stoch_k: lastVal(st.k),
    stoch_d: lastVal(st.d),
    williams: lastVal(williamsR(high, low, close)),
    cci: lastVal(cci(high, low, close)),
    roc: lastVal(roc(close)),
    momentum: lastVal(momentum(close)),
    uo: lastVal(ultimateOsc(high, low, close)),
    ao: lastVal(awesomeOsc(high, low)),
    trix: lastVal(trix(close)),
    ppo: lastVal(ppoSet.line),
    ppo_signal: lastVal(ppoSet.signal),
    macd: lastVal(macdLine),
    macd_signal: lastVal(macdSig),
    macd_hist: lastVal(macdHist),
    dmi_plus: lastVal(dmiSet.plus),
    dmi_minus: lastVal(dmiSet.minus),
    adx: lastVal(dmiSet.adx),
    adxr: lastVal(dmiSet.adxr),
    atr: lastVal(atr14),
    atr_pct: lastVal(atr14) != null && lastC ? (lastVal(atr14)! / lastC) * 100 : null,
    hv: lastVal(hv(close)),
    stdev: lastVal(rollingStd(close, 20)),
    bb_upper: lastVal(bbU),
    bb_mid: lastVal(bbM),
    bb_lower: lastVal(bbL),
    kel_upper: lastVal(kel.upper),
    kel_mid: lastVal(kel.mid),
    kel_lower: lastVal(kel.lower),
    don_upper: lastVal(don.upper),
    don_mid: lastVal(don.mid),
    don_lower: lastVal(don.lower),
    chop: lastVal(choppiness(high, low, close)),
    volume: lastBar?.volume ?? null,
    vol_sma20: lastVal(sma(volume, 20)),
    vol_sma50: lastVal(sma(volume, 50)),
    obv: lastVal(obv(close, volume)),
    cmf: lastVal(cmf(high, low, close, volume)),
    mfi: lastVal(mfi(high, low, close, volume)),
    vwap: last(vwap(high, low, close, volume, stamps)),
    ad: lastVal(accDist(high, low, close, volume)),
    force: lastVal(forceIndex(close, volume)),
    emv: lastVal(easeOfMovement(high, low, volume)),
    vol_osc: lastVal(volumeOsc(volume)),
    pdh: prevBar?.high ?? null,
    pdl: prevBar?.low ?? null,
    pwh: weekSlice.length ? Math.max(...weekSlice.map((b) => b.high)) : null,
    pwl: weekSlice.length ? Math.min(...weekSlice.map((b) => b.low)) : null,
    pmh: monthSlice.length ? Math.max(...monthSlice.map((b) => b.high)) : null,
    pml: monthSlice.length ? Math.min(...monthSlice.map((b) => b.low)) : null,
    high20: hh20,
    low20: ll20,
    high52: hh52,
    low52: ll52,
    pivot: piv?.pivot ?? null,
    r1: piv?.r1 ?? null,
    r2: piv?.r2 ?? null,
    r3: piv?.r3 ?? null,
    s1: piv?.s1 ?? null,
    s2: piv?.s2 ?? null,
    s3: piv?.s3 ?? null,
    hh: struct.higher_highs ? 1 : 0,
    hl: struct.higher_lows ? 1 : 0,
    lh: struct.lower_highs ? 1 : 0,
    ll: struct.lower_lows ? 1 : 0,
  };
  values.price_vs_sma10 = lastC && values.sma10 ? ((lastC - values.sma10) / values.sma10) * 100 : null;
  values.price_vs_sma20 = lastC && values.sma20 ? ((lastC - values.sma20) / values.sma20) * 100 : null;
  values.price_vs_sma50 = lastC && values.sma50 ? ((lastC - values.sma50) / values.sma50) * 100 : null;
  values.price_vs_sma100 = lastC && values.sma100 ? ((lastC - values.sma100) / values.sma100) * 100 : null;
  values.price_vs_sma200 = lastC && values.sma200 ? ((lastC - values.sma200) / values.sma200) * 100 : null;
  values.price_vs_ema9 = lastC && values.ema9 ? ((lastC - values.ema9) / values.ema9) * 100 : null;
  values.price_vs_ema20 = lastC && values.ema20 ? ((lastC - values.ema20) / values.ema20) * 100 : null;
  values.price_vs_ema21 = lastC && values.ema21 ? ((lastC - values.ema21) / values.ema21) * 100 : null;
  values.price_vs_ema50 = lastC && values.ema50 ? ((lastC - values.ema50) / values.ema50) * 100 : null;
  values.price_vs_ema100 = lastC && values.ema100 ? ((lastC - values.ema100) / values.ema100) * 100 : null;
  values.price_vs_ema200 = lastC && values.ema200 ? ((lastC - values.ema200) / values.ema200) * 100 : null;
  values.sma10_slope = slope(sma10, 3);
  values.sma20_slope = slope(sma20, 3);
  values.sma50_slope = slope(sma50, 5);
  values.sma200_slope = slope(sma200, 5);
  values.ema20_slope = slope(ema20, 3);
  values.ema50_slope = slope(ema50, 5);
  values.ema200_slope = slope(ema200, 5);
  values.rvol = values.volume && values.vol_sma20 ? values.volume / values.vol_sma20 : null;
  values.vol_ratio = values.rvol;
  values.vol_chg = n > 1 && volume[n - 2] ? ((volume[n - 1] - volume[n - 2]) / volume[n - 2]) * 100 : null;
  values.obv_slope = slope(obv(close, volume), 5);
  values.bb_width = values.bb_upper != null && values.bb_lower != null && values.bb_mid ? ((values.bb_upper - values.bb_lower) / values.bb_mid) * 100 : null;
  values.bb_pctb =
    values.bb_upper != null && values.bb_lower != null && values.bb_upper !== values.bb_lower && lastC != null
      ? (lastC - values.bb_lower) / (values.bb_upper - values.bb_lower)
      : null;
  values.kel_width = values.kel_upper != null && values.kel_lower != null && values.kel_mid ? ((values.kel_upper - values.kel_lower) / values.kel_mid) * 100 : null;
  values.don_width = values.don_upper != null && values.don_lower != null && values.don_mid ? ((values.don_upper - values.don_lower) / values.don_mid) * 100 : null;
  const hvHist = hv(close).filter((x): x is number => x != null);
  values.vol_pctile =
    values.hv != null && hvHist.length > 5
      ? (hvHist.filter((x) => x <= values.hv!).length / hvHist.length) * 100
      : null;
  values.vol_expand = values.bb_width != null && values.bb_width > 8 ? 1 : values.bb_width != null ? 0 : null;
  values.vol_contract = values.bb_width != null && values.bb_width < 3 ? 1 : values.bb_width != null ? 0 : null;
  values.dist_52h = lastC && hh52 ? ((lastC - hh52) / hh52) * 100 : null;
  values.dist_52l = lastC && ll52 ? ((lastC - ll52) / ll52) * 100 : null;
  const swingH = n >= 30 ? Math.max(...high.slice(-swingLook, -Math.floor(swingLook / 2) || undefined)) : null;
  const swingL = n >= 30 ? Math.min(...low.slice(-swingLook, -Math.floor(swingLook / 2) || undefined)) : null;
  const fibRange = swingH != null && swingL != null ? swingH - swingL : null;
  values.fib_382 = swingH != null && fibRange != null ? swingH - 0.382 * fibRange : null;
  values.fib_500 = swingH != null && fibRange != null ? swingH - 0.5 * fibRange : null;
  values.fib_618 = swingH != null && fibRange != null ? swingH - 0.618 * fibRange : null;
  values.fib_ext = swingH != null && fibRange != null ? swingH + 0.618 * fibRange : null;
  values.dyn_sup = values.ema21;
  values.dyn_res = values.ema50;
  values.breakout = lastC && hh20 && lastC > hh20 ? 1 : lastC && hh20 ? 0 : null;
  values.breakdown = lastC && ll20 && lastC < ll20 ? 1 : lastC && ll20 ? 0 : null;
  const uptrend = struct.higher_highs && struct.higher_lows;
  const downtrend = struct.lower_highs && struct.lower_lows;
  values.uptrend = uptrend ? 1 : 0;
  values.downtrend = downtrend ? 1 : 0;
  values.sideways = !uptrend && !downtrend ? 1 : 0;
  values.consolidation = values.bb_width != null && values.bb_width < 4 ? 1 : values.bb_width != null ? 0 : null;
  values.bos = (uptrend && values.breakdown) || (downtrend && values.breakout) ? 1 : 0;
  values.choch = (uptrend && struct.lower_highs) || (downtrend && struct.higher_lows) ? 1 : 0;
  values.struct_strength = (Number(struct.higher_highs) + Number(struct.higher_lows) + Number(!struct.lower_highs) + Number(!struct.lower_lows)) * 25;
  values.struct_consistency = values.adx;
  values.ema20_50_x = values.ema20 != null && values.ema50 != null ? values.ema20 - values.ema50 : null;
  values.ema50_200_x = values.ema50 != null && values.ema200 != null ? values.ema50 - values.ema200 : null;
  values.golden = values.sma50 != null && values.sma200 != null && values.sma50 > values.sma200 ? 1 : values.sma50 != null && values.sma200 != null ? 0 : null;
  values.death = values.sma50 != null && values.sma200 != null && values.sma50 < values.sma200 ? 1 : values.sma50 != null && values.sma200 != null ? 0 : null;
  const mas = [values.sma20, values.sma50, values.sma200].filter((x): x is number => x != null);
  values.sma_align = mas.length === 3 && lastC ? (lastC > mas[0] && mas[0] > mas[1] && mas[1] > mas[2] ? 1 : lastC < mas[0] && mas[0] < mas[1] && mas[1] < mas[2] ? -1 : 0) : null;
  const emas = [values.ema20, values.ema50, values.ema200].filter((x): x is number => x != null);
  values.ema_align = emas.length === 3 && lastC ? (lastC > emas[0] && emas[0] > emas[1] && emas[1] > emas[2] ? 1 : lastC < emas[0] && emas[0] < emas[1] && emas[1] < emas[2] ? -1 : 0) : null;
  values.ma_compress = values.sma20 != null && values.sma50 != null ? (Math.abs(values.sma20 - values.sma50) / values.sma50) * 100 : null;
  values.ma_expand = values.ma_compress != null ? (values.ma_compress > 3 ? 1 : 0) : null;
  values.dist_200 = values.price_vs_sma200;
  const upVol = volume.filter((_, i) => i > 0 && close[i] >= close[i - 1]).slice(-20).reduce((s, x) => s + x, 0);
  const dnVol = volume.filter((_, i) => i > 0 && close[i] < close[i - 1]).slice(-20).reduce((s, x) => s + x, 0);
  values.up_vol = upVol || null;
  values.down_vol = dnVol || null;
  values.up_down_ratio = dnVol ? upVol / dnVol : null;
  values.vp_confirm = values.ret_5 != null && values.rvol != null ? (values.ret_5 > 0 && values.rvol > 1 ? 1 : values.ret_5 < 0 && values.rvol > 1 ? -1 : 0) : null;
  const o = lastBar?.open ?? 0;
  const h = lastBar?.high ?? 0;
  const l = lastBar?.low ?? 0;
  const c = lastC ?? 0;
  const body = candleBody(o, c);
  const range = h - l || 1;
  const upperW = h - Math.max(o, c);
  const lowerW = Math.min(o, c) - l;
  values.doji = body / range < 0.1 ? 1 : 0;
  values.hammer = lowerW > 2 * body && upperW < body && c >= o ? 1 : 0;
  values.inv_hammer = upperW > 2 * body && lowerW < body ? 1 : 0;
  values.shooting = upperW > 2 * body && lowerW < body && c < o ? 1 : 0;
  const prevBody = n > 1 ? candleBody(open[n - 2], close[n - 2]) : 0;
  values.bull_engulf = n > 1 && close[n - 2] < open[n - 2] && c > o && c >= open[n - 2] && o <= close[n - 2] ? 1 : 0;
  values.bear_engulf = n > 1 && close[n - 2] > open[n - 2] && c < o && c <= open[n - 2] && o >= close[n - 2] ? 1 : 0;
  values.morning =
    n > 2 && close[n - 3] < open[n - 3] && Math.abs(close[n - 2] - open[n - 2]) < prevBody * 0.5 && c > o && c > (open[n - 3] + close[n - 3]) / 2 ? 1 : 0;
  values.evening =
    n > 2 && close[n - 3] > open[n - 3] && Math.abs(close[n - 2] - open[n - 2]) < prevBody * 0.5 && c < o && c < (open[n - 3] + close[n - 3]) / 2 ? 1 : 0;
  values.harami = n > 1 && body < prevBody && Math.max(o, c) <= Math.max(open[n - 2], close[n - 2]) && Math.min(o, c) >= Math.min(open[n - 2], close[n - 2]) ? 1 : 0;
  values.soldiers = n > 2 && [0, 1, 2].every((k) => close[n - 1 - k] > open[n - 1 - k]) ? 1 : 0;
  values.crows = n > 2 && [0, 1, 2].every((k) => close[n - 1 - k] < open[n - 1 - k]) ? 1 : 0;
  values.marubozu = body / range > 0.9 ? 1 : 0;
  values.inside = n > 1 && h <= high[n - 2] && l >= low[n - 2] ? 1 : 0;
  values.outside = n > 1 && h >= high[n - 2] && l <= low[n - 2] ? 1 : 0;
  values.pin = (upperW > 2 * body || lowerW > 2 * body) && body / range < 0.35 ? 1 : 0;
  values.tweezer_top = n > 1 && Math.abs(high[n - 1] - high[n - 2]) / (high[n - 1] || 1) < 0.001 && c < o ? 1 : 0;
  values.tweezer_bot = n > 1 && Math.abs(low[n - 1] - low[n - 2]) / (low[n - 1] || 1) < 0.001 && c > o ? 1 : 0;
  values.bull_flag = values.uptrend === 1 && values.consolidation === 1 ? 1 : 0;
  values.bear_flag = values.downtrend === 1 && values.consolidation === 1 ? 1 : 0;
  values.asc_tri = values.hl === 1 && values.hh === 0 && values.consolidation === 1 ? 1 : 0;
  values.desc_tri = values.lh === 1 && values.ll === 0 && values.consolidation === 1 ? 1 : 0;
  values.ma_trend = values.ema_align;
  const missing = bars.filter((b) => !(b.close > 0) || !(b.high >= b.low)).length;
  const notes: Record<string, string> = {
    rsi: "RSI uses Wilder smoothing. Above 70 can be strong or overbought; 80+ is treated as overextended, not automatically strong-bullish.",
    macd: "MACD line minus signal. Histogram sign shows short-term momentum, not a standalone trade.",
    adx: "ADX measures trend strength, not direction. Direction comes from DMI+ vs DMI-.",
  };
  return {
    symbol,
    name,
    bars: n,
    missing,
    latest: stamps[n - 1]?.toISOString() || "",
    close,
    open,
    high,
    low,
    volume,
    stamps,
    values,
    notes,
  };
}

type Spec = {
  id: string;
  category: string;
  name: string;
  key: string;
  required: number;
  kind: "price" | "pct" | "osc" | "trend" | "flag-bull" | "flag-bear" | "raw";
  calc: string;
  desc: string;
  higherBetter?: boolean;
};

function specs(): Spec[] {
  const price: Spec[] = [
    ["price", "Current Price", "price", 1, "price", "Last close", "Latest available close"],
    ["open", "Open", "open", 1, "price", "Session/bar open", "Open of the last bar"],
    ["high", "High", "high", 1, "price", "Session/bar high", "High of the last bar"],
    ["low", "Low", "low", 1, "price", "Session/bar low", "Low of the last bar"],
    ["prev_close", "Previous Close", "prev_close", 2, "price", "Prior bar close", "Close of the previous bar"],
    ["gap_pct", "Gap %", "gap_pct", 2, "pct", "(Open - prior close) / prior close", "Overnight or inter-bar gap"],
    ["ret_1", "1D Return", "ret_1", 2, "pct", "Close vs prior close", "One-bar return"],
    ["ret_5", "5D Return", "ret_5", 6, "pct", "Close vs close 5 bars ago", "Five-bar return"],
    ["ret_10", "10D Return", "ret_10", 11, "pct", "Close vs close 10 bars ago", "Ten-bar return"],
    ["ret_20", "20D Return", "ret_20", 21, "pct", "Close vs close 20 bars ago", "Twenty-bar return"],
    ["ret_21", "1M Return", "ret_21", 22, "pct", "Close vs close 21 bars ago", "Approximate 1-month return"],
    ["ret_63", "3M Return", "ret_63", 64, "pct", "Close vs close 63 bars ago", "Approximate 3-month return"],
    ["ret_126", "6M Return", "ret_126", 127, "pct", "Close vs close 126 bars ago", "Approximate 6-month return"],
    ["ret_ytd", "YTD Return", "ret_ytd", 20, "pct", "Close vs first print of the calendar year", "Year-to-date return"],
    ["ret_252", "1Y Return", "ret_252", 253, "pct", "Close vs close 252 bars ago", "Approximate 1-year return"],
  ].map(([id, name, key, req, kind, calc, desc]) => ({
    id: String(id),
    category: "Trend",
    name: String(name),
    key: String(key),
    required: Number(req),
    kind: kind as Spec["kind"],
    calc: String(calc),
    desc: String(desc),
    higherBetter: true,
  }));

  const mas: Spec[] = [];
  for (const [id, name, key, req] of [
    ["sma10", "SMA 10", "sma10", 10],
    ["sma20", "SMA 20", "sma20", 20],
    ["sma50", "SMA 50", "sma50", 50],
    ["sma100", "SMA 100", "sma100", 100],
    ["sma200", "SMA 200", "sma200", 200],
    ["ema9", "EMA 9", "ema9", 9],
    ["ema20", "EMA 20", "ema20", 20],
    ["ema21", "EMA 21", "ema21", 21],
    ["ema50", "EMA 50", "ema50", 50],
    ["ema100", "EMA 100", "ema100", 100],
    ["ema200", "EMA 200", "ema200", 200],
  ] as const) {
    mas.push({ id, category: "Trend", name, key, required: req, kind: "price", calc: `${name} of close`, desc: `${name} level`, higherBetter: false });
  }
  const vs: Spec[] = [
    "price_vs_sma10",
    "price_vs_sma20",
    "price_vs_sma50",
    "price_vs_sma100",
    "price_vs_sma200",
    "price_vs_ema9",
    "price_vs_ema20",
    "price_vs_ema21",
    "price_vs_ema50",
    "price_vs_ema100",
    "price_vs_ema200",
  ].map((k) => ({
    id: k,
    category: "Trend",
    name: k.replaceAll("_", " ").replace("price vs ", "Price vs ").toUpperCase(),
    key: k,
    required: 20,
    kind: "pct",
    calc: "Percent distance from the moving average",
    desc: "Positive means price is above the average",
    higherBetter: true,
  }));
  const slopes: Spec[] = ["sma10_slope", "sma20_slope", "sma50_slope", "sma200_slope", "ema20_slope", "ema50_slope", "ema200_slope"].map((k) => ({
    id: k,
    category: "Trend",
    name: k.replaceAll("_", " ").toUpperCase(),
    key: k,
    required: 25,
    kind: "trend",
    calc: "Percent change of the MA over a short lookback",
    desc: "Rising average supports the matching trend",
    higherBetter: true,
  }));

  const mom: Spec[] = [
    ["rsi7", "RSI 7", "rsi7", 8, "osc"],
    ["rsi14", "RSI 14", "rsi14", 15, "osc"],
    ["rsi21", "RSI 21", "rsi21", 22, "osc"],
    ["stoch_k", "Stochastic %K", "stoch_k", 14, "osc"],
    ["stoch_d", "Stochastic %D", "stoch_d", 17, "osc"],
    ["williams", "Williams %R", "williams", 14, "raw"],
    ["cci", "CCI", "cci", 20, "raw"],
    ["roc", "ROC", "roc", 13, "pct"],
    ["momentum", "Momentum", "momentum", 11, "trend"],
    ["uo", "Ultimate Oscillator", "uo", 28, "osc"],
    ["ao", "Awesome Oscillator", "ao", 34, "trend"],
    ["trix", "TRIX", "trix", 45, "trend"],
    ["ppo", "PPO", "ppo", 26, "trend"],
    ["ppo_signal", "PPO Signal", "ppo_signal", 35, "trend"],
    ["macd", "MACD Line", "macd", 26, "trend"],
    ["macd_signal", "MACD Signal", "macd_signal", 35, "trend"],
    ["macd_hist", "MACD Histogram", "macd_hist", 35, "trend"],
    ["dmi_plus", "DMI+", "dmi_plus", 28, "raw"],
    ["dmi_minus", "DMI-", "dmi_minus", 28, "raw"],
    ["adx", "ADX", "adx", 28, "raw"],
    ["adxr", "ADXR", "adxr", 42, "raw"],
  ].map(([id, name, key, req, kind]) => ({
    id: String(id),
    category: "Momentum",
    name: String(name),
    key: String(key),
    required: Number(req),
    kind: kind as Spec["kind"],
    calc: String(name),
    desc: `${String(name)} from OHLCV`,
    higherBetter: id !== "dmi_minus" && id !== "williams",
  }));

  const vol: Spec[] = [
    ["atr", "ATR", "atr", 15, "price", false],
    ["atr_pct", "ATR %", "atr_pct", 15, "pct", false],
    ["hv", "Historical Volatility", "hv", 22, "pct", false],
    ["stdev", "Standard Deviation", "stdev", 20, "price", false],
    ["bb_upper", "Bollinger Upper", "bb_upper", 20, "price", false],
    ["bb_mid", "Bollinger Middle", "bb_mid", 20, "price", false],
    ["bb_lower", "Bollinger Lower", "bb_lower", 20, "price", false],
    ["bb_width", "Bollinger Width", "bb_width", 20, "pct", false],
    ["bb_pctb", "Bollinger %B", "bb_pctb", 20, "raw", false],
    ["kel_upper", "Keltner Upper", "kel_upper", 20, "price", false],
    ["kel_mid", "Keltner Middle", "kel_mid", 20, "price", false],
    ["kel_lower", "Keltner Lower", "kel_lower", 20, "price", false],
    ["kel_width", "Keltner Width", "kel_width", 20, "pct", false],
    ["don_upper", "Donchian Upper", "don_upper", 20, "price", false],
    ["don_mid", "Donchian Middle", "don_mid", 20, "price", false],
    ["don_lower", "Donchian Lower", "don_lower", 20, "price", false],
    ["don_width", "Donchian Width", "don_width", 20, "pct", false],
    ["vol_pctile", "Volatility Percentile", "vol_pctile", 40, "raw", false],
    ["vol_expand", "Volatility Expansion", "vol_expand", 20, "flag-bull", false],
    ["vol_contract", "Volatility Contraction", "vol_contract", 20, "flag-bear", false],
    ["chop", "Choppiness Index", "chop", 14, "raw", false],
  ].map(([id, name, key, req, kind]) => ({
    id: String(id),
    category: "Volatility",
    name: String(name),
    key: String(key),
    required: Number(req),
    kind: kind as Spec["kind"],
    calc: String(name),
    desc: String(name),
    higherBetter: false,
  }));

  const volume: Spec[] = [
    ["volume", "Current Volume", "volume", 1, "raw", false],
    ["vol_sma20", "Average Volume 20", "vol_sma20", 20, "raw", false],
    ["vol_sma50", "Average Volume 50", "vol_sma50", 50, "raw", false],
    ["rvol", "Relative Volume", "rvol", 20, "raw", true],
    ["vol_ratio", "Volume Ratio", "vol_ratio", 20, "raw", true],
    ["vol_chg", "Volume Change %", "vol_chg", 2, "pct", false],
    ["obv", "OBV", "obv", 5, "raw", true],
    ["obv_slope", "OBV Slope", "obv_slope", 10, "trend", true],
    ["cmf", "CMF", "cmf", 20, "trend", true],
    ["mfi", "MFI", "mfi", 14, "osc", true],
    ["vwap", "VWAP", "vwap", 2, "price", false],
    ["ad", "Accumulation/Distribution", "ad", 5, "raw", true],
    ["force", "Force Index", "force", 13, "trend", true],
    ["emv", "Ease of Movement", "emv", 14, "trend", true],
    ["vol_osc", "Volume Oscillator", "vol_osc", 10, "trend", true],
    ["up_vol", "Up Volume", "up_vol", 20, "raw", true],
    ["down_vol", "Down Volume", "down_vol", 20, "raw", false],
    ["up_down_ratio", "Up/Down Volume Ratio", "up_down_ratio", 20, "raw", true],
    ["vp_confirm", "Volume-Price Confirmation", "vp_confirm", 6, "trend", true],
  ].map(([id, name, key, req, kind, hb]) => ({
    id: String(id),
    category: "Volume",
    name: String(name),
    key: String(key),
    required: Number(req),
    kind: kind as Spec["kind"],
    calc: String(name),
    desc: String(name),
    higherBetter: Boolean(hb),
  }));

  const sr: Spec[] = [
    ["pdh", "Previous Day High", "pdh", 2, "price"],
    ["pdl", "Previous Day Low", "pdl", 2, "price"],
    ["pwh", "Previous Week High", "pwh", 5, "price"],
    ["pwl", "Previous Week Low", "pwl", 5, "price"],
    ["pmh", "Previous Month High", "pmh", 21, "price"],
    ["pml", "Previous Month Low", "pml", 21, "price"],
    ["high20", "20-Day High", "high20", 20, "price"],
    ["low20", "20-Day Low", "low20", 20, "price"],
    ["high52", "52-Week High", "high52", 50, "price"],
    ["low52", "52-Week Low", "low52", 50, "price"],
    ["dist_52h", "Distance from 52-Week High", "dist_52h", 50, "pct"],
    ["dist_52l", "Distance from 52-Week Low", "dist_52l", 50, "pct"],
    ["pivot", "Pivot Point", "pivot", 2, "price"],
    ["r1", "R1", "r1", 2, "price"],
    ["r2", "R2", "r2", 2, "price"],
    ["r3", "R3", "r3", 2, "price"],
    ["s1", "S1", "s1", 2, "price"],
    ["s2", "S2", "s2", 2, "price"],
    ["s3", "S3", "s3", 2, "price"],
    ["fib_382", "Fibonacci 38.2%", "fib_382", 30, "price"],
    ["fib_500", "Fibonacci 50%", "fib_500", 30, "price"],
    ["fib_618", "Fibonacci 61.8%", "fib_618", 30, "price"],
    ["fib_ext", "Fibonacci Extension", "fib_ext", 30, "price"],
    ["dyn_sup", "Dynamic Support (EMA21)", "dyn_sup", 21, "price"],
    ["dyn_res", "Dynamic Resistance (EMA50)", "dyn_res", 50, "price"],
    ["breakout", "Breakout Detection", "breakout", 20, "flag-bull"],
    ["breakdown", "Breakdown Detection", "breakdown", 20, "flag-bear"],
  ].map(([id, name, key, req, kind]) => ({
    id: String(id),
    category: "Support/Resistance",
    name: String(name),
    key: String(key),
    required: Number(req),
    kind: kind as Spec["kind"],
    calc: String(name),
    desc: String(name),
    higherBetter: false,
  }));

  const structure: Spec[] = [
    ["hh", "Higher High", "hh", 20, "flag-bull"],
    ["hl", "Higher Low", "hl", 20, "flag-bull"],
    ["lh", "Lower High", "lh", 20, "flag-bear"],
    ["ll", "Lower Low", "ll", 20, "flag-bear"],
    ["uptrend", "Uptrend", "uptrend", 20, "flag-bull"],
    ["downtrend", "Downtrend", "downtrend", 20, "flag-bear"],
    ["sideways", "Sideways/Ranging", "sideways", 20, "raw"],
    ["consolidation", "Consolidation", "consolidation", 20, "raw"],
    ["bos", "Break of Structure (BOS)", "bos", 20, "raw"],
    ["choch", "Change of Character (CHoCH)", "choch", 20, "raw"],
    ["struct_strength", "Structure Strength", "struct_strength", 20, "raw"],
    ["struct_consistency", "Structure Consistency (ADX)", "struct_consistency", 28, "raw"],
  ].map(([id, name, key, req, kind]) => ({
    id: String(id),
    category: "Structure",
    name: String(name),
    key: String(key),
    required: Number(req),
    kind: kind as Spec["kind"],
    calc: "Deterministic swing comparison of the last 20 bars split in half",
    desc: String(name),
    higherBetter: id === "hh" || id === "hl" || id === "uptrend" || id === "struct_strength",
  }));

  const maStruct: Spec[] = [
    ["ema20_50_x", "EMA20/EMA50 spread", "ema20_50_x", 50, "trend"],
    ["ema50_200_x", "EMA50/EMA200 spread", "ema50_200_x", 200, "trend"],
    ["golden", "Golden Cross (SMA50>SMA200)", "golden", 200, "flag-bull"],
    ["death", "Death Cross (SMA50<SMA200)", "death", 200, "flag-bear"],
    ["sma_align", "SMA alignment", "sma_align", 200, "trend"],
    ["ema_align", "EMA alignment", "ema_align", 200, "trend"],
    ["ma_compress", "MA compression", "ma_compress", 50, "pct"],
    ["ma_expand", "MA expansion", "ma_expand", 50, "flag-bull"],
    ["dist_200", "Distance from 200-day MA", "dist_200", 200, "pct"],
    ["ma_trend", "MA trend direction", "ma_trend", 200, "trend"],
  ].map(([id, name, key, req, kind]) => ({
    id: String(id),
    category: "Trend",
    name: String(name),
    key: String(key),
    required: Number(req),
    kind: kind as Spec["kind"],
    calc: String(name),
    desc: String(name),
    higherBetter: true,
  }));

  const patterns: Spec[] = [
    ["doji", "Doji"],
    ["hammer", "Hammer"],
    ["inv_hammer", "Inverted Hammer"],
    ["shooting", "Shooting Star"],
    ["bull_engulf", "Bullish Engulfing"],
    ["bear_engulf", "Bearish Engulfing"],
    ["morning", "Morning Star"],
    ["evening", "Evening Star"],
    ["harami", "Harami"],
    ["soldiers", "Three White Soldiers"],
    ["crows", "Three Black Crows"],
    ["marubozu", "Marubozu"],
    ["inside", "Inside Bar"],
    ["outside", "Outside Bar"],
    ["pin", "Pin Bar"],
    ["tweezer_top", "Tweezer Top"],
    ["tweezer_bot", "Tweezer Bottom"],
    ["bull_flag", "Bull Flag"],
    ["bear_flag", "Bear Flag"],
    ["asc_tri", "Ascending Triangle"],
    ["desc_tri", "Descending Triangle"],
  ].map(([id, name]) => ({
    id,
    category: "Patterns",
    name,
    key: id,
    required: 3,
    kind: id.includes("bear") || id.includes("shoot") || id === "evening" || id === "crows" || id === "tweezer_top" || id === "desc_tri" ? "flag-bear" : "flag-bull",
    calc: "OHLC geometry on the last 1–3 bars; structural flags also require the 20-bar trend/width conditions",
    desc: `${name} detected only when the documented candle/structure rules are met`,
    higherBetter: !String(id).includes("bear") && id !== "shooting" && id !== "evening" && id !== "crows" && id !== "tweezer_top" && id !== "desc_tri",
  }));

  return [...price, ...mas, ...vs, ...slopes, ...mom, ...vol, ...volume, ...sr, ...structure, ...maStruct, ...patterns];
}

export const COMPARE_SPECS = specs();

function signalFor(spec: Spec, v: number | null): CompareSignal {
  if (v == null) return "INSUFFICIENT DATA";
  if (spec.kind === "osc") return classifyOscillator(v);
  if (spec.kind === "trend" || spec.kind === "pct") return classifyTrend(v);
  if (spec.kind === "flag-bull") return v > 0 ? "BULLISH" : "NEUTRAL";
  if (spec.kind === "flag-bear") return v > 0 ? "BEARISH" : "NEUTRAL";
  if (spec.key === "adx" || spec.key === "adxr" || spec.key === "struct_consistency") {
    if (v >= 25) return "BULLISH";
    if (v >= 18) return "NEUTRAL";
    return "MIXED";
  }
  if (spec.key === "chop") return v > 61 ? "NEUTRAL" : v < 38 ? "BULLISH" : "MIXED";
  if (spec.key === "williams") return classifyOscillator(v + 100, 80, 20, 50);
  if (spec.key === "cci") return v > 100 ? "OVEREXTENDED" : v > 0 ? "BULLISH" : v > -100 ? "BEARISH" : "OVEREXTENDED";
  if (spec.key === "bb_pctb") return v > 1 ? "OVEREXTENDED" : v > 0.6 ? "BULLISH" : v > 0.4 ? "NEUTRAL" : v > 0 ? "BEARISH" : "OVEREXTENDED";
  if (spec.kind === "price" && spec.higherBetter) return "NEUTRAL";
  return "NEUTRAL";
}

function interpret(spec: Spec, v: number | null, signal: CompareSignal) {
  if (v == null) return `INSUFFICIENT DATA for ${spec.name}.`;
  return `${spec.desc}. Value ${typeof v === "number" ? v.toFixed(4) : v}. Classified ${signal} using the documented ${spec.kind} rules — not a predicted return.`;
}

export function cellsFromSnap(snap: SeriesSnap): Record<string, CompareCell> {
  const out: Record<string, CompareCell> = {};
  for (const spec of COMPARE_SPECS) {
    const v = snap.values[spec.key] ?? null;
    const signal = signalFor(spec, v);
    const display = spec.kind === "pct" ? pct(v) : spec.kind === "flag-bull" || spec.kind === "flag-bear" ? (v ? "Yes" : "No") : px(v);
    out[spec.id] = cell(v, display, signal, interpret(spec, v, signal), snap.bars, spec.required);
  }
  return out;
}

function scoreFromSignal(s: CompareSignal): number | null {
  switch (s) {
    case "STRONG BULLISH":
      return 100;
    case "BULLISH":
      return 82;
    case "MODERATELY BULLISH":
      return 68;
    case "NEUTRAL":
      return 50;
    case "MIXED":
      return 50;
    case "OVEREXTENDED":
      return 55;
    case "MODERATELY BEARISH":
      return 32;
    case "BEARISH":
      return 18;
    case "STRONG BEARISH":
      return 0;
    default:
      return null;
  }
}

export function categoryScores(cells: Record<string, CompareCell>) {
  const cats: Record<string, number | null> = {};
  for (const cat of Object.keys(CATEGORY_WEIGHTS)) {
    const rows = COMPARE_SPECS.filter((s) => s.category === cat);
    const scores = rows.map((s) => scoreFromSignal(cells[s.id]?.signal)).filter((x): x is number => x != null);
    cats[cat] = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }
  return cats;
}

export function overallScore(cats: Record<string, number | null>) {
  let acc = 0;
  let w = 0;
  const breakdown: { category: string; score: number | null; weight: number }[] = [];
  for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const score = cats[category] ?? null;
    breakdown.push({ category, score, weight });
    if (score != null) {
      acc += score * weight;
      w += weight;
    }
  }
  return { score: w > 0 ? Math.round(acc / w) : null, breakdown };
}

export function headlineFromScore(score: number | null, cells: Record<string, CompareCell>): CompareSignal {
  if (score == null) return "INSUFFICIENT DATA";
  const rsi = cells.rsi14?.value;
  if (typeof rsi === "number" && rsi >= 80 && score >= 70) return "OVEREXTENDED";
  if (score >= 85) return "STRONG BULLISH";
  if (score >= 70) return "BULLISH";
  if (score >= 60) return "MODERATELY BULLISH";
  if (score >= 45) return "NEUTRAL";
  if (score >= 40) return "MIXED";
  if (score >= 30) return "MODERATELY BEARISH";
  if (score >= 15) return "BEARISH";
  return "STRONG BEARISH";
}

export function distributionOf(cells: Record<string, CompareCell>) {
  const dist: Record<string, number> = {
    Bullish: 0,
    Bearish: 0,
    Neutral: 0,
    Mixed: 0,
    Overextended: 0,
    "Insufficient Data": 0,
  };
  for (const c of Object.values(cells)) {
    if (c.signal.includes("BULLISH")) dist.Bullish += 1;
    else if (c.signal.includes("BEARISH")) dist.Bearish += 1;
    else if (c.signal === "MIXED") dist.Mixed += 1;
    else if (c.signal === "OVEREXTENDED") dist.Overextended += 1;
    else if (c.signal === "INSUFFICIENT DATA") dist["Insufficient Data"] += 1;
    else dist.Neutral += 1;
  }
  return dist;
}

export function confidenceOf(cells: Record<string, CompareCell>, bars: number, cats: Record<string, number | null>) {
  const vals = Object.values(cells);
  const valid = vals.filter((c) => c.signal !== "INSUFFICIENT DATA").length;
  const completeness = vals.length ? valid / vals.length : 0;
  const data = Math.min(1, bars / 200);
  const catVals = Object.values(cats).filter((x): x is number => x != null);
  const mean = catVals.length ? catVals.reduce((a, b) => a + b, 0) / catVals.length : 50;
  const variance = catVals.length ? catVals.reduce((a, b) => a + (b - mean) ** 2, 0) / catVals.length : 0;
  const agreement = Math.max(0, 1 - Math.sqrt(variance) / 50);
  return Math.round(100 * (0.4 * completeness + 0.3 * data + 0.3 * agreement));
}

export function toCard(snap: SeriesSnap, error: string | null): CompareTickerCard {
  if (error) {
    return {
      symbol: snap.symbol,
      name: snap.name,
      signal: "INSUFFICIENT DATA",
      score: null,
      confidence: null,
      categories: {},
      scoreBreakdown: Object.entries(CATEGORY_WEIGHTS).map(([category, weight]) => ({ category, score: null, weight })),
      distribution: {},
      error,
    };
  }
  const cells = cellsFromSnap(snap);
  const cats = categoryScores(cells);
  const overall = overallScore(cats);
  return {
    symbol: snap.symbol,
    name: snap.name,
    signal: headlineFromScore(overall.score, cells),
    score: overall.score,
    confidence: confidenceOf(cells, snap.bars, cats),
    categories: cats,
    scoreBreakdown: overall.breakdown,
    distribution: distributionOf(cells),
    error: null,
  };
}

export function relativeLabel(spec: Spec, a: CompareCell, b: CompareCell, s1: string, s2: string): CompareRelative {
  if (a.signal === "INSUFFICIENT DATA" || b.signal === "INSUFFICIENT DATA") return "Not Directly Comparable";
  if (spec.higherBetter === false && (spec.kind === "price" || spec.category === "Volatility" || spec.category === "Support/Resistance")) {
    return "Not Directly Comparable";
  }
  if (spec.kind === "flag-bull" || spec.kind === "flag-bear") {
    if (a.display === b.display) return "Comparable";
    return a.display === "Yes" ? s1 : s2;
  }
  if (typeof a.value === "number" && typeof b.value === "number") {
    if (Math.abs(a.value - b.value) < 1e-6) return "Comparable";
    if (spec.higherBetter === false) return "Not Directly Comparable";
    return a.value > b.value ? s1 : s2;
  }
  return "Mixed";
}

export function buildRows(a: SeriesSnap, b: SeriesSnap): CompareIndicatorRow[] {
  const ca = cellsFromSnap(a);
  const cb = cellsFromSnap(b);
  const rows = COMPARE_SPECS.map((spec) => ({
    id: spec.id,
    category: spec.category,
    name: spec.name,
    description: spec.desc,
    calculation: spec.calc,
    requiredPeriods: spec.required,
    t1: ca[spec.id],
    t2: cb[spec.id],
    relative: relativeLabel(spec, ca[spec.id], cb[spec.id], a.symbol, b.symbol),
  }));
  const min = Math.min(a.close.length, b.close.length);
  const r1 = a.close.slice(-min).map((c, i, arr) => (i === 0 || !arr[i - 1] ? 0 : c / arr[i - 1] - 1)).slice(1);
  const r2 = b.close.slice(-min).map((c, i, arr) => (i === 0 || !arr[i - 1] ? 0 : c / arr[i - 1] - 1)).slice(1);
  const corr = pearson(r1, r2);
  const roll = rollingCorrelation(r1, r2, 20);
  const beta = betaOf(r1, r2);
  const ratio = a.close[a.close.length - 1] && b.close[b.close.length - 1] ? a.close[a.close.length - 1] / b.close[b.close.length - 1] : null;
  const rsTrend = a.values.ret_20 != null && b.values.ret_20 != null ? a.values.ret_20 - b.values.ret_20 : null;
  const va1 = a.values.ret_20 != null && a.values.hv ? a.values.ret_20 / a.values.hv : null;
  const va2 = b.values.ret_20 != null && b.values.hv ? b.values.ret_20 / b.values.hv : null;
  const pair = (
    id: string,
    name: string,
    t1v: number | null,
    t2v: number | null,
    calc: string,
    higherBetter: boolean,
    required: number,
  ): CompareIndicatorRow => {
    const spec: Spec = { id, category: "Relative Strength", name, key: id, required, kind: "raw", calc, desc: name, higherBetter };
    const t1 = cell(t1v, px(t1v, 3), t1v == null ? "INSUFFICIENT DATA" : "NEUTRAL", `${name} uses aligned closes from both series.`, min, required);
    const t2 = cell(t2v, px(t2v, 3), t2v == null ? "INSUFFICIENT DATA" : "NEUTRAL", `${name} uses aligned closes from both series.`, min, required);
    return { id, category: "Relative Strength", name, description: name, calculation: calc, requiredPeriods: required, t1, t2, relative: relativeLabel(spec, t1, t2, a.symbol, b.symbol) };
  };
  rows.push(
    pair("rs_ratio", "Relative strength ratio", ratio, 1, "Last close A / last close B", false, 2),
    pair("rs_trend", "Relative strength trend (20D)", rsTrend, rsTrend == null ? null : -rsTrend, "20-bar return spread", true, 21),
    pair("corr", "Correlation", corr, corr, "Pearson of overlapping returns", false, 20),
    pair("roll_corr", "Rolling correlation (20)", roll, roll, "Last 20-return Pearson", false, 40),
    pair("beta", "Beta vs ticker 2", beta, 1, "Cov(r1,r2)/Var(r2)", false, 20),
    pair("vol_adj_ret", "Volatility-adjusted 20D return", va1, va2, "20-bar return / historical volatility", true, 22),
  );
  return rows;
}

export function relativePerformance(a: SeriesSnap, b: SeriesSnap) {
  const keys: [string, string][] = [
    ["1D", "ret_1"],
    ["5D", "ret_5"],
    ["10D", "ret_10"],
    ["20D", "ret_20"],
    ["1M", "ret_21"],
    ["3M", "ret_63"],
    ["6M", "ret_126"],
    ["YTD", "ret_ytd"],
    ["1Y", "ret_252"],
  ];
  const rows = keys.map(([label, key]) => ({
    label,
    t1: pct(a.values[key] ?? null),
    t2: pct(b.values[key] ?? null),
  }));
  const min = Math.min(a.close.length, b.close.length);
  const r1 = a.close.slice(-min).map((c, i, arr) => (i === 0 || !arr[i - 1] ? 0 : c / arr[i - 1] - 1)).slice(1);
  const r2 = b.close.slice(-min).map((c, i, arr) => (i === 0 || !arr[i - 1] ? 0 : c / arr[i - 1] - 1)).slice(1);
  const ratio = a.close[a.close.length - 1] && b.close[b.close.length - 1] ? a.close[a.close.length - 1] / b.close[b.close.length - 1] : null;
  const corr = pearson(r1, r2);
  const roll = rollingCorrelation(r1, r2, 20);
  const beta = betaOf(r1, r2);
  const rsTrend = a.values.ret_20 != null && b.values.ret_20 != null ? a.values.ret_20 - b.values.ret_20 : null;
  const va1 = a.values.ret_20 != null && a.values.hv ? a.values.ret_20 / a.values.hv : null;
  const va2 = b.values.ret_20 != null && b.values.hv ? b.values.ret_20 / b.values.hv : null;
  rows.push({ label: "Relative strength ratio", t1: px(ratio, 4), t2: "1.00" });
  rows.push({ label: "Relative strength trend (20D spread)", t1: pct(rsTrend), t2: pct(rsTrend != null ? -rsTrend : null) });
  rows.push({ label: "Correlation", t1: px(corr, 3), t2: px(corr, 3) });
  rows.push({ label: "Rolling correlation (20)", t1: px(roll, 3), t2: px(roll, 3) });
  rows.push({ label: "Beta vs ticker 2", t1: px(beta, 3), t2: "1.00" });
  rows.push({ label: "Volatility-adjusted 20D return", t1: px(va1, 3), t2: px(va2, 3) });
  return rows;
}

export function chartPoints(snap: SeriesSnap) {
  const ema20 = ema(snap.close, 20);
  const ema50 = ema(snap.close, 50);
  const ema200 = ema(snap.close, 200);
  const rsi14 = rsi(snap.close, 14);
  const [macdLine] = macd(snap.close);
  return snap.close.map((c, i) => ({
    time: Math.floor(snap.stamps[i].getTime() / 1000),
    close: c,
    ema20: ema20[i],
    ema50: ema50[i],
    ema200: ema200[i],
    volume: snap.volume[i] || 0,
    rsi: rsi14[i],
    macd: macdLine[i],
  }));
}

export function lightweightTrend(bars: OHLCVBar[]): CompareSignal {
  if (bars.length < 15) return "INSUFFICIENT DATA";
  const snap = buildSnapshot("x", "x", bars);
  const cells = cellsFromSnap(snap);
  const cats = categoryScores(cells);
  return headlineFromScore(overallScore(cats).score, cells);
}

export { lastNum };
