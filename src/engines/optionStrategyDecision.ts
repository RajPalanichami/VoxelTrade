import type { AnalyzerStrategyId } from "@/lib/optionAnalyzerStrategies";
import {
  contractGreeks,
  daysToExpiration,
  expectedMove,
  historicalVolatility,
  positionSign,
  probabilityInBands,
  yearFractionFromDays,
  type ContractGreeks,
  type PriceBand,
} from "@/src/engines/bsGreeks";
import { blackScholesPrice, intrinsicValue, moneyness, normalizeIv } from "@/src/engines/optionAnalyzerPayoff";

export type Impact = "positive" | "negative" | "neutral" | "caution" | "na";
export type TrendLabel = "Bullish" | "Bearish" | "Neutral";

export type StrategyFactor = {
  factor: string;
  value: string;
  impact: Impact;
  interpretation: string;
  importance: "high" | "medium" | "low";
  status: string;
  tooltip: string;
  weightKey?: WeightKey;
};

export type WeightKey = "iv" | "trend" | "delta" | "theta" | "vega" | "support" | "liquidity" | "event";

export const SCORE_BANDS = [
  { min: 80, label: "Strong Setup" },
  { min: 65, label: "Favorable" },
  { min: 50, label: "Neutral / Watch" },
  { min: 35, label: "Caution" },
  { min: 0, label: "Unfavorable" },
] as const;

export const DEFAULT_WEIGHTS: Record<WeightKey, number> = {
  iv: 0.2,
  trend: 0.2,
  delta: 0.15,
  theta: 0.1,
  vega: 0.15,
  support: 0.1,
  liquidity: 0.05,
  event: 0.05,
};

const WEIGHTS: Partial<Record<AnalyzerStrategyId, Partial<Record<WeightKey, number>>>> = {
  straddle: { iv: 0.25, trend: 0.05, delta: 0.05, theta: 0.2, vega: 0.25, support: 0.05, liquidity: 0.05, event: 0.1 },
  short_straddle: { iv: 0.25, trend: 0.15, delta: 0.1, theta: 0.15, vega: 0.15, support: 0.05, liquidity: 0.05, event: 0.1 },
  strangle: { iv: 0.25, trend: 0.05, delta: 0.05, theta: 0.2, vega: 0.25, support: 0.05, liquidity: 0.05, event: 0.1 },
  short_strangle: { iv: 0.25, trend: 0.15, delta: 0.1, theta: 0.15, vega: 0.15, support: 0.05, liquidity: 0.05, event: 0.1 },
  iron_condor: { iv: 0.25, trend: 0.2, delta: 0.1, theta: 0.15, vega: 0.1, support: 0.05, liquidity: 0.05, event: 0.1 },
  long_call: { iv: 0.2, trend: 0.25, delta: 0.15, theta: 0.1, vega: 0.1, support: 0.05, liquidity: 0.05, event: 0.1 },
  long_put: { iv: 0.2, trend: 0.25, delta: 0.15, theta: 0.1, vega: 0.1, support: 0.05, liquidity: 0.05, event: 0.1 },
};

type VolSide = "long" | "short" | "neutral";

const PROFILES: Record<AnalyzerStrategyId, { bias: TrendLabel; vol: VolSide; rangeBound: boolean }> = {
  long_call: { bias: "Bullish", vol: "long", rangeBound: false },
  long_put: { bias: "Bearish", vol: "long", rangeBound: false },
  short_call: { bias: "Bearish", vol: "short", rangeBound: false },
  short_put: { bias: "Bullish", vol: "short", rangeBound: false },
  bull_call_spread: { bias: "Bullish", vol: "neutral", rangeBound: false },
  bear_call_spread: { bias: "Bearish", vol: "short", rangeBound: false },
  bull_put_spread: { bias: "Bullish", vol: "short", rangeBound: false },
  bear_put_spread: { bias: "Bearish", vol: "neutral", rangeBound: false },
  straddle: { bias: "Neutral", vol: "long", rangeBound: false },
  short_straddle: { bias: "Neutral", vol: "short", rangeBound: true },
  strangle: { bias: "Neutral", vol: "long", rangeBound: false },
  short_strangle: { bias: "Neutral", vol: "short", rangeBound: true },
  butterfly: { bias: "Neutral", vol: "short", rangeBound: true },
  iron_butterfly: { bias: "Neutral", vol: "short", rangeBound: true },
  condor: { bias: "Neutral", vol: "short", rangeBound: true },
  iron_condor: { bias: "Neutral", vol: "short", rangeBound: true },
  covered_call: { bias: "Neutral", vol: "short", rangeBound: false },
  cash_secured_put: { bias: "Bullish", vol: "short", rangeBound: false },
  protective_put: { bias: "Bullish", vol: "long", rangeBound: false },
  collar: { bias: "Neutral", vol: "neutral", rangeBound: true },
  calendar: { bias: "Neutral", vol: "neutral", rangeBound: true },
  diagonal: { bias: "Bullish", vol: "neutral", rangeBound: false },
};

export type DecisionLeg = {
  right: "call" | "put";
  side: "buy" | "sell";
  strike: number;
  premium: number;
  quantity: number;
  expiration: string;
  iv?: number | null;
  bid?: number | null;
  ask?: number | null;
  volume?: number | null;
  openInterest?: number | null;
};

