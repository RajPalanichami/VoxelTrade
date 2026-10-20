import { SECTORS } from "@/src/data/sectors";
import { SECTOR_ETF } from "@/src/config/env";
import { dmi, roc } from "@/src/engines/compareMath";
import { pickPrimaryPattern } from "@/src/engines/chartPatterns";
import {
  atr,
  bollinger,
  ema,
  last,
  macd,
  rsi,
  slope,
  structureFlags,
  vwap,
} from "@/src/engines/indicators";
import { headlineCategory, headlineSentiment, toFrame } from "@/src/providers/base";
import type { OHLCVBar, Quote } from "@/src/types/domain";
import {
  DEFAULT_OPPORTUNITY_SETTINGS,
  type CatalystCategory,
  type CatalystType,
  type MarketRegimeLabel,
  type OpportunityAlertType,
  type OpportunityBucket,
  type OpportunityChartBar,
  type OpportunityEventFlag,
  type OpportunityNewsItem,
  type OpportunitySettings,
  type OpportunityState,
  type OpportunityTfRow,
  type OpportunityTimeframe,
  type ResistanceLevel,
  type RiskRegime,
  type RsLabel,
  type ScoreFactor,
  type StrengthLabel,
  type StructureBias,
  type TradeReadiness,
  type TrendLabel,
  type VwapDistanceStatus,
  type VwapStatus,
  type VolumeBreakoutLabel,
  scoreBand,
} from "@/lib/opportunity";
import {
  detectStructuralLevels,
  nearestAbove,
  nearestBelow,
  pickLevel,
  sourceLabel,
} from "@/src/engines/opportunityResistance";
import {
  classifyBucket,
  classifyVwapStatus,
  describeRr,
  readinessFromParts,
  resolveOpportunityState,
  volumeLabels,
  vwapDistanceStatus,
} from "@/src/engines/opportunityScoring";

const FALLBACK_SECTOR: Record<string, { name: string; etf: string; slug: string }> = {
  ARM: { name: "Semiconductors", etf: "SOXX", slug: "semiconductors" },
  MRVL: { name: "Semiconductors", etf: "SOXX", slug: "semiconductors" },
  LRCX: { name: "Semiconductors", etf: "SOXX", slug: "semiconductors" },
  ANET: { name: "Technology", etf: "XLK", slug: "technology" },
  DELL: { name: "Technology", etf: "XLK", slug: "technology" },
  PLTR: { name: "Technology", etf: "XLK", slug: "technology" },
  SMH: { name: "Semiconductors", etf: "SOXX", slug: "semiconductors" },
};

export function sectorForTicker(symbol: string, quoteSector?: string | null) {
  const upper = symbol.toUpperCase();
  for (const meta of Object.values(SECTORS)) {
    if (meta.members.some(([s]) => s === upper)) {
      return { name: meta.name, etf: meta.etf, slug: meta.slug };
    }
  }
  if (FALLBACK_SECTOR[upper]) return FALLBACK_SECTOR[upper];
  if (quoteSector) {
    const etf = SECTOR_ETF[quoteSector];
    if (etf) {
      return { name: quoteSector, etf, slug: quoteSector.toLowerCase().replace(/\s+/g, "-") };
    }
  }
  return { name: "Unknown", etf: "", slug: "" };
}

export type TfSnap = {
  close: number;
  high: number;
  low: number;
  ema20: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  ema20Slope: number | null;
  ema50Slope: number | null;
  rsi: number | null;
  macd: number | null;
  macdHist: number | null;
  adx: number | null;
  roc: number | null;
  atr: number | null;
  atrPct: number | null;
  bbWidth: number | null;
  volContract: boolean;
  volume: number | null;
  avgVolume: number | null;
  rvol: number | null;
  volumeTrend: "Improving" | "Stable" | "Fading";
  vwap: number | null;
  vwapSlope: number | null;
  distVwapPct: number | null;
  vwapStatus: VwapStatus | "—";
  trend: TrendLabel;
  structure: string;
  hh: boolean;
  hl: boolean;
  lh: boolean;
  ll: boolean;
  lastClosedAbove: (level: number) => boolean;
  bars: OHLCVBar[];
};

function nums(series: (number | null)[]) {
  return series.map((v) => (v == null ? 0 : v));
}

export function snapshotTimeframe(bars: OHLCVBar[] | undefined, atrPeriod = 14): TfSnap | null {
  if (!bars || bars.length < 20) return null;
  const frame = toFrame(bars);
  const c = frame.get("close");
  const h = frame.get("high");
  const l = frame.get("low");
  const v = frame.get("volume");
  const ts = frame.timestamps();
  const ema20 = ema(c, 20);
  const ema50 = ema(c, 50);
  const ema100 = ema(c, 100);
  const ema200 = ema(c, 200);
  const rsiV = rsi(c, 14);
  const [macdL, , macdH] = macd(c);
  const atrV = atr(h, l, c, atrPeriod);
  const vwapV = vwap(h, l, c, v, ts);
  const [bbU, bbM, bbL] = bollinger(c, 20, 2);
  const adx = last(dmi(nums(h), nums(l), nums(c), 14).adx);
  const rocV = last(roc(nums(c), 12));
  const close = last(c);
  const high = last(h);
  const low = last(l);
  if (close == null || high == null || low == null) return null;
  const e20 = last(ema20);
  const e50 = last(ema50);
  const e100 = last(ema100);
  const e200 = last(ema200);
  const atrLast = last(atrV);
  const vwapLast = last(vwapV);
  const avgVol = last(v.map((x, i, arr) => {
    const slice = arr.slice(Math.max(0, i - 19), i + 1).filter((n): n is number => n != null);
    if (slice.length < 5) return null;
    return slice.reduce((s, n) => s + n, 0) / slice.length;
  }));
  const vol = last(v.map((x) => (x && x > 0 ? x : null)));
  const rvol = vol != null && avgVol && avgVol > 0 ? vol / avgVol : null;
  const bbULast = last(bbU);
  const bbLLast = last(bbL);
  const bbMLast = last(bbM);
  const bbWidth = bbULast != null && bbLLast != null && bbMLast ? (bbULast - bbLLast) / Math.abs(bbMLast) : null;
  const prevWidth = (() => {
    const idx = bbU.length - 8;
    if (idx < 0 || bbU[idx] == null || bbL[idx] == null || bbM[idx] == null) return null;
    return ((bbU[idx] as number) - (bbL[idx] as number)) / Math.abs(bbM[idx] as number);
  })();
  const flags = structureFlags(h, l, Math.min(20, bars.length));
  const above20 = e20 != null && close > e20;
  const above50 = e50 != null && close > e50;
  const below20 = e20 != null && close < e20;
  const below50 = e50 != null && close < e50;
  let trend: TrendLabel = "Neutral";
  if (above20 && above50 && flags.higher_highs && flags.higher_lows) trend = "Bullish";
  else if (below20 && below50 && flags.lower_highs && flags.lower_lows) trend = "Bearish";
  else if (above20 && above50) trend = "Bullish";
  else if (below50) trend = "Bearish";
  const structure = flags.higher_highs && flags.higher_lows
    ? "HH/HL"
    : flags.lower_highs && flags.lower_lows
      ? "LH/LL"
      : flags.higher_lows
        ? "Higher Low"
        : flags.lower_highs
          ? "Lower High"
          : "Mixed";
  const vwapSlope = slope(vwapV, 3);
  const distVwapPct = vwapLast ? ((close - vwapLast) / vwapLast) * 100 : null;
  const recentCloses = c.slice(-6, -1);
  const belowRecently =
    vwapV.slice(-6, -1).filter((v, i) => v != null && recentCloses[i] != null && (recentCloses[i] as number) < v).length >= 2;
  const vwapStatus: VwapStatus | "—" =
    vwapLast == null || distVwapPct == null
      ? "—"
      : classifyVwapStatus(distVwapPct, vwapSlope, belowRecently && distVwapPct >= 0, distVwapPct <= -0.25 && !belowRecently);
  const recentVol = v.slice(-8).filter((x): x is number => x != null);
  const olderVol = v.slice(-16, -8).filter((x): x is number => x != null);
  const recentAvg = recentVol.length ? recentVol.reduce((s, n) => s + n, 0) / recentVol.length : 0;
  const olderAvg = olderVol.length ? olderVol.reduce((s, n) => s + n, 0) / olderVol.length : recentAvg;
  const volumeTrend: TfSnap["volumeTrend"] = recentAvg > olderAvg * 1.08 ? "Improving" : recentAvg < olderAvg * 0.92 ? "Fading" : "Stable";
  return {
    close,
    high,
    low,
    ema20: e20,
    ema50: e50,
    ema100: e100,
    ema200: e200,
    ema20Slope: slope(ema20, 3),
    ema50Slope: slope(ema50, 3),
    rsi: last(rsiV),
    macd: last(macdL),
    macdHist: last(macdH),
    adx,
    roc: rocV,
    atr: atrLast,
    atrPct: atrLast != null ? (atrLast / close) * 100 : null,
    bbWidth,
    volContract: bbWidth != null && prevWidth != null ? bbWidth < prevWidth * 0.92 : false,
    volume: vol,
    avgVolume: avgVol,
    rvol,
    volumeTrend,
    vwap: vwapLast,
    vwapSlope,
    distVwapPct,
    vwapStatus,
    trend,
    structure,
    hh: flags.higher_highs,
    hl: flags.higher_lows,
    lh: flags.lower_highs,
    ll: flags.lower_lows,
    lastClosedAbove: (level: number) => bars[bars.length - 1].close > level,
    bars,
  };
}

