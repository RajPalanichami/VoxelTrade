import { getSettings, TIMEFRAME_LABELS } from "@/src/config/env";
import type { Confidence, Indicators, SignalEvidence, SignalLabel, SRLevels, StatusTone, TradingPlan } from "@/src/types/domain";

export const BASE_WEIGHTS: Record<string, number> = {
  price_trend: 15,
  rsi: 10,
  macd: 10,
  volume: 10,
  sr: 15,
  fundamentals: 10,
  earnings: 8,
  market: 7,
  rates: 5,
  catalysts: 10,
};

export const TF_WEIGHTS: Record<string, Record<string, number>> = {
  "5m": {
    price_trend: 18,
    rsi: 14,
    macd: 14,
    volume: 14,
    sr: 18,
    fundamentals: 4,
    earnings: 3,
    market: 7,
    rates: 2,
    catalysts: 6,
  },
  "30m": {
    price_trend: 16,
    rsi: 12,
    macd: 12,
    volume: 12,
    sr: 16,
    fundamentals: 6,
    earnings: 5,
    market: 8,
    rates: 3,
    catalysts: 10,
  },
  "1h": { ...BASE_WEIGHTS },
  "4h": {
    price_trend: 18,
    rsi: 8,
    macd: 10,
    volume: 8,
    sr: 18,
    fundamentals: 8,
    earnings: 6,
    market: 10,
    rates: 4,
    catalysts: 10,
  },
  "1d": {
    price_trend: 12,
    rsi: 8,
    macd: 8,
    volume: 8,
    sr: 12,
    fundamentals: 14,
    earnings: 12,
    market: 10,
    rates: 8,
    catalysts: 8,
  },
};

function clamp(x: number, lo = 0, hi = 10): number {
  return Math.max(lo, Math.min(hi, x));
}

function tone(score: number): StatusTone {
  if (score >= 7) return "BULLISH";
  if (score <= 3.5) return "BEARISH";
  if (score >= 5.5 && score < 7) return "CAUTION";
  return "NEUTRAL";
}

export function scorePriceTrend(ind: Indicators, timeframe: string): [number, string, Record<string, unknown>] {
  const px = ind.last_close ?? null;
  const evidence = { price: px, ema9: ind.ema9, ema20: ind.ema20, ema21: ind.ema21, ema50: ind.ema50, ema200: ind.ema200 };
  if (px == null) return [5, "Insufficient price history.", evidence];

  const e20 = ind.ema20 ?? ind.ema21 ?? null;
  const e50 = ind.ema50 ?? null;
  const e200 = ind.ema200 ?? null;
  const e9 = ind.ema9 ?? null;
  const e21 = ind.ema21 ?? null;
  let score = 5;
  const bits: string[] = [];

  if (timeframe === "5m" || timeframe === "30m") {
    if (e9 != null && e21 != null && px > e9 && e9 > e21) {
      score = 8;
      bits.push("Price > EMA9 > EMA21");
      if (e50 != null && e21 > e50) {
        score = 9;
        bits.push("EMA21 > EMA50");
      }
    } else if (e9 != null && e21 != null && px < e9 && e9 < e21) {
      score = 2;
      bits.push("Price < EMA9 < EMA21");
    } else if (e9 != null && e21 != null) {
      bits.push("EMAs mixed / chop");
      score = 4.5;
    }
    if (ind.vwap != null) {
      if (px > ind.vwap) {
        score = Math.min(10, score + 0.8);
        bits.push("Price > VWAP");
      } else {
        score = Math.max(0, score - 0.8);
        bits.push("Price < VWAP");
      }
    }
  } else {
    const stackedUp = e20 != null && e50 != null && e200 != null && px > e20 && e20 > e50 && e50 > e200;
    const stackedDn = e20 != null && e50 != null && e200 != null && px < e20 && e20 < e50 && e50 < e200;
    if (stackedUp) {
      score = 9;
      bits.push("Price > EMA20 > EMA50 > EMA200");
      const slopes = [ind.ema20_slope, ind.ema50_slope, ind.ema200_slope].filter((s) => s != null) as number[];
      if (slopes.length && slopes.every((s) => s > 0)) {
        score = 10;
        bits.push("All EMA slopes positive");
      }
    } else if (stackedDn) {
      score = 1.5;
      bits.push("Price < EMA20 < EMA50 < EMA200");
    } else {
      const above = [e20, e50, e200].filter((e) => e != null && px > e).length;
      score = 3 + above * 1.5;
      bits.push(`Price above ${above}/3 major EMAs`);
    }
    if (e9 != null && e21 != null) {
      if (e9 > e21) {
        score = Math.min(10, score + 0.4);
        bits.push("EMA9 > EMA21");
      } else {
        score = Math.max(0, score - 0.4);
      }
    }
    if (timeframe === "1h" && ind.vwap != null) {
      if (px > ind.vwap) {
        score = Math.min(10, score + 0.5);
        bits.push("Price > VWAP");
      } else {
        score = Math.max(0, score - 0.5);
        bits.push("Price < VWAP");
      }
    }
    if (ind.higher_highs && ind.higher_lows) {
      score = Math.min(10, score + 0.4);
      bits.push("Higher highs & higher lows");
    } else if (ind.lower_highs && ind.lower_lows) {
      score = Math.max(0, score - 0.4);
      bits.push("Lower highs & lower lows");
    }
  }
  if (e200 == null) bits.push("EMA200 unavailable (insufficient history)");
  return [clamp(score), bits.join("; ") || "Trend mixed.", evidence];
}