export type DecisionContext = {
  hv?: number | null;
  shortTrend?: TrendLabel | null;
  mediumTrend?: TrendLabel | null;
  longTrend?: TrendLabel | null;
  vwap?: number | null;
  rsi?: number | null;
  macdBullish?: boolean | null;
  support?: number | null;
  resistance?: number | null;
  ema20?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  marketTrend?: TrendLabel | null;
  sectorTrend?: TrendLabel | null;
  relativeStrength?: number | null;
  earningsDays?: number | null;
};

export type DecisionInput = {
  symbol: string;
  strategyId: AnalyzerStrategyId;
  strategyLabel: string;
  spot: number;
  expiration: string;
  now?: Date;
  legs: DecisionLeg[];
  stockShares?: number;
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  riskReward: number | null;
  profitZones: PriceBand[];
  context?: DecisionContext;
};

export type GreekRow = {
  label: string;
  delta: number | null;
  gamma: number | null;
  vega: number | null;
  theta: number | null;
  rho: number | null;
};

export type ScenarioEstimate = { label: string; pnl: number | null; note: string };

export type OptionDecision = {
  score: number | null;
  scoreLabel: string;
  bias: TrendLabel;
  thesis: string;
  mainRisk: string;
  factors: StrategyFactor[];
  greeks: GreekRow[];
  net: { delta: number | null; gamma: number | null; vega: number | null; theta: number | null; rho: number | null };
  iv: {
    current: number | null;
    hv: number | null;
    vsHv: number | null;
    rank: null;
    percentile: null;
    note: string;
  };
  expectedMove: { dollars: number; percent: number; upper: number; lower: number } | null;
  scenarios: ScenarioEstimate[];
  focus: { strike: number; right: "call" | "put"; moneyness: string; distance: number; distancePct: number } | null;
};

const UNAVAILABLE = "Data unavailable from the configured market-data source.";

const TIPS: Record<string, string> = {
  Vega: "Approximate option-price sensitivity to a 1 percentage-point change in implied volatility.",
  Theta: "Approximate daily change in option value from time decay, all else equal. Actual P&L also depends on price, IV, and the bid/ask.",
  Gamma: "How quickly Delta changes when the underlying price changes.",
  Delta: "Approximate share-equivalent directional exposure. Delta is not the probability of finishing in the money and not the probability of profit.",
  Rho: "Approximate sensitivity to a 1 percentage-point change in interest rates. Usually small for short-dated equity options.",
  "IV percentile": "Where today's IV sits versus past IV readings. It is not the probability of a future move.",
};

function statusFor(impact: Impact) {
  if (impact === "positive") return "Favorable";
  if (impact === "negative") return "Unfavorable";
  if (impact === "caution") return "Caution";
  if (impact === "neutral") return "Neutral";
  return "N/A";
}

function factor(partial: Omit<StrategyFactor, "status">): StrategyFactor {
  return { ...partial, status: statusFor(partial.impact) };
}

function na(name: string, tooltip = "", importance: StrategyFactor["importance"] = "medium", weightKey?: WeightKey): StrategyFactor {
  return factor({
    factor: name,
    value: "N/A",
    impact: "na",
    interpretation: `N/A — ${UNAVAILABLE}`,
    importance,
    tooltip,
    weightKey,
  });
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return n.toFixed(digits);
}

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "N/A";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function volImpact(vol: VolSide, rich: boolean | null): Impact {
  if (rich == null) return "na";
  if (vol === "short") return rich ? "positive" : "negative";
  if (vol === "long") return rich ? "caution" : "positive";
  return rich ? "caution" : "neutral";
}

function volText(vol: VolSide, rich: boolean) {
  if (vol === "short") {
    return rich
      ? "Implied volatility is rich versus recent realized volatility, which can mean richer premium for an option seller."
      : "Implied volatility is not rich versus realized volatility, so the seller is not being paid an elevated premium.";
  }
  if (vol === "long") {
    return rich
      ? "Caution — implied volatility is rich versus realized volatility, so this long option may be relatively expensive."
      : "Implied volatility is not elevated versus realized volatility, which is less of a headwind for buying premium.";
  }
  return rich
    ? "IV is rich versus realized volatility. A spread reduces vega versus a naked option, so this is a caution rather than a hard reject."
    : "IV is not rich versus realized volatility. Direction and structure matter more than the volatility premium here.";
}

function trendImpact(profile: { bias: TrendLabel; rangeBound: boolean }, trend: TrendLabel | null): Impact {
  if (!trend) return "na";
  if (profile.rangeBound) {
    if (trend === "Neutral") return "positive";
    return "negative";
  }
  if (profile.bias === "Neutral") return trend === "Neutral" ? "neutral" : "caution";
  if (trend === profile.bias) return "positive";
  if (trend === "Neutral") return "neutral";
  return "negative";
}

function trendText(profile: { bias: TrendLabel; rangeBound: boolean }, label: string, trend: TrendLabel) {
  if (profile.rangeBound) {
    return trend === "Neutral"
      ? `${label} is neutral, which supports a range-bound structure.`
      : `${label} is ${trend.toLowerCase()}, which works against a strategy that needs the underlying to stay in a range.`;
  }
  if (profile.bias === "Neutral") return `${label} is ${trend.toLowerCase()}. This structure is not primarily a directional bet.`;
  if (trend === profile.bias) return `${label} is ${trend.toLowerCase()}, which supports this ${profile.bias.toLowerCase()} strategy.`;
  if (trend === "Neutral") return `${label} is neutral, so it neither confirms nor fights the ${profile.bias.toLowerCase()} bias.`;
  return `${label} is ${trend.toLowerCase()}, which conflicts with this ${profile.bias.toLowerCase()} strategy.`;
}

