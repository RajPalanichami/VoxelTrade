/** Model Greeks from listed IV. These are estimates, not exchange-printed Greeks. */

export type ContractGreeks = {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  probItm: number;
};

function normPdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCdf(x: number) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2);
  return 0.5 * (1 + sign * y);
}

export function daysToExpiration(expiration: string, now = new Date()) {
  const exp = Date.parse(`${expiration.slice(0, 10)}T20:00:00Z`);
  if (!Number.isFinite(exp)) return null;
  return Math.max(0, (exp - now.getTime()) / 86_400_000);
}

export function yearFractionFromDays(days: number) {
  return Math.max(days, 0) / 365;
}

export function contractGreeks(input: {
  right: "call" | "put";
  spot: number;
  strike: number;
  iv: number;
  years: number;
  rate?: number;
}): ContractGreeks | null {
  const { right, spot, strike } = input;
  const rate = input.rate ?? 0;
  const iv = input.iv;
  if (!(spot > 0) || !(strike > 0) || !(iv > 0) || !(input.years >= 0)) return null;
  if (input.years <= 1 / 365 / 24) {
    const delta = right === "call" ? (spot > strike ? 1 : 0) : spot < strike ? -1 : 0;
    return { delta, gamma: 0, vega: 0, theta: 0, rho: 0, probItm: Math.abs(delta) };
  }
  const sqrtT = Math.sqrt(input.years);
  const d1 = (Math.log(spot / strike) + (rate + (iv * iv) / 2) * input.years) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const pdf = normPdf(d1);
  const discount = Math.exp(-rate * input.years);
  const callDelta = normCdf(d1);
  const delta = right === "call" ? callDelta : callDelta - 1;
  const gamma = pdf / (spot * iv * sqrtT);
  const vega = (spot * pdf * sqrtT) / 100;
  const thetaYear =
    right === "call"
      ? (-(spot * pdf * iv) / (2 * sqrtT) - rate * strike * discount * normCdf(d2))
      : (-(spot * pdf * iv) / (2 * sqrtT) + rate * strike * discount * normCdf(-d2));
  const theta = thetaYear / 365;
  const rho =
    right === "call"
      ? (strike * input.years * discount * normCdf(d2)) / 100
      : (-strike * input.years * discount * normCdf(-d2)) / 100;
  const probItm = right === "call" ? normCdf(d2) : normCdf(-d2);
  return { delta, gamma, vega, theta, rho, probItm };
}

export function positionSign(side: "buy" | "sell") {
  return side === "sell" ? -1 : 1;
}

export function expectedMove(spot: number, iv: number, years: number) {
  if (!(spot > 0) || !(iv > 0) || !(years > 0)) return null;
  const move = spot * iv * Math.sqrt(years);
  return {
    dollars: move,
    percent: (move / spot) * 100,
    upper: spot + move,
    lower: Math.max(0, spot - move),
  };
}

export function historicalVolatility(closes: number[], window = 20) {
  const vals = closes.filter((n) => Number.isFinite(n) && n > 0);
  const slice = vals.slice(-(window + 1));
  if (slice.length < 8) return null;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i += 1) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((sum, n) => sum + n, 0) / rets.length;
  const variance = rets.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (rets.length - 1);
  if (!(variance >= 0)) return null;
  return Math.sqrt(variance) * Math.sqrt(252);
}

export function probAbove(spot: number, level: number, iv: number, years: number, rate = 0) {
  if (!(spot > 0) || !(level > 0) || !(iv > 0) || !(years > 0)) return null;
  const sqrtT = Math.sqrt(years);
  const d2 = (Math.log(spot / level) + (rate - (iv * iv) / 2) * years) / (iv * sqrtT);
  return normCdf(d2);
}

export type PriceBand = { from: number | null; to: number | null };

/** Risk-neutral probability that price expires inside any profit band. Model estimate. */
export function probabilityInBands(spot: number, iv: number, years: number, bands: PriceBand[], rate = 0) {
  if (!bands.length || !(iv > 0) || !(years > 0) || !(spot > 0)) return null;
  let total = 0;
  for (const band of bands) {
    const lo = band.from;
    const hi = band.to;
    if (lo == null && hi == null) return 1;
    if (lo == null && hi != null) {
      const p = probAbove(spot, hi, iv, years, rate);
      if (p == null) return null;
      total += 1 - p;
    } else if (hi == null && lo != null) {
      const p = probAbove(spot, lo, iv, years, rate);
      if (p == null) return null;
      total += p;
    } else if (lo != null && hi != null && hi > lo) {
      const a = probAbove(spot, lo, iv, years, rate);
      const b = probAbove(spot, hi, iv, years, rate);
      if (a == null || b == null) return null;
      total += Math.max(0, a - b);
    }
  }
  return Math.min(1, Math.max(0, total));
}