export function scoreRsi(ind: Indicators): [number, string, Record<string, unknown>] {
  const r = ind.rsi ?? null;
  const prev = ind.rsi_prev ?? null;
  const ev = { rsi: r, rsi_prev: prev };
  if (r == null) return [5, "RSI unavailable.", ev];
  const rising = prev != null && r > prev;
  const falling = prev != null && r < prev;
  if (r >= 55 && r <= 70 && rising) return [9.5, `RSI ${r.toFixed(1)} in 55–70 and rising (strong bullish momentum).`, ev];
  if (r >= 50 && r <= 70 && rising) return [8, `RSI ${r.toFixed(1)} in 50–70 and rising.`, ev];
  if (r >= 50 && r <= 70) return [7, `RSI ${r.toFixed(1)} constructive (50–70).`, ev];
  if (r > 70) return [6.5, `RSI ${r.toFixed(1)} > 70 — strong momentum with pullback risk (not auto-bearish).`, ev];
  if (r < 30 && falling) return [1.5, `RSI ${r.toFixed(1)} < 30 and falling (strong bearish).`, ev];
  if (r < 30) return [3.5, `RSI ${r.toFixed(1)} oversold — bounce risk, still weak.`, ev];
  if (r < 50) return [3, `RSI ${r.toFixed(1)} < 50 (bearish momentum).`, ev];
  return [5, `RSI ${r.toFixed(1)} neutral.`, ev];
}

export function scoreMacd(ind: Indicators): [number, string, Record<string, unknown>] {
  const m = ind.macd ?? null;
  const s = ind.macd_signal ?? null;
  const h = ind.macd_hist ?? null;
  const hp = ind.macd_hist_prev ?? null;
  const ev = { macd: m, signal: s, hist: h, hist_prev: hp };
  if (m == null || s == null || h == null) return [5, "MACD unavailable.", ev];
  const rising = hp != null && h > hp;
  const bullishCross = m > s && hp != null && (hp <= 0 && 0 <= h || (m > s && rising && h > 0));
  if (m > s && h > 0 && rising) return [9.5, "MACD > signal, histogram positive and rising (strong bullish).", ev];
  if (m > s && h > 0) return [8, "MACD > signal and histogram > 0.", ev];
  if (bullishCross) return [8.5, "Bullish MACD crossover developing.", ev];
  if (m < s && h < 0 && (hp == null || h < hp)) return [2, "MACD < signal, histogram negative and falling.", ev];
  if (m < s && h < 0) return [2.5, "MACD < signal and histogram < 0.", ev];
  if (m > s) return [6, "MACD above signal but histogram mixed.", ev];
  return [4, "MACD mixed / flattening.", ev];
}

export function scoreVolume(ind: Indicators, breakout: boolean): [number, string, Record<string, unknown>] {
  const vr = ind.volume_ratio ?? null;
  const ev = { volume_ratio: vr, last_volume: ind.last_volume, avg20: ind.volume_sma20, breakout };
  if (vr == null) return [5, "Volume ratio unavailable.", ev];
  if (vr >= 1.5) {
    const msg = breakout
      ? `Volume ${vr.toFixed(2)}x average — bullish breakout confirmation.`
      : `Volume ${vr.toFixed(2)}x average (strong).`;
    return [breakout ? 9 : 8, msg, ev];
  }
  if (vr >= 1.2) return [7.5, `Volume ${vr.toFixed(2)}x average — good confirmation.`, ev];
  if (vr >= 0.8) return [5.5, `Volume ${vr.toFixed(2)}x average — normal / neutral.`, ev];
  return [3, `Volume ${vr.toFixed(2)}x average — weak participation.`, ev];
}