function momentumLabel(snap: TfSnap | null): OpportunityTfRow["momentum"] {
  if (!snap) return "—";
  const rsiV = snap.rsi ?? 50;
  const hist = snap.macdHist ?? 0;
  if (rsiV >= 58 && hist > 0 && (snap.roc ?? 0) > 0) return "Strong";
  if (hist > 0 || (snap.rsi ?? 50) > 52) return "Improving";
  if (rsiV <= 42 && hist < 0) return "Weak";
  if (hist < 0) return "Weakening";
  return "Neutral";
}

export function vwapAlignment(snaps: Partial<Record<OpportunityTimeframe, TfSnap | null>>): {
  status: VwapStatus;
  label: string;
  detail: string;
  score: number;
} {
  const keys: OpportunityTimeframe[] = ["5m", "15m", "30m", "1h"];
  const above = keys.filter((tf) => {
    const s = snaps[tf];
    return s && s.vwap != null && s.close > s.vwap;
  }).length;
  const below = keys.filter((tf) => {
    const s = snaps[tf];
    return s && s.vwap != null && s.close < s.vwap;
  }).length;
  const slopePos = keys.filter((tf) => (snaps[tf]?.vwapSlope ?? 0) > 0).length;
  if (above >= 3 && slopePos >= 2) {
    return { status: "STRONG_SUPPORT", label: "Strong VWAP Alignment", detail: "5m, 15m, 30m and 1H hold above rising VWAP.", score: 91 };
  }
  if (above >= 2 && below <= 1) {
    return { status: "SUPPORT", label: "Moderate VWAP Alignment", detail: "15m and 30m remain above VWAP; lower timeframe is mixed.", score: 74 };
  }
  if (above >= 1 && below >= 1) {
    return { status: "RECLAIMING", label: "Weak VWAP Alignment", detail: "Price is near VWAP and repeatedly crossing it.", score: 48 };
  }
  if (below >= 3) {
    return { status: "STRONG_RESISTANCE", label: "Negative VWAP Alignment", detail: "15m and 30m are below VWAP.", score: 18 };
  }
  if (below >= 1) return { status: "LOST_VWAP", label: "VWAP Lost", detail: "Price lost VWAP on a key timeframe.", score: 28 };
  return { status: "NEUTRAL", label: "VWAP Neutral", detail: "VWAP is not providing a clear read.", score: 50 };
}

export function classifyRelativeStrength(stockRet: number | null, benchRet: number | null): RsLabel {
  if (stockRet == null || benchRet == null) return "Neutral";
  const diff = stockRet - benchRet;
  if (diff >= 3) return "Outperforming";
  if (diff >= 0.75) return "Improving";
  if (diff <= -3) return "Deteriorating";
  if (diff <= -0.75) return "Underperforming";
  return "Neutral";
}

export function strengthFromRs(label: RsLabel): StrengthLabel {
  if (label === "Outperforming") return "Strong";
  if (label === "Improving") return "Improving";
  if (label === "Underperforming") return "Weakening";
  if (label === "Deteriorating") return "Weak";
  return "Neutral";
}

export function periodReturn(closes: number[], bars: number) {
  if (closes.length <= bars) return null;
  const a = closes[closes.length - 1];
  const b = closes[closes.length - 1 - bars];
  if (!b) return null;
  return ((a - b) / b) * 100;
}

export type MarketRegime = {
  label: MarketRegimeLabel;
  risk: RiskRegime;
  explanation: string;
  spy: { trend: TrendLabel; vs20: string; vs50: string; price: number | null };
  qqq: { trend: TrendLabel; vs20: string; vs50: string; price: number | null };
  iwm: { trend: TrendLabel; vs20: string; vs50: string; price: number | null };
  vix: { trend: "Rising" | "Falling" | "Stable" | "—"; risk: string; price: number | null };
};

function vsEma(price: number | null, emaV: number | null) {
  if (price == null || emaV == null) return "—";
  return price >= emaV ? "Above" : "Below";
}

export function assessMarketRegime(input: {
  spy?: TfSnap | null;
  qqq?: TfSnap | null;
  iwm?: TfSnap | null;
  vix?: TfSnap | null;
}): MarketRegime {
  const spy = input.spy || null;
  const qqq = input.qqq || null;
  const iwm = input.iwm || null;
  const vix = input.vix || null;
  const vixRising = (vix?.ema20Slope ?? 0) > 0.01 || (vix?.roc ?? 0) > 2;
  const vixElevated = (vix?.close ?? 0) >= 22;
  const bull = (s: TfSnap | null) => !!s && s.trend === "Bullish" && (s.ema20 == null || s.close > s.ema20);
  const bear = (s: TfSnap | null) => !!s && s.trend === "Bearish";
  let label: MarketRegimeLabel = "NEUTRAL";
  let explanation = "Broad-market evidence is mixed. Individual ticker confirmation is still required.";
  if (bear(spy) && bear(qqq)) {
    label = "BEARISH";
    explanation = "SPY and QQQ are below key EMAs with weaker structure. Long setups face a hostile backdrop.";
  } else if (vixElevated && vixRising && !(bull(spy) && bull(qqq))) {
    label = "CAUTIOUS";
    explanation = "Volatility is elevated and rising. Treat breakouts as unconfirmed until they hold.";
  } else if (bull(spy) && bull(qqq)) {
    label = vixElevated ? "CAUTIOUS" : "BULLISH";
    explanation = vixElevated
      ? "Trend is constructive, but VIX is elevated. Size and confirmation matter more than usual."
      : "Broad-market trend is currently supportive of long setups, although individual ticker confirmation is still required.";
  } else if (vixRising) {
    label = "CAUTIOUS";
    explanation = "Index trend is mixed and VIX is rising. Wait for cleaner alignment before treating a trigger as confirmed.";
  }
  const pack = (s: TfSnap | null) => ({
    trend: s?.trend || "Neutral",
    vs20: vsEma(s?.close ?? null, s?.ema20 ?? null),
    vs50: vsEma(s?.close ?? null, s?.ema50 ?? null),
    price: s?.close ?? null,
  });
  const risk: RiskRegime = label === "BULLISH" ? "RISK-ON" : label === "BEARISH" ? "RISK-OFF" : "RISK-NEUTRAL";
  return {
    label,
    risk,
    explanation,
    spy: pack(spy),
    qqq: pack(qqq),
    iwm: pack(iwm),
    vix: {
      trend: !vix ? "—" : vixRising ? "Rising" : (vix.ema20Slope ?? 0) < -0.01 ? "Falling" : "Stable",
      risk: vixElevated ? "Elevated" : (vix?.close ?? 0) >= 16 ? "Moderate" : "Contained",
      price: vix?.close ?? null,
    },
  };
}

