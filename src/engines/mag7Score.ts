import { atr, ema, last, macd, rsi } from "@/src/engines/indicators";
import type { Frame, Num } from "@/src/lib/series";
import { sma, withColumns } from "@/src/lib/series";

export const MAG7: [string, string][] = [
  ["NVDA", "NVIDIA"],
  ["MSFT", "Microsoft"],
  ["META", "Meta Platforms"],
  ["AAPL", "Apple"],
  ["AMZN", "Amazon"],
  ["GOOGL", "Alphabet"],
  ["TSLA", "Tesla"],
];
export const MAG7_SYMBOLS = MAG7.map(([s]) => s);
export const BENCH: Record<string, string> = { SPY: "SPY", QQQ: "QQQ", SOXX: "SOXX", VIX: "^VIX", NDX: "^IXIC" };
export const PERIOD_BARS: Record<string, number> = { "1W": 5, "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "3Y": 756, "5Y": 1260 };

export function retPct(closes: number[], timestamps: Date[], bars: number): number | null {
  const s = closes.filter((_, i) => Number.isFinite(closes[i]));
  if (s.length < bars + 1) return null;
  const a = s[s.length - 1];
  const b = s[s.length - 1 - bars];
  if (!b) return null;
  return (a / b - 1) * 100;
}

export function ytdPct(closes: number[], timestamps: Date[]): number | null {
  if (!closes.length || !timestamps.length) return null;
  const year = timestamps[timestamps.length - 1].getUTCFullYear();
  let first: number | null = null;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i].getUTCFullYear() === year && Number.isFinite(closes[i])) {
      first = closes[i];
      break;
    }
  }
  const lastClose = closes[closes.length - 1];
  if (first == null || !first) return null;
  return (lastClose / first - 1) * 100;
}

export function histVol(closes: number[], window: number): number | null {
  if (closes.length < window + 2) return null;
  const logs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) logs.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (logs.length < window) return null;
  const slice = logs.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export function roc(closes: number[], timestamps: Date[], period = 21): number | null {
  return retPct(closes, timestamps, period);
}

export function normalizeTo100(closes: { time: number; close: number }[]): { time: number; value: number }[] {
  if (!closes.length) return [];
  const base = closes[0].close;
  if (!base) return [];
  return closes.map((p) => ({ time: p.time, value: Math.round((p.close / base) * 100 * 10000) / 10000 }));
}

export function sliceCloses(closes: number[], timestamps: Date[], rangeKey: string): { time: number; close: number }[] {
  if (!closes.length) return [];
  const key = (rangeKey || "1M").toUpperCase();
  let start = 0;
  if (key === "YTD") {
    const year = timestamps[timestamps.length - 1].getUTCFullYear();
    start = timestamps.findIndex((t) => t.getUTCFullYear() === year);
    if (start < 0) start = 0;
  } else {
    const n = PERIOD_BARS[key];
    if (n) start = Math.max(0, closes.length - (n + 1));
  }
  const out: { time: number; close: number }[] = [];
  for (let i = start; i < closes.length; i++) {
    if (Number.isFinite(closes[i])) out.push({ time: Math.floor(timestamps[i].getTime() / 1000), close: closes[i] });
  }
  return out;
}

function rsiPoints(value: number | null): [number, string] {
  if (value == null) return [0, "Unavailable"];
  if (value >= 70) return [7, "Overbought"];
  if (value >= 50) return [10, "Bullish momentum"];
  if (value >= 30) return [4, "Weak"];
  return [2, "Oversold"];
}

function macdPoints(line: number | null, signal: number | null, hist: number | null): [number, string] {
  if (line == null || signal == null || hist == null) return [0, "Unavailable"];
  if (hist > 0 && line > signal) return [5, "Bullish"];
  if (hist < 0 && line < signal) return [0, "Bearish"];
  return [2, "Neutral"];
}

function rocPoints(value: number | null): number {
  if (value == null) return 0;
  if (value >= 8) return 5;
  if (value >= 3) return 4;
  if (value > 0) return 3;
  if (value > -5) return 1;
  return 0;
}

function relVolPoints(ratio: number | null): number {
  if (ratio == null) return 0;
  if (ratio >= 1.5) return 5;
  if (ratio >= 1) return 3;
  if (ratio >= 0.7) return 1;
  return 0;
}