export function scoreSr(ind: Indicators, levels: SRLevels, breakout: boolean): [number, string, Record<string, unknown>] {
  const px = ind.last_close ?? null;
  const ev = { price: px, s1: levels.s1, s2: levels.s2, r1: levels.r1, r2: levels.r2, pivot: levels.pivot, vwap: levels.vwap };
  if (px == null) return [5, "No price for S/R scoring.", ev];
  let score = 5;
  const bits: string[] = [];
  if (levels.s1 != null && px >= levels.s1) {
    score += 1.5;
    bits.push(`Holding above S1 ${levels.s1.toFixed(2)}`);
  } else if (levels.s1 != null) {
    score -= 1.5;
    bits.push(`Lost S1 ${levels.s1.toFixed(2)}`);
  }
  if (levels.r1 != null) {
    const dist = (levels.r1 - px) / px;
    if (dist > 0 && dist < 0.0025) {
      score -= 1.2;
      bits.push(`Pressed directly under R1 ${levels.r1.toFixed(2)}`);
    } else if (px > levels.r1 && breakout) {
      score += 2;
      bits.push(`Breakout above R1 ${levels.r1.toFixed(2)}`);
    } else if (px > levels.r1) {
      score += 0.8;
      bits.push(`Trading above R1 ${levels.r1.toFixed(2)}`);
    } else {
      bits.push(`Room to R1 ${levels.r1.toFixed(2)}`);
    }
  }
  if (levels.pivot != null) {
    if (px > levels.pivot) {
      score += 0.8;
      bits.push("Above pivot");
    } else {
      score -= 0.5;
      bits.push("Below pivot");
    }
  }
  if (levels.vwap != null) {
    if (px > levels.vwap) {
      score += 0.7;
      bits.push("Above VWAP");
    } else {
      score -= 0.7;
      bits.push("Below VWAP");
    }
  }
  return [clamp(score), bits.join("; ") || "S/R mixed.", ev];
}

export function scoreFundamentals(fund: Record<string, unknown> | null | undefined): [number, string, Record<string, unknown>] {
  if (!fund) return [5, "Fundamentals unavailable — scored neutral (does not invent values).", {}];
  let score = 0;
  const bits: string[] = [];
  const rev = fund.revenue_growth as number | undefined;
  const eps = fund.eps_growth as number | undefined;
  const gm = fund.gross_margin as number | undefined;
  const om = fund.operating_margin as number | undefined;
  const fcf = fund.fcf_growth as number | undefined;
  const debtOk = fund.healthy_balance;
  const pe = fund.pe as number | undefined;
  const fwdPe = fund.forward_pe as number | undefined;
  const profitable = fund.profitable;
  if (rev != null) {
    if (rev > 0.1) {
      score += 2;
      bits.push(`Revenue growth ${(rev * 100).toFixed(1)}%`);
    } else if (rev > 0) {
      score += 1;
      bits.push(`Revenue growth ${(rev * 100).toFixed(1)}%`);
    } else bits.push(`Revenue ${(rev * 100).toFixed(1)}%`);
  }
  if (eps != null) {
    if (eps > 0.1) {
      score += 2;
      bits.push(`EPS growth ${(eps * 100).toFixed(1)}%`);
    } else if (eps > 0) {
      score += 1;
      bits.push(`EPS growth ${(eps * 100).toFixed(1)}%`);
    } else bits.push(`EPS ${(eps * 100).toFixed(1)}%`);
  }
  if (gm != null && om != null && om > 0 && (gm || 0) > 0.3) {
    score += 1;
    bits.push("Margin profile constructive");
  }
  if (fcf != null && fcf > 0) {
    score += 2;
    bits.push("FCF growing");
  } else if (fcf != null) bits.push("FCF not expanding");
  if (debtOk) {
    score += 1;
    bits.push("Balance sheet healthy");
  }
  if (profitable) {
    score += 1;
    bits.push("Profitable");
  }
  if (pe != null && fwdPe != null && fwdPe > 0 && fwdPe < (pe || 99) && fwdPe < 40) {
    score += 1;
    bits.push("Valuation reasonable vs growth");
  } else if (pe != null && pe > 0 && pe < 35) {
    score += 0.5;
    bits.push(`P/E ${pe.toFixed(1)}`);
  }
  if (score === 0 && bits.length) score = 4;
  else if (score === 0) {
    score = 5;
    bits.push("Limited fundamental fields");
  }
  return [
    clamp(score),
    bits.join("; "),
    { revenue_growth: fund.revenue_growth, eps_growth: fund.eps_growth, pe: fund.pe, forward_pe: fund.forward_pe, gross_margin: fund.gross_margin, operating_margin: fund.operating_margin },
  ];
}

