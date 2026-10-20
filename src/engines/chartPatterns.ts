import { structureFlags, swingPoints } from "@/src/engines/indicators";
import type { OHLCVBar } from "@/src/types/domain";
import {
  analyzeChartPattern,
  overviewDecisionFromSignal,
  tradeDecisionFromSignal,
  type PatternAnalysis,
} from "@/src/engines/patternEngine";

export type PatternBias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type PatternDecision = "Entry" | "Wait" | "Avoid";
export type OverviewDecision = "BUY / ENTER" | "SELL / ENTER" | "WAIT" | "AVOID";
export type TradeDecision = "ENTER" | "ENTER SWING TRADE" | "WAIT FOR BREAKOUT" | "AVOID / NO TRADE";
export type PatternFamily = "reversal" | "continuation" | "candlestick" | "gap" | "structure";
export type PatternTradeStyle = "day" | "swing";

export type ChartPatternDef = {
  id: string;
  name: string;
  bias: PatternBias;
  family: PatternFamily;
};

export type PatternHit = {
  id: string;
  name: string;
  bias: PatternBias;
  family: PatternFamily;
  status: string;
  quality: number;
  recency: number;
  endIndex: number;
};

export type PrimaryPattern = {
  id: string;
  name: string;
  bias: PatternBias;
  status: string;
  market_structure: string;
  decision: PatternDecision;
  evaluated: number;
  analysis?: PatternAnalysis;
};

export type PatternLevels = {
  entry: number;
  entryLow: number;
  entryHigh: number;
  preferred: number;
  stop: number;
  target1: number;
  target2: number;
  target3: number;
  entryHint: "above" | "below" | "at";
};

export const CHART_PATTERN_CATALOG: ChartPatternDef[] = [
  { id: "head_shoulders", name: "Head & Shoulders", bias: "BEARISH", family: "reversal" },
  { id: "inv_head_shoulders", name: "Inverse Head & Shoulders", bias: "BULLISH", family: "reversal" },
  { id: "double_top", name: "Double Top", bias: "BEARISH", family: "reversal" },
  { id: "double_bottom", name: "Double Bottom", bias: "BULLISH", family: "reversal" },
  { id: "triple_top", name: "Triple Top", bias: "BEARISH", family: "reversal" },
  { id: "triple_bottom", name: "Triple Bottom", bias: "BULLISH", family: "reversal" },
  { id: "rounding_top", name: "Rounding Top", bias: "BEARISH", family: "reversal" },
  { id: "rounding_bottom", name: "Rounding Bottom", bias: "BULLISH", family: "reversal" },
  { id: "cup_handle", name: "Cup and Handle", bias: "BULLISH", family: "continuation" },
  { id: "inv_cup_handle", name: "Inverse Cup and Handle", bias: "BEARISH", family: "continuation" },
  { id: "ascending_triangle", name: "Ascending Triangle", bias: "BULLISH", family: "continuation" },
  { id: "descending_triangle", name: "Descending Triangle", bias: "BEARISH", family: "continuation" },
  { id: "symmetrical_triangle", name: "Symmetrical Triangle", bias: "NEUTRAL", family: "continuation" },
  { id: "rising_wedge", name: "Rising Wedge", bias: "BEARISH", family: "reversal" },
  { id: "falling_wedge", name: "Falling Wedge", bias: "BULLISH", family: "reversal" },
  { id: "bull_flag", name: "Bull Flag", bias: "BULLISH", family: "continuation" },
  { id: "bear_flag", name: "Bear Flag", bias: "BEARISH", family: "continuation" },
  { id: "bull_pennant", name: "Bull Pennant", bias: "BULLISH", family: "continuation" },
  { id: "bear_pennant", name: "Bear Pennant", bias: "BEARISH", family: "continuation" },
  { id: "rectangle", name: "Rectangle", bias: "NEUTRAL", family: "structure" },
  { id: "ascending_channel", name: "Ascending Channel", bias: "BULLISH", family: "structure" },
  { id: "descending_channel", name: "Descending Channel", bias: "BEARISH", family: "structure" },
  { id: "broadening", name: "Broadening Formation", bias: "NEUTRAL", family: "reversal" },
  { id: "diamond_top", name: "Diamond Top", bias: "BEARISH", family: "reversal" },
  { id: "diamond_bottom", name: "Diamond Bottom", bias: "BULLISH", family: "reversal" },
  { id: "island_top", name: "Island Reversal Top", bias: "BEARISH", family: "reversal" },
  { id: "island_bottom", name: "Island Reversal Bottom", bias: "BULLISH", family: "reversal" },
  { id: "v_bottom", name: "V Bottom", bias: "BULLISH", family: "reversal" },
  { id: "v_top", name: "V Top", bias: "BEARISH", family: "reversal" },
  { id: "climax_top", name: "Climax Top", bias: "BEARISH", family: "reversal" },
  { id: "bullish_engulfing", name: "Bullish Engulfing", bias: "BULLISH", family: "candlestick" },
  { id: "bearish_engulfing", name: "Bearish Engulfing", bias: "BEARISH", family: "candlestick" },
  { id: "hammer", name: "Hammer", bias: "BULLISH", family: "candlestick" },
  { id: "hanging_man", name: "Hanging Man", bias: "BEARISH", family: "candlestick" },
  { id: "inverted_hammer", name: "Inverted Hammer", bias: "BULLISH", family: "candlestick" },
  { id: "shooting_star", name: "Shooting Star", bias: "BEARISH", family: "candlestick" },
  { id: "morning_star", name: "Morning Star", bias: "BULLISH", family: "candlestick" },
  { id: "evening_star", name: "Evening Star", bias: "BEARISH", family: "candlestick" },
  { id: "three_white_soldiers", name: "Three White Soldiers", bias: "BULLISH", family: "candlestick" },
  { id: "three_black_crows", name: "Three Black Crows", bias: "BEARISH", family: "candlestick" },
  { id: "piercing_line", name: "Piercing Line", bias: "BULLISH", family: "candlestick" },
  { id: "dark_cloud_cover", name: "Dark Cloud Cover", bias: "BEARISH", family: "candlestick" },
  { id: "bullish_harami", name: "Bullish Harami", bias: "BULLISH", family: "candlestick" },
  { id: "bearish_harami", name: "Bearish Harami", bias: "BEARISH", family: "candlestick" },
  { id: "tweezer_bottom", name: "Tweezer Bottom", bias: "BULLISH", family: "candlestick" },
  { id: "tweezer_top", name: "Tweezer Top", bias: "BEARISH", family: "candlestick" },
  { id: "marubozu_bull", name: "Bullish Marubozu", bias: "BULLISH", family: "candlestick" },
  { id: "marubozu_bear", name: "Bearish Marubozu", bias: "BEARISH", family: "candlestick" },
  { id: "gap_up", name: "Breakaway Gap Up", bias: "BULLISH", family: "gap" },
  { id: "gap_down", name: "Breakaway Gap Down", bias: "BEARISH", family: "gap" },
];

