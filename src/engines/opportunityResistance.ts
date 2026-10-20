import { swingPoints, volumeProfileNodes } from "@/src/engines/indicators";
import type { OHLCVBar } from "@/src/types/domain";
import type { ResistanceLevel, ResistanceSource } from "@/lib/opportunity";

function barTime(bar: OHLCVBar) {
  const t = bar.timestamp instanceof Date ? bar.timestamp : new Date(bar.timestamp);
  return t.toISOString();
}

function cluster(values: { price: number; time?: string }[], price: number, pct = 0.0035) {
  const sorted = [...values].filter((v) => Number.isFinite(v.price) && v.price > 0).sort((a, b) => a.price - b.price);
  if (!sorted.length) return [] as { price: number; members: typeof values; tests: number; last?: string }[];
  const thresh = Math.max(price * pct, price * 0.001);
  const groups: { price: number; members: typeof values }[] = [{ price: sorted[0].price, members: [sorted[0]] }];
  for (const item of sorted.slice(1)) {
    const last = groups[groups.length - 1];
    if (item.price - last.price <= thresh) {
      last.members.push(item);
      last.price = last.members.reduce((s, m) => s + m.price, 0) / last.members.length;
    } else groups.push({ price: item.price, members: [item] });
  }
  return groups.map((g) => ({
    price: Math.round(g.price * 100) / 100,
    members: g.members,
    tests: g.members.length,
    last: g.members.map((m) => m.time).filter(Boolean).sort().at(-1),
  }));
}

function countTouches(bars: OHLCVBar[], level: number, side: "high" | "low") {
  const band = Math.max(level * 0.003, 0.01);
  let tests = 0;
  let last: string | undefined;
  for (const b of bars) {
    const px = side === "high" ? b.high : b.low;
    if (Math.abs(px - level) <= band) {
      tests += 1;
      last = barTime(b);
    }
  }
  return { tests, last };
}

function swingLevels(bars: OHLCVBar[], timeframe: string, price: number, side: "high" | "low"): ResistanceLevel[] {
  if (bars.length < 16) return [];
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const [sh, sl] = swingPoints(highs, lows, 3, 3);
  const series = side === "high" ? sh : sl;
  const points = series
    .map((v, i) => (v == null ? null : { price: v, time: barTime(bars[i]) }))
    .filter((x): x is { price: number; time: string } => !!x);
  const relevant = side === "high" ? points.filter((p) => p.price > price * 1.0008) : points.filter((p) => p.price < price * 0.9992);
  return cluster(relevant, price).slice(0, 4).map((g) => {
    const touches = countTouches(bars.slice(-80), g.price, side);
    const tests = Math.max(g.tests, touches.tests);
    const source: ResistanceSource = tests >= 3 ? "REPEATED_REJECTION" : timeframe === "1w" ? "WEEKLY_LEVEL" : timeframe === "1d" ? "DAILY_LEVEL" : "SWING_HIGH";
    return {
      price: g.price,
      timeframe,
      source: side === "low" && source === "SWING_HIGH" ? "DAILY_LEVEL" : source,
      testCount: tests,
      lastTestTime: touches.last || g.last,
      strength: Math.min(100, 40 + tests * 15 + (timeframe === "1d" || timeframe === "1w" ? 10 : 0)),
      confidence: Math.min(100, 45 + tests * 12),
    };
  });
}

function consolidationHigh(bars: OHLCVBar[], timeframe: string, price: number): ResistanceLevel | null {
  const look = bars.slice(-24);
  if (look.length < 12) return null;
  const high = Math.max(...look.map((b) => b.high));
  const low = Math.min(...look.map((b) => b.low));
  const mid = (high + low) / 2;
  if (!mid || (high - low) / mid > 0.065) return null;
  if (high <= price * 1.0005) return null;
  const touches = countTouches(look, high, "high");
  return {
    price: Math.round(high * 100) / 100,
    timeframe,
    source: "CONSOLIDATION_HIGH",
    testCount: Math.max(2, touches.tests),
    lastTestTime: touches.last,
    strength: 70,
    confidence: 68,
  };
}

function priorBreakout(bars: OHLCVBar[], timeframe: string, price: number): ResistanceLevel | null {
  if (bars.length < 20) return null;
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const [sh] = swingPoints(highs, lows, 3, 3);
  for (let i = 8; i < sh.length - 3; i++) {
    const level = sh[i];
    if (level == null || level <= price) continue;
    const after = bars.slice(i + 1);
    const broke = after.some((b) => b.close > level * 1.002);
    const lost = after.some((b) => b.close < level * 0.997);
    if (broke && lost) {
      return {
        price: Math.round(level * 100) / 100,
        timeframe,
        source: "PRIOR_BREAKOUT",
        testCount: countTouches(after, level, "high").tests,
        lastTestTime: barTime(after[after.length - 1]),
        strength: 62,
        confidence: 60,
      };
    }
  }
  return null;
}