export function scoreEarnings(earn: Record<string, unknown> | null | undefined): [number, string, Record<string, unknown>] {
  if (!earn) return [5, "Earnings revision data unavailable — scored neutral.", {}];
  const epsRev = earn.eps_revision_trend;
  const rec = earn.recommendation;
  const days = earn.days_to_earnings as number | undefined;
  const bits: string[] = [];
  let score = 5;
  if (epsRev === "up") {
    score += 2.5;
    bits.push("Analysts raising EPS estimates");
  } else if (epsRev === "down") {
    score -= 2.5;
    bits.push("Analysts cutting EPS estimates");
  } else bits.push("EPS revisions stable / unknown");
  if (rec === "buy" || rec === "strong_buy") {
    score += 1.5;
    bits.push(`Street bias ${rec}`);
  } else if (rec === "sell" || rec === "strong_sell") {
    score -= 1.5;
    bits.push(`Street bias ${rec}`);
  }
  if (days != null && days >= 0 && days <= getSettings().earningsDangerDays) {
    bits.push(`Earnings in ${days}d — event risk`);
    score -= 1;
  }
  return [clamp(score), bits.join("; ") || "Earnings mixed.", earn];
}

export function scoreMarket(ctx: Record<string, unknown> | null | undefined, sector: string | null): [number, string, Record<string, unknown>] {
  if (!ctx) return [5, "Market context unavailable — scored neutral.", {}];
  const bits: string[] = [];
  let score = 5;
  const spx = ctx.spx_change_pct as number | undefined;
  const ndx = ctx.ndx_change_pct as number | undefined;
  const vix = ctx.vix as number | undefined;
  const vixChg = ctx.vix_change_pct as number | undefined;
  const sectorChg = ctx.sector_change_pct as number | undefined;
  if (spx != null) {
    if (spx > 0.4) {
      score += 1.2;
      bits.push(`S&P ${spx >= 0 ? "+" : ""}${spx.toFixed(2)}%`);
    } else if (spx < -0.8) {
      score -= 1.8;
      bits.push(`S&P ${spx >= 0 ? "+" : ""}${spx.toFixed(2)}% (risk-off)`);
    } else bits.push(`S&P ${spx >= 0 ? "+" : ""}${spx.toFixed(2)}%`);
  }
  if (ndx != null) {
    if (ndx > 0.4) score += 0.8;
    else if (ndx < -0.8) score -= 1;
    bits.push(`NDX ${ndx >= 0 ? "+" : ""}${ndx.toFixed(2)}%`);
  }
  if (vix != null) {
    bits.push(`VIX ${vix.toFixed(2)}`);
    if (vix > 25 || (vixChg != null && vixChg > 8)) {
      score -= 1.5;
      bits.push("Elevated vol");
    }
  }
  if (sectorChg != null) {
    if (sectorChg > 0.5) score += 1;
    else if (sectorChg < -0.8) score -= 1.2;
    bits.push(`Sector ${sector || ""} ${sectorChg >= 0 ? "+" : ""}${sectorChg.toFixed(2)}%`);
  }
  return [clamp(score), bits.join("; ") || "Market mixed.", ctx];
}

export function scoreRates(rates: Record<string, unknown> | null | undefined): [number, string, Record<string, unknown>] {
  if (!rates || rates.yield == null) return [5, "Treasury data unavailable — scored neutral.", {}];
  const y = rates.yield as number;
  const d1 = rates.change_1d as number | undefined;
  const d5 = rates.change_5d as number | undefined;
  const trend20 = rates.trend_20d as string | undefined;
  const bits = [`10Y ${y.toFixed(2)}%`];
  let score = 6;
  if (trend20 === "falling" || (d5 != null && d5 < -0.08)) {
    score = 8;
    bits.push("Yields falling/stable — supportive for growth");
  } else if (trend20 === "rising" && d5 != null && d5 > 0.2) {
    score = 2.5;
    bits.push("Yields rising rapidly — caution for duration/growth");
  } else if (trend20 === "rising" || (d5 != null && d5 > 0.08)) {
    score = 4;
    bits.push("Yields rising moderately — caution");
  } else bits.push("Yields stable — direction more important than level");
  if (d1 != null) bits.push(`1d ${d1 >= 0 ? "+" : ""}${d1.toFixed(3)}`);
  return [clamp(score), bits.join("; "), rates];
}

