import type {
  AltcoinSeasonLabel,
  CryptoAsset,
  CryptoBreadth,
  CryptoGauge,
  CryptoGaugeLabel,
  CryptoGlobal,
  CryptoRotation,
  CryptoScannerRow,
  CryptoStructure,
  CryptoStructureStatus,
} from "@/lib/crypto";
import { atr, ema, last, macd, rsi, structureFlags, vwap } from "@/src/engines/indicators";
import { sma, type Frame } from "@/src/lib/series";

export function dominanceChange24h(currentDom: number | null, assetMcapChange: number | null, totalMcapChange: number | null): number | null {
  if (currentDom == null || assetMcapChange == null || totalMcapChange == null) return null;
  const prev = currentDom * (1 + totalMcapChange / 100) / (1 + assetMcapChange / 100);
  if (!Number.isFinite(prev)) return null;
  return currentDom - prev;
}

export function periodChange(points: { time: number; value: number }[], days: number, now = Date.now()): number | null {
  if (points.length < 2) return null;
  const target = now - days * 86_400_000;
  let prior = points[0];
  for (const p of points) {
    if (p.time * (p.time < 1e12 ? 1000 : 1) <= target) prior = p;
  }
  const lastPt = points[points.length - 1];
  if (!prior.value || !lastPt.value) return null;
  return ((lastPt.value / prior.value - 1) * 100);
}

export function ytdChange(points: { time: number; value: number }[], now = new Date()): number | null {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  return periodChange(points, (now.getTime() - start) / 86_400_000, now.getTime());
}

export function marketStructure(frame: Frame | null): CryptoStructure | null {
  if (!frame || frame.empty || frame.rows.length < 20) {
    return {
      trend: "INSUFFICIENT_DATA",
      higherHigh: false,
      higherLow: false,
      lowerHigh: false,
      lowerLow: false,
      support: null,
      resistance: null,
      atr: null,
      volatility: null,
      rsi: null,
      macd: null,
      ema20: null,
      ema50: null,
      sma20: null,
      sma50: null,
      sma200: null,
      vwap: null,
      status: "FORMING",
      explanation: "Not enough completed candles to classify market structure. No look-ahead is used.",
    };
  }
  const close = frame.get("close");
  const high = frame.get("high");
  const low = frame.get("low");
  const volume = frame.get("volume");
  const flags = structureFlags(high, low, Math.min(20, frame.rows.length));
  const ema20 = last(ema(close, 20));
  const ema50 = last(ema(close, 50));
  const s20 = last(sma(close, 20));
  const s50 = last(sma(close, 50));
  const s200 = last(sma(close, 200));
  const lastClose = last(close);
  const lastAtr = last(atr(high, low, close, 14));
  const [macdLine] = macd(close);
  const lastRsi = last(rsi(close, 14));
  const lastVwap = last(vwap(high, low, close, volume, frame.timestamps()));
  const look = Math.min(40, frame.rows.length);
  const recentHigh = Math.max(...(high.slice(-look).filter((v): v is number => v != null)));
  const recentLow = Math.min(...(low.slice(-look).filter((v): v is number => v != null)));
  let trend: CryptoStructure["trend"] = "RANGE";
  if (flags.higher_highs && flags.higher_lows) trend = "UPTREND";
  else if (flags.lower_highs && flags.lower_lows) trend = "DOWNTREND";
  const status = structureStatus(lastClose, recentHigh, recentLow, lastAtr, trend);
  const vol = lastClose && lastAtr ? (lastAtr / lastClose) * 100 : null;
  return {
    trend,
    higherHigh: flags.higher_highs,
    higherLow: flags.higher_lows,
    lowerHigh: flags.lower_highs,
    lowerLow: flags.lower_lows,
    support: Number.isFinite(recentLow) ? recentLow : null,
    resistance: Number.isFinite(recentHigh) ? recentHigh : null,
    atr: lastAtr,
    volatility: vol,
    rsi: lastRsi,
    macd: last(macdLine),
    ema20,
    ema50,
    sma20: s20,
    sma50: s50,
    sma200: s200,
    vwap: lastVwap,
    status,
    explanation: structureExplanation(trend, status, lastClose, recentHigh, recentLow),
  };
}