function scoreLabel(score: number) {
  return SCORE_BANDS.find((band) => score >= band.min)?.label || "Unfavorable";
}

function weightsFor(id: AnalyzerStrategyId) {
  return { ...DEFAULT_WEIGHTS, ...(WEIGHTS[id] || {}) };
}

export function scoreFromFactors(id: AnalyzerStrategyId, factors: StrategyFactor[]) {
  const weights = weightsFor(id);
  const buckets = new Map<WeightKey, number[]>();
  for (const row of factors) {
    if (!row.weightKey || row.impact === "na") continue;
    const points = row.impact === "positive" ? 85 : row.impact === "neutral" ? 55 : row.impact === "caution" ? 40 : 18;
    const list = buckets.get(row.weightKey) || [];
    list.push(points);
    buckets.set(row.weightKey, list);
  }
  let weightSum = 0;
  let total = 0;
  for (const key of Object.keys(weights) as WeightKey[]) {
    const list = buckets.get(key);
    if (!list?.length || !(weights[key] > 0)) continue;
    const avg = list.reduce((sum, n) => sum + n, 0) / list.length;
    total += avg * weights[key];
    weightSum += weights[key];
  }
  if (!(weightSum > 0)) return null;
  return Math.round(total / weightSum);
}

function mainRisk(input: DecisionInput, profile: { vol: VolSide; rangeBound: boolean }) {
  const symbol = input.symbol.toUpperCase();
  const strike = input.legs[0]?.strike;
  const strikeText = strike != null ? `$${strike.toFixed(2)}` : "the selected strike";
  switch (input.strategyId) {
    case "short_put":
    case "cash_secured_put":
      return `Sharp downside move in ${symbol} through ${strikeText}, particularly if implied volatility expands at the same time.`;
    case "short_call":
      return `Sharp rally in ${symbol} through ${strikeText}. Loss is unlimited if the shares keep rising.`;
    case "long_call":
      return `${symbol} fails to rally enough before ${input.expiration} for the call to overcome time decay${profile.vol === "long" ? " and any IV contraction" : ""}.`;
    case "long_put":
      return `${symbol} fails to fall enough before ${input.expiration}, so theta and any IV contraction reduce the put's value.`;
    case "straddle":
    case "strangle":
      return `${symbol} stays inside the premium paid through ${input.expiration}, so time decay erodes the long premium.`;
    case "short_straddle":
    case "short_strangle":
      return `A large move in ${symbol} in either direction, especially if implied volatility rises. Loss can exceed the credit.`;
    case "iron_condor":
    case "iron_butterfly":
    case "condor":
    case "butterfly":
      return `${symbol} moves beyond the short strikes before ${input.expiration}. The credit does not cap that loss.`;
    case "covered_call":
      return `${symbol} either drops through the stock position, or rallies through the short call and caps further upside.`;
    case "protective_put":
      return `${symbol} drifts sideways or higher while the put premium decays, so the hedge costs more than the protection is worth.`;
    case "collar":
      return `${symbol} falls through the long put, or the short call caps a rally the shares would otherwise have kept.`;
    case "calendar":
    case "diagonal":
      return `The near-dated short option does not decay as expected, or ${symbol} moves through the short strike before ${input.expiration}.`;
    default:
      return `${symbol} moves against the ${input.strategyLabel} structure before ${input.expiration}, or volatility moves against the position's vega.`;
  }
}

function thesis(profile: { bias: TrendLabel; vol: VolSide }, label: string) {
  const vol =
    profile.vol === "short" ? "short-premium / positive theta" : profile.vol === "long" ? "long-premium / positive vega" : "defined-risk structure";
  return `${label} is a ${profile.bias.toLowerCase()} ${vol} position. The score uses only factors the current data can support.`;
}

type LegGreek = { leg: DecisionLeg; g: ContractGreeks | null; years: number };

function legModels(input: DecisionInput, now: Date): LegGreek[] {
  return input.legs.map((leg) => {
    const days = daysToExpiration(leg.expiration || input.expiration, now);
    const years = days == null ? 0 : yearFractionFromDays(days);
    const iv = normalizeIv(leg.iv);
    const g = iv ? contractGreeks({ right: leg.right, spot: input.spot, strike: leg.strike, iv, years, rate: 0 }) : null;
    return { leg, g, years };
  });
}

function sumNet(rows: LegGreek[], key: keyof ContractGreeks) {
  if (!rows.some((row) => row.g)) return null;
  return rows.reduce((sum, row) => sum + (row.g ? row.g[key] * positionSign(row.leg.side) * row.leg.quantity : 0), 0);
}

function repricedPnl(input: DecisionInput, rows: LegGreek[], spot: number, ivMult: number, dayShift: number) {
  if (!rows.length || rows.some((row) => !normalizeIv(row.leg.iv))) return null;
  let pnl = 0;
  for (const row of rows) {
    const iv = (normalizeIv(row.leg.iv) || 0) * ivMult;
    const years = Math.max(0, row.years - dayShift / 365);
    const mark = years <= 0 ? intrinsicValue(row.leg.right, spot, row.leg.strike) : blackScholesPrice(row.leg.right, spot, row.leg.strike, years, 0, iv);
    const sign = positionSign(row.leg.side);
    pnl += sign * (mark - row.leg.premium) * 100 * row.leg.quantity;
  }
  if (input.stockShares) pnl += (spot - input.spot) * input.stockShares;
  return Math.round(pnl * 100) / 100;
}