type Pivot = { i: number; price: number };

type Ctx = {
  bars: OHLCVBar[];
  n: number;
  last: OHLCVBar;
  price: number;
  highs: Pivot[];
  lows: Pivot[];
  atr: number;
};

function atrApprox(bars: OHLCVBar[], period = 14) {
  if (bars.length < 2) return Math.abs(bars[0]?.close || 1) * 0.02;
  let sum = 0;
  const start = Math.max(1, bars.length - period);
  for (let i = start; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    sum += Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - prev), Math.abs(bars[i].low - prev));
  }
  return sum / (bars.length - start) || bars[bars.length - 1].close * 0.015;
}

function collectPivots(bars: OHLCVBar[], left = 2, right = 2) {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];
  const [sh, sl] = swingPoints(
    bars.map((b) => b.high),
    bars.map((b) => b.low),
    left,
    right,
  );
  sh.forEach((v, i) => {
    if (v != null) highs.push({ i, price: v });
  });
  sl.forEach((v, i) => {
    if (v != null) lows.push({ i, price: v });
  });
  return { highs, lows };
}

function near(a: number, b: number, tol: number) {
  return Math.abs(a - b) <= tol;
}

function recencyOf(endIndex: number, n: number) {
  const age = n - 1 - endIndex;
  return Math.max(0, 1 - age / 36);
}

function activeEnd(status: string, patternEnd: number, n: number) {
  if (/Confirmed|Breakout/.test(status)) return n - 1;
  return patternEnd;
}

function hit(def: ChartPatternDef, status: string, quality: number, endIndex: number, n: number): PatternHit {
  const active = activeEnd(status, endIndex, n);
  return {
    id: def.id,
    name: def.name,
    bias: def.bias,
    family: def.family,
    status,
    quality: Math.max(0, Math.min(1, quality)),
    recency: recencyOf(active, n),
    endIndex: active,
  };
}