function structureStatus(
  close: number | null,
  resistance: number,
  support: number,
  atrValue: number | null,
  trend: CryptoStructure["trend"],
): CryptoStructureStatus {
  if (close == null || !Number.isFinite(resistance) || !Number.isFinite(support)) return "FORMING";
  const buffer = atrValue && atrValue > 0 ? atrValue * 0.15 : close * 0.004;
  if (close > resistance + buffer) return "BREAKOUT_CONFIRMED";
  if (close > resistance - buffer && close <= resistance + buffer) return "BREAKOUT_PENDING";
  if (trend === "UPTREND" && close >= support - buffer && close <= support + buffer) return "RETEST_PENDING";
  if (trend === "DOWNTREND" && close < support - buffer) return "FAILED";
  return "FORMING";
}

function structureExplanation(
  trend: CryptoStructure["trend"],
  status: CryptoStructureStatus,
  close: number | null,
  resistance: number,
  support: number,
) {
  const px = close != null ? close.toFixed(2) : "n/a";
  return `Last completed structure is ${trend.replaceAll("_", " ").toLowerCase()} (${status.replaceAll("_", " ")}). Close ${px} vs resistance ${resistance.toFixed(2)} / support ${support.toFixed(2)}. Status uses completed candles only.`;
}

export function computeBreadth(assets: CryptoAsset[], universe: "TOP_50" | "TOP_100"): CryptoBreadth {
  const slice = assets.filter((a) => a.rank != null && a.rank <= (universe === "TOP_50" ? 50 : 100));
  const n = slice.length;
  const advancing = slice.filter((a) => (a.change24h ?? 0) > 0).length;
  const declining = slice.filter((a) => (a.change24h ?? 0) < 0).length;
  const unchanged = Math.max(0, n - advancing - declining);
  const dma = dmaCounts(slice);
  return {
    universe,
    advancing,
    declining,
    unchanged,
    advancingPct: n ? (advancing / n) * 100 : null,
    decliningPct: n ? (declining / n) * 100 : null,
    above20Dma: dma.n20,
    above50Dma: dma.n50,
    above200Dma: dma.n200,
    above20DmaPct: dma.d20 ? (dma.n20! / dma.d20) * 100 : null,
    above50DmaPct: dma.d50 ? (dma.n50! / dma.d50) * 100 : null,
    above200DmaPct: dma.d200 ? (dma.n200! / dma.d200) * 100 : null,
    dmaSource: dma.d20 || dma.d50 || dma.d200 ? "sparkline/lookback approximation on ranked coins" : "unavailable",
    dmaAvailable: Boolean(dma.d20 || dma.d50 || dma.d200),
  };
}

function dmaCounts(assets: CryptoAsset[]) {
  let n20 = 0;
  let d20 = 0;
  let n50 = 0;
  let d50 = 0;
  let n200 = 0;
  let d200 = 0;
  for (const a of assets) {
    if (a.price == null) continue;
    if (a.sparkline.length >= 20) {
      d20 += 1;
      const mean = avg(a.sparkline.slice(-20));
      if (mean != null && a.price > mean) n20 += 1;
    }
    if (a.change30d != null) {
      d50 += 1;
      if (a.change30d > 0) n50 += 1;
    }
    if (a.change200d != null) {
      d200 += 1;
      if (a.change200d > 0) n200 += 1;
    }
  }
  return {
    n20: d20 ? n20 : null,
    d20,
    n50: d50 ? n50 : null,
    d50,
    n200: d200 ? n200 : null,
    d200,
  };
}

function avg(values: number[]) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