const POSITIVE_CATALYST = [
  "beats",
  "beat",
  "raises guidance",
  "raised guidance",
  "upgrade",
  "wins",
  "contract",
  "approval",
  "partnership",
  "launch",
  "record",
  "demand",
];
const NEGATIVE_CATALYST = [
  "miss",
  "cuts guidance",
  "lowered guidance",
  "downgrade",
  "lawsuit",
  "probe",
  "delay",
  "recall",
  "lay off",
  "investigation",
  "sec ",
];

function catalystCategory(headline: string): CatalystCategory {
  const raw = headlineCategory(headline).toLowerCase();
  if (raw.includes("earn")) return "EARNINGS";
  if (raw.includes("guidance")) return "GUIDANCE";
  if (raw.includes("product") || raw.includes("ai")) return "PRODUCT";
  if (raw.includes("contract")) return "CONTRACT";
  if (raw.includes("analyst") || raw.includes("upgrade") || raw.includes("downgrade")) return "ANALYST";
  if (raw.includes("macro") || raw.includes("fed")) return "MACRO";
  if (raw.includes("m&a") || raw.includes("merger")) return "M_AND_A";
  if (raw.includes("regulat") || raw.includes("sec")) return "REGULATORY";
  if (raw.includes("sector")) return "SECTOR";
  return "OTHER";
}

export function classifyCatalyst(headline: string): {
  type: CatalystType;
  relevance: "High" | "Medium" | "Low";
  category: CatalystCategory;
  relevanceScore: number;
} {
  const t = headline.toLowerCase();
  const pos = POSITIVE_CATALYST.some((w) => t.includes(w));
  const neg = NEGATIVE_CATALYST.some((w) => t.includes(w));
  const material = /earn|guidance|contract|approval|merger|acqui|lawsuit|downgrade|upgrade|product|partnership/.test(t);
  const category = catalystCategory(headline);
  if (pos && !neg) return { type: "Positive", relevance: material ? "High" : "Medium", category, relevanceScore: material ? 82 : 58 };
  if (neg) return { type: "Negative", relevance: material ? "High" : "Medium", category, relevanceScore: material ? 84 : 55 };
  const sent = headlineSentiment(headline);
  if (sent === "positive") return { type: "Positive", relevance: material ? "Medium" : "Low", category, relevanceScore: material ? 54 : 28 };
  if (sent === "negative") return { type: "Negative", relevance: material ? "Medium" : "Low", category, relevanceScore: material ? 56 : 26 };
  return { type: "Neutral", relevance: material ? "Medium" : "Low", category, relevanceScore: material ? 40 : 18 };
}

export function ageLabel(iso: string | null, now = Date.now()) {
  if (!iso) return "Unknown";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "Just now";
  const min = Math.round(ms / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr} hr ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function mapNews(raw: Record<string, unknown>[], lookbackHours: number, now = Date.now()): OpportunityNewsItem[] {
  const cutoff = now - lookbackHours * 3600_000;
  return raw
    .map((item) => {
      const headline = String(item.headline || item.title || "");
      const publishedAt = item.published_at ? String(item.published_at) : item.publishedAt ? String(item.publishedAt) : null;
      const ts = publishedAt ? new Date(publishedAt).getTime() : NaN;
      if (publishedAt && Number.isFinite(ts) && ts < cutoff) return null;
      const cat = classifyCatalyst(headline);
      const ageMs = publishedAt && Number.isFinite(new Date(publishedAt).getTime()) ? now - new Date(publishedAt).getTime() : 0;
      const freshness = clamp(100 - ageMs / (60 * 60 * 1000 * 0.8), 8, 100);
      const technicalImpact =
        cat.type === "Positive" && cat.relevance !== "Low" ? "SUPPORTIVE" : cat.type === "Negative" && cat.relevance !== "Low" ? "NEGATIVE" : "NEUTRAL";
      return {
        headline,
        source: String(item.source || item.publisher || "News"),
        publishedAt,
        age: ageLabel(publishedAt, now),
        catalystType: cat.type,
        category: cat.category,
        relevance: cat.relevance,
        relevanceScore: cat.relevanceScore,
        freshness: Math.round(freshness),
        technicalImpact,
        url: item.url ? String(item.url) : undefined,
      } satisfies OpportunityNewsItem;
    })
    .filter((x): x is OpportunityNewsItem => !!x && !!x.headline)
    .slice(0, 8);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatEt(iso = new Date().toISOString()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso)) + " ET";
}

export type OpportunityRow = {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  state: OpportunityState;
  setup: string;
  bucket: OpportunityBucket;
  tradeReadiness: TradeReadiness;
  technicalQuality: number | null;
  entryQuality: number | null;
  vwapQuality: number | null;
  volumeQuality: number | null;
  rsQuality: number | null;
  marketAlignment: number | null;
  catalystQuality: number | null;
  rrQuality: number | null;
  overallOpportunity: number | null;
  previousEvent: { flag: OpportunityEventFlag; reason: string; time: string } | null;
  breakout: string;
  vwap: string;
  volume: string;
  volumeDetail: { rvol: number | null; trend: string; breakoutVolume: VolumeBreakoutLabel };
  rs: StrengthLabel;
  sectorRs: StrengthLabel;
  marketRs: StrengthLabel;
  rsDetail: { spy20: number | null; qqq20: number | null; sector20: number | null; spy10: number | null; spy5: number | null; trend: string };
  catalyst: CatalystType | "None";
  rr: number | null;
  rrLabel: string;
  rrReason: string;
  rrStatus: string;
  breakoutScore: number | null;
  swingScore: number | null;
  breakoutBand: ReturnType<typeof scoreBand>;
  swingBand: ReturnType<typeof scoreBand>;
  scoreBreakdown: ScoreFactor[];
  swingBreakdown: ScoreFactor[];
  penalties: { label: string; points: number }[];
  whyNow: string[];
  waiting: string[];
  nextTrigger: string;
  invalidation: string;
  entry: number | null;
  entrySource: string;
  stop: number | null;
  stopSource: string;
  t1: number | null;
  t2: number | null;
  t3: number | null;
  t1Source: string;
  t2Source: string;
  t3Source: string;
  resistance: number | null;
  resistanceDetail: ResistanceLevel | null;
  resistances: {
    immediate: ResistanceLevel | null;
    m30: ResistanceLevel | null;
    h1: ResistanceLevel | null;
    h4: ResistanceLevel | null;
    daily: ResistanceLevel | null;
    weekly: ResistanceLevel | null;
    week52: ResistanceLevel | null;
    all: ResistanceLevel[];
  };
  support: number | null;
  distanceToResistancePct: number | null;
  vwapDetail: {
    alignment: string;
    status: VwapStatus | "—";
    distancePct: number | null;
    distanceStatus: VwapDistanceStatus;
    vwap: number | null;
    byTf: Partial<Record<OpportunityTimeframe, { status: VwapStatus | "—"; dist: number | null; value: number | null }>>;
  };
  earnings: { label: string; days: number | null; risk: boolean; insideSwing: boolean };
  sector: { name: string; etf: string; alignment: string; vsSpy: number | null; tickerVsSector: number | null };
  pattern: { name: string; status: string; bias: string } | null;
  structureBias: StructureBias;
  mtf: OpportunityTfRow[];
  mtfAlignmentPct: number | null;
  conflicts: { title: string; status: string; detail: string }[];
  overextended: boolean;
  overextension: { level: "NONE" | "MODERATE" | "HIGH"; detail: string };
  news: OpportunityNewsItem[];
  freshness: { market: string; news: string; technical: string; stale: boolean };
  alerts: { type: OpportunityAlertType; message: string; key: string }[];
  audit: { setupDetected: string; triggerReached: string | null; confirmed: string | null; retest: string | null; invalidated: string | null };
  auditHistory: { at: string; from: string; to: string; reason: string }[];
  charts: Partial<Record<"1d" | "30m" | "15m" | "5m", OpportunityChartBar[]>>;
  error?: string;
};