export function scoreTrend(price: number, ema20: number | null, ema50: number | null, ema200: number | null) {
  let pts = 0;
  const checks = {
    price_gt_ema20: ema20 != null && price > ema20,
    price_gt_ema50: ema50 != null && price > ema50,
    price_gt_ema200: ema200 != null && price > ema200,
    ema20_gt_ema50: ema20 != null && ema50 != null && ema20 > ema50,
    ema50_gt_ema200: ema50 != null && ema200 != null && ema50 > ema200,
  };
  for (const ok of Object.values(checks)) if (ok) pts += 5;
  let alignment = "Neutral";
  if (ema20 && ema50 && ema200 && price > ema20 && ema20 > ema50 && ema50 > ema200) alignment = "Bullish";
  else if (ema20 && ema50 && ema200 && price < ema20 && ema20 < ema50 && ema50 < ema200) alignment = "Bearish";
  return { points: pts, max: 25, alignment, ...checks };
}

export function scoreVolume(frame: Frame) {
  const v = frame.get("volume") as Num[];
  const c = frame.get("close") as Num[];
  const sma20 = sma(v, 20);
  const avg20 = last(sma20);
  const today = v.length ? (v[v.length - 1] as number | null) : null;
  const ratio = today && avg20 ? today / avg20 : null;
  const volPts = relVolPoints(ratio);
  let trendPts = 0;
  const finiteV = v.filter((x): x is number => x != null);
  if (finiteV.length >= 20) {
    const recent = finiteV.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const priorSlice = finiteV.slice(-20, -5);
    const prior = priorSlice.length ? priorSlice.reduce((a, b) => a + b, 0) / priorSlice.length : recent;
    if (prior > 0 && recent > prior * 1.05) trendPts = 5;
    else if (prior > 0 && recent > prior * 0.9) trendPts = 2;
  }
  let upPts = 0;
  let upShare: number | null = null;
  const finiteC = c.filter((x): x is number => x != null);
  if (finiteC.length >= 21 && finiteV.length >= 21) {
    let up = 0;
    let tot = 0;
    const start = Math.max(1, finiteC.length - 20);
    for (let i = start; i < finiteC.length; i++) {
      const vol = finiteV[i] ?? 0;
      tot += vol;
      if (finiteC[i] > finiteC[i - 1]) up += vol;
    }
    if (tot > 0) {
      upShare = up / tot;
      if (upShare >= 0.55) upPts = 5;
      else if (upShare >= 0.45) upPts = 2;
    }
  }
  const change = finiteC.length > 1 ? finiteC[finiteC.length - 1] - finiteC[finiteC.length - 2] : 0;
  let confirm = "Neutral";
  if (ratio != null && ratio >= 1.2 && change > 0) confirm = "Bullish confirmation";
  else if (ratio != null && ratio >= 1.2 && change < 0) confirm = "Bearish pressure";
  else if (ratio != null && ratio < 0.8 && change > 0) confirm = "Weak rally";
  else if (ratio != null && ratio < 0.8 && change < 0) confirm = "Weak selling";
  return {
    points: volPts + trendPts + upPts,
    max: 15,
    relative_volume: ratio,
    volume: today,
    avg_volume_20: avg20,
    up_volume_share: upShare,
    confirm,
  };
}

export function scoreVolatility(frame: Frame, price: number) {
  const h = frame.get("high");
  const l = frame.get("low");
  const c = frame.get("close");
  const atrV = last(atr(h, l, c, 14));
  const atrPct = atrV && price ? (atrV / price) * 100 : null;
  const closes = c.filter((x): x is number => x != null);
  const hv20 = histVol(closes, 20);
  const hv30 = histVol(closes, 30);
  const hv60 = histVol(closes, 60);
  let atrPts = 0;
  if (atrPct != null) {
    if (atrPct >= 1 && atrPct <= 3.5) atrPts = 5;
    else if (atrPct < 1 || atrPct <= 5) atrPts = 3;
    else atrPts = 1;
  }
  let expPts = 0;
  let expansion: number | null = null;
  if (hv20 != null && hv60 != null && hv60 > 0) {
    expansion = hv20 / hv60;
    if (expansion < 0.9) expPts = 5;
    else if (expansion <= 1.15) expPts = 3;
    else expPts = 1;
  }
  const atrS = atr(h, l, c, 14).filter((x): x is number => x != null);
  let atrTrend = "Stable";
  let atrTrendPts = 2;
  if (atrS.length >= 10) {
    const now = atrS[atrS.length - 1];
    const prev = atrS[atrS.length - 10];
    if (prev > 0) {
      if (now > prev * 1.08) {
        atrTrend = "Rising";
        atrTrendPts = 1;
      } else if (now < prev * 0.92) {
        atrTrend = "Falling";
        atrTrendPts = 5;
      } else {
        atrTrend = "Stable";
        atrTrendPts = 3;
      }
    }
  }
  let label = "Unavailable";
  if (hv20 != null && hv20 >= 55) label = "Very High";
  else if (hv20 != null && hv20 >= 40) label = "High";
  else if (hv20 != null && hv20 >= 25) label = "Moderate";
  else if (hv20 != null) label = "Lower";
  return {
    points: atrPts + expPts + atrTrendPts,
    max: 15,
    atr: atrV,
    atr_pct: atrPct,
    hv20,
    hv30,
    hv60,
    trend: atrTrend,
    label,
    expansion,
  };
}