export function computeRotation(assets: CryptoAsset[], global: CryptoGlobal): CryptoRotation {
  const btc = assets.find((a) => a.symbol === "BTC");
  const eth = assets.find((a) => a.symbol === "ETH");
  const large = bucket(assets, 1, 10);
  const mid = bucket(assets, 11, 50);
  const small = bucket(assets, 51, 100);
  const alts = assets.filter((a) => a.symbol !== "BTC");
  const price = [
    { label: "BTC", change24h: btc?.change24h ?? null },
    { label: "ETH", change24h: eth?.change24h ?? null },
    { label: "Large Caps (Top 10)", change24h: meanChange(large) },
    { label: "Mid Caps (11-50)", change24h: meanChange(mid) },
    { label: "Small Caps (51-100)", change24h: meanChange(small) },
    { label: "Altcoins (ex-BTC)", change24h: meanChange(alts) },
  ];
  const volumeRows = [
    { label: "BTC", volume24h: btc?.volume24h ?? null },
    { label: "ETH", volume24h: eth?.volume24h ?? null },
    { label: "Large Caps", volume24h: sum(large, (a) => a.volume24h) },
    { label: "Mid Caps", volume24h: sum(mid, (a) => a.volume24h) },
    { label: "Small Caps", volume24h: sum(small, (a) => a.volume24h) },
  ];
  const volTotal = volumeRows.reduce((s, r) => s + (r.volume24h || 0), 0);
  const capRows = [
    { label: "BTC", marketCap: global.btcMarketCap },
    { label: "ETH", marketCap: global.ethMarketCap },
    { label: "Altcoins", marketCap: global.altcoinMarketCap },
  ];
  const capTotal = capRows.reduce((s, r) => s + (r.marketCap || 0), 0);
  return {
    price,
    volume: volumeRows.map((r) => ({ ...r, share: volTotal && r.volume24h != null ? (r.volume24h / volTotal) * 100 : null })),
    marketCap: capRows.map((r) => ({ ...r, share: capTotal && r.marketCap != null ? (r.marketCap / capTotal) * 100 : null })),
    note: "These rows measure price, volume, and market-cap share. They do not claim actual capital is moving between wallets.",
  };
}

function bucket(assets: CryptoAsset[], from: number, to: number) {
  return assets.filter((a) => a.rank != null && a.rank >= from && a.rank <= to);
}

function meanChange(assets: CryptoAsset[]) {
  const vals = assets.map((a) => a.change24h).filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function sum(assets: CryptoAsset[], fn: (a: CryptoAsset) => number | null) {
  const vals = assets.map(fn).filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0);
}

export function relativeStrength(asset: CryptoAsset, bench: CryptoAsset | null, key: "change24h" | "change7d" | "change30d") {
  if (asset[key] == null || bench?.[key] == null) return null;
  return asset[key]! - bench[key]!;
}

export function buildScanner(assets: CryptoAsset[], btc: CryptoAsset | null, eth: CryptoAsset | null): CryptoScannerRow[] {
  return assets.map((a) => ({
    symbol: a.symbol,
    name: a.name,
    id: a.id,
    price: a.price,
    marketCap: a.marketCap,
    volume24h: a.volume24h,
    change24h: a.change24h,
    change7d: a.change7d,
    change30d: a.change30d,
    rsBtc: relativeStrength(a, btc, "change7d"),
    rsEth: relativeStrength(a, eth, "change7d"),
    rsi: null,
    volumeSurge: Boolean(a.volumeChange24h != null && a.volumeChange24h >= 50),
    sector: null,
  }));
}