export function buildOptionDecision(input: DecisionInput): OptionDecision {
  const now = input.now ?? new Date();
  const profile = PROFILES[input.strategyId];
  const rows = legModels(input, now);
  const netDelta = sumNet(rows, "delta");
  const netGamma = sumNet(rows, "gamma");
  const netVega = sumNet(rows, "vega");
  const netTheta = sumNet(rows, "theta");
  const netRho = sumNet(rows, "rho");
  const ivs = input.legs.map((leg) => normalizeIv(leg.iv)).filter((n): n is number => n != null);
  const iv = ivs.length ? ivs.reduce((sum, n) => sum + n, 0) / ivs.length : null;
  const hv = input.context?.hv ?? null;
  const vsHv = iv != null && hv != null ? iv - hv : null;
  const rich = vsHv == null ? null : vsHv > 0.03;
  const days = daysToExpiration(input.expiration, now);
  const move = iv != null && days != null ? expectedMove(input.spot, iv, yearFractionFromDays(Math.max(days, 1 / 24))) : null;
  const focusLeg = input.legs[0];
  const focus = focusLeg
    ? {
        strike: focusLeg.strike,
        right: focusLeg.right,
        moneyness: moneyness(focusLeg.right, input.spot, focusLeg.strike),
        distance: focusLeg.strike - input.spot,
        distancePct: input.spot ? ((focusLeg.strike - input.spot) / input.spot) * 100 : 0,
      }
    : null;

  const bidAsk = input.legs.map((leg) => (leg.bid != null && leg.ask != null && leg.ask > 0 ? (leg.ask - leg.bid) / ((leg.ask + leg.bid) / 2 || leg.ask) : null));
  const spreadPct = bidAsk.filter((n): n is number => n != null);
  const avgSpread = spreadPct.length ? spreadPct.reduce((s, n) => s + n, 0) / spreadPct.length : null;
  const volume = input.legs.reduce((s, leg) => s + (leg.volume || 0), 0);
  const oi = input.legs.reduce((s, leg) => s + (leg.openInterest || 0), 0);
  const volOi = oi > 0 ? volume / oi : null;

  let liquidityImpact: Impact = "na";
  if (avgSpread != null) {
    if (avgSpread <= 0.08 && oi >= 200) liquidityImpact = "positive";
    else if (avgSpread >= 0.2 || (oi > 0 && oi < 50)) liquidityImpact = "negative";
    else liquidityImpact = "caution";
  }

  const pop = iv != null && days != null && days > 0 ? probabilityInBands(input.spot, iv, yearFractionFromDays(days), input.profitZones) : null;
  const itm = rows[0]?.g?.probItm ?? null;

  const deltaImpact: Impact =
    netDelta == null
      ? "na"
      : profile.rangeBound
        ? Math.abs(netDelta) <= 0.2
          ? "positive"
          : "caution"
        : profile.bias === "Bullish"
          ? netDelta > 0.1
            ? "positive"
            : netDelta < -0.05
              ? "negative"
              : "neutral"
          : profile.bias === "Bearish"
            ? netDelta < -0.1
              ? "positive"
              : netDelta > 0.05
                ? "negative"
                : "neutral"
            : "neutral";

  const thetaImpact: Impact = netTheta == null ? "na" : profile.vol === "short" ? (netTheta > 0 ? "positive" : "negative") : profile.vol === "long" ? "caution" : netTheta >= 0 ? "positive" : "caution";
  const vegaImpact: Impact =
    netVega == null ? "na" : profile.vol === "short" ? (netVega < 0 ? "positive" : "negative") : profile.vol === "long" ? (netVega > 0 ? "positive" : "caution") : "neutral";
  const gammaImpact: Impact =
    netGamma == null ? "na" : profile.vol === "short" && netGamma < 0 ? "caution" : profile.vol === "long" && netGamma > 0 ? "positive" : "neutral";

  const factors: StrategyFactor[] = [
    factor({
      factor: "Underlying Price",
      value: money(input.spot),
      impact: "neutral",
      interpretation: `${input.symbol.toUpperCase()} is marked at ${money(input.spot)}. Moneyness uses this price versus each strike, not Delta.`,
      importance: "high",
      tooltip: "Live or latest underlying price used for the chain.",
    }),
    iv == null
      ? na("IV", TIPS["IV percentile"], "high", "iv")
      : factor({
          factor: "IV",
          value: `${(iv * 100).toFixed(1)}%`,
          impact: rich == null ? "neutral" : volImpact(profile.vol, rich),
          interpretation:
            vsHv == null
              ? "Current implied volatility from the selected contracts. Historical volatility is unavailable, so richness is not judged."
              : volText(profile.vol, vsHv > 0.03),
          importance: "high",
          tooltip: "Average listed implied volatility of the selected legs.",
          weightKey: vsHv == null ? undefined : "iv",
        }),
    factor({
      factor: "IV Rank",
      value: "N/A",
      impact: "na",
      interpretation: "N/A — IV rank needs a history of implied volatility. The configured source provides the current IV only, so rank is not calculated.",
      importance: "high",
      tooltip: "IV rank places today's IV between the 52-week high and low IV. It is not a probability.",
    }),
    factor({
      factor: "52-Week IV Percentile",
      value: "N/A",
      impact: "na",
      interpretation: "N/A — a 52-week IV percentile would mean today's IV is higher than that share of past IV readings. It is not an 80% chance of a move. That history is not in the configured source.",
      importance: "high",
      tooltip: TIPS["IV percentile"],
    }),
    hv == null
      ? na("Historical Volatility", "Realized volatility needs enough daily closes.", "medium", "iv")
      : factor({
          factor: "Historical Volatility",
          value: `${(hv * 100).toFixed(1)}%`,
          impact: "neutral",
          interpretation: "Close-to-close realized volatility from recent daily bars, annualized. It is not a forecast.",
          importance: "medium",
          tooltip: "Annualized standard deviation of recent log returns.",
        }),
    vsHv == null
      ? na("IV vs HV", "", "high", "iv")
      : factor({
          factor: "IV vs HV",
          value: `${vsHv >= 0 ? "+" : ""}${(vsHv * 100).toFixed(1)} pts`,
          impact: volImpact(profile.vol, Boolean(rich)),
          interpretation: volText(profile.vol, Boolean(rich)),
          importance: "high",
          tooltip: "Current IV minus recent realized volatility, in percentage points.",
          weightKey: "iv",
        }),
    netVega == null
      ? na("Vega", TIPS.Vega, "high", "vega")
      : factor({
          factor: "Vega",
          value: `${netVega >= 0 ? "+" : ""}${netVega.toFixed(2)} position`,
          impact: vegaImpact,
          interpretation:
            netVega < 0
              ? "Negative position vega. A decline in IV generally benefits this position, all else equal. Option vega and position vega have opposite signs when the option is sold."
              : "Positive position vega. A rise in IV generally benefits this position, all else equal.",
          importance: "high",
          tooltip: TIPS.Vega,
          weightKey: "vega",
        }),
    netTheta == null
      ? na("Theta", TIPS.Theta, "high", "theta")
      : factor({
          factor: "Theta",
          value: `${netTheta >= 0 ? "+" : ""}${netTheta.toFixed(3)} /day`,
          impact: thetaImpact,
          interpretation:
            netTheta > 0
              ? `Positive position theta. Estimated daily decay benefit is about ${money(netTheta * 100)} per contract-equivalent before other Greeks move. Greeks are theoretical.`
              : `Negative position theta. Estimated daily decay cost is about ${money(Math.abs(netTheta) * 100)} before price and IV changes. Time decay works against long premium.`,
          importance: "high",
          tooltip: TIPS.Theta,
          weightKey: "theta",
        }),
    netGamma == null
      ? na("Gamma", TIPS.Gamma, "high")
      : factor({
          factor: "Gamma",
          value: `${netGamma >= 0 ? "+" : ""}${netGamma.toFixed(4)}`,
          impact: gammaImpact,
          interpretation:
            profile.vol === "short"
              ? "Negative gamma can become increasingly unfavorable if the underlying makes a large move. Delta will shift against a short-option position as price runs."
              : "Positive gamma means directional exposure increases if the underlying moves in the position's favor. It is not a guarantee of profit.",
          importance: profile.vol === "short" ? "high" : "medium",
          tooltip: TIPS.Gamma,
        }),
    netDelta == null
      ? na("Delta", TIPS.Delta, "high", "delta")
      : factor({
          factor: "Delta",
          value: `${netDelta >= 0 ? "+" : ""}${netDelta.toFixed(2)} position`,
          impact: deltaImpact,
          interpretation: `Net position delta is about ${netDelta >= 0 ? "+" : ""}${netDelta.toFixed(2)} share-equivalents per contract quantity before gamma. This is directional exposure, not probability ITM and not probability of profit.`,
          importance: "high",
          tooltip: TIPS.Delta,
          weightKey: "delta",
        }),
    netRho == null
      ? na("Rho", TIPS.Rho, "low")
      : factor({
          factor: "Rho",
          value: `${netRho >= 0 ? "+" : ""}${netRho.toFixed(3)}`,
          impact: "neutral",
          interpretation: "Interest-rate sensitivity is usually small for short-dated equity options. It matters more when expiration is far out. This estimate uses a 0% rate because a live rate is not joined here.",
          importance: days != null && days > 180 ? "medium" : "low",
          tooltip: TIPS.Rho,
        }),
    pop == null
      ? na("Probability of Profit", "Needs IV and a mapped profit zone.", "high")
      : factor({
          factor: "Probability of Profit",
          value: `${(pop * 100).toFixed(0)}%`,
          impact: pop >= 0.55 ? "positive" : pop < 0.4 ? "caution" : "neutral",
          interpretation: "Model probability that price expires inside a profit zone, using current IV. It is not Delta and it is not a guarantee.",
          importance: "high",
          tooltip: "Risk-neutral estimate from the lognormal model and the calculated profit zone.",
        }),
    itm == null
      ? na("Probability ITM", TIPS.Delta, "medium")
      : factor({
          factor: "Probability ITM",
          value: `${(itm * 100).toFixed(0)}%`,
          impact: "neutral",
          interpretation: "Model probability the focus option expires in the money. It is related to Delta but it is not Delta and not the probability the strategy is profitable.",
          importance: "medium",
          tooltip: "N(d2) for a call, N(-d2) for a put, from the listed IV.",
        }),
    move == null
      ? na("Expected Move", "Needs a listed IV and an expiration.", "high")
      : factor({
          factor: "Expected Move",
          value: `±${money(move.dollars)}`,
          impact: profile.rangeBound ? "caution" : "neutral",
          interpretation: `Approximate one-standard-deviation range from current IV: ${money(move.lower)} – ${money(move.upper)} by ${input.expiration}. This is a model range, not a forecast.`,
          importance: "high",
          tooltip: "Spot × IV × square root of time. Not a promise of the future range.",
        }),
    move == null
      ? na("Expected Move %", "", "medium")
      : factor({
          factor: "Expected Move %",
          value: `${move.percent.toFixed(1)}%`,
          impact: "neutral",
          interpretation: "The dollar expected move as a percent of the current underlying price.",
          importance: "medium",
          tooltip: "Expected move divided by the underlying price.",
        }),
    focus == null
      ? na("Strike Distance", "", "medium")
      : factor({
          factor: "Strike Distance",
          value: `${focus.distance >= 0 ? "+" : ""}${focus.distancePct.toFixed(2)}% · ${focus.moneyness}`,
          impact: "neutral",
          interpretation: `${focus.right.toUpperCase()} strike ${money(focus.strike)} is ${money(focus.distance)} from ${money(input.spot)} (${focus.moneyness}). Moneyness is strike versus price, not Delta.`,
          importance: "medium",
          tooltip: "Distance of the focus strike from the underlying.",
        }),
    days == null
      ? na("Days to Expiration", "", "medium")
      : factor({
          factor: "Days to Expiration",
          value: `${Math.round(days)}`,
          impact: days < 7 && profile.vol === "long" ? "caution" : "neutral",
          interpretation: days < 7 ? "Expiration is close. Theta and gamma are more sensitive this near expiry." : `${Math.round(days)} calendar days remain until ${input.expiration}.`,
          importance: "medium",
          tooltip: "Calendar days until the selected expiration.",
        }),
    avgSpread == null
      ? na("Bid/Ask Spread", "", "medium", "liquidity")
      : factor({
          factor: "Bid/Ask Spread",
          value: `${(avgSpread * 100).toFixed(1)}% of mid`,
          impact: liquidityImpact,
          interpretation:
            liquidityImpact === "positive"
              ? "Tight spread relative to the mid and usable open interest. Liquidity looks workable."
              : liquidityImpact === "negative"
                ? "Wide spread or thin open interest. Fills can be worse than the mid used in the model."
                : "Spread and open interest are mixed. Treat the mid as an estimate, not a guaranteed fill.",
          importance: "medium",
          tooltip: "Average (ask − bid) / mid across the selected legs.",
          weightKey: "liquidity",
        }),
    factor({
      factor: "Volume",
      value: volume ? volume.toLocaleString("en-US") : "N/A",
      impact: volume >= 100 ? "positive" : volume > 0 ? "neutral" : "na",
      interpretation: volume ? "Listed contract volume for the selected legs." : UNAVAILABLE,
      importance: "low",
      tooltip: "Contracts traded in the latest chain snapshot.",
    }),
    factor({
      factor: "Open Interest",
      value: oi ? oi.toLocaleString("en-US") : "N/A",
      impact: oi >= 500 ? "positive" : oi > 0 ? "neutral" : "na",
      interpretation: oi ? "Open interest across the selected legs." : UNAVAILABLE,
      importance: "medium",
      tooltip: "Outstanding contracts. Higher open interest usually means easier exits.",
      weightKey: oi ? "liquidity" : undefined,
    }),
    volOi == null
      ? na("Volume/OI", "", "low")
      : factor({
          factor: "Volume/OI",
          value: volOi.toFixed(2),
          impact: volOi >= 0.5 ? "neutral" : "neutral",
          interpretation: volOi >= 1 ? "Volume is high relative to open interest, so today's activity is elevated versus the existing book." : "Volume is modest relative to open interest.",
          importance: "low",
          tooltip: "Today's volume divided by open interest. Activity, not a directional signal by itself.",
        }),
    contextTrend("Short-Term Trend", input.context?.shortTrend, profile),
    contextTrend("Medium-Term Trend", input.context?.mediumTrend, profile),
    contextTrend("Long-Term Trend", input.context?.longTrend, profile),
    input.context?.support == null
      ? na("Support", "", "medium", "support")
      : factor({
          factor: "Support",
          value: money(input.context.support),
          impact: profile.bias === "Bearish" ? "neutral" : input.spot >= input.context.support ? "positive" : "caution",
          interpretation:
            input.spot >= input.context.support
              ? `Price is above calculated support at ${money(input.context.support)}.`
              : `Price is below calculated support at ${money(input.context.support)}, so downside structure is already damaged.`,
          importance: "medium",
          tooltip: "Nearest calculated support from the daily level engine.",
          weightKey: "support",
        }),
    input.context?.resistance == null
      ? na("Resistance", "", "medium", "support")
      : factor({
          factor: "Resistance",
          value: money(input.context.resistance),
          impact: profile.bias === "Bullish" && input.spot >= input.context.resistance * 0.995 ? "caution" : "neutral",
          interpretation: `Nearest calculated resistance is ${money(input.context.resistance)}.`,
          importance: "medium",
          tooltip: "Nearest calculated resistance from the daily level engine.",
          weightKey: "support",
        }),
    input.context?.vwap == null
      ? na("VWAP", "", "low")
      : factor({
          factor: "VWAP",
          value: money(input.context.vwap),
          impact: "neutral",
          interpretation: input.spot >= input.context.vwap ? "Price is above VWAP." : "Price is below VWAP.",
          importance: "low",
          tooltip: "Session or daily VWAP from the existing indicator engine.",
        }),
    input.context?.ema20 == null && input.context?.ema50 == null
      ? na("Moving Averages", "", "medium", "trend")
      : factor({
          factor: "Moving Averages",
          value: [input.context?.ema20 != null ? `EMA20 ${money(input.context.ema20)}` : null, input.context?.ema50 != null ? `EMA50 ${money(input.context.ema50)}` : null, input.context?.ema200 != null ? `EMA200 ${money(input.context.ema200)}` : null].filter(Boolean).join(" · "),
          impact: trendImpact(profile, input.context?.mediumTrend || input.context?.longTrend || null),
          interpretation: "Daily moving averages from the existing indicator engine.",
          importance: "medium",
          tooltip: "EMA 20, 50, and 200 when the daily indicator response includes them.",
          weightKey: "trend",
        }),
    input.context?.rsi == null
      ? na("RSI", "", "low")
      : factor({
          factor: "RSI",
          value: input.context.rsi.toFixed(1),
          impact: input.context.rsi >= 70 || input.context.rsi <= 30 ? "caution" : "neutral",
          interpretation: input.context.rsi >= 70 ? "RSI is elevated. That is a momentum reading, not a reversal timer." : input.context.rsi <= 30 ? "RSI is depressed. That is a momentum reading, not a reversal timer." : "RSI is inside a neutral band.",
          importance: "low",
          tooltip: "Relative strength index from the daily indicator engine.",
        }),
    input.context?.macdBullish == null
      ? na("MACD", "", "low", "trend")
      : factor({
          factor: "MACD",
          value: input.context.macdBullish ? "Bullish" : "Bearish",
          impact: trendImpact(profile, input.context.macdBullish ? "Bullish" : "Bearish"),
          interpretation: input.context.macdBullish ? "MACD line is above its signal." : "MACD line is below its signal.",
          importance: "low",
          tooltip: "Daily MACD versus signal.",
          weightKey: "trend",
        }),
    input.context?.relativeStrength == null
      ? na("Relative Strength", "No benchmark comparison was loaded for this view.", "low")
      : factor({
          factor: "Relative Strength",
          value: `${input.context.relativeStrength >= 0 ? "+" : ""}${input.context.relativeStrength.toFixed(2)} pts`,
          impact: "neutral",
          interpretation: "Difference versus the benchmark change supplied to this view.",
          importance: "low",
          tooltip: "Underlying change minus benchmark change.",
        }),
    input.context?.marketTrend == null
      ? na("Market Trend", "", "medium", "trend")
      : factor({
          factor: "Market Trend",
          value: input.context.marketTrend,
          impact: trendImpact(profile, input.context.marketTrend),
          interpretation: trendText(profile, "The broader market", input.context.marketTrend),
          importance: "medium",
          tooltip: "Index trend supplied by the existing market context.",
          weightKey: "trend",
        }),
    input.context?.sectorTrend == null
      ? na("Sector Trend", "Sector trend is not in the configured source for this view.", "low")
      : factor({
          factor: "Sector Trend",
          value: input.context.sectorTrend,
          impact: trendImpact(profile, input.context.sectorTrend),
          interpretation: trendText(profile, "The sector", input.context.sectorTrend),
          importance: "low",
          tooltip: "Sector trend when a sector series is available.",
          weightKey: "trend",
        }),
    input.context?.earningsDays == null
      ? na("Earnings/Event Risk", "", "high", "event")
      : factor({
          factor: "Earnings/Event Risk",
          value: `${input.context.earningsDays} days`,
          impact: input.context.earningsDays <= 14 ? (profile.vol === "short" ? "negative" : "caution") : "neutral",
          interpretation:
            input.context.earningsDays <= 14
              ? profile.vol === "short"
                ? "A known event is inside two weeks. Short premium can be hurt by IV expansion into the event, then face gap risk."
                : "A known event is inside two weeks. A large move can help a long-premium bet, but IV crush after the event can offset it."
              : "The next known earnings date is outside the immediate window.",
          importance: "high",
          tooltip: "Days until the next earnings date returned by the existing earnings source.",
          weightKey: "event",
        }),
    factor({
      factor: "Liquidity Risk",
      value: liquidityImpact === "positive" ? "Low" : liquidityImpact === "negative" ? "High" : liquidityImpact === "caution" ? "Medium" : "N/A",
      impact: liquidityImpact === "na" ? "na" : liquidityImpact === "positive" ? "positive" : liquidityImpact,
      interpretation: liquidityImpact === "na" ? UNAVAILABLE : "Liquidity risk follows the bid/ask width and open interest of the selected legs.",
      importance: "medium",
      tooltip: "Combined read of spread and open interest.",
      weightKey: liquidityImpact === "na" ? undefined : "liquidity",
    }),
    factor({
      factor: "Assignment Risk",
      value: assignment(input, days),
      impact: assignment(input, days) === "High" ? "caution" : "neutral",
      interpretation:
        assignment(input, days) === "High"
          ? "A short option is in the money with limited time left. Early assignment is possible and is not fully captured by expiration payoff."
          : "Assignment risk looks ordinary for this structure. Short in-the-money options can still be assigned early.",
      importance: "medium",
      tooltip: "Short options can be assigned before expiration, especially when in the money.",
    }),
    factor({
      factor: "Max Profit",
      value: input.maxProfit == null ? "Unlimited" : money(input.maxProfit),
      impact: "neutral",
      interpretation: input.maxProfit == null ? "This structure has no finite maximum profit at expiration." : "Expiration maximum profit from the existing payoff engine.",
      importance: "high",
      tooltip: "Theoretical expiration maximum. Not a guaranteed fill.",
    }),
    factor({
      factor: "Max Loss",
      value: input.maxLoss == null ? "Unlimited" : money(input.maxLoss),
      impact: input.maxLoss == null ? "negative" : "neutral",
      interpretation: input.maxLoss == null ? "Maximum loss is unlimited. Do not substitute a dollar cap." : "Expiration maximum loss from the full strategy payoff, including stock when the strategy holds shares.",
      importance: "high",
      tooltip: "Theoretical expiration loss. Unlimited means the loss has no modeled cap.",
    }),
    factor({
      factor: "Breakeven",
      value: input.breakevens.length ? input.breakevens.map((n) => money(n)).join(" · ") : "N/A",
      impact: "neutral",
      interpretation: "Expiration breakeven prices from the payoff engine.",
      importance: "high",
      tooltip: "Underlying prices where expiration P&L is zero.",
    }),
    factor({
      factor: "Risk/Reward",
      value: input.riskReward == null ? "N/A" : `${input.riskReward.toFixed(2)} : 1`,
      impact: input.riskReward != null && input.riskReward >= 1.5 ? "positive" : "neutral",
      interpretation: input.riskReward == null ? "Risk/reward is not a finite ratio when profit or loss is unlimited." : "Maximum profit divided by maximum loss at expiration.",
      importance: "medium",
      tooltip: "Expiration payoff ratio. It ignores the probability of each outcome.",
    }),
    factor({
      factor: "Main Risk",
      value: "See interpretation",
      impact: "caution",
      interpretation: mainRisk(input, profile),
      importance: "high",
      tooltip: "Primary way this structure loses money, using the selected ticker and strikes.",
    }),
    factor({
      factor: "Strategy Bias",
      value: profile.bias,
      impact: "neutral",
      interpretation: thesis(profile, input.strategyLabel),
      importance: "high",
      tooltip: "Structural bias of the selected strategy, before the score.",
    }),
  ];

  const score = scoreFromFactors(input.strategyId, factors);
  const scenarios = scenarioRows(input, rows);

  return {
    score,
    scoreLabel: score == null ? "N/A" : scoreLabel(score),
    bias: profile.bias,
    thesis: thesis(profile, input.strategyLabel),
    mainRisk: mainRisk(input, profile),
    factors,
    greeks: [
      ...rows.map((row) => ({
        label: `${row.leg.side === "sell" ? "Short" : "Long"} ${money(row.leg.strike)} ${row.leg.right}`,
        delta: row.g ? row.g.delta * positionSign(row.leg.side) : null,
        gamma: row.g ? row.g.gamma * positionSign(row.leg.side) : null,
        vega: row.g ? row.g.vega * positionSign(row.leg.side) : null,
        theta: row.g ? row.g.theta * positionSign(row.leg.side) : null,
        rho: row.g ? row.g.rho * positionSign(row.leg.side) : null,
      })),
      { label: "Net strategy", delta: netDelta, gamma: netGamma, vega: netVega, theta: netTheta, rho: netRho },
    ],
    net: { delta: netDelta, gamma: netGamma, vega: netVega, theta: netTheta, rho: netRho },
    iv: {
      current: iv,
      hv,
      vsHv,
      rank: null,
      percentile: null,
      note: "IV rank and 52-week IV percentile need a history of implied volatility. The chain provides the current IV only, so those two fields are left blank instead of estimated.",
    },
    expectedMove: move,
    scenarios,
    focus,
  };
}