export function scoreCatalysts(news: Record<string, unknown>[] | null | undefined, earn: Record<string, unknown> | null | undefined): [number, string, Record<string, unknown>] {
  if (!news?.length) {
    let extra = "";
    if (earn && earn.days_to_earnings != null) extra = ` Next earnings in ${earn.days_to_earnings}d.`;
    return [5, "No recent ticker news loaded." + extra, { count: 0 }];
  }
  const pos = news.filter((n) => ["positive", "bullish"].includes(String(n.sentiment || "").toLowerCase())).length;
  const neg = news.filter((n) => ["negative", "bearish"].includes(String(n.sentiment || "").toLowerCase())).length;
  let score = 5 + Math.min(3, pos) - Math.min(3, neg);
  const cats = new Set(news.map((n) => n.category).filter(Boolean));
  const bits = [`${news.length} headlines`, `${pos} positive / ${neg} negative`];
  if (cats.has("Regulation") || cats.has("M&A")) {
    bits.push("Event-risk category present");
    score -= 0.5;
  }
  const days = earn?.days_to_earnings as number | undefined;
  if (days != null && days >= 0 && days <= getSettings().earningsDangerDays) {
    score -= 1.5;
    bits.push("Inside earnings danger window");
  }
  return [clamp(score), bits.join("; "), { positive: pos, negative: neg, count: news.length }];
}

export function classify(score: number): SignalLabel {
  if (score >= 85) return "STRONG_BUY";
  if (score >= 75) return "BUY";
  if (score >= 65) return "WAIT";
  if (score >= 50) return "WEAK";
  return "SELL";
}

export function applyHardFilters(
  label: SignalLabel,
  _score: number,
  ind: Indicators,
  levels: SRLevels,
  plan: TradingPlan | null,
  market: Record<string, unknown> | null | undefined,
  earn: Record<string, unknown> | null | undefined,
  stale: boolean,
  timeframeBearish: boolean,
): [SignalLabel, string[]] {
  const settings = getSettings();
  const blocks: string[] = [];
  const buyish = label === "BUY" || label === "STRONG_BUY";
  if (stale) blocks.push("Data is stale — will not treat as LIVE or auto-buy.");
  if (plan && plan.risk_reward != null && plan.risk_reward < settings.minRiskReward) {
    blocks.push(`R:R ${plan.risk_reward.toFixed(2)} below minimum ${settings.minRiskReward.toFixed(1)} — DO NOT TRADE.`);
  }
  if (ind.last_close && levels.r1) {
    const dist = (levels.r1 - ind.last_close) / ind.last_close;
    if (dist > 0 && dist < 0.0015) blocks.push("Price is directly below major resistance.");
  }
  const breakout = Boolean(ind.last_close && levels.r1 && ind.last_close > levels.r1);
  if (breakout && (ind.volume_ratio || 0) < 1.2) blocks.push("Breakout without volume confirmation.");
  if (market && market.spx_change_pct != null && (market.spx_change_pct as number) <= -1.2) {
    blocks.push("Market is strongly bearish.");
  }
  if (timeframeBearish) blocks.push("Selected timeframe trend is bearish.");
  const days = earn?.days_to_earnings as number | undefined;
  if (days != null && days >= 0 && days <= settings.earningsDangerDays) {
    blocks.push("Earnings event inside configured danger window.");
  }
  if (buyish && blocks.length) return ["NO_TRADE", blocks];
  return [label, blocks];
}

export function computeConfidence(
  selected: SignalLabel,
  mtf: Record<string, SignalLabel> | null | undefined,
  volumeOk: boolean,
  rr: number | null | undefined,
  marketOk: boolean,
): Confidence {
  const bullish = new Set<SignalLabel>(["BUY", "STRONG_BUY"]);
  const bearish = new Set<SignalLabel>(["SELL"]);
  if (!mtf) return "MEDIUM";
  const vals = Object.values(mtf);
  const bull = vals.filter((v) => bullish.has(v)).length;
  const bear = vals.filter((v) => bearish.has(v)).length;
  const selectedOk = bullish.has(selected);
  const higher = ["1h", "4h", "1d"].map((tf) => mtf[tf]).filter(Boolean) as SignalLabel[];
  const higherBull = higher.length ? higher.every((x) => bullish.has(x)) : false;
  const conflict = bull >= 2 && bear >= 2;
  if (conflict || (selectedOk && bear >= 3)) return "LOW";
  if (selectedOk && higherBull && marketOk && volumeOk && (rr || 0) >= 2) return "HIGH";
  if (selectedOk && bull >= 3) return volumeOk ? "HIGH" : "MEDIUM";
  return "MEDIUM";
}

