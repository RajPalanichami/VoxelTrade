import { classicPivots, last, swingPoints, volumeProfileNodes } from "@/src/engines/indicators";
import type { Frame } from "@/src/lib/series";
import type { Indicators, SRLevels } from "@/src/types/domain";
import { emptyLevels } from "@/src/types/domain";

function cluster(levels: number[], price: number, pct = 0.0035): [number, number][] {
  const vals = [...new Set(levels.filter((x) => Number.isFinite(x) && x > 0))].sort((a, b) => a - b);
  if (!vals.length) return [];
  const thresh = Math.max(price * pct, price * 0.001);
  const zones: number[][] = [[vals[0]]];
  for (const x of vals.slice(1)) {
    if (x - zones[zones.length - 1][zones[zones.length - 1].length - 1] <= thresh) {
      zones[zones.length - 1].push(x);
    } else zones.push([x]);
  }
  return zones.map((z) => [Math.min(...z), Math.max(...z)]);
}

function pickN(candidates: number[], price: number, side: "support" | "resistance", n = 3): number[] {
  if (side === "support") {
    return candidates.filter((c) => c < price).sort((a, b) => b - a).slice(0, n);
  }
  return candidates.filter((c) => c > price).sort((a, b) => a - b).slice(0, n);
}

export function calculateLevels(frame: Frame, indicators: Indicators, price: number): SRLevels {
  const methods: string[] = [];
  const weighted: [number, number][] = [];
  const look = Math.min(frame.rows.length, 80);
  const recent = frame.tail(look);
  const high = recent.get("high");
  const low = recent.get("low");
  const [sh, sl] = swingPoints(high, low, 3, 3);
  const swingsH = sh.filter((x): x is number => x != null).slice(-8);
  const swingsL = sl.filter((x): x is number => x != null).slice(-8);
  if (swingsH.length || swingsL.length) {
    methods.push("swing");
    for (const x of [...swingsH, ...swingsL]) weighted.push([x, 0.3]);
  }
  const swingHigh = swingsH.length ? Math.max(...swingsH) : last(frame.get("high"));
  const swingLow = swingsL.length ? Math.min(...swingsL) : last(frame.get("low"));

  const prev = frame.rows.length >= 2 ? frame.rows[frame.rows.length - 2] : frame.rows[frame.rows.length - 1];
  const piv = classicPivots(prev.high, prev.low, prev.close);
  methods.push("pivot");
  for (const key of ["pivot", "r1", "r2", "r3", "s1", "s2", "s3"] as const) {
    weighted.push([piv[key], 0.2]);
  }

  let emaAdded = false;
  for (const val of [indicators.ema9, indicators.ema20, indicators.ema21, indicators.ema50, indicators.ema200]) {
    if (val) {
      if (!emaAdded) {
        methods.push("ema");
        emaAdded = true;
      }
      weighted.push([val, 0.15]);
      break;
    }
  }
  for (const val of [indicators.ema20, indicators.ema21, indicators.ema50, indicators.ema200]) {
    if (val) weighted.push([val, 0.15]);
  }
  if (indicators.vwap) {
    methods.push("vwap");
    weighted.push([indicators.vwap, 0.15]);
  }
  const nodes = volumeProfileNodes(recent.get("close"), recent.get("volume"), 20);
  if (nodes.length) {
    methods.push("volume_zone");
    for (const [px] of nodes.slice(0, 6)) weighted.push([px, 0.1]);
  }
  if (indicators.atr) {
    methods.push("atr");
    const a = indicators.atr;
    for (const k of [0.5, 1, 1.5, 2]) {
      weighted.push([price - k * a, 0.1]);
      weighted.push([price + k * a, 0.1]);
    }
  }

  const unique = [...new Set(weighted.map(([p]) => Math.round(p * 10000) / 10000).filter((x) => x && x > 0))];
  const supports = pickN(unique, price, "support", 8);
  const resistances = pickN(unique, price, "resistance", 8);
  let supportZones = cluster(supports, price).filter((z) => z[1] < price);
  let resistanceZones = cluster(resistances, price).filter((z) => z[0] > price);
  supportZones = supportZones.sort((a, b) => b[1] - a[1]).slice(0, 5);
  resistanceZones = resistanceZones.sort((a, b) => a[0] - b[0]).slice(0, 5);
  const zoneMid = (z: [number, number]) => (z[0] + z[1]) / 2;
  const sVals = supportZones.length ? supportZones.map(zoneMid) : supports;
  const rVals = resistanceZones.length ? resistanceZones.map(zoneMid) : resistances;
  const g = (seq: number[], i: number) => (i < seq.length ? Math.round(seq[i] * 100) / 100 : null);

  return emptyLevels({
    pivot: Math.round(piv.pivot * 100) / 100,
    s1: g(sVals, 0),
    s2: g(sVals, 1),
    s3: g(sVals, 2),
    r1: g(rVals, 0),
    r2: g(rVals, 1),
    r3: g(rVals, 2),
    swing_high: swingHigh != null ? Math.round(swingHigh * 100) / 100 : null,
    swing_low: swingLow != null ? Math.round(swingLow * 100) / 100 : null,
    vwap: indicators.vwap != null ? Math.round(indicators.vwap * 100) / 100 : null,
    ema20: indicators.ema20 != null ? Math.round(indicators.ema20 * 100) / 100 : indicators.ema21 != null ? Math.round(indicators.ema21 * 100) / 100 : null,
    ema50: indicators.ema50 != null ? Math.round(indicators.ema50 * 100) / 100 : null,
    support_zones: supportZones.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]),
    resistance_zones: resistanceZones.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]),
    methods_used: [...new Set(methods)].sort(),
  });
}