function contextTrend(name: string, trend: TrendLabel | null | undefined, profile: { bias: TrendLabel; rangeBound: boolean }): StrategyFactor {
  if (!trend) return na(name, "Needs the existing indicator engine for this horizon.", "medium", "trend");
  const impact = trendImpact(profile, trend);
  return factor({
    factor: name,
    value: trend,
    impact,
    interpretation: trendText(profile, name, trend),
    importance: "high",
    tooltip: "Trend label from existing EMA structure on that horizon.",
    weightKey: "trend",
  });
}

function assignment(input: DecisionInput, days: number | null) {
  const shortItm = input.legs.some((leg) => leg.side === "sell" && moneyness(leg.right, input.spot, leg.strike) === "ITM");
  if (shortItm && days != null && days <= 10) return "High";
  if (shortItm) return "Medium";
  return "Low";
}

function scenarioRows(input: DecisionInput, rows: LegGreek[]): ScenarioEstimate[] {
  const note = "Scenario estimate — not a guaranteed P&L forecast.";
  const shocks: [string, number, number, number][] = [
    [`${input.symbol} +5%`, 1.05, 1, 0],
    [`${input.symbol} +2%`, 1.02, 1, 0],
    [`${input.symbol} unchanged`, 1, 1, 0],
    [`${input.symbol} -2%`, 0.98, 1, 0],
    [`${input.symbol} -5%`, 0.95, 1, 0],
    ["IV +10%", 1, 1.1, 0],
    ["IV -10%", 1, 0.9, 0],
    ["Time passes 7 days", 1, 1, 7],
    ["Time passes 30 days", 1, 1, 30],
  ];
  return shocks.map(([label, spotMult, ivMult, days]) => ({
    label,
    pnl: repricedPnl(input, rows, input.spot * spotMult, ivMult, days),
    note,
  }));
}

export function trendFromIndicators(ind: { ema9?: number | null; ema20?: number | null; ema21?: number | null; ema50?: number | null; last_close?: number | null } | null | undefined): TrendLabel | null {
  if (!ind?.last_close) return null;
  const fast = ind.ema9 ?? ind.ema20;
  const slow = ind.ema21 ?? ind.ema50;
  if (fast == null || slow == null) return null;
  if (fast > slow && ind.last_close >= slow) return "Bullish";
  if (fast < slow && ind.last_close <= slow) return "Bearish";
  return "Neutral";
}

export { historicalVolatility };