export function buildExplanation(
  timeframe: string,
  label: SignalLabel,
  categories: SignalEvidence[],
  plan: TradingPlan | null,
  mtfNote: string | null,
): string {
  const tf = TIMEFRAME_LABELS[timeframe] || timeframe;
  const bull = categories.filter((c) => c.status === "BULLISH");
  const bear = categories.filter((c) => c.status === "BEARISH");
  const whyBull = bull.slice(0, 4).map((c) => c.name).join(", ") || "limited bullish confirmation";
  const whyBear = bear.slice(0, 3).map((c) => c.name).join(", ");
  const core = categories.find((c) => c.name === "Price Trend")?.details || "";
  const rsi = categories.find((c) => c.name.includes("RSI"))?.details || "";
  const macd = categories.find((c) => c.name === "MACD")?.details || "";
  const vol = categories.find((c) => c.name === "Volume")?.details || "";
  let head: string;
  if (label === "NO_TRADE" || label === "WAIT" || label === "WEAK") {
    head = `${tf} is not a high-quality new-entry setup (${label.replace("_", " ")}).`;
  } else if (label === "SELL") head = `${tf} bias is bearish.`;
  else if (label === "STRONG_BUY") head = `${tf} setup is strongly bullish.`;
  else head = `${tf} setup is bullish.`;
  let body = ` Bullish: ${whyBull}.`;
  if (whyBear) body += ` Bearish/caution: ${whyBear}.`;
  const detail = [core, rsi, macd, vol].filter(Boolean).join(" ");
  if (plan?.block_reason) body += ` Hard filter: ${plan.block_reason}`;
  if (mtfNote) body += ` ${mtfNote}`;
  return `${head}${body} ${detail}`.trim();
}

export function scoreAll(
  _symbol: string,
  timeframe: string,
  ind: Indicators,
  levels: SRLevels,
  _freshness: unknown,
  fundamentals?: Record<string, unknown> | null,
  earnings?: Record<string, unknown> | null,
  market?: Record<string, unknown> | null,
  rates?: Record<string, unknown> | null,
  news?: Record<string, unknown>[] | null,
  sector?: string | null,
): [SignalEvidence[], number, number, number, number] {
  const weights = TF_WEIGHTS[timeframe] || BASE_WEIGHTS;
  const px = ind.last_close;
  const breakout = Boolean(px && levels.r1 && px > levels.r1);
  const specs: [number, string, string, [number, string, Record<string, unknown>]][] = [
    [1, "Price Trend", "price_trend", scorePriceTrend(ind, timeframe)],
    [2, "RSI Momentum", "rsi", scoreRsi(ind)],
    [3, "MACD", "macd", scoreMacd(ind)],
    [4, "Volume", "volume", scoreVolume(ind, breakout)],
    [5, "Support/Resistance", "sr", scoreSr(ind, levels, breakout)],
    [6, "Fundamentals", "fundamentals", scoreFundamentals(fundamentals)],
    [7, "Earnings Revisions", "earnings", scoreEarnings(earnings)],
    [8, "Market/Sector", "market", scoreMarket(market, sector ?? null)],
    [9, "Interest Rates", "rates", scoreRates(rates)],
    [10, "Catalysts/Risk", "catalysts", scoreCatalysts(news, earnings)],
  ];
  const cats: SignalEvidence[] = [];
  let total = 0;
  let b = 0;
  let n = 0;
  let be = 0;
  for (const [i, name, key, [raw, details, ev]] of specs) {
    const w = weights[key];
    const weighted = (raw / 10) * w;
    total += weighted;
    const t = tone(raw);
    if (t === "BULLISH") b += 1;
    else if (t === "BEARISH") be += 1;
    else n += 1;
    cats.push({
      id: i,
      name,
      status: t,
      raw_score: Math.round(raw * 10) / 10,
      weight: w,
      weighted_score: Math.round(weighted * 100) / 100,
      details,
      evidence: ev,
    });
  }
  return [cats, Math.round(total), b, n, be];
}