function byId(id: string) {
  const def = CHART_PATTERN_CATALOG.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown pattern ${id}`);
  return def;
}

function lastHighs(highs: Pivot[], count: number) {
  return highs.slice(-count);
}

function lastLows(lows: Pivot[], count: number) {
  return lows.slice(-count);
}

function necklineStatus(price: number, line: number, bias: PatternBias, tol: number) {
  if (bias === "BEARISH") {
    if (price < line - tol) return "Confirmed Breakdown";
    if (price < line + tol) return "Forming";
    return "Forming";
  }
  if (price > line + tol) return "Breakout Confirmed";
  return "Forming";
}

function detectGeometric(ctx: Ctx): PatternHit[] {
  const out: PatternHit[] = [];
  const { highs, lows, price, atr, n } = ctx;
  const tol = atr * 0.55;

  const h2 = lastHighs(highs, 2);
  const h3 = lastHighs(highs, 3);
  const l2 = lastLows(lows, 2);
  const l3 = lastLows(lows, 3);

  if (h2.length === 2 && l2.length >= 1) {
    const [a, b] = h2;
    const trough = lows.filter((p) => p.i > a.i && p.i < b.i).sort((x, y) => x.price - y.price)[0];
    if (trough && near(a.price, b.price, tol) && b.i > a.i) {
      const status = necklineStatus(price, trough.price, "BEARISH", atr * 0.15);
      out.push(hit(byId("double_top"), status, 0.72 + (status.includes("Confirmed") ? 0.18 : 0), b.i, n));
    }
  }

  if (l2.length === 2 && h2.length >= 1) {
    const [a, b] = l2;
    const peak = highs.filter((p) => p.i > a.i && p.i < b.i).sort((x, y) => y.price - x.price)[0];
    if (peak && near(a.price, b.price, tol) && b.i > a.i) {
      const status = necklineStatus(price, peak.price, "BULLISH", atr * 0.15);
      out.push(hit(byId("double_bottom"), status, 0.72 + (status.includes("Confirmed") ? 0.18 : 0), b.i, n));
    }
  }

  if (h3.length === 3 && l2.length >= 2) {
    const [ls, head, rs] = h3;
    if (head.price > ls.price && head.price > rs.price && near(ls.price, rs.price, tol * 1.4)) {
      const neckLows = lows.filter((p) => p.i > ls.i && p.i < rs.i);
      if (neckLows.length >= 2) {
        const line = (neckLows[0].price + neckLows[neckLows.length - 1].price) / 2;
        const status = necklineStatus(price, line, "BEARISH", atr * 0.15);
        out.push(hit(byId("head_shoulders"), status, 0.8 + (status.includes("Confirmed") ? 0.15 : 0), rs.i, n));
      }
    }
  }

  if (l3.length === 3 && h2.length >= 2) {
    const [ls, head, rs] = l3;
    if (head.price < ls.price && head.price < rs.price && near(ls.price, rs.price, tol * 1.4)) {
      const neckHighs = highs.filter((p) => p.i > ls.i && p.i < rs.i);
      if (neckHighs.length >= 2) {
        const line = (neckHighs[0].price + neckHighs[neckHighs.length - 1].price) / 2;
        const status = necklineStatus(price, line, "BULLISH", atr * 0.15);
        out.push(hit(byId("inv_head_shoulders"), status, 0.8 + (status.includes("Confirmed") ? 0.15 : 0), rs.i, n));
      }
    }
  }

  if (h3.length === 3 && near(h3[0].price, h3[1].price, tol) && near(h3[1].price, h3[2].price, tol)) {
    const line = Math.min(...lows.slice(-3).map((p) => p.price));
    const status = necklineStatus(price, line, "BEARISH", atr * 0.15);
    out.push(hit(byId("triple_top"), status, 0.7, h3[2].i, n));
  }
  if (l3.length === 3 && near(l3[0].price, l3[1].price, tol) && near(l3[1].price, l3[2].price, tol)) {
    const line = Math.max(...highs.slice(-3).map((p) => p.price));
    const status = necklineStatus(price, line, "BULLISH", atr * 0.15);
    out.push(hit(byId("triple_bottom"), status, 0.7, l3[2].i, n));
  }

  if (h3.length >= 3 && l3.length >= 3) {
    const hs = h3.map((p) => p.price);
    const ls = l3.map((p) => p.price);
    const highFlat = near(Math.max(...hs), Math.min(...hs), tol);
    const lowFlat = near(Math.max(...ls), Math.min(...ls), tol);
    const highsFalling = hs[2] < hs[0] - atr * 0.15;
    const highsRising = hs[2] > hs[0] + atr * 0.15;
    const lowsRising = ls[2] > ls[0] + atr * 0.15;
    const lowsFalling = ls[2] < ls[0] - atr * 0.15;
    const end = Math.max(h3[h3.length - 1].i, l3[l3.length - 1].i);
    if (highFlat && lowsRising) {
      const cap = Math.max(...hs);
      out.push(hit(byId("ascending_triangle"), necklineStatus(price, cap, "BULLISH", atr * 0.12), 0.78, end, n));
    }
    if (lowFlat && highsFalling) {
      const floor = Math.min(...ls);
      out.push(hit(byId("descending_triangle"), necklineStatus(price, floor, "BEARISH", atr * 0.12), 0.78, end, n));
    }
    if (highsFalling && lowsRising) {
      const mid = (Math.max(...hs) + Math.min(...ls)) / 2;
      const status = price > mid + atr * 0.2 ? "Breakout Confirmed" : price < mid - atr * 0.2 ? "Confirmed Breakdown" : "Forming";
      const def = byId("symmetrical_triangle");
      const biased: PatternHit = {
        ...hit(def, status, 0.74, end, n),
        bias: status === "Breakout Confirmed" ? "BULLISH" : status === "Confirmed Breakdown" ? "BEARISH" : "NEUTRAL",
      };
      out.push(biased);
    }
    if (highsRising && lowsRising && hs[2] - hs[0] < ls[2] - ls[0] + atr * 0.2) {
      out.push(hit(byId("rising_wedge"), price < ls[2] ? "Confirmed Breakdown" : "Forming", 0.66, end, n));
    }
    if (highsFalling && lowsFalling && ls[0] - ls[2] < hs[0] - hs[2] + atr * 0.2) {
      out.push(hit(byId("falling_wedge"), price > hs[2] ? "Breakout Confirmed" : "Forming", 0.66, end, n));
    }
    if (highFlat && lowFlat) {
      const cap = Math.max(...hs);
      const floor = Math.min(...ls);
      const status = price > cap + atr * 0.1 ? "Breakout Confirmed" : price < floor - atr * 0.1 ? "Confirmed Breakdown" : "Forming";
      const def = byId("rectangle");
      out.push({
        ...hit(def, status, 0.6, end, n),
        bias: status === "Breakout Confirmed" ? "BULLISH" : status === "Confirmed Breakdown" ? "BEARISH" : "NEUTRAL",
      });
    }
    if (highsRising && lowsRising && near(hs[2] - hs[0], ls[2] - ls[0], tol * 1.6)) {
      out.push(hit(byId("ascending_channel"), "Forming", 0.62, end, n));
    }
    if (highsFalling && lowsFalling && near(hs[0] - hs[2], ls[0] - ls[2], tol * 1.6)) {
      out.push(hit(byId("descending_channel"), "Forming", 0.62, end, n));
    }
    if (highsRising && lowsFalling) {
      out.push(hit(byId("broadening"), "Forming", 0.55, end, n));
    }
  }

  const impulse = ctx.bars.slice(-18, -6);
  const flag = ctx.bars.slice(-6);
  if (impulse.length >= 8 && flag.length >= 5) {
    const impulseRet = impulse[impulse.length - 1].close - impulse[0].close;
    const flagHighs = flag.map((b) => b.high);
    const flagLows = flag.map((b) => b.low);
    const flagRange = Math.max(...flagHighs) - Math.min(...flagLows);
    const tight = flagRange < atr * 3.2;
    if (impulseRet > atr * 2.2 && tight) {
      const falling = flag[flag.length - 1].close <= flag[0].close + atr * 0.15;
      const contracting = flagHighs[flagHighs.length - 1] - flagLows[flagLows.length - 1] < flagHighs[0] - flagLows[0];
      const lastBar = n - 1;
      if (falling) {
        const status = price > Math.max(...flagHighs) ? "Breakout Confirmed" : "Forming";
        out.push(hit(byId("bull_flag"), status, 0.84, lastBar, n));
      }
      if (contracting) out.push(hit(byId("bull_pennant"), price > Math.max(...flagHighs) ? "Breakout Confirmed" : "Forming", 0.7, lastBar, n));
    }
    if (impulseRet < -atr * 2.2 && tight) {
      const rising = flag[flag.length - 1].close >= flag[0].close - atr * 0.15;
      const contracting = flagHighs[flagHighs.length - 1] - flagLows[flagLows.length - 1] < flagHighs[0] - flagLows[0];
      const lastBar = n - 1;
      if (rising) {
        const status = price < Math.min(...flagLows) ? "Confirmed Breakdown" : "Forming";
        out.push(hit(byId("bear_flag"), status, 0.84, lastBar, n));
      }
      if (contracting) out.push(hit(byId("bear_pennant"), price < Math.min(...flagLows) ? "Confirmed Breakdown" : "Forming", 0.7, lastBar, n));
    }
  }

  const window = ctx.bars.slice(-40);
  if (window.length >= 28) {
    const mid = Math.floor(window.length * 0.45);
    const leftLip = Math.max(...window.slice(0, 8).map((b) => b.high));
    const cupLow = Math.min(...window.slice(8, mid + 8).map((b) => b.low));
    const rightLip = Math.max(...window.slice(mid, -5).map((b) => b.high));
    const handleLow = Math.min(...window.slice(-5).map((b) => b.low));
    if (cupLow < leftLip - atr * 2 && near(leftLip, rightLip, atr * 1.4) && handleLow < rightLip && handleLow > cupLow + (rightLip - cupLow) * 0.45) {
      const status = price > rightLip ? "Breakout Confirmed" : "Forming";
      out.push(hit(byId("cup_handle"), status, 0.73, n - 1, n));
    }
    const leftLow = Math.min(...window.slice(0, 8).map((b) => b.low));
    const invHigh = Math.max(...window.slice(8, mid + 8).map((b) => b.high));
    const rightLow = Math.min(...window.slice(mid, -5).map((b) => b.low));
    if (invHigh > leftLow + atr * 2 && near(leftLow, rightLow, atr * 1.4)) {
      out.push(hit(byId("inv_cup_handle"), price < rightLow ? "Confirmed Breakdown" : "Forming", 0.62, n - 1, n));
    }
    const closes = window.map((b) => b.close);
    const first = closes.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const middle = closes.slice(10, 22).reduce((a, b) => a + b, 0) / Math.max(1, closes.slice(10, 22).length);
    const lastAvg = closes.slice(-8).reduce((a, b) => a + b, 0) / 8;
    if (middle < first - atr && lastAvg > middle + atr * 0.8 && near(lastAvg, first, atr * 2)) {
      out.push(hit(byId("rounding_bottom"), lastAvg > first ? "Breakout Confirmed" : "Forming", 0.58, n - 1, n));
    }
    if (middle > first + atr && lastAvg < middle - atr * 0.8 && near(lastAvg, first, atr * 2)) {
      out.push(hit(byId("rounding_top"), lastAvg < first ? "Confirmed Breakdown" : "Forming", 0.58, n - 1, n));
    }
  }

  const recent = ctx.bars.slice(-10);
  if (recent.length >= 8) {
    const mid = Math.min(...recent.slice(2, 6).map((b) => b.low));
    const start = recent[0].close;
    const end = recent[recent.length - 1].close;
    if (mid < start - atr * 1.6 && end > start - atr * 0.3 && end > mid + atr) {
      out.push(hit(byId("v_bottom"), "Confirmed", 0.4, n - 1, n));
    }
    const peak = Math.max(...recent.slice(2, 6).map((b) => b.high));
    if (peak > start + atr * 1.6 && end < start + atr * 0.3 && end < peak - atr) {
      out.push(hit(byId("v_top"), "Confirmed", 0.4, n - 1, n));
    }
    const vol = recent.map((b) => b.volume);
    const avgVol = vol.slice(0, -2).reduce((a, b) => a + b, 0) / Math.max(1, vol.length - 2);
    const lastVol = recent[recent.length - 1].volume;
    if (peak > start + atr * 2 && lastVol > avgVol * 1.8 && end < peak - atr * 0.8) {
      out.push(hit(byId("climax_top"), "Confirmed", 0.6, n - 1, n));
    }
  }

  if (h3.length >= 3 && l3.length >= 3) {
    const firstW = h3[1].price - l3[1].price;
    const lastW = h3[2].price - l3[2].price;
    if (firstW > lastW * 1.25 && h3[1].price > h3[0].price) {
      out.push(hit(byId("diamond_top"), price < l3[2].price ? "Confirmed Breakdown" : "Forming", 0.52, n - 1, n));
    }
    if (firstW > lastW * 1.25 && l3[1].price < l3[0].price) {
      out.push(hit(byId("diamond_bottom"), price > h3[2].price ? "Breakout Confirmed" : "Forming", 0.52, n - 1, n));
    }
  }

  return out;
}

function body(bar: OHLCVBar) {
  return Math.abs(bar.close - bar.open);
}
function range(bar: OHLCVBar) {
  return Math.max(bar.high - bar.low, 1e-9);
}
function upperWick(bar: OHLCVBar) {
  return bar.high - Math.max(bar.open, bar.close);
}
function lowerWick(bar: OHLCVBar) {
  return Math.min(bar.open, bar.close) - bar.low;
}
function bull(bar: OHLCVBar) {
  return bar.close > bar.open;
}

function detectCandlesAndGaps(ctx: Ctx): PatternHit[] {
  const out: PatternHit[] = [];
  const { bars, n, atr } = ctx;
  if (n < 4) return out;
  const a = bars[n - 3];
  const b = bars[n - 2];
  const c = bars[n - 1];
  const prev = bars[n - 2];

  if (bull(c) && !bull(b) && c.open <= b.close && c.close >= b.open) {
    out.push(hit(byId("bullish_engulfing"), "Confirmed", 0.7, n - 1, n));
  }
  if (!bull(c) && bull(b) && c.open >= b.close && c.close <= b.open) {
    out.push(hit(byId("bearish_engulfing"), "Confirmed", 0.7, n - 1, n));
  }
  if (lowerWick(c) > body(c) * 2 && upperWick(c) < body(c) * 0.6 && c.close > c.open) {
    out.push(hit(byId("hammer"), "Forming", 0.58, n - 1, n));
  }
  if (lowerWick(c) > body(c) * 2 && upperWick(c) < body(c) * 0.6 && c.close < c.open) {
    out.push(hit(byId("hanging_man"), "Forming", 0.52, n - 1, n));
  }
  if (upperWick(c) > body(c) * 2 && lowerWick(c) < body(c) * 0.6 && c.close > c.open) {
    out.push(hit(byId("inverted_hammer"), "Forming", 0.5, n - 1, n));
  }
  if (upperWick(c) > body(c) * 2 && lowerWick(c) < body(c) * 0.6 && c.close < c.open) {
    out.push(hit(byId("shooting_star"), "Forming", 0.58, n - 1, n));
  }
  if (!bull(a) && body(b) < range(b) * 0.35 && bull(c) && c.close > (a.open + a.close) / 2) {
    out.push(hit(byId("morning_star"), "Confirmed", 0.74, n - 1, n));
  }
  if (bull(a) && body(b) < range(b) * 0.35 && !bull(c) && c.close < (a.open + a.close) / 2) {
    out.push(hit(byId("evening_star"), "Confirmed", 0.74, n - 1, n));
  }
  if (n >= 3) {
    const x = bars[n - 3];
    const y = bars[n - 2];
    const z = bars[n - 1];
    if (bull(x) && bull(y) && bull(z) && y.close > x.close && z.close > y.close) {
      out.push(hit(byId("three_white_soldiers"), "Confirmed", 0.68, n - 1, n));
    }
    if (!bull(x) && !bull(y) && !bull(z) && y.close < x.close && z.close < y.close) {
      out.push(hit(byId("three_black_crows"), "Confirmed", 0.68, n - 1, n));
    }
  }
  if (!bull(b) && bull(c) && c.open < b.low && c.close > (b.open + b.close) / 2 && c.close < b.open) {
    out.push(hit(byId("piercing_line"), "Confirmed", 0.6, n - 1, n));
  }
  if (bull(b) && !bull(c) && c.open > b.high && c.close < (b.open + b.close) / 2 && c.close > b.open) {
    out.push(hit(byId("dark_cloud_cover"), "Confirmed", 0.6, n - 1, n));
  }
  if (!bull(b) && bull(c) && c.open > b.close && c.close < b.open) {
    out.push(hit(byId("bullish_harami"), "Forming", 0.48, n - 1, n));
  }
  if (bull(b) && !bull(c) && c.open < b.close && c.close > b.open) {
    out.push(hit(byId("bearish_harami"), "Forming", 0.48, n - 1, n));
  }
  if (near(b.low, c.low, atr * 0.2) && bull(c) && !bull(b)) {
    out.push(hit(byId("tweezer_bottom"), "Forming", 0.5, n - 1, n));
  }
  if (near(b.high, c.high, atr * 0.2) && !bull(c) && bull(b)) {
    out.push(hit(byId("tweezer_top"), "Forming", 0.5, n - 1, n));
  }
  if (bull(c) && body(c) > range(c) * 0.86) out.push(hit(byId("marubozu_bull"), "Confirmed", 0.46, n - 1, n));
  if (!bull(c) && body(c) > range(c) * 0.86) out.push(hit(byId("marubozu_bear"), "Confirmed", 0.46, n - 1, n));

  if (c.low > prev.high * 1.002 && c.open > prev.high) {
    out.push(hit(byId("gap_up"), "Breakout Confirmed", 0.66, n - 1, n));
  }
  if (c.high < prev.low * 0.998 && c.open < prev.low) {
    out.push(hit(byId("gap_down"), "Confirmed Breakdown", 0.66, n - 1, n));
  }

  if (n >= 3) {
    const gapBar = bars[n - 2];
    const left = bars[n - 3];
    const right = bars[n - 1];
    if (gapBar.low > left.high && gapBar.low > right.high) {
      out.push(hit(byId("island_top"), "Confirmed", 0.55, n - 1, n));
    }
    if (gapBar.high < left.low && gapBar.high < right.low) {
      out.push(hit(byId("island_bottom"), "Confirmed", 0.55, n - 1, n));
    }
  }
  return out;
}

export function marketStructureLabel(bars: OHLCVBar[]) {
  const flags = structureFlags(
    bars.map((b) => b.high),
    bars.map((b) => b.low),
    20,
  );
  if (flags.higher_highs && flags.higher_lows) return "Higher High + Higher Low";
  if (flags.lower_highs && flags.lower_lows) return "Lower High + Lower Low";
  if (flags.higher_highs && flags.lower_lows) return "Higher High + Lower Low";
  if (flags.lower_highs && flags.higher_lows) return "Lower High + Higher Low";
  return "Range-bound";
}

function structureFallback(ctx: Ctx, structure: string): PatternHit {
  const end = ctx.n - 1;
  if (structure === "Higher High + Higher Low") return hit(byId("ascending_channel"), "Forming", 0.42, end, ctx.n);
  if (structure === "Lower High + Lower Low") return hit(byId("descending_channel"), "Forming", 0.42, end, ctx.n);
  return hit(byId("rectangle"), "Watching", 0.36, end, ctx.n);
}

function relevance(hitRow: PatternHit, structure: string) {
  const familyWeight = hitRow.family === "continuation" || hitRow.family === "reversal" ? 0.16 : hitRow.family === "structure" ? 0.04 : 0;
  const classic = new Set([
    "head_shoulders",
    "inv_head_shoulders",
    "double_top",
    "double_bottom",
    "bull_flag",
    "bear_flag",
    "ascending_triangle",
    "descending_triangle",
    "cup_handle",
  ]);
  const classicBonus = classic.has(hitRow.id) ? 0.1 : 0;
  const confirm = /Confirmed|Breakout/.test(hitRow.status) ? 0.18 : hitRow.status === "Forming" ? 0.06 : 0;
  const align =
    (hitRow.bias === "BULLISH" && structure.includes("Higher High + Higher Low")) ||
    (hitRow.bias === "BEARISH" && structure.includes("Lower High + Lower Low"))
      ? 0.1
      : 0;
  return hitRow.quality * 0.48 + hitRow.recency * 0.28 + familyWeight + classicBonus + confirm + align;
}

function decisionFor(hitRow: PatternHit): PatternDecision {
  if (hitRow.bias === "BULLISH" && /Breakout Confirmed|Confirmed$/.test(hitRow.status)) return "Entry";
  if (hitRow.bias === "BEARISH" && /Confirmed Breakdown|Confirmed$/.test(hitRow.status)) return "Avoid";
  if (hitRow.bias === "BEARISH") return "Avoid";
  if (hitRow.status === "Forming" || hitRow.status === "Watching") return "Wait";
  if (hitRow.bias === "NEUTRAL") return "Wait";
  return "Wait";
}

export function evaluateAllPatterns(bars: OHLCVBar[]): { evaluated: number; hits: PatternHit[] } {
  if (bars.length < 20) return { evaluated: CHART_PATTERN_CATALOG.length, hits: [] };
  const { highs, lows } = collectPivots(bars);
  const ctx: Ctx = {
    bars,
    n: bars.length,
    last: bars[bars.length - 1],
    price: bars[bars.length - 1].close,
    highs,
    lows,
    atr: atrApprox(bars),
  };
  const hits = [...detectGeometric(ctx), ...detectCandlesAndGaps(ctx)];
  return { evaluated: CHART_PATTERN_CATALOG.length, hits };
}

export function pickPrimaryPattern(bars: OHLCVBar[]): PrimaryPattern {
  const analysis = analyzeChartPattern(bars);
  const structure = analysis.marketStructure.label || marketStructureLabel(bars);
  const { evaluated, hits } = evaluateAllPatterns(bars);
  if (analysis.primary) {
    const signal = analysis.signal;
    return {
      id: analysis.primary.id,
      name: analysis.primary.name,
      bias: analysis.primary.bias,
      status: analysis.primary.displayStatus,
      market_structure: structure,
      decision: signal.action === "BUY" || signal.action === "SELL" ? "Entry" : signal.action === "NO_TRADE" || signal.action === "INSUFFICIENT_DATA" ? "Avoid" : "Wait",
      evaluated,
      analysis,
    };
  }
  const ranked = [...hits].sort((a, b) => relevance(b, structure) - relevance(a, structure));
  const best = ranked[0];
  if (!best) {
    return {
      id: "none",
      name: "No reliable pattern detected",
      bias: "NEUTRAL",
      status: "Watching",
      market_structure: structure,
      decision: "Avoid",
      evaluated,
      analysis,
    };
  }
  return {
    id: best.id,
    name: best.name,
    bias: best.bias,
    status: best.status,
    market_structure: structure,
    decision: decisionFor(best),
    evaluated,
    analysis,
  };
}

function isConfirmedStatus(status: string) {
  return /Breakout Confirmed|Confirmed Breakdown|Confirmed/.test(status);
}

export function overviewDecisionFor(bias: PatternBias, status: string, signal?: { action: string }): OverviewDecision {
  if (signal) return overviewDecisionFromSignal(signal as Parameters<typeof overviewDecisionFromSignal>[0]);
  if (status === "Watching") return "AVOID";
  return "WAIT";
}

export function tradeDecisionFor(status: string, style: PatternTradeStyle, signal?: { action: string }): TradeDecision {
  if (signal) return tradeDecisionFromSignal(signal as Parameters<typeof tradeDecisionFromSignal>[0], style);
  if (status === "Watching") return "AVOID / NO TRADE";
  if (!isConfirmedStatus(status)) return "WAIT FOR BREAKOUT";
  return "WAIT FOR BREAKOUT";
}

function roundPx(n: number) {
  if (!Number.isFinite(n)) return n;
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 2 : 4;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function resampleToMonthly(bars: OHLCVBar[]): OHLCVBar[] {
  const buckets = new Map<string, OHLCVBar[]>();
  for (const bar of bars) {
    const d = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, "0")}`;
    const list = buckets.get(key) || [];
    list.push(bar);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, list]) => {
      const first = list[0];
      const last = list[list.length - 1];
      const d = first.timestamp instanceof Date ? first.timestamp : new Date(first.timestamp);
      return {
        ...last,
        timestamp: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59)),
        open: first.open,
        high: Math.max(...list.map((b) => b.high)),
        low: Math.min(...list.map((b) => b.low)),
        close: last.close,
        volume: list.reduce((sum, b) => sum + b.volume, 0),
        timeframe: "1M",
      };
    });
}