export function scoreRisk(vol: Record<string, unknown>, price: number, ema50: number | null, ema200: number | null, volume: Record<string, unknown>): number {
  let risk = 0;
  const atrPct = vol.atr_pct as number | null;
  if (atrPct != null) risk += Math.min(35, Math.max(6, atrPct * 7));
  const hv20 = vol.hv20 as number | null;
  if (hv20 != null) risk += Math.min(25, hv20 * 0.4);
  const exp = vol.expansion as number | null;
  if (exp != null && exp > 1.15) risk += 15;
  else if (exp != null && exp > 1) risk += 8;
  if (ema50 != null && price < ema50) risk += 10;
  if (ema200 != null && price < ema200) risk += 15;
  const share = volume.up_volume_share as number | null;
  if (share != null && share < 0.4) risk += 10;
  return Math.min(100, Math.max(5, Math.trunc(risk)));
}

export function detectCrosses(frame: Frame): string[] {
  const notes: string[] = [];
  const e50 = frame.get("ema50");
  const e200 = frame.get("ema200");
  const px = frame.get("close");
  const p20 = frame.get("ema20");
  if (!e50.length || !e200.length || frame.rows.length < 3) return notes;
  const look = Math.min(6, frame.rows.length - 1);
  const last50 = e50[e50.length - 1];
  const last200 = e200[e200.length - 1];
  if (last50 != null && last200 != null) {
    const nowGt = last50 > last200;
    const prev50 = e50[e50.length - 1 - look];
    const prev200 = e200[e200.length - 1 - look];
    const prev = prev50 != null && prev200 != null ? prev50 > prev200 : nowGt;
    if (nowGt && !prev) notes.push("Golden Cross");
    if (!nowGt && prev) notes.push("Death Cross");
  }
  for (const [name, series] of [["20 EMA", p20], ["50 EMA", e50], ["200 EMA", e200]] as const) {
    if (series.length < 2 || series[series.length - 1] == null || series[series.length - 2] == null) continue;
    const above = (px[px.length - 1] as number) > (series[series.length - 1] as number);
    const was = (px[px.length - 2] as number) > (series[series.length - 2] as number);
    if (above && !was) notes.push(`Price crossed above ${name}`);
    if (!above && was) notes.push(`Price crossed below ${name}`);
  }
  return notes;
}

export function enrichFrame(frame: Frame): Frame {
  const c = frame.get("close");
  const [line, sig, hist] = macd(c);
  return withColumns(frame, {
    ema20: ema(c, 20),
    ema50: ema(c, 50),
    ema100: ema(c, 100),
    ema200: ema(c, 200),
    rsi: rsi(c, 14),
    macd: line,
    macd_signal: sig,
    macd_hist: hist,
  });
}