export function altcoinSeason(input: {
  btcDominance: number | null;
  ethBtc: number | null;
  top50BeatBtc: number | null;
  top100BeatBtc: number | null;
  altBreadth: number | null;
}): { label: AltcoinSeasonLabel; score: number | null; methodology: string; inputs: string[] } {
  const parts: { w: number; v: number | null; label: string }[] = [
    { w: 0.25, v: input.btcDominance != null ? clamp(100 - input.btcDominance, 0, 100) : null, label: `BTC dominance ${fmt(input.btcDominance)}%` },
    { w: 0.2, v: input.top50BeatBtc, label: `Top 50 beating BTC: ${fmt(input.top50BeatBtc)}%` },
    { w: 0.2, v: input.top100BeatBtc, label: `Top 100 beating BTC: ${fmt(input.top100BeatBtc)}%` },
    { w: 0.2, v: input.altBreadth, label: `Alt 24h breadth: ${fmt(input.altBreadth)}%` },
    { w: 0.15, v: input.ethBtc != null ? clamp(50 + input.ethBtc * 4, 0, 100) : null, label: `ETH/BTC 24h ${fmt(input.ethBtc)}%` },
  ];
  const usable = parts.filter((p) => p.v != null);
  const weight = usable.reduce((s, p) => s + p.w, 0);
  const score = usable.length ? usable.reduce((s, p) => s + (p.v as number) * p.w, 0) / weight : null;
  let label: AltcoinSeasonLabel = "Transition";
  if (score != null && score >= 68) label = "Altcoin Season";
  else if (score != null && score >= 55) label = "Altcoin Rotation";
  else if (score != null && score <= 35) label = "BTC Season";
  return {
    label,
    score,
    methodology:
      "Score is a weighted blend of BTC dominance (inverted), share of Top 50/100 beating BTC on 7D, alt 24h breadth, and ETH/BTC 24h. It is a regime label, not a forecast.",
    inputs: parts.map((p) => p.label),
  };
}

export function oiInterpretation(priceChange: number | null, oiChange: number | null): string | null {
  if (priceChange == null || oiChange == null) return null;
  if (priceChange > 0 && oiChange > 0) return "Possible Interpretation: new leverage may be opening with the advance.";
  if (priceChange > 0 && oiChange < 0) return "Possible Interpretation: short covering / deleveraging may be lifting price.";
  if (priceChange < 0 && oiChange > 0) return "Possible Interpretation: new downside positioning may be opening.";
  if (priceChange < 0 && oiChange < 0) return "Possible Interpretation: deleveraging may be accompanying the decline.";
  return "Possible Interpretation: price and open interest are mixed; no clean leverage read.";
}

export function cryptoGauge(input: {
  btcChange24h: number | null;
  btcTrendUp: boolean | null;
  btcDominance: number | null;
  ethChange24h: number | null;
  altBreadth: number | null;
  totalChange24h: number | null;
  volumeChange24h: number | null;
  stableChange: number | null;
  funding: number | null;
  sentiment: number | null;
}): CryptoGauge {
  const rows: { label: string; value: string; raw: number | null; score: (n: number) => number }[] = [
    { label: "BTC 24h", value: fmtPct(input.btcChange24h), raw: input.btcChange24h, score: (n) => clamp(50 + n * 6, 0, 100) },
    { label: "BTC trend", value: input.btcTrendUp == null ? "—" : input.btcTrendUp ? "Uptrend" : "Downtrend", raw: input.btcTrendUp == null ? null : input.btcTrendUp ? 70 : 30, score: (n) => n },
    { label: "BTC dominance", value: fmt(input.btcDominance, 1) + (input.btcDominance != null ? "%" : ""), raw: input.btcDominance, score: (n) => clamp(100 - (n - 40) * 1.4, 0, 100) },
    { label: "ETH 24h", value: fmtPct(input.ethChange24h), raw: input.ethChange24h, score: (n) => clamp(50 + n * 6, 0, 100) },
    { label: "Alt breadth", value: fmt(input.altBreadth, 1) + (input.altBreadth != null ? "%" : ""), raw: input.altBreadth, score: (n) => n },
    { label: "Total market cap 24h", value: fmtPct(input.totalChange24h), raw: input.totalChange24h, score: (n) => clamp(50 + n * 8, 0, 100) },
    { label: "Volume 24h change", value: fmtPct(input.volumeChange24h), raw: input.volumeChange24h, score: (n) => clamp(50 + n * 0.4, 0, 100) },
    { label: "Stablecoin 7d", value: fmtPct(input.stableChange), raw: input.stableChange, score: (n) => clamp(50 + n * 8, 0, 100) },
    { label: "BTC funding", value: input.funding == null ? "—" : `${(input.funding * 100).toFixed(4)}%`, raw: input.funding, score: (n) => clamp(50 - n * 8000, 0, 100) },
    { label: "Sentiment", value: input.sentiment == null ? "—" : String(Math.round(input.sentiment)), raw: input.sentiment, score: (n) => n },
  ];
  const scored = rows.map((r) => ({
    label: r.label,
    value: r.value,
    score: r.raw == null ? Number.NaN : r.score(r.raw),
  }));
  const usable = scored.filter((r) => Number.isFinite(r.score));
  const score = usable.length ? usable.reduce((s, r) => s + r.score, 0) / usable.length : 50;
  let label: CryptoGaugeLabel = "NEUTRAL";
  if (score >= 62) label = "RISK-ON";
  else if (score <= 38) label = "RISK-OFF";
  return {
    label,
    score: Math.round(score),
    inputs: scored.map((r) => ({ label: r.label, value: r.value, score: Number.isFinite(r.score) ? Math.round(r.score) : 0 })),
    explanation: `Gauge ${label} from ${usable.length} available inputs. Score ${Math.round(score)}/100. This is a transparent average, not an AI score.`,
  };
}