function gapResistance(bars: OHLCVBar[], timeframe: string, price: number): ResistanceLevel | null {
  for (let i = bars.length - 2; i >= Math.max(1, bars.length - 40); i--) {
    const prev = bars[i - 1];
    const cur = bars[i];
    if (cur.open > prev.high * 1.004 && cur.open > price) {
      return {
        price: Math.round(cur.open * 100) / 100,
        timeframe,
        source: "GAP",
        testCount: 1,
        lastTestTime: barTime(cur),
        strength: 55,
        confidence: 58,
      };
    }
  }
  return null;
}

function volumeResistance(bars: OHLCVBar[], timeframe: string, price: number): ResistanceLevel | null {
  const nodes = volumeProfileNodes(bars.map((b) => b.close), bars.map((b) => b.volume), 20);
  const above = nodes.filter(([px]) => px > price * 1.002).sort((a, b) => a[0] - b[0])[0];
  if (!above) return null;
  return {
    price: Math.round(above[0] * 100) / 100,
    timeframe,
    source: "VOLUME_PROFILE",
    testCount: 1,
    strength: 50,
    confidence: 52,
  };
}

export function detectStructuralLevels(input: {
  price: number;
  daily?: OHLCVBar[];
  weekly?: OHLCVBar[];
  h4?: OHLCVBar[];
  h1?: OHLCVBar[];
  m30?: OHLCVBar[];
  week52High?: number | null;
}): { resistances: ResistanceLevel[]; supports: ResistanceLevel[] } {
  const price = input.price;
  const resistances: ResistanceLevel[] = [];
  const supports: ResistanceLevel[] = [];
  const add = (list: ResistanceLevel[], item: ResistanceLevel | null | undefined) => {
    if (!item || !Number.isFinite(item.price)) return;
    if (list.some((x) => Math.abs(x.price - item.price) / item.price < 0.0025 && x.source === item.source)) return;
    list.push(item);
  };

  if (input.m30) swingLevels(input.m30, "30m", price, "high").forEach((x) => add(resistances, x));
  if (input.h1) swingLevels(input.h1, "1h", price, "high").forEach((x) => add(resistances, x));
  if (input.h4) swingLevels(input.h4, "4h", price, "high").forEach((x) => add(resistances, x));
  if (input.daily) {
    swingLevels(input.daily, "1d", price, "high").forEach((x) => add(resistances, x));
    const recentDaily = input.daily.slice(-60);
    swingLevels(recentDaily, "1d", price, "low").forEach((x) => add(supports, { ...x, source: x.source === "SWING_HIGH" ? "DAILY_LEVEL" : x.source }));
    add(resistances, consolidationHigh(input.daily, "1d", price));
    add(resistances, priorBreakout(input.daily, "1d", price));
    add(resistances, gapResistance(input.daily, "1d", price));
    add(resistances, volumeResistance(input.daily.slice(-80), "1d", price));
    const completed = input.daily.filter((b) => b.volume > 0);
    const prev = completed.length >= 2 ? completed[completed.length - 2] : completed[completed.length - 1];
    if (prev && prev.high > price) {
      add(resistances, {
        price: Math.round(prev.high * 100) / 100,
        timeframe: "1d",
        source: "PREVIOUS_DAY_HIGH",
        testCount: 1,
        lastTestTime: barTime(prev),
        strength: 48,
        confidence: 70,
      });
    }
  }
  if (input.weekly) {
    swingLevels(input.weekly, "1w", price, "high").forEach((x) => add(resistances, x));
    const last = input.weekly[input.weekly.length - 2] || input.weekly[input.weekly.length - 1];
    if (last && last.high > price) {
      add(resistances, {
        price: Math.round(last.high * 100) / 100,
        timeframe: "1w",
        source: "PREVIOUS_WEEK_HIGH",
        testCount: 1,
        lastTestTime: barTime(last),
        strength: 58,
        confidence: 72,
      });
    }
  }
  if (input.week52High && input.week52High > price) {
    add(resistances, {
      price: Math.round(input.week52High * 100) / 100,
      timeframe: "1d",
      source: "52_WEEK_HIGH",
      testCount: 1,
      strength: 80,
      confidence: 90,
    });
  }
  if (input.m30) add(resistances, consolidationHigh(input.m30, "30m", price));

  resistances.sort((a, b) => a.price - b.price || b.strength - a.strength);
  supports.sort((a, b) => b.price - a.price);
  return { resistances, supports };
}

export function pickLevel(levels: ResistanceLevel[], timeframe?: string, source?: ResistanceSource) {
  if (timeframe) {
    const match = levels.find((l) => l.timeframe === timeframe && l.source !== "52_WEEK_HIGH");
    if (match) return match;
  }
  if (source) return levels.find((l) => l.source === source) || null;
  return levels[0] || null;
}

export function nearestAbove(levels: ResistanceLevel[], price: number) {
  return levels.filter((l) => l.price > price && l.source !== "52_WEEK_HIGH").sort((a, b) => a.price - b.price)[0] || null;
}

export function nearestBelow(levels: ResistanceLevel[], price: number) {
  const below = levels.filter((l) => l.price < price * 0.997).sort((a, b) => b.price - a.price);
  return below.find((l) => (price - l.price) / price <= 0.14) || below[0] || null;
}

export function sourceLabel(source: ResistanceSource) {
  return source.replaceAll("_", " ");
}