export function analyzeStock(
  symbol: string,
  name: string,
  frame: Frame,
  quote: Record<string, unknown>,
  benches: Record<string, { closes: number[]; timestamps: Date[] }>,
): Record<string, unknown> | null {
  if (!frame || frame.empty || frame.rows.length < 30) return null;
  const framed = enrichFrame(frame);
  const price = Number(quote.price ?? framed.rows[framed.rows.length - 1].close);
  const ema20 = last(framed.get("ema20"));
  const ema50 = last(framed.get("ema50"));
  const ema100 = last(framed.get("ema100"));
  const ema200 = last(framed.get("ema200"));
  const rsiV = last(framed.get("rsi"));
  const macdV = last(framed.get("macd"));
  const macdSig = last(framed.get("macd_signal"));
  const macdH = last(framed.get("macd_hist"));
  const closes = framed.get("close").filter((x): x is number => x != null);
  const timestamps = framed.timestamps();
  const rocV = roc(closes, timestamps, 21);
  const trend = scoreTrend(price, ema20, ema50, ema200);
  const [rsiPts, rsiLabel] = rsiPoints(rsiV);
  const [macdPts, macdLabel] = macdPoints(macdV, macdSig, macdH);
  const rocPts = rocPoints(rocV);
  const stock1m = retPct(closes, timestamps, 21);
  let spyRs: number | null = null;
  let qqqRs: number | null = null;
  let ndxRs: number | null = null;
  if (stock1m != null) {
    const spy1m = benches.SPY ? retPct(benches.SPY.closes, benches.SPY.timestamps, 21) : null;
    const qqq1m = benches.QQQ ? retPct(benches.QQQ.closes, benches.QQQ.timestamps, 21) : null;
    const ndx1m = benches.NDX ? retPct(benches.NDX.closes, benches.NDX.timestamps, 21) : null;
    spyRs = spy1m != null ? stock1m - spy1m : null;
    qqqRs = qqq1m != null ? stock1m - qqq1m : null;
    ndxRs = ndx1m != null ? stock1m - ndx1m : null;
  }
  let rsPts = 0;
  if (qqqRs != null && spyRs != null) {
    if (qqqRs > 0 && spyRs > 0) rsPts = 5;
    else if (qqqRs > 0 || spyRs > 0) rsPts = 3;
  }
  const momentum = {
    points: rsiPts + macdPts + rocPts + rsPts,
    max: 25,
    rsi: rsiV,
    rsi_label: rsiLabel,
    macd: macdV,
    macd_signal: macdSig,
    macd_hist: macdH,
    macd_label: macdLabel,
    roc: rocV,
    rs_spy: spyRs,
    rs_qqq: qqqRs,
    rs_ndx: ndxRs,
  };
  const volume = scoreVolume(framed);
  const vola = scoreVolatility(framed, price);
  const risk = scoreRisk(vola, price, ema50, ema200, volume);
  const performance = {
    today: quote.change_percent ?? null,
    "1W": retPct(closes, timestamps, 5),
    "1M": retPct(closes, timestamps, 21),
    "3M": retPct(closes, timestamps, 63),
    "6M": retPct(closes, timestamps, 126),
    YTD: ytdPct(closes, timestamps),
    "1Y": retPct(closes, timestamps, 252),
    "3Y": retPct(closes, timestamps, 756),
    "5Y": retPct(closes, timestamps, 1260),
  };
  const spark = closes.slice(-20);
  const momLabel = momentum.points >= 18 ? "Strong" : momentum.points >= 11 ? "Moderate" : "Weak";
  return {
    symbol,
    name: name || (quote.name as string) || symbol,
    price,
    change: quote.change,
    change_percent: quote.change_percent,
    spark,
    source: quote.source,
    trend,
    momentum,
    volume,
    volatility: vola,
    performance,
    emas: { ema20, ema50, ema100, ema200 },
    crosses: detectCrosses(framed),
    risk_score: risk,
    momentum_label: momLabel,
    closes: closes.map((v, i) => ({ time: Math.floor(timestamps[i].getTime() / 1000), close: v })),
  };
}

export function applyPerformancePoints(rows: Record<string, unknown>[]): void {
  const periods = ["1W", "1M", "3M", "6M", "1Y"];
  for (const row of rows) {
    row.performance_points = 0;
    row.performance_max = 20;
  }
  for (const period of periods) {
    const ranked = rows
      .filter((r) => (r.performance as Record<string, number | null>)?.[period] != null)
      .sort((a, b) => ((b.performance as Record<string, number>)[period] ?? 0) - ((a.performance as Record<string, number>)[period] ?? 0));
    ranked.forEach((r, i) => {
      const val = (r.performance as Record<string, number>)[period];
      let pts = 0;
      if (val != null && val > 0) {
        pts = 2;
        if (i === 0) pts = 4;
        else if (i <= 2) pts = 3;
      }
      r.performance_points = (r.performance_points as number) + pts;
    });
  }
}