export function buildTradeLevels(bars: OHLCVBar[], hit: { bias: PatternBias; status: string }): PatternLevels {
  const last = bars[bars.length - 1];
  const price = last.close;
  const atr = Math.max(atrApprox(bars), price * 0.004);
  const lookback = bars.slice(-8);
  const rangeHigh = Math.max(...lookback.map((b) => b.high));
  const rangeLow = Math.min(...lookback.map((b) => b.low));
  const { highs, lows } = collectPivots(bars);
  const swingHigh = highs.length ? highs[highs.length - 1].price : rangeHigh;
  const swingLow = lows.length ? lows[lows.length - 1].price : rangeLow;
  const confirmed = isConfirmedStatus(hit.status);

  if (hit.bias === "BEARISH") {
    const trigger = Math.min(rangeLow, swingLow);
    const invalidation = Math.max(swingHigh, rangeHigh);
    const entry = confirmed ? price : trigger - atr * 0.05;
    let stop = Math.max(invalidation, entry) + atr * 0.15;
    if (stop <= entry) stop = entry + Math.max(atr, entry * 0.008);
    const risk = Math.max(stop - entry, atr);
    return {
      entry: roundPx(entry),
      entryLow: roundPx(Math.min(entry, trigger)),
      entryHigh: roundPx(Math.max(entry, trigger)),
      preferred: roundPx(entry),
      stop: roundPx(stop),
      target1: roundPx(entry - risk),
      target2: roundPx(entry - 2 * risk),
      target3: roundPx(entry - 3 * risk),
      entryHint: confirmed ? "at" : "below",
    };
  }

  const trigger = Math.max(rangeHigh, swingHigh);
  const invalidation = Math.min(swingLow, rangeLow);
  const entry = confirmed && hit.bias === "BULLISH" ? price : trigger + atr * 0.05;
  const preferred = confirmed && hit.bias === "BULLISH" ? price : trigger + atr * 0.08;
  let stop = invalidation - atr * 0.15;
  if (stop >= entry) stop = entry - Math.max(atr, entry * 0.008);
  const risk = Math.max(entry - stop, atr);
  const zoneLow = confirmed ? Math.min(price, trigger) : trigger;
  const zoneHigh = confirmed ? price + atr * 0.15 : trigger + atr * 0.25;
  return {
    entry: roundPx(entry),
    entryLow: roundPx(Math.min(zoneLow, zoneHigh)),
    entryHigh: roundPx(Math.max(zoneLow, zoneHigh)),
    preferred: roundPx(preferred),
    stop: roundPx(stop),
    target1: roundPx(entry + risk),
    target2: roundPx(entry + 2 * risk),
    target3: roundPx(entry + 3 * risk),
    entryHint: confirmed && hit.bias === "BULLISH" ? "at" : "above",
  };
}