function chartBars(bars?: OHLCVBar[], take = 80): OpportunityChartBar[] {
  if (!bars?.length) return [];
  return bars.slice(-take).map((b) => ({
    time: Math.floor((b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp)).getTime() / 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
}

export function analyzeOpportunityTicker(input: {
  symbol: string;
  quote?: Quote | null;
  bars: Partial<Record<OpportunityTimeframe, OHLCVBar[]>>;
  spyDaily?: number[];
  qqqDaily?: number[];
  sectorDaily?: number[];
  news?: Record<string, unknown>[];
  earningsDays?: number | null;
  earningsDate?: string | null;
  regime: MarketRegime;
  settings?: OpportunitySettings;
  now?: number;
  error?: string;
}): OpportunityRow {
  const settings = input.settings || DEFAULT_OPPORTUNITY_SETTINGS;
  const now = input.now ?? Date.now();
  const symbol = input.symbol.toUpperCase();
  const sector = sectorForTicker(symbol, input.quote?.sector);
  const news = mapNews(input.news || [], settings.newsLookbackHours, now);
  const freshnessStale = input.quote?.freshness.data_status === "STALE";
  const baseFresh = {
    market: input.quote?.freshness.data_status || (input.bars["1d"]?.length ? "LIVE" : "UNAVAILABLE"),
    news: news[0]?.age || "No recent items",
    technical: input.bars["1d"]?.length ? "LIVE" : "UNAVAILABLE",
    stale: freshnessStale,
  };

  if (input.error || !input.bars["1d"] || input.bars["1d"].length < 30) {
    return {
      symbol,
      name: input.quote?.name || symbol,
      price: input.quote?.price ?? last(input.bars["1d"]?.map((b) => b.close) || []) ?? null,
      changePct: input.quote?.change_percent ?? null,
      state: "INSUFFICIENT DATA",
      setup: "Insufficient Data",
      breakout: "—",
      vwap: "—",
      volume: "—",
      rs: "Neutral",
      sectorRs: "Neutral",
      marketRs: "Neutral",
      bucket: "INSUFFICIENT",
      tradeReadiness: "NO TRADE",
      technicalQuality: null,
      entryQuality: null,
      vwapQuality: null,
      volumeQuality: null,
      rsQuality: null,
      marketAlignment: null,
      catalystQuality: null,
      rrQuality: null,
      overallOpportunity: null,
      previousEvent: null,
      volumeDetail: { rvol: null, trend: "—", breakoutVolume: "NOT YET CONFIRMED" },
      rsDetail: { spy20: null, qqq20: null, sector20: null, spy10: null, spy5: null, trend: "—" },
      catalyst: "None",
      rr: null,
      rrLabel: "R:R: N/A",
      rrReason: "Required market data is unavailable.",
      rrStatus: "N/A",
      breakoutScore: null,
      swingScore: null,
      breakoutBand: "Insufficient Data",
      swingBand: "Insufficient Data",
      scoreBreakdown: [],
      swingBreakdown: [],
      penalties: [],
      whyNow: [],
      waiting: ["Required market data is unavailable or stale."],
      nextTrigger: "Retry when market data is available.",
      invalidation: "—",
      entry: null,
      entrySource: "Insufficient data",
      stop: null,
      stopSource: "Insufficient data",
      t1: null,
      t2: null,
      t3: null,
      t1Source: "—",
      t2Source: "—",
      t3Source: "—",
      resistance: null,
      resistanceDetail: null,
      resistances: { immediate: null, m30: null, h1: null, h4: null, daily: null, weekly: null, week52: null, all: [] },
      support: null,
      distanceToResistancePct: null,
      vwapDetail: { alignment: "—", status: "—", distancePct: null, distanceStatus: "NORMAL", vwap: null, byTf: {} },
      earnings: { label: "Unavailable", days: input.earningsDays ?? null, risk: false, insideSwing: false },
      sector: { ...sector, alignment: "—", vsSpy: null, tickerVsSector: null },
      pattern: null,
      structureBias: "NEUTRAL",
      mtf: OPPORTUNITY_TF_ROWS(input.bars, settings.atrPeriod),
      mtfAlignmentPct: null,
      conflicts: [],
      overextended: false,
      overextension: { level: "NONE", detail: "Insufficient data" },
      news,
      freshness: { ...baseFresh, technical: "UNAVAILABLE" },
      alerts: [],
      audit: { setupDetected: formatEt(new Date(now).toISOString()), triggerReached: null, confirmed: null, retest: null, invalidated: null },
      auditHistory: [],
      charts: {},
      error: input.error || "Unable to retrieve enough market data.",
    };
  }

  const snaps: Partial<Record<OpportunityTimeframe, TfSnap | null>> = {};
  for (const tf of ["1w", "1d", "4h", "1h", "30m", "15m", "5m"] as OpportunityTimeframe[]) {
    snaps[tf] = snapshotTimeframe(input.bars[tf], settings.atrPeriod);
  }
  const daily = snaps["1d"]!;
  const weekly = snaps["1w"];
  const h4 = snaps["4h"];
  const h1 = snaps["1h"];
  const m30 = snaps["30m"];
  const m15 = snaps["15m"];
  const m5 = snaps["5m"];
  const price = input.quote?.price ?? daily.close;
  const structural = detectStructuralLevels({
    price,
    daily: input.bars["1d"],
    weekly: input.bars["1w"],
    h4: input.bars["4h"],
    h1: input.bars["1h"],
    m30: input.bars["30m"],
    week52High: input.quote?.week52_high ?? (input.bars["1d"] ? Math.max(...input.bars["1d"].slice(-252).map((b) => b.high)) : null),
  });
  const immediate = nearestAbove(structural.resistances, price);
  const res30 = pickLevel(structural.resistances, "30m") || immediate;
  const res1h = pickLevel(structural.resistances, "1h");
  const res4h = pickLevel(structural.resistances, "4h");
  const resDaily = pickLevel(structural.resistances, "1d");
  const resWeekly = pickLevel(structural.resistances, "1w");
  const res52 = structural.resistances.find((l) => l.source === "52_WEEK_HIGH") || null;
  const resistanceLevel = immediate || res30 || resDaily;
  const resistance = resistanceLevel?.price ?? null;
  const supportLevel = nearestBelow(structural.supports, price);
  const support = supportLevel?.price ?? null;
  const distRes = resistance && price ? ((resistance - price) / price) * 100 : null;
  const distSup = support && price ? ((price - support) / price) * 100 : null;

  const dailyCloses = input.bars["1d"].map((b) => b.close);
  const rsSpy = classifyRelativeStrength(periodReturn(dailyCloses, 20), periodReturn(input.spyDaily || [], 20));
  const rsQqq = classifyRelativeStrength(periodReturn(dailyCloses, 20), periodReturn(input.qqqDaily || [], 20));
  const rsSector = classifyRelativeStrength(periodReturn(dailyCloses, 20), periodReturn(input.sectorDaily || [], 20));
  const rs5 = classifyRelativeStrength(periodReturn(dailyCloses, 5), periodReturn(input.spyDaily || [], 5));
  const stockRs = strengthFromRs(rsSpy);
  const sectorRs = strengthFromRs(rsSector);
  const marketRs = strengthFromRs(rsQqq);

  const vwapPack = vwapAlignment(snaps);
  const patternHit = pickPrimaryPattern(input.bars["1d"]);
  const pattern = patternHit.name !== "No reliable pattern detected"
    ? { name: patternHit.name, status: patternHit.status, bias: patternHit.bias }
    : null;

  const catalystItem = news.find((n) => n.relevance !== "Low") || news[0];
  const catalyst: CatalystType | "None" = catalystItem ? catalystItem.catalystType : "None";
  const earningsDays = input.earningsDays ?? null;
  const earningsRisk = earningsDays != null && earningsDays <= settings.earningsWarnDays;
  const earningsLabel =
    earningsDays == null
      ? "Unavailable"
      : earningsDays <= 0
        ? "Today / after close"
        : earningsDays === 1
          ? "Tomorrow"
          : `${earningsDays} trading days away`;

  const confirm = settings.confirmTimeframe === "15m" ? m15 : m30;
  const rvol = confirm?.rvol ?? m30?.rvol ?? daily.rvol;
  const closedAbove = resistance != null && confirm ? confirm.lastClosedAbove(resistance) : false;
  const heldAbove = resistance != null && price > resistance && (m15?.close ?? price) > resistance;
  const confirmBars = (confirm?.bars || []).filter((b) => b.volume > 0);
  const lostBreakout =
    resistance != null &&
    confirmBars.length >= 4 &&
    confirmBars.slice(-8, -1).filter((b) => b.close > resistance * 1.002).length >= 1 &&
    confirmBars[confirmBars.length - 1].close < resistance * 0.997 &&
    price < resistance * 0.997;
  const retestZone = resistance != null && heldAbove && (m30?.low ?? daily.low) <= resistance * 1.004 && (m30?.close ?? daily.close) >= resistance;
  const testsOk = (resistanceLevel?.testCount || 0) >= settings.minResistanceTests || (resistanceLevel?.source === "CONSOLIDATION_HIGH");
  const nearRes = resistance != null && distRes != null && distRes >= 0 && distRes <= settings.breakoutProximityPct && testsOk;
  const volumeOk = rvol != null && rvol >= settings.minRelVolume;
  const vwapOk = !settings.requireVwapSupport || ["SUPPORT", "STRONG_SUPPORT", "ABOVE_VWAP", "RECLAIMING"].includes(vwapPack.status);

  const atrFromEma = daily.ema20 && daily.atr ? (price - daily.ema20) / daily.atr : null;
  const overextended =
    (daily.distVwapPct != null && daily.distVwapPct > settings.overextensionPct) ||
    (atrFromEma != null && atrFromEma > 2.4) ||
    (daily.rsi != null && daily.rsi > settings.rsiMax);
  const overLevel = atrFromEma != null && atrFromEma > 2.8 || (daily.distVwapPct != null && daily.distVwapPct > settings.overextensionPct * 1.3)
    ? "HIGH"
    : overextended
      ? "MODERATE"
      : "NONE";

  const structureBias: StructureBias = daily.hh && daily.hl ? "BULLISH" : daily.lh && daily.ll ? "BEARISH" : daily.hl || daily.lh ? "TRANSITIONING" : "NEUTRAL";
  const patternConflict = !!(pattern && ((pattern.bias === "BULLISH" && (h4?.trend === "Bearish" || structureBias === "BEARISH")) || (pattern.bias === "BEARISH" && structureBias === "BULLISH")));

  const conflicts: OpportunityRow["conflicts"] = [];
  if (daily.trend === "Bullish" && m5?.trend === "Bearish") {
    conflicts.push({
      title: "STRUCTURE CONFLICT",
      status: "WAIT FOR LOWER-TIMEFRAME CONFIRMATION",
      detail: `Daily trend: Bullish. 4H: ${h4?.trend || "—"}. 30m: ${m30?.trend || "—"}. 5m: Bearish.`,
    });
  }
  if (closedAbove && !volumeOk) {
    conflicts.push({
      title: "TECHNICAL CONFLICT",
      status: "UNCONFIRMED BREAKOUT",
      detail: "Price closed above resistance BUT volume confirmation is missing.",
    });
  }
  if (patternConflict && pattern) {
    conflicts.push({
      title: "STRUCTURE CONFLICT",
      status: "PATTERN / STRUCTURE DISAGREE",
      detail: `Pattern suggests ${pattern.bias.toLowerCase()} continuation, but ${h4?.trend === "Bearish" ? "4H" : "daily"} structure remains ${structureBias.toLowerCase()} because price has not broken the most recent opposing swing.`,
    });
  }
  if (daily.trend === "Bullish" && weekly?.trend === "Bearish") {
    conflicts.push({
      title: "STRUCTURE CONFLICT",
      status: "HIGHER-TIMEFRAME DISAGREES",
      detail: "Daily is constructive while weekly structure is still bearish.",
    });
  }

  const resolved = resolveOpportunityState({
    nearRes: !!nearRes && (daily.hl || !!m30?.hl) && daily.trend !== "Bearish",
    closedAbove,
    heldAbove,
    volumeOk,
    vwapOk,
    retestHold: !!retestZone,
    failedBreakout: lostBreakout,
    lostVwapAfterBreak: lostBreakout && (m30?.vwapStatus === "LOST_VWAP" || m15?.vwapStatus === "LOST_VWAP"),
    dailyBullish: daily.trend === "Bullish" || structureBias === "BULLISH",
    structureConflict: conflicts.some((c) => c.title === "STRUCTURE CONFLICT"),
    insufficient: false,
  });
  let state = resolved.state;
  if (input.regime.label === "BEARISH" && state === "DEVELOPING" && !nearRes) state = "NO TRADE";
  if (catalyst === "Negative" && catalystItem?.relevance === "High" && state === "PRE-BREAKOUT") {
    conflicts.push({ title: "CATALYST CONFLICT", status: "NEGATIVE CATALYST", detail: "High-relevance negative news conflicts with a long setup." });
  }

  const entry = ["TRIGGERED", "CONFIRMED", "RETEST", "ACTIVE"].includes(state)
    ? (state === "RETEST" && resistance ? resistance : price)
    : nearRes && resistance
      ? resistance
      : null;
  const stop = support != null && (!entry || support < entry)
    ? support
    : null;
  const targetAnchor = entry ?? price;
  const aboveEntry = structural.resistances
    .filter((l) => l.price > targetAnchor * 1.004)
    .sort((a, b) => a.price - b.price);
  const t1Level = aboveEntry[0] || null;
  const t2Level = aboveEntry.find((l) => t1Level != null && l.price > t1Level.price * 1.006) || null;
  const t3Level =
    aboveEntry.find((l) => t2Level != null && l.price > t2Level.price * 1.006) ||
    (res52 && t2Level && res52.price > t2Level.price * 1.006 ? res52 : null);
  const nextRes = t1Level;
  const t1 = t1Level?.price ?? null;
  const t2 = t2Level?.price ?? null;
  const t3 = t3Level?.price ?? null;
  const rr = entry != null && stop != null && t1 != null && entry > stop && t1 > entry ? round2((t1 - entry) / (entry - stop)) : null;
  const packRR = describeRr(rr, rr == null ? "N/A" : rr < 1 ? "POOR / NO TRADE" : rr < 1.5 ? "WEAK" : rr < 2 ? "ACCEPTABLE" : rr < 3 ? "STRONG" : "VERY STRONG", entry, stop, t1);
  const poorRR = rr != null && rr < settings.minRR;
  if (poorRR) {
    conflicts.push({
      title: "RISK/REWARD CONFLICT",
      status: "POOR RISK/REWARD",
      detail: `Technical setup can remain visible, but R:R ${rr?.toFixed(2)} : 1 is below the ${settings.minRR.toFixed(1)} minimum.`,
    });
  }
  if (overextended) {
    conflicts.push({
      title: "OVEREXTENSION",
      status: "WAIT FOR PULLBACK",
      detail: `Price is ${daily.distVwapPct != null ? `${daily.distVwapPct.toFixed(1)}% vs VWAP` : "extended from VWAP/EMA"}.`,
    });
  }

  const mtf = OPPORTUNITY_TF_ROWS(input.bars, settings.atrPeriod, snaps);
  const aligned = mtf.filter((r) => r.trend === "Bullish").length;
  const known = mtf.filter((r) => r.trend !== "—").length;
  const mtfAlignmentPct = known ? Math.round((aligned / known) * 100) : null;

  const dailyStruct = clamp((daily.hh && daily.hl ? 14 : daily.hl ? 10 : daily.trend === "Bullish" ? 9 : daily.trend === "Bearish" ? 3 : 7) + (weekly?.trend === "Bullish" ? 1 : 0), 0, 15);
  const m30Struct = clamp(m30 ? (m30.hl && m30.trend === "Bullish" ? 9 : m30.hl ? 7 : m30.trend === "Bullish" ? 6 : 3) : 3, 0, 10);
  const m15Mom = clamp(m15 ? (momentumLabel(m15) === "Strong" ? 9 : momentumLabel(m15) === "Improving" ? 7 : 4) : 3, 0, 10);
  const m5Entry = clamp(m5 ? (m5.hl ? 4 : m5.trend === "Bullish" ? 3 : 1) : 2, 0, 5);
  const vwapPts = clamp(Math.round(vwapPack.score / 10), 0, 10);
  const volPts = clamp(rvol == null ? 4 : rvol >= settings.minRelVolume ? 9 : rvol >= 1 ? 6 : 3, 0, 10);
  const proxPts = distRes == null ? 3 : distRes < 0 ? (heldAbove ? 8 : 2) : distRes <= settings.breakoutProximityPct ? 9 : distRes <= 4 ? 6 : 3;
  const rsPts = stockRs === "Strong" ? 9 : stockRs === "Improving" ? 7 : stockRs === "Neutral" ? 5 : 2;
  const sectorPts = sectorRs === "Strong" ? 5 : sectorRs === "Improving" ? 4 : sectorRs === "Neutral" ? 3 : 1;
  const regimePts = input.regime.label === "BULLISH" ? 5 : input.regime.label === "NEUTRAL" ? 3 : input.regime.label === "CAUTIOUS" ? 2 : 0;
  const catPts = catalyst === "Positive" ? 5 : catalyst === "Negative" ? 1 : 3;
  const rrPts = rr == null ? 2 : rr >= 2.5 ? 5 : rr >= settings.minRR ? 4 : 1;

  const penalties: { label: string; points: number }[] = [];
  if (input.regime.label === "BEARISH") penalties.push({ label: "Major bearish market regime", points: 12 });
  if (lostBreakout) penalties.push({ label: "Previous failed breakout (history only)", points: 4 });
  if (catalyst === "Negative" && (catalystItem?.relevance === "High")) penalties.push({ label: "Major negative catalyst", points: 10 });
  if (overextended) penalties.push({ label: "Overextended from VWAP/EMA", points: 8 });
  if (poorRR) penalties.push({ label: "Poor risk/reward", points: 6 });
  if (earningsRisk) penalties.push({ label: "Earnings approaching", points: 2 });
  if (conflicts.some((c) => c.status.includes("UNCONFIRMED"))) penalties.push({ label: "Unconfirmed breakout", points: 5 });
  if (daily.trend === "Bearish" && support != null && price < support) penalties.push({ label: "Price below major support", points: 12 });

  const rawBreakout = dailyStruct + m30Struct + m15Mom + m5Entry + vwapPts + volPts + proxPts + rsPts + sectorPts + regimePts + catPts + rrPts;
  const breakoutScore = clamp(rawBreakout - penalties.reduce((s, p) => s + p.points, 0), 0, 100);

  const swingFactors: ScoreFactor[] = [
    { name: "Daily Trend", score: daily.trend === "Bullish" ? 14 : daily.trend === "Neutral" ? 8 : 3, max: 14, note: daily.trend },
    { name: "Weekly Trend", score: weekly?.trend === "Bullish" ? 12 : weekly?.trend === "Neutral" ? 6 : weekly ? 2 : 4, max: 12, note: weekly?.trend || "Unavailable" },
    { name: "Momentum", score: momentumLabel(daily) === "Strong" ? 10 : momentumLabel(daily) === "Improving" ? 7 : 4, max: 10, note: String(momentumLabel(daily)) },
    { name: "Relative Strength", score: rsPts, max: 10, note: rsSpy },
    { name: "Sector Strength", score: sectorPts, max: 8, note: rsSector },
    { name: "Consolidation Quality", score: daily.volContract || (m30?.volContract ?? false) ? 8 : 4, max: 8, note: daily.volContract ? "Range contracting" : "No contraction" },
    { name: "Breakout Potential", score: nearRes || closedAbove ? 8 : 4, max: 8, note: nearRes ? "Near resistance" : closedAbove ? "Triggered" : "Not close" },
    { name: "Catalyst", score: catPts, max: 6, note: String(catalyst) },
    { name: "Volatility / ATR", score: daily.atrPct != null && daily.atrPct < 4 ? 6 : 3, max: 6, note: daily.atrPct != null ? `${daily.atrPct.toFixed(1)}% ATR` : "n/a" },
    { name: "Risk/Reward", score: rrPts, max: 6, note: rr != null ? `${rr.toFixed(1)} : 1` : "N/A" },
    { name: "Market Regime", score: regimePts, max: 6, note: input.regime.label },
    { name: "Support Distance", score: distSup != null && distSup < 8 ? 6 : 3, max: 6, note: distSup != null ? `${distSup.toFixed(1)}%` : "n/a" },
  ];
  const swingScore = clamp(swingFactors.reduce((s, f) => s + f.score, 0) - (overextended ? 8 : 0) - (input.regime.label === "BEARISH" ? 10 : 0) - (lostBreakout ? 8 : 0), 0, 100);

  const scoreBreakdown: ScoreFactor[] = [
    { name: "Daily / Weekly Structure", score: dailyStruct, max: 15, note: `${daily.structure} / ${weekly?.structure || "—"}` },
    { name: "30m Structure", score: m30Struct, max: 10, note: m30?.structure || "Unavailable" },
    { name: "15m Momentum", score: m15Mom, max: 10, note: String(momentumLabel(m15)) },
    { name: "5m Entry Structure", score: m5Entry, max: 5, note: m5?.structure || "Unavailable" },
    { name: "VWAP Alignment", score: vwapPts, max: 10, note: vwapPack.label },
    { name: "Volume", score: volPts, max: 10, note: rvol != null ? `${rvol.toFixed(2)}x` : "n/a" },
    { name: "Resistance Proximity", score: proxPts, max: 10, note: distRes != null ? `${distRes.toFixed(1)}%` : "n/a" },
    { name: "Relative Strength", score: rsPts, max: 10, note: rsSpy },
    { name: "Sector", score: sectorPts, max: 5, note: rsSector },
    { name: "Market Regime", score: regimePts, max: 5, note: input.regime.label },
    { name: "Catalyst", score: catPts, max: 5, note: String(catalyst) },
    { name: "Risk/Reward", score: rrPts, max: 5, note: rr != null ? `${rr.toFixed(1)} : 1` : "N/A" },
  ];

  const whyNow: string[] = [];
  if (resistanceLevel && distRes != null && distRes >= 0) {
    whyNow.push(`Price is ${distRes.toFixed(2)}% below a ${resistanceLevel.timeframe} ${sourceLabel(resistanceLevel.source).toLowerCase()} ($${resistanceLevel.price.toFixed(2)}).`);
    whyNow.push(`Resistance has been tested ${resistanceLevel.testCount} time${resistanceLevel.testCount === 1 ? "" : "s"}${resistanceLevel.lastTestTime ? ` · last ${formatEt(resistanceLevel.lastTestTime)}` : ""}.`);
  }
  if (daily.hh && daily.hl) whyNow.push("Daily structure is bullish HH/HL.");
  if (m30?.hl) whyNow.push("30m structure is forming higher lows beneath resistance.");
  if (m30?.vwap != null && m30.close > m30.vwap) whyNow.push(`30m price remains above VWAP ($${m30.vwap.toFixed(2)}).`);
  if (rvol != null) whyNow.push(`Relative volume is ${rvol.toFixed(2)}x.`);
  if (periodReturn(dailyCloses, 10) != null && periodReturn(input.spyDaily || [], 10) != null) {
    const vs = (periodReturn(dailyCloses, 10) || 0) - (periodReturn(input.spyDaily || [], 10) || 0);
    if (vs > 0) whyNow.push(`Sector/ticker is outperforming SPY by ${vs.toFixed(1)}% over 10 sessions.`);
  }
  if (!news.some((n) => n.catalystType === "Negative" && n.relevance === "High")) whyNow.push("No major negative catalyst detected.");
  if (pattern) whyNow.push(`Chart Pattern engine: ${pattern.name} (${pattern.status}).`);

  const waiting: string[] = [];
  if (state === "PRE-BREAKOUT" || state === "DEVELOPING") {
    waiting.push("Breakout has not yet occurred.");
    if (!volumeOk) waiting.push("Breakout volume is not yet confirmed.");
    if (m5 && m5.trend !== "Bullish") waiting.push("5m structure has not confirmed.");
  }
  if (earningsRisk) waiting.push(`Earnings in ${earningsDays} trading day${earningsDays === 1 ? "" : "s"}. Gap risk is elevated.`);
  if (overextended) waiting.push("Price is significantly extended from VWAP. Chasing risk is elevated. Wait for consolidation or a controlled pullback.");
  if (conflicts.length) waiting.push(conflicts[0].status);

  const nextTrigger = resistance
    ? `${settings.confirmTimeframe} close above $${resistance.toFixed(2)} with relative volume >= ${settings.minRelVolume.toFixed(1)}x${settings.requireVwapSupport ? " and 15m VWAP remaining supportive." : "."}`
    : "Unable to define a trigger until a structural resistance is identified.";

  const invalidation = stop != null
    ? `${settings.confirmTimeframe} close below $${stop.toFixed(2)} AND loss of higher-low structure.`
    : "A close back below the nearest structural support.";

  const volPack = volumeLabels({
    rvol,
    trend: daily.volumeTrend,
    broken: closedAbove,
    confirmed: closedAbove && volumeOk && (state === "CONFIRMED" || state === "RETEST" || state === "ACTIVE"),
  });

  const alerts: { type: OpportunityAlertType; message: string; key: string }[] = [];
  if (nearRes) alerts.push({ type: "APPROACHING_BREAKOUT", message: `${symbol} is within ${distRes?.toFixed(2)}% of structural resistance $${resistance?.toFixed(2)}.`, key: `${symbol}:near:${resistance}` });
  if (state === "TRIGGERED" || state === "CONFIRMED") alerts.push({ type: "BREAKOUT_TRIGGERED", message: `${symbol} closed above $${resistance?.toFixed(2)}.`, key: `${symbol}:trigger:${resistance}` });
  if (closedAbove && volumeOk) alerts.push({ type: "VOLUME_CONFIRMATION", message: `${symbol} breakout volume confirmed at ${rvol?.toFixed(2)}x.`, key: `${symbol}:vol:${resistance}` });
  if (vwapPack.status === "SUPPORT" || vwapPack.status === "STRONG_SUPPORT") {
    alerts.push({ type: "VWAP_CONFIRMATION", message: `${symbol}: 15m and 30m VWAP alignment is supportive.`, key: `${symbol}:vwap:${vwapPack.status}` });
  }
  if (state === "RETEST") alerts.push({ type: "SUCCESSFUL_RETEST", message: `${symbol} retested $${resistance?.toFixed(2)} and held.`, key: `${symbol}:retest:${resistance}` });
  if (lostBreakout) alerts.push({ type: "BREAKOUT_FAILURE", message: `${symbol}: previous breakout invalidated; current setup rebuilding.`, key: `${symbol}:fail:${resistance}` });
  if (catalystItem && catalystItem.relevance !== "Low") {
    alerts.push({ type: "NEWS_CATALYST", message: `${symbol} ${catalyst.toLowerCase()} catalyst: ${catalystItem.headline}`, key: `${symbol}:news:${catalystItem.headline.slice(0, 40)}` });
  }

  const setup = state === "PRE-BREAKOUT" ? "Pre-Breakout" : state === "TRIGGERED" ? "Triggered" : state === "CONFIRMED" ? "Confirmed" : state === "RETEST" ? "Retest" : state === "ACTIVE" ? "Active" : state === "DEVELOPING" ? "Developing" : state === "NO TRADE" ? "No Trade" : "Insufficient Data";

  const ts = formatEt(new Date(now).toISOString());
  const spy20 = periodReturn(dailyCloses, 20);
  const qqq20 = periodReturn(input.qqqDaily || [], 20);
  const sector20 = periodReturn(input.sectorDaily || [], 20);
  const spy10 = periodReturn(input.spyDaily || [], 10);
  const spy5v = periodReturn(input.spyDaily || [], 5);
  const stock20 = spy20;
  const stock10 = periodReturn(dailyCloses, 10);
  const stock5 = periodReturn(dailyCloses, 5);
  const rsTrend = stock5 != null && stock10 != null && stock20 != null
    ? stock5 - (spy5v || 0) > stock10 - (spy10 || 0) ? "IMPROVING" : stock5 - (spy5v || 0) < stock10 - (spy10 || 0) - 0.4 ? "WEAKENING" : "STABLE"
    : "—";
  const technicalQuality = breakoutScore;
  const entryQuality = clamp(
    (state === "CONFIRMED" || state === "RETEST" || state === "ACTIVE" ? 62 : state === "TRIGGERED" ? 48 : state === "PRE-BREAKOUT" ? 36 : 22) +
      (vwapOk ? 8 : 0) +
      (volumeOk ? 8 : 0) +
      (nearRes ? 6 : 0) +
      (m5?.hl ? 4 : 0) -
      (overextended ? 18 : 0) -
      (rr != null && rr < 1 ? 12 : 0),
    0,
    100,
  );
  const vwapQuality = vwapPack.score;
  const volumeQuality = clamp(rvol == null ? 40 : Math.round(Math.min(100, rvol * 40)), 0, 100);
  const rsQuality = clamp(rsPts * 10, 0, 100);
  const marketAlignment = clamp(regimePts * 12 + sectorPts * 8, 0, 100);
  const catalystQuality = clamp(catPts * 16 + (catalystItem?.freshness || 20) * 0.2, 0, 100);
  const rrQuality = rr == null ? 20 : clamp(Math.round(rr * 28), 0, 100);
  const ready = readinessFromParts({
    technical: technicalQuality,
    entry: entryQuality,
    rr,
    minRR: settings.minRR,
    vwapOk,
    overextended,
    regime: input.regime.label,
    negativeCatalyst: catalyst === "Negative" && catalystItem?.relevance === "High",
    conflict: conflicts.some((c) => c.title.includes("CONFLICT")),
    state,
  });
  const overall = clamp(Math.round(technicalQuality * 0.34 + entryQuality * 0.16 + ready.score * 0.18 + marketAlignment * 0.12 + catalystQuality * 0.1 + rrQuality * 0.1), 0, 100);
  const bucket = classifyBucket({
    state,
    technical: technicalQuality,
    rr,
    minRR: settings.minRR,
    minTechnical: settings.minTechnicalScore,
    conflict: conflicts.some((c) => c.title === "STRUCTURE CONFLICT"),
    negativeCatalyst: catalyst === "Negative" && catalystItem?.relevance === "High",
    vwapOk,
  });
  const sectorVsSpy = sector20 != null && periodReturn(input.spyDaily || [], 20) != null ? sector20 - (periodReturn(input.spyDaily || [], 20) || 0) : null;
  const tickerVsSector = stock20 != null && sector20 != null ? stock20 - sector20 : null;

  return {
    symbol,
    name: input.quote?.name || symbol,
    price,
    changePct: input.quote?.change_percent ?? null,
    state,
    setup,
    bucket,
    tradeReadiness: ready.label,
    technicalQuality,
    entryQuality,
    vwapQuality,
    volumeQuality,
    rsQuality,
    marketAlignment,
    catalystQuality,
    rrQuality,
    overallOpportunity: overall,
    previousEvent: resolved.event ? { flag: resolved.event, reason: resolved.reason, time: ts } : null,
    breakout: closedAbove ? (volumeOk ? "Confirmed close" : "Unconfirmed close") : nearRes ? `${distRes?.toFixed(2)}% to ${resistanceLevel ? sourceLabel(resistanceLevel.source) : "resistance"}` : "Not close",
    vwap: `${vwapPack.label}${m30?.vwap != null && m30.distVwapPct != null ? ` · ${m30.distVwapPct >= 0 ? "+" : ""}${m30.distVwapPct.toFixed(1)}% vs 30m VWAP` : ""}`,
    volume: volPack.display,
    volumeDetail: { rvol, trend: volPack.trendLabel, breakoutVolume: volPack.breakoutVolume },
    rs: stockRs,
    sectorRs,
    marketRs,
    rsDetail: {
      spy20: stock20 != null && periodReturn(input.spyDaily || [], 20) != null ? round2(stock20 - (periodReturn(input.spyDaily || [], 20) || 0)) : null,
      qqq20: stock20 != null && qqq20 != null ? round2(stock20 - qqq20) : null,
      sector20: tickerVsSector != null ? round2(tickerVsSector) : null,
      spy10: stock10 != null && spy10 != null ? round2(stock10 - spy10) : null,
      spy5: stock5 != null && spy5v != null ? round2(stock5 - spy5v) : null,
      trend: rsTrend,
    },
    catalyst,
    rr,
    rrLabel: packRR.label,
    rrReason: packRR.reason,
    rrStatus: rr == null ? "N/A" : rr < 1 ? "POOR / NO TRADE" : rr < 1.5 ? "WEAK" : rr < 2 ? "ACCEPTABLE" : rr < 3 ? "STRONG" : "VERY STRONG",
    breakoutScore: technicalQuality,
    swingScore: swingScore,
    breakoutBand: scoreBand(technicalQuality),
    swingBand: scoreBand(swingScore),
    scoreBreakdown,
    swingBreakdown: swingFactors,
    penalties,
    whyNow: whyNow.slice(0, 6),
    waiting,
    nextTrigger,
    invalidation,
    entry: entry != null ? round2(entry) : null,
    entrySource: state === "RETEST" ? "Retest of breakout level" : closedAbove ? "Breakout close" : nearRes ? "Breakout above structural resistance" : "No confirmed entry trigger",
    stop: stop != null ? round2(stop) : null,
    stopSource: supportLevel ? `${supportLevel.timeframe} ${sourceLabel(supportLevel.source).toLowerCase()}` : daily.ema20 != null ? "Daily 20 EMA + structure" : "Insufficient structural support",
    t1: t1 != null ? round2(t1) : null,
    t2: t2 != null ? round2(t2) : null,
    t3: t3 != null ? round2(t3) : null,
    t1Source: t1Level ? `${t1Level.timeframe} ${sourceLabel(t1Level.source)}` : "No structural target above entry",
    t2Source: t2Level ? `${t2Level.timeframe} ${sourceLabel(t2Level.source)}` : "No higher structural target",
    t3Source: t3Level ? `${t3Level.timeframe} ${sourceLabel(t3Level.source)}` : "No extension target",
    resistance: resistance != null ? round2(resistance) : null,
    resistanceDetail: resistanceLevel,
    resistances: { immediate, m30: res30, h1: res1h, h4: res4h, daily: resDaily, weekly: resWeekly, week52: res52, all: structural.resistances },
    support: support != null ? round2(support) : null,
    distanceToResistancePct: distRes != null ? round2(distRes) : null,
    vwapDetail: {
      alignment: vwapPack.label,
      status: vwapPack.status,
      distancePct: m30?.distVwapPct ?? daily.distVwapPct,
      distanceStatus: vwapDistanceStatus(m30?.distVwapPct ?? daily.distVwapPct, settings.overextensionPct),
      vwap: m30?.vwap ?? daily.vwap,
      byTf: {
        "5m": { status: m5?.vwapStatus || "—", dist: m5?.distVwapPct ?? null, value: m5?.vwap ?? null },
        "15m": { status: m15?.vwapStatus || "—", dist: m15?.distVwapPct ?? null, value: m15?.vwap ?? null },
        "30m": { status: m30?.vwapStatus || "—", dist: m30?.distVwapPct ?? null, value: m30?.vwap ?? null },
        "1h": { status: h1?.vwapStatus || "—", dist: h1?.distVwapPct ?? null, value: h1?.vwap ?? null },
        "4h": { status: h4?.vwapStatus || "—", dist: h4?.distVwapPct ?? null, value: h4?.vwap ?? null },
        "1d": { status: daily.vwapStatus, dist: daily.distVwapPct, value: daily.vwap },
      },
    },
    earnings: { label: earningsLabel, days: earningsDays, risk: earningsRisk, insideSwing: earningsDays != null && earningsDays <= 15 },
    sector: {
      ...sector,
      alignment: sectorRs === "Strong" || sectorRs === "Improving" ? "STRONG" : sectorRs === "Weak" || sectorRs === "Weakening" ? "WEAK" : "NEUTRAL",
      vsSpy: sectorVsSpy != null ? round2(sectorVsSpy) : null,
      tickerVsSector: tickerVsSector != null ? round2(tickerVsSector) : null,
    },
    pattern,
    structureBias,
    mtf,
    mtfAlignmentPct,
    conflicts,
    overextended,
    overextension: {
      level: overLevel,
      detail: overLevel === "NONE"
        ? "Distance from VWAP/EMA is not excessive."
        : `Price is ${atrFromEma != null ? `${atrFromEma.toFixed(1)} ATR from 20 EMA` : "extended"}; ${daily.distVwapPct != null ? `${daily.distVwapPct.toFixed(1)}% vs VWAP` : ""}. Preferred: wait for pullback.`,
    },
    news,
    freshness: baseFresh,
    alerts: alerts.filter((a) => settings.enabledAlerts.includes(a.type)),
    audit: {
      setupDetected: ts,
      triggerReached: state === "TRIGGERED" || state === "CONFIRMED" || state === "RETEST" || state === "ACTIVE" ? ts : null,
      confirmed: state === "CONFIRMED" || state === "RETEST" || state === "ACTIVE" ? ts : null,
      retest: state === "RETEST" ? ts : null,
      invalidated: resolved.event ? ts : null,
    },
    auditHistory: resolved.event ? [{ at: ts, from: "PRE-BREAKOUT", to: state, reason: resolved.reason }] : [{ at: ts, from: "—", to: state, reason: resolved.reason }],
    charts: {
      "1d": chartBars(input.bars["1d"]),
      "30m": chartBars(input.bars["30m"]),
      "15m": chartBars(input.bars["15m"]),
      "5m": chartBars(input.bars["5m"]),
    },
  };
}

function OPPORTUNITY_TF_ROWS(
  bars: Partial<Record<OpportunityTimeframe, OHLCVBar[]>>,
  atrPeriod = 14,
  snaps?: Partial<Record<OpportunityTimeframe, TfSnap | null>>,
): OpportunityTfRow[] {
  return (["1w", "1d", "4h", "1h", "30m", "15m", "5m"] as OpportunityTimeframe[]).map((tf) => {
    const snap = snaps?.[tf] ?? snapshotTimeframe(bars[tf], atrPeriod);
    if (!snap) return { timeframe: tf, trend: "—", vwap: "—", momentum: "—", structure: "—" };
    return {
      timeframe: tf,
      trend: snap.trend,
      vwap: tf === "1w" || tf === "1d" ? "—" : snap.vwapStatus,
      momentum: momentumLabel(snap),
      structure: snap.structure,
    };
  });
}

export function summarizeStates(rows: OpportunityRow[]) {
  const counts: Record<string, number> = {
    "PRE-BREAKOUT": 0,
    TRIGGERED: 0,
    CONFIRMED: 0,
    RETEST: 0,
    DEVELOPING: 0,
    ACTIVE: 0,
    "NO TRADE": 0,
    "INSUFFICIENT DATA": 0,
  };
  for (const row of rows) counts[row.state] = (counts[row.state] || 0) + 1;
  return {
    monitored: rows.length,
    preBreakout: counts["PRE-BREAKOUT"],
    triggered: counts.TRIGGERED,
    confirmed: counts.CONFIRMED,
    retest: counts.RETEST,
    developing: counts.DEVELOPING,
    noTrade: counts["NO TRADE"],
    invalidated: rows.filter((r) => r.previousEvent?.flag).length,
    insufficient: counts["INSUFFICIENT DATA"],
    breakoutWatch: rows.filter((r) => r.bucket === "BREAKOUT_WATCH").length,
    technicalWatch: rows.filter((r) => r.bucket === "TECHNICAL_WATCH").length,
  };
}

export function resampleToMinutes(bars: OHLCVBar[], minutes: number, timeframe: string): OHLCVBar[] {
  if (!bars.length) return [];
  const buckets = new Map<number, OHLCVBar[]>();
  const ms = minutes * 60 * 1000;
  for (const b of bars) {
    const t = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
    const key = Math.floor(t.getTime() / ms) * ms + ms;
    const list = buckets.get(key) || [];
    list.push({ ...b, timestamp: t });
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, list]) => ({
      symbol: list[0].symbol,
      timestamp: new Date(key),
      open: list[0].open,
      high: Math.max(...list.map((x) => x.high)),
      low: Math.min(...list.map((x) => x.low)),
      close: list[list.length - 1].close,
      volume: list.reduce((s, x) => s + x.volume, 0),
      timeframe,
      source: "resample",
    }));
}