export function buildWhy(r: Record<string, unknown>): string {
  const t = r.trend as Record<string, unknown>;
  const m = r.momentum as Record<string, unknown>;
  const v = r.volume as Record<string, unknown>;
  const vol = r.volatility as Record<string, unknown>;
  const bits: string[] = [];
  if (t.alignment === "Bullish") bits.push("price is stacked above the 20/50/200 EMA");
  else if (t.alignment === "Bearish") bits.push("price is below a bearish EMA stack");
  else bits.push("moving averages are mixed");
  if (m.macd_label === "Bullish") bits.push("MACD remains positive");
  else if (m.macd_label === "Bearish") bits.push("MACD is negative");
  if (m.rs_qqq != null) {
    if ((m.rs_qqq as number) > 0) bits.push(`it is outperforming QQQ by ${(m.rs_qqq as number).toFixed(1)} percentage points over 1M`);
    else bits.push(`it is underperforming QQQ by ${Math.abs(m.rs_qqq as number).toFixed(1)} percentage points over 1M`);
  }
  if (v.relative_volume != null) {
    bits.push(`relative volume is ${(v.relative_volume as number).toFixed(2)}x the 20-day average (${String(v.confirm).toLowerCase()})`);
  }
  if (vol.label) bits.push(`volatility is ${String(vol.label).toLowerCase()}`);
  const lead = `${r.symbol} — ${r.strength}/100. ${r.rank === 1 ? "Strongest Magnificent 7 stock. " : r.rank === 7 ? "Weakest Magnificent 7 stock. " : ""}`;
  return lead + (bits[0] ? bits[0][0].toUpperCase() + bits[0].slice(1) : "") + (bits.length > 1 ? ", " + bits.slice(1).join(", ") : "") + ".";
}

export function finalizeScores(rows: Record<string, unknown>[]): void {
  applyPerformancePoints(rows);
  const ones = rows.map((r) => (r.performance as Record<string, number | null>)?.["1M"]).filter((x): x is number => x != null);
  const basket1m = ones.length ? ones.reduce((a, b) => a + b, 0) / ones.length : null;
  for (const r of rows) {
    const strength =
      ((r.trend as { points: number }).points || 0) +
      ((r.momentum as { points: number }).points || 0) +
      ((r.volume as { points: number }).points || 0) +
      ((r.volatility as { points: number }).points || 0) +
      ((r.performance_points as number) || 0);
    r.strength = Math.min(100, Math.trunc(strength));
    r.components = {
      trend: (r.trend as { points: number }).points,
      momentum: (r.momentum as { points: number }).points,
      volume: (r.volume as { points: number }).points,
      volatility: (r.volatility as { points: number }).points,
      performance: r.performance_points,
    };
    const s = r.strength as number;
    r.signal = s >= 80 ? "STRONG" : s >= 68 ? "BULLISH" : s >= 52 ? "NEUTRAL" : "WEAK";
    const m1 = (r.performance as Record<string, number | null>)["1M"];
    (r.momentum as Record<string, unknown>).rs_mag7 = m1 != null && basket1m != null ? m1 - basket1m : null;
  }
  rows.sort((a, b) => (b.strength as number) - (a.strength as number) || String(a.symbol).localeCompare(String(b.symbol)));
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.why = buildWhy(r);
  });
}

export function categories(rows: Record<string, unknown>[]): Record<string, string | null> {
  if (!rows.length) return {};
  const pick = (fn: (r: Record<string, unknown>) => number | null, reverse = true) => {
    const eligible = rows.filter((r) => fn(r) != null);
    if (!eligible.length) return null;
    return eligible.reduce((best, cur) => {
      const bv = fn(best) as number;
      const cv = fn(cur) as number;
      return reverse ? (cv > bv ? cur : best) : cv < bv ? cur : best;
    })["symbol"] as string;
  };
  return {
    best_overall: rows[0].symbol as string,
    best_momentum: pick((r) => (r.momentum as { points: number }).points),
    best_trend: pick((r) => (r.trend as { points: number }).points),
    best_volume: pick((r) => (r.volume as { points: number }).points),
    lowest_volatility: pick((r) => (r.volatility as { atr_pct?: number | null }).atr_pct ?? null, false),
    best_1m: pick((r) => (r.performance as Record<string, number | null>)["1M"]),
    best_1y: pick((r) => (r.performance as Record<string, number | null>)["1Y"]),
    highest_risk: pick((r) => r.risk_score as number),
  };
}

export function marketTone(rows: Record<string, unknown>[], spyChg: number | null, qqqChg: number | null): string {
  if (!rows.length) return "UNAVAILABLE";
  const strong = rows.filter((r) => (r.strength as number) >= 68).length;
  const weak = rows.filter((r) => (r.strength as number) < 52).length;
  if (strong >= 4 && (qqqChg || 0) >= 0) return "BULLISH";
  if (weak >= 4 || (qqqChg != null && qqqChg < -1 && spyChg != null && spyChg < -1)) return "BEARISH";
  return "MIXED";
}