export function factualSummary(input: {
  global: CryptoGlobal;
  btc: CryptoAsset | null;
  eth: CryptoAsset | null;
  breadth: CryptoBreadth;
  rotation: CryptoRotation;
  gauge: CryptoGauge;
  sentimentLabel: string | null;
  newsHeadlines: string[];
}): string[] {
  const lines: string[] = [];
  if (input.global.totalMarketCap != null) {
    lines.push(
      `Total market: $${compactNum(input.global.totalMarketCap)} (${fmtPct(input.global.marketCapChange24h)} 24h), volume $${compactNum(input.global.totalVolume24h)}.`,
    );
  }
  if (input.btc?.price != null) {
    lines.push(`Bitcoin: ${input.btc.price.toFixed(2)} (${fmtPct(input.btc.change24h)} 24h), dominance ${fmt(input.global.btcDominance, 1)}%.`);
  }
  if (input.eth?.price != null) {
    lines.push(`Ethereum: ${input.eth.price.toFixed(2)} (${fmtPct(input.eth.change24h)} 24h), dominance ${fmt(input.global.ethDominance, 1)}%.`);
  }
  if (input.breadth.advancingPct != null) {
    lines.push(`Altcoin breadth (${input.breadth.universe.replace("_", " ")}): ${input.breadth.advancingPct.toFixed(1)}% advancing / ${input.breadth.decliningPct?.toFixed(1) ?? "—"}% declining.`);
  }
  const leader = [...input.rotation.price].sort((a, b) => (b.change24h ?? -999) - (a.change24h ?? -999))[0];
  if (leader?.change24h != null) lines.push(`Capital rotation (price-based): ${leader.label} is the strongest 24h cohort at ${fmtPct(leader.change24h)}. ${input.rotation.note}`);
  if (input.global.total2 != null) lines.push(`TOTAL2 (ex-BTC) ${compactNum(input.global.total2)}; TOTAL3 (ex-BTC+ETH) ${compactNum(input.global.total3)}.`);
  lines.push(`Market gauge: ${input.gauge.label} (${input.gauge.score}/100). Sentiment: ${input.sentimentLabel || "unavailable"}.`);
  if (input.newsHeadlines[0]) lines.push(`Major catalyst: ${input.newsHeadlines[0]}`);
  return lines;
}

function compactNum(n?: number | null) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  return n.toFixed(0);
}

function fmt(n?: number | null, digits = 2) {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
}

function fmtPct(n?: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
