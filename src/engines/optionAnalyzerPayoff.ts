export const OPTION_MULTIPLIER = 100;
export const DEFAULT_CONTRACT_MULTIPLIER = 100;

export type AnalyzerRight = "call" | "put";
export type AnalyzerSide = "buy" | "sell";
export type Moneyness = "ITM" | "ATM" | "OTM";
export type PremiumSource = "bid" | "ask" | "mid" | "last" | "custom";
export type BoundStatus = "LIMITED" | "UNLIMITED";
export type ScenarioStatus = "Maximum Loss" | "Maximum Profit" | "Loss" | "Profit" | "Breakeven";
export type ValidationLevel = "error" | "warning";

export type AnalyzerLeg = {
  right: AnalyzerRight;
  side: AnalyzerSide;
  strike: number;
  premium: number;
  quantity: number;
  expiration?: string;
  iv?: number | null;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  contract?: string;
  contractMultiplier?: number;
  priceSource?: PremiumSource;
};

export type StockPosition = {
  shares: number;
  entry: number;
  side?: "LONG" | "SHORT";
};

export type PriceZone = {
  from: number | null;
  to: number | null;
};

export type ResidualValuation = {
  farExpiration: string;
  years: number;
};

export function roundCents(n: number) {
  return Math.round(n * 100) / 100;
}

export function roundPx(n: number) {
  return Math.round(n * 100) / 100;
}

export function contractMultiplierOf(leg: AnalyzerLeg) {
  return leg.contractMultiplier && leg.contractMultiplier > 0 ? leg.contractMultiplier : DEFAULT_CONTRACT_MULTIPLIER;
}

export function createAnalyzerLeg(input: {
  right: string;
  side: string;
  strike: number;
  premium: number;
  quantity?: number;
  expiration?: string;
  iv?: number | null;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  contract?: string;
  contractMultiplier?: number;
  priceSource?: PremiumSource;
}): AnalyzerLeg {
  const right = input.right.toLowerCase();
  const side = input.side.toLowerCase();
  if (right !== "call" && right !== "put") throw new Error("right must be call or put");
  if (side !== "buy" && side !== "sell") throw new Error("side must be buy or sell");
  if (!(input.strike > 0) || input.premium < 0 || (input.quantity ?? 1) <= 0) {
    throw new Error("strike, premium, and quantity must be valid");
  }
  const multiplier = input.contractMultiplier ?? DEFAULT_CONTRACT_MULTIPLIER;
  if (!(multiplier > 0)) throw new Error("contract multiplier must be positive");
  return {
    right,
    side,
    strike: input.strike,
    premium: input.premium,
    quantity: input.quantity ?? 1,
    expiration: input.expiration,
    iv: input.iv ?? null,
    bid: input.bid ?? null,
    ask: input.ask ?? null,
    last: input.last ?? null,
    contract: input.contract,
    contractMultiplier: multiplier,
    priceSource: input.priceSource,
  };
}

export function fillLivePremium(side: AnalyzerSide, bid: number | null | undefined, ask: number | null | undefined, mid: number) {
  if (side === "buy") {
    if (ask != null && ask > 0) return ask;
    if (mid > 0) return mid;
    if (bid != null && bid > 0) return bid;
  } else {
    if (bid != null && bid > 0) return bid;
    if (mid > 0) return mid;
    if (ask != null && ask > 0) return ask;
  }
  throw new Error("No live bid/ask or listed premium for an option leg");
}

export function resolveEntryPremium(input: {
  side: AnalyzerSide;
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
  last?: number | null;
  source?: PremiumSource;
  custom?: number | null;
}): { premium: number; source: PremiumSource; fallback: boolean } {
  const mid =
    input.mid != null && input.mid > 0
      ? input.mid
      : input.bid != null && input.ask != null && input.bid > 0 && input.ask > 0
        ? (input.bid + input.ask) / 2
        : 0;
  const source = input.source || (input.side === "buy" ? "ask" : "bid");
  if (source === "custom") {
    if (input.custom == null || input.custom < 0) throw new Error("Custom premium must be zero or positive");
    return { premium: input.custom, source, fallback: false };
  }
  if (source === "bid" && input.bid != null && input.bid > 0) return { premium: input.bid, source, fallback: false };
  if (source === "ask" && input.ask != null && input.ask > 0) return { premium: input.ask, source, fallback: false };
  if (source === "last" && input.last != null && input.last > 0) return { premium: input.last, source, fallback: false };
  if (source === "mid" && mid > 0) return { premium: mid, source: "mid", fallback: false };
  return { premium: fillLivePremium(input.side, input.bid, input.ask, mid), source, fallback: true };
}

export function moneyness(right: AnalyzerRight, spot: number, strike: number): Moneyness {
  if (!(spot > 0) || !(strike > 0)) return "OTM";
  if (Math.abs(spot - strike) / spot <= 0.01) return "ATM";
  if (right === "call") return spot > strike ? "ITM" : "OTM";
  return spot < strike ? "ITM" : "OTM";
}

export function yearFraction(from: string, to: string) {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return (b - a) / (365.25 * 24 * 3600 * 1000);
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

export function normalizeIv(iv: number | null | undefined) {
  if (iv == null || !Number.isFinite(iv) || iv <= 0) return null;
  return iv > 2 ? iv / 100 : iv;
}

export function blackScholesPrice(right: AnalyzerRight, spot: number, strike: number, years: number, rate: number, iv: number) {
  if (years <= 1e-8 || iv <= 0) {
    return right === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  }
  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + (iv * iv) / 2) * years) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  if (right === "call") return spot * normCdf(d1) - strike * Math.exp(-rate * years) * normCdf(d2);
  return strike * Math.exp(-rate * years) * normCdf(-d2) - spot * normCdf(-d1);
}

export function intrinsicValue(right: AnalyzerRight, spot: number, strike: number) {
  return right === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

export function legMarkValue(leg: AnalyzerLeg, spot: number, residual?: ResidualValuation | null) {
  const isFar = Boolean(residual?.farExpiration && leg.expiration && leg.expiration === residual.farExpiration && residual.years > 0);
  if (isFar) {
    const iv = normalizeIv(leg.iv);
    if (iv) return blackScholesPrice(leg.right, spot, leg.strike, residual!.years, 0, iv);
  }
  return intrinsicValue(leg.right, spot, leg.strike);
}

export function cashToday(legs: AnalyzerLeg[], stock?: StockPosition | null) {
  let total = 0;
  for (const leg of legs) {
    const sign = leg.side === "buy" ? -1 : 1;
    total += sign * leg.premium * contractMultiplierOf(leg) * leg.quantity;
  }
  if (stock?.shares) {
    const stockSign = stock.side === "SHORT" ? 1 : -1;
    total += stockSign * stock.shares * stock.entry;
  }
  return roundCents(total);
}

export function optionPremiumCash(legs: AnalyzerLeg[]) {
  return cashToday(legs, null);
}

export function premiumTotals(legs: AnalyzerLeg[]) {
  let paid = 0;
  let received = 0;
  for (const leg of legs) {
    const cash = leg.premium * contractMultiplierOf(leg) * leg.quantity;
    if (leg.side === "buy") paid += cash;
    else received += cash;
  }
  const net = received - paid;
  return {
    premiumPaid: roundCents(paid),
    premiumReceived: roundCents(received),
    netDebit: roundCents(Math.max(0, -net)),
    netCredit: roundCents(Math.max(0, net)),
    netPremium: roundCents(net),
  };
}

export function pnlAt(legs: AnalyzerLeg[], spot: number, stock?: StockPosition | null, residual?: ResidualValuation | null) {
  let pnl = 0;
  for (const leg of legs) {
    const value = legMarkValue(leg, spot, residual);
    const sign = leg.side === "buy" ? 1 : -1;
    pnl += sign * (value - leg.premium) * contractMultiplierOf(leg) * leg.quantity;
  }
  if (stock?.shares) {
    const stockSign = stock.side === "SHORT" ? -1 : 1;
    pnl += stockSign * (spot - stock.entry) * stock.shares;
  }
  return roundCents(pnl);
}

function rightSlope(legs: AnalyzerLeg[], stock?: StockPosition | null) {
  let slope = 0;
  if (stock?.shares) slope += (stock.side === "SHORT" ? -1 : 1) * stock.shares;
  for (const leg of legs) {
    if (leg.right !== "call") continue;
    slope += (leg.side === "buy" ? 1 : -1) * contractMultiplierOf(leg) * leg.quantity;
  }
  return slope;
}

function uniquePrices(values: Array<number | null | undefined>) {
  const out: number[] = [];
  for (const v of values) {
    if (v == null || !Number.isFinite(v) || v < 0) continue;
    const px = roundPx(v);
    if (!out.some((x) => Math.abs(x - px) < 1e-6)) out.push(px);
  }
  return out.sort((a, b) => a - b);
}

function keyPrices(legs: AnalyzerLeg[], spot: number, stock?: StockPosition | null) {
  const strikes = legs.map((l) => l.strike);
  const hiAnchor = Math.max(spot, ...strikes, stock?.entry || 0) * 3;
  return uniquePrices([0, 0.01, spot, stock?.entry, ...strikes, hiAnchor]);
}

export function breakevensAt(legs: AnalyzerLeg[], stock?: StockPosition | null, residual?: ResidualValuation | null, spot = 100) {
  const knots = keyPrices(legs, spot, stock);
  const found: number[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i];
    const b = knots[i + 1];
    const va = pnlAt(legs, a, stock, residual);
    const vb = pnlAt(legs, b, stock, residual);
    if (Math.abs(va) < 0.005) found.push(roundPx(a));
    else if (Math.abs(vb) < 0.005) found.push(roundPx(b));
    else if (va * vb < 0) {
      const frac = Math.abs(va) / (Math.abs(va) + Math.abs(vb));
      found.push(roundPx(a + (b - a) * frac));
    }
  }
  const uniq: number[] = [];
  for (const be of found) {
    if (!uniq.length || Math.abs(be - uniq[uniq.length - 1]) > 0.02) uniq.push(be);
  }
  return uniq;
}

function zonesFromSign(legs: AnalyzerLeg[], stock: StockPosition | null | undefined, residual: ResidualValuation | null | undefined, spot: number, wantProfit: boolean): PriceZone[] {
  const breaks = breakevensAt(legs, stock, residual, spot);
  const knots = [0.01, ...breaks, Math.max(spot, ...legs.map((l) => l.strike), 1) * 4];
  const zones: PriceZone[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const mid = (knots[i] + knots[i + 1]) / 2;
    const pos = pnlAt(legs, mid, stock, residual) > 0.005;
    if (pos !== wantProfit) continue;
    const from = i === 0 ? null : knots[i];
    const to = i === knots.length - 2 ? null : knots[i + 1];
    const last = zones[zones.length - 1];
    if (last && last.to === from) last.to = to;
    else zones.push({ from, to });
  }
  return zones;
}

export function extremesAt(legs: AnalyzerLeg[], stock?: StockPosition | null, residual?: ResidualValuation | null, spot = 100) {
  const slope = rightSlope(legs, stock);
  const knots = keyPrices(legs, spot, stock);
  const values = knots.map((p) => pnlAt(legs, p, stock, residual));
  const finiteMax = Math.max(...values);
  const finiteMin = Math.min(...values);
  const unlimitedProfit = slope > 1e-6;
  const unlimitedLoss = slope < -1e-6;
  return {
    maxProfit: unlimitedProfit ? null : roundCents(Math.max(0, finiteMax)),
    maxLoss: unlimitedLoss ? null : roundCents(Math.max(0, -finiteMin)),
    signedMax: unlimitedProfit ? null : roundCents(finiteMax),
    signedMin: unlimitedLoss ? null : roundCents(finiteMin),
    maxProfitStatus: (unlimitedProfit ? "UNLIMITED" : "LIMITED") as BoundStatus,
    maxLossStatus: (unlimitedLoss ? "UNLIMITED" : "LIMITED") as BoundStatus,
    unboundedLossDirection: unlimitedLoss ? ("up" as const) : null,
    slope,
  };
}

export function chartDomain(
  legs: AnalyzerLeg[],
  spot: number,
  stock?: StockPosition | null,
  breakevens: number[] = [],
  maxLossStatus: BoundStatus = "LIMITED",
) {
  const strikes = legs.map((l) => l.strike);
  const anchors = uniquePrices([spot, stock?.entry, ...strikes, ...breakevens]);
  const minA = anchors[0] ?? spot;
  const maxA = anchors[anchors.length - 1] ?? spot;
  const span = Math.max(maxA - minA, Math.max(spot * 0.08, 2));
  const pad = Math.max(span * 0.28, spot * 0.06, 1);
  let lo = Math.max(0.01, minA - pad);
  let hi = maxA + pad;
  if (maxLossStatus === "UNLIMITED") hi = Math.max(hi, maxA * 1.35, spot * 1.35);
  const hasShortPut = legs.some((l) => l.right === "put" && l.side === "sell");
  if (hasShortPut || stock?.shares) lo = Math.max(0.01, Math.min(lo, minA * 0.45));
  return { lo: roundPx(lo), hi: roundPx(hi), lossContinues: maxLossStatus === "UNLIMITED" };
}

export function priceCurve(legs: AnalyzerLeg[], spot: number, stock?: StockPosition | null, residual?: ResidualValuation | null, steps = 161) {
  const ext = extremesAt(legs, stock, residual, spot);
  const breaks = breakevensAt(legs, stock, residual, spot);
  const { lo, hi } = chartDomain(legs, spot, stock, breaks, ext.maxLossStatus);
  const step = (hi - lo) / (steps - 1);
  const grid = Array.from({ length: steps }, (_, i) => roundPx(lo + i * step));
  for (const k of uniquePrices([...legs.map((l) => l.strike), spot, stock?.entry, ...breaks])) {
    if (k > lo && k < hi) grid.push(k);
  }
  const uniq = uniquePrices(grid);
  return uniq.map((price) => ({ price, pnl: pnlAt(legs, price, stock, residual) }));
}

export function scenarioRows(legs: AnalyzerLeg[], spot: number, stock?: StockPosition | null, residual?: ResidualValuation | null) {
  const rows: { label: string; price: number; pnl: number }[] = [];
  const specs: [string, number][] = [
    ["-20%", 0.8],
    ["-10%", 0.9],
    ["Unchanged", 1],
    ["+10%", 1.1],
    ["+20%", 1.2],
  ];
  for (const [label, mult] of specs) {
    const price = roundPx(spot * mult);
    rows.push({ label, price, pnl: pnlAt(legs, price, stock, residual) });
  }
  return rows;
}

export function riskReward(maxProfit: number | null, maxLoss: number | null) {
  if (maxProfit == null || maxLoss == null || maxLoss <= 0) return null;
  return roundCents(maxProfit / maxLoss);
}

export function formatZone(zone: PriceZone) {
  if (zone.from == null && zone.to == null) return "Any price";
  if (zone.from == null) return `Below $${zone.to!.toFixed(2)}`;
  if (zone.to == null) return `Above $${zone.from.toFixed(2)}`;
  return `$${zone.from.toFixed(2)} – $${zone.to.toFixed(2)}`;
}

export function describePosition(input: {
  symbol: string;
  name?: string;
  strategyLabel: string;
  expiration: string;
  farExpiration?: string | null;
  contracts: number;
  spot: number;
  legs: AnalyzerLeg[];
  stock?: StockPosition | null;
  cash: number;
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  profitZones: PriceZone[];
  maxLossRegion?: string | null;
  exceedsPremium?: boolean;
}) {
  const ticker = input.symbol.toUpperCase();
  const company = input.name && input.name !== ticker ? `${ticker} (${input.name})` : ticker;
  const legs = input.legs
    .map((l) => {
      const live = l.side === "buy" ? l.ask ?? l.premium : l.bid ?? l.premium;
      const src = l.priceSource || (l.side === "buy" ? "ask" : "bid");
      return `${l.side === "buy" ? "buy" : "sell"} ${l.quantity} ${l.right} @ $${l.strike.toFixed(2)} for $${l.premium.toFixed(2)} (live ${src} $${(live ?? l.premium).toFixed(2)})`;
    })
    .join("; ");
  const stock = input.stock?.shares ? ` plus ${input.stock.shares} shares at $${input.stock.entry.toFixed(2)}` : "";
  const entry =
    input.cash < 0
      ? `net debit ${usdAbs(input.cash)}`
      : input.cash > 0
        ? `net credit ${usdAbs(input.cash)}`
        : "no net premium";
  const maxP = input.maxProfit == null ? "unlimited" : usdAbs(input.maxProfit);
  const maxL = input.maxLoss == null ? "unlimited" : usdAbs(input.maxLoss);
  const be = input.breakevens.length ? input.breakevens.map((b) => `$${b.toFixed(2)}`).join(" and ") : "none in range";
  const profit = input.profitZones.length ? input.profitZones.map(formatZone).join("; ") : "no profit zone at expiration";
  const later = input.farExpiration ? ` The later-dated leg is valued at the ${input.expiration} expiration using its listed IV.` : "";
  const region = input.maxLossRegion ? ` ${input.maxLossRegion}.` : "";
  const extra = input.exceedsPremium
    ? ` Maximum loss is greater than the ${entry.replace("net ", "")}.`
    : input.maxLoss != null && input.cash < 0 && Math.abs(input.maxLoss - Math.abs(input.cash)) <= 0.51
      ? " Maximum loss equals the net debit paid."
      : "";
  return `For ${company} expiring ${input.expiration}, a ${input.strategyLabel} (${input.contracts} contract${input.contracts === 1 ? "" : "s"}) is built as: ${legs}${stock}. Entry is a ${entry}. Maximum profit is ${maxP}. Maximum loss is ${maxL}.${extra}${region} Breakeven point(s): ${be}. Profit zone: ${profit}. All figures use the selected contracts and live listed premiums at a ${ticker} price of $${input.spot.toFixed(2)}.${later}`;
}

function usdAbs(n: number) {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ValidationIssue = { level: ValidationLevel; message: string };

export type StrikeRow = {
  price: number;
  pnl: number;
  status: ScenarioStatus;
  returnPct: number | null;
};

export type PayoffEngineOptionLeg = {
  side: "BUY" | "SELL";
  optionType: "CALL" | "PUT";
  strike: number;
  premium: number;
  quantity: number;
  expiration: string;
  contractMultiplier: number;
};

export type PayoffEngineStockLeg = {
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
};

export type PayoffEnginePosition = {
  ticker: string;
  underlyingPrice: number;
  legs: Array<PayoffEngineOptionLeg | PayoffEngineStockLeg>;
};

export function isPayoffStockLeg(leg: PayoffEngineOptionLeg | PayoffEngineStockLeg): leg is PayoffEngineStockLeg {
  return "entryPrice" in leg;
}

export function lossToPremiumRatio(maxLoss: number | null, netPremium: number) {
  if (maxLoss == null) return null;
  const denom = Math.abs(netPremium);
  if (!(denom > 0) || !Number.isFinite(maxLoss)) return null;
  return roundCents(Math.abs(maxLoss) / denom);
}

export function formatEtTimestamp(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

export function marketDataFreshness(source?: string | null, asOf?: string | null, now = Date.now()) {
  const ageMs = asOf && Number.isFinite(new Date(asOf).getTime()) ? now - new Date(asOf).getTime() : null;
  const delayedProvider = /yahoo|yfinance|delayed/i.test(source || "");
  const stale = ageMs != null && ageMs > 5 * 60 * 1000;
  return {
    source: source || "unknown",
    as_of: asOf || null,
    as_of_et: formatEtTimestamp(asOf),
    status: delayedProvider || stale ? ("Delayed" as const) : ("Live" as const),
    stale,
    age_ms: ageMs,
  };
}

export function markToMarketPnl(legs: AnalyzerLeg[], spot: number, stock?: StockPosition | null) {
  let pnl = 0;
  for (const leg of legs) {
    const mid =
      leg.bid != null && leg.ask != null && leg.bid > 0 && leg.ask > 0
        ? (leg.bid + leg.ask) / 2
        : leg.last != null && leg.last > 0
          ? leg.last
          : null;
    if (mid == null) return null;
    const sign = leg.side === "buy" ? 1 : -1;
    pnl += sign * (mid - leg.premium) * contractMultiplierOf(leg) * leg.quantity;
  }
  if (stock?.shares) {
    const stockSign = stock.side === "SHORT" ? -1 : 1;
    pnl += stockSign * (spot - stock.entry) * stock.shares;
  }
  return roundCents(pnl);
}

function zonesWherePnlEquals(
  legs: AnalyzerLeg[],
  stock: StockPosition | null | undefined,
  residual: ResidualValuation | null | undefined,
  spot: number,
  target: number | null,
): PriceZone[] {
  if (target == null) return [];
  const breaks = breakevensAt(legs, stock, residual, spot);
  const knots = uniquePrices([0, 0.01, ...legs.map((l) => l.strike), spot, stock?.entry, ...breaks, Math.max(spot, ...legs.map((l) => l.strike), 1) * 4]);
  const zones: PriceZone[] = [];
  const atTarget = (price: number) => Math.abs(pnlAt(legs, price, stock, residual) - target) <= 0.51;
  for (let i = 0; i < knots.length - 1; i++) {
    const mid = (knots[i] + knots[i + 1]) / 2;
    if (!atTarget(mid) && !atTarget(knots[i])) continue;
    if (!atTarget(mid) && atTarget(knots[i])) {
      const last = zones[zones.length - 1];
      const point = { from: knots[i], to: knots[i] };
      if (!last || last.to !== point.from) zones.push(point);
      continue;
    }
    const from = i === 0 ? null : knots[i];
    const to = i === knots.length - 2 ? null : knots[i + 1];
    const last = zones[zones.length - 1];
    if (last && last.to === from) last.to = to;
    else zones.push({ from, to });
  }
  if (atTarget(knots[knots.length - 1])) {
    const lastPx = knots[knots.length - 1];
    const last = zones[zones.length - 1];
    if (last && last.to == null) {
      /* already covers the right tail */
    } else if (!last || last.to !== lastPx) {
      zones.push({ from: lastPx, to: lastPx });
    }
  }
  return zones;
}

export function formatMaxLossRegion(ticker: string, zones: PriceZone[], unlimited?: boolean, direction?: "up" | null) {
  const name = ticker.toUpperCase();
  if (unlimited) {
    return direction === "up"
      ? `Maximum loss is unlimited. Losses continue increasing as ${name} rises.`
      : `Maximum loss is unlimited.`;
  }
  if (!zones.length) return null;
  const parts = zones.map((z) => {
    if (z.from == null && z.to != null) return `at or below $${z.to.toFixed(2)}`;
    if (z.to == null && z.from != null) return `at or above $${z.from.toFixed(2)}`;
    if (z.from != null && z.to != null && Math.abs(z.to - z.from) < 0.03) return `at $${z.from.toFixed(2)}`;
    if (z.from != null && z.to != null) return `between $${z.from.toFixed(2)} and $${z.to.toFixed(2)}`;
    return "across the displayed range";
  });
  return `Maximum Loss Occurs When ${name} Is ${parts.join(" or ")}`;
}

export function wingLosses(legs: AnalyzerLeg[], stock?: StockPosition | null, residual?: ResidualValuation | null, spot = 100) {
  const puts = legs.filter((l) => l.right === "put").map((l) => l.strike);
  const calls = legs.filter((l) => l.right === "call").map((l) => l.strike);
  if (!puts.length || !calls.length) return null;
  const putMin = Math.min(...uniquePrices([0.01, ...puts]).map((p) => pnlAt(legs, p, stock, residual)));
  const hi = Math.max(spot, ...calls) * 3;
  const callMin = Math.min(...uniquePrices([...calls, hi]).map((p) => pnlAt(legs, p, stock, residual)));
  return {
    putSideMaxLoss: roundCents(Math.max(0, -putMin)),
    callSideMaxLoss: roundCents(Math.max(0, -callMin)),
    overallMaxLoss: roundCents(Math.max(0, -Math.min(putMin, callMin))),
  };
}

export function strikeLevelRows(
  legs: AnalyzerLeg[],
  spot: number,
  stock: StockPosition | null | undefined,
  residual: ResidualValuation | null | undefined,
  breakevens: number[],
  signedMin: number | null,
  signedMax: number | null,
  netPremium: number,
): StrikeRow[] {
  const prices = uniquePrices([0, 0.01, ...legs.map((l) => l.strike), spot, stock?.entry, ...breakevens]);
  const denom = Math.abs(netPremium);
  return prices.map((price) => {
    const pnl = pnlAt(legs, price, stock, residual);
    let status: ScenarioStatus = pnl > 0.5 ? "Profit" : pnl < -0.5 ? "Loss" : "Breakeven";
    if (signedMin != null && Math.abs(pnl - signedMin) <= 0.51) status = "Maximum Loss";
    else if (signedMax != null && Math.abs(pnl - signedMax) <= 0.51) status = "Maximum Profit";
    else if (Math.abs(pnl) <= 0.5) status = "Breakeven";
    return {
      price,
      pnl,
      status,
      returnPct: denom > 0 ? roundCents((pnl / denom) * 100) : null,
    };
  });
}

export function effectiveCostBasis(legs: AnalyzerLeg[], stock?: StockPosition | null) {
  const prem = premiumTotals(legs);
  if (stock?.shares) return roundPx(stock.entry - prem.netPremium / stock.shares);
  const shortPut = legs.find((l) => l.right === "put" && l.side === "sell");
  const longPuts = legs.filter((l) => l.right === "put" && l.side === "buy");
  if (shortPut && !longPuts.length) return roundPx(shortPut.strike - shortPut.premium);
  return null;
}

export function requiredCapital(legs: AnalyzerLeg[], stock: StockPosition | null | undefined, maxLoss: number | null) {
  if (stock?.shares) return roundCents(Math.abs(stock.shares * stock.entry));
  const shortPuts = legs.filter((l) => l.right === "put" && l.side === "sell");
  const shortCalls = legs.filter((l) => l.right === "call" && l.side === "sell");
  const longCalls = legs.filter((l) => l.right === "call" && l.side === "buy");
  if (shortPuts.length && !shortCalls.length && !longCalls.length && !legs.some((l) => l.right === "put" && l.side === "buy")) {
    return roundCents(shortPuts.reduce((s, l) => s + l.strike * contractMultiplierOf(l) * l.quantity, 0));
  }
  if (maxLoss == null) return null;
  return maxLoss;
}

export function validateAnalyzerPosition(legs: AnalyzerLeg[], stock?: StockPosition | null, expiration?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!legs.length) issues.push({ level: "error", message: "At least one option leg is required." });
  const seen = new Set<string>();
  for (const leg of legs) {
    if (!(leg.strike > 0)) issues.push({ level: "error", message: "Every option strike must be greater than zero." });
    if (leg.premium < 0) issues.push({ level: "error", message: "Premium cannot be negative." });
    if (!(leg.quantity > 0)) issues.push({ level: "error", message: "Quantity must be greater than zero." });
    if (!(contractMultiplierOf(leg) > 0)) issues.push({ level: "error", message: "Contract multiplier must be greater than zero." });
    if (leg.side === "buy" && (leg.ask == null || !(leg.ask > 0)) && (leg.priceSource || "ask") === "ask") {
      issues.push({ level: "warning", message: `Missing ask for the ${leg.right} $${leg.strike.toFixed(2)}. A fallback premium was used.` });
    }
    if (leg.side === "sell" && (leg.bid == null || !(leg.bid > 0)) && (leg.priceSource || "bid") === "bid") {
      issues.push({ level: "warning", message: `Missing bid for the ${leg.right} $${leg.strike.toFixed(2)}. A fallback premium was used.` });
    }
    const key = `${leg.side}-${leg.right}-${leg.strike}-${leg.expiration || ""}-${leg.quantity}`;
    if (seen.has(key)) issues.push({ level: "warning", message: "Duplicate option legs were supplied." });
    seen.add(key);
    if (leg.expiration) {
      const exp = new Date(`${leg.expiration}T00:00:00Z`).getTime();
      const today = new Date();
      const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
      if (Number.isFinite(exp) && exp < todayUtc) issues.push({ level: "error", message: `Option expiration ${leg.expiration} is already in the past.` });
      else if (Number.isFinite(exp) && exp === todayUtc) issues.push({ level: "warning", message: "This is a same-day / 0DTE expiration. Values can change quickly." });
    }
  }
  if (stock && (!(stock.shares > 0) || !(stock.entry > 0))) {
    issues.push({ level: "error", message: "Stock quantity and entry price must be positive." });
  }
  if (expiration && legs.some((l) => l.expiration && l.expiration < expiration)) {
    issues.push({ level: "error", message: "A later-dated spread cannot use an expiration before the selected near date." });
  }
  return issues;
}

export function validateStrategyConstruction(strategyId: string, legs: AnalyzerLeg[], stock?: StockPosition | null): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const calls = legs.filter((l) => l.right === "call").sort((a, b) => a.strike - b.strike);
  const puts = legs.filter((l) => l.right === "put").sort((a, b) => a.strike - b.strike);
  const buyCalls = calls.filter((l) => l.side === "buy");
  const sellCalls = calls.filter((l) => l.side === "sell");
  const buyPuts = puts.filter((l) => l.side === "buy");
  const sellPuts = puts.filter((l) => l.side === "sell");
  if (strategyId === "bull_call_spread" && (buyCalls[0]?.strike ?? 0) >= (sellCalls[0]?.strike ?? 0)) {
    issues.push({ level: "error", message: "Bull call spread requires buying the lower-strike call and selling the higher-strike call." });
  }
  if (strategyId === "bear_call_spread" && (sellCalls[0]?.strike ?? 0) >= (buyCalls[0]?.strike ?? 0)) {
    issues.push({ level: "error", message: "Bear call spread requires selling the lower-strike call and buying the higher-strike call." });
  }
  if (strategyId === "bull_put_spread" && (buyPuts[0]?.strike ?? 0) >= (sellPuts[0]?.strike ?? 0)) {
    issues.push({ level: "error", message: "Bull put spread requires selling the higher-strike put and buying the lower-strike put." });
  }
  if (strategyId === "bear_put_spread" && (sellPuts[0]?.strike ?? 0) >= (buyPuts[0]?.strike ?? 0)) {
    issues.push({ level: "error", message: "Bear put spread requires buying the higher-strike put and selling the lower-strike put." });
  }
  if ((strategyId === "covered_call" || strategyId === "protective_put" || strategyId === "collar") && !stock?.shares) {
    issues.push({ level: "error", message: `${strategyId.replaceAll("_", " ")} requires a long stock position.` });
  }
  if (strategyId === "short_call" && (!sellCalls.length || buyCalls.length || stock?.shares)) {
    issues.push({ level: "error", message: "A short call must be an uncovered short call to report unlimited risk." });
  }
  return issues;
}

export function explainStrategyRisk(input: {
  strategyId: string;
  strategyLabel: string;
  symbol: string;
  premiumPaid: number;
  premiumReceived: number;
  netDebit: number;
  netCredit: number;
  maxProfit: number | null;
  maxLoss: number | null;
  maxLossRegion: string | null;
  effectiveBasis: number | null;
  stock?: StockPosition | null;
}) {
  const ticker = input.symbol.toUpperCase();
  const credit = input.netCredit > 0 ? usdAbs(input.netCredit) : usdAbs(input.premiumReceived);
  const debit = input.netDebit > 0 ? usdAbs(input.netDebit) : usdAbs(input.premiumPaid);
  const loss = input.maxLoss == null ? "unlimited" : usdAbs(input.maxLoss);
  const profit = input.maxProfit == null ? "unlimited" : usdAbs(input.maxProfit);
  const region = input.maxLossRegion ? ` ${input.maxLossRegion}.` : "";
  switch (input.strategyId) {
    case "bull_put_spread":
      return `You receive a net credit of ${credit} when entering this ${input.strategyLabel} on ${ticker}. Maximum profit is limited to that credit (${profit}). If ${ticker} falls far enough below the short put, the spread can lose ${loss}, which is the strike width minus the net credit.${region} That loss is greater than the credit received.`;
    case "bear_call_spread":
      return `You receive a net credit of ${credit} on this ${input.strategyLabel}. Maximum profit is ${profit}. If ${ticker} rises through the short call, the defined maximum loss is ${loss} (strike width minus the net credit).${region} Risk exceeds the credit received.`;
    case "short_call":
      return `You receive ${credit} for selling the uncovered ${ticker} call. Maximum profit is that premium. Maximum loss is unlimited because ${ticker} can keep rising. The premium is not a loss cap.`;
    case "short_put":
      return `You receive ${credit} for selling the uncovered ${ticker} put. Maximum profit is that premium. Theoretical maximum loss is ${loss} if ${ticker} falls to zero (strike minus premium received). That loss is substantially greater than the premium.`;
    case "cash_secured_put":
      return `This cash-secured put has the same expiration payoff as a short put. Maximum profit is the ${credit} premium. Theoretical maximum loss is ${loss} if ${ticker} goes to zero. Cash required to buy the shares is the strike collateral, which is not the same number as maximum loss. Effective purchase price is ${input.effectiveBasis != null ? usdAbs(input.effectiveBasis) : "N/A"} per share.`;
    case "covered_call":
      return `The short call premium on ${ticker} provides income and an upside cap, but it only offsets part of a stock decline. Maximum theoretical loss is ${loss} if the shares fall to zero. The call premium is not the maximum loss of the combined position.`;
    case "protective_put":
      return input.maxLoss != null && input.maxLoss > input.premiumPaid
        ? `The put limits ${ticker} downside below the put strike, but the overall stock + put position can still lose ${loss}. The put premium of ${debit} is not the maximum loss of the combined strategy.`
        : `The put limits ${ticker} downside below the put strike. Combined expiration maximum loss is ${loss}, calculated from the stock position plus the put premium — not from the put premium alone.`;
    case "collar":
      return `This collar combines long ${ticker} stock with a protective put and a short call. Maximum loss is ${loss} and maximum profit is ${profit}, both from the full stock + options payoff. Do not treat the put premium as the strategy’s maximum loss.`;
    case "iron_condor":
    case "iron_butterfly":
      return `This ${input.strategyLabel} collects a net credit of ${credit}. Maximum profit is that credit if ${ticker} finishes between the short strikes. Maximum loss is ${loss}, taken from the worst expiration payoff (wider wing width minus the credit), not from the premium alone.${region}`;
    case "long_call":
    case "long_put":
    case "bull_call_spread":
    case "bear_put_spread":
      return `This ${input.strategyLabel} is a debit of ${debit}. Maximum loss equals that net debit (${loss}) if the options expire worthless. Maximum profit is ${profit}.`;
    default:
      return `For this ${input.strategyLabel} on ${ticker}, entry premium paid is ${usdAbs(input.premiumPaid)} and premium received is ${usdAbs(input.premiumReceived)}. Maximum profit is ${profit}. Maximum loss is ${loss}.${region}`;
  }
}

export type RiskWarningKind = "unlimited" | "exceeds_credit" | "exceeds_premium" | "stock_plus_option" | "limited_debit";

export function classifyRiskWarning(input: {
  maxLoss: number | null;
  maxLossStatus: BoundStatus;
  netDebit: number;
  netCredit: number;
  premiumPaid: number;
  usesStock: boolean;
}): { kind: RiskWarningKind; title: string; body: string } {
  const credit = input.netCredit;
  const paid = input.premiumPaid;
  if (input.maxLossStatus === "UNLIMITED" || input.maxLoss == null) {
    return {
      kind: "unlimited",
      title: "UNLIMITED LOSS POTENTIAL",
      body: `The maximum loss is not limited to the ${usdAbs(credit || paid)} premium received. Losses can continue increasing as the underlying price rises.`,
    };
  }
  if (input.usesStock) {
    return {
      kind: "stock_plus_option",
      title: input.maxLoss > paid + 0.51 ? "Strategy Loss Exceeds Option Premium" : "Combined Stock + Option Risk",
      body:
        input.maxLoss > paid + 0.51
          ? `The ${usdAbs(paid || credit)} option premium is not the maximum loss of the combined stock + option position. Expiration maximum loss is ${usdAbs(input.maxLoss)}.`
          : `This position includes the underlying stock. Expiration maximum loss of the combined strategy is ${usdAbs(input.maxLoss)}, calculated from the stock and option payoffs together.`,
    };
  }
  if (credit > 0 && input.maxLoss > credit + 0.51) {
    return {
      kind: "exceeds_credit",
      title: "Maximum Loss Exceeds Premium/Credit",
      body: `You receive ${usdAbs(credit)} in premium/credit, but the strategy can lose up to ${usdAbs(input.maxLoss)} at expiration.`,
    };
  }
  if (paid > 0 && input.maxLoss > paid + 0.51 && credit <= 0) {
    return {
      kind: "exceeds_premium",
      title: "Maximum Loss Exceeds Premium/Credit",
      body: `You pay ${usdAbs(paid)} in premium, but the strategy can lose up to ${usdAbs(input.maxLoss)} at expiration.`,
    };
  }
  return {
    kind: "limited_debit",
    title: "Maximum Loss Limited to Net Debit",
    body: `Maximum loss equals the ${usdAbs(input.netDebit || paid)} net debit paid for this defined-risk position.`,
  };
}

export type AnalyzerPayoff = {
  symbol: string;
  name: string;
  spot: number;
  strategy_id: string;
  strategy_label: string;
  expiration: string;
  far_expiration: string | null;
  contracts: number;
  contract_multiplier: number;
  cash_today: number;
  option_premium: number;
  premium_paid: number;
  premium_received: number;
  net_debit: number;
  net_credit: number;
  entry_label: string;
  max_profit: number | null;
  max_loss: number | null;
  max_profit_status: BoundStatus;
  max_loss_status: BoundStatus;
  risk_beyond_credit: number | null;
  loss_to_premium_ratio: number | null;
  risk_reward: number | null;
  breakevens: number[];
  profit_zones: PriceZone[];
  loss_zones: PriceZone[];
  max_profit_zones: PriceZone[];
  max_loss_zones: PriceZone[];
  max_loss_region: string | null;
  max_profit_region: string | null;
  side_losses: { putSideMaxLoss: number; callSideMaxLoss: number; overallMaxLoss: number } | null;
  effective_cost_basis: number | null;
  required_capital: number | null;
  upside_cap: number | null;
  downside_protection: number | null;
  strike_rows: StrikeRow[];
  curve: { price: number; pnl: number }[];
  chart_domain: { lo: number; hi: number; lossContinues: boolean };
  scenarios: { label: string; price: number; pnl: number }[];
  at_spot_pnl: number;
  expiration_pnl_at_spot: number;
  current_estimated_pnl: number | null;
  explanation: string;
  risk_explanation: string;
  warning: { kind: RiskWarningKind; title: string; body: string };
  validation: ValidationIssue[];
  residual: boolean;
  residual_years: number;
  stock: StockPosition | null;
  legs: Array<
    AnalyzerLeg & {
      moneyness: Moneyness;
      cash: number;
      label: string;
      entry_source: string;
    }
  >;
};

function fromEngineLeg(leg: PayoffEngineOptionLeg): AnalyzerLeg {
  return createAnalyzerLeg({
    right: leg.optionType.toLowerCase(),
    side: leg.side.toLowerCase(),
    strike: leg.strike,
    premium: leg.premium,
    quantity: leg.quantity,
    expiration: leg.expiration,
    contractMultiplier: leg.contractMultiplier,
  });
}

export function calculatePayoff(position: PayoffEnginePosition, underlyingPrice: number) {
  const optionLegs = position.legs.filter((l): l is PayoffEngineOptionLeg => !isPayoffStockLeg(l)).map(fromEngineLeg);
  const stockLeg = position.legs.find(isPayoffStockLeg);
  const stock = stockLeg ? { shares: stockLeg.quantity, entry: stockLeg.entryPrice, side: stockLeg.side } : null;
  const exp = optionLegs[0]?.expiration || "";
  const out = analyzePayoff({
    symbol: position.ticker,
    spot: underlyingPrice,
    strategyId: "custom",
    strategyLabel: "Custom",
    expiration: exp,
    legs: optionLegs,
    stock,
  });
  return {
    pnl: pnlAt(optionLegs, underlyingPrice, stock),
    totalPremiumPaid: out.premium_paid,
    totalPremiumReceived: out.premium_received,
    netDebit: out.net_debit,
    netCredit: out.net_credit,
    maxProfit: out.max_profit,
    maxLoss: out.max_loss,
    maxProfitStatus: out.max_profit_status,
    maxLossStatus: out.max_loss_status,
    breakevens: out.breakevens,
    profitZones: out.profit_zones,
    lossZones: out.loss_zones,
    maxLossPriceRanges: out.max_loss_zones,
    maxProfitPriceRanges: out.max_profit_zones,
  };
}

export function analyzePayoff(input: {
  symbol: string;
  name?: string;
  spot: number;
  strategyId: string;
  strategyLabel: string;
  expiration: string;
  farExpiration?: string | null;
  contracts?: number;
  legs: AnalyzerLeg[];
  stock?: StockPosition | null;
  asOf?: string | null;
  source?: string | null;
}): AnalyzerPayoff {
  if (!input.legs.length) throw new Error("At least one option leg is required");
  if (!(input.spot > 0)) throw new Error("Spot price must be positive");
  const stock = input.stock?.shares ? input.stock : null;
  const residual =
    input.farExpiration && yearFraction(input.expiration, input.farExpiration) > 0
      ? { farExpiration: input.farExpiration, years: yearFraction(input.expiration, input.farExpiration) }
      : null;
  const validation = [
    ...validateAnalyzerPosition(input.legs, stock, input.expiration),
    ...validateStrategyConstruction(input.strategyId, input.legs, stock),
  ];
  if (validation.some((v) => v.level === "error")) {
    throw new Error(validation.find((v) => v.level === "error")!.message);
  }
  const cash = cashToday(input.legs, stock);
  const optionPrem = optionPremiumCash(input.legs);
  const prem = premiumTotals(input.legs);
  const ext = extremesAt(input.legs, stock, residual, input.spot);
  const breaks = breakevensAt(input.legs, stock, residual, input.spot);
  const profitZones = zonesFromSign(input.legs, stock, residual, input.spot, true);
  const lossZones = zonesFromSign(input.legs, stock, residual, input.spot, false);
  const maxLossZones = zonesWherePnlEquals(input.legs, stock, residual, input.spot, ext.signedMin);
  const maxProfitZones = zonesWherePnlEquals(input.legs, stock, residual, input.spot, ext.signedMax);
  const contracts = input.contracts ?? Math.max(1, ...input.legs.map((l) => l.quantity));
  const multiplier = contractMultiplierOf(input.legs[0]);
  const maxLossRegion = formatMaxLossRegion(input.symbol, maxLossZones, ext.maxLossStatus === "UNLIMITED", ext.unboundedLossDirection);
  const maxProfitRegion =
    ext.maxProfitStatus === "UNLIMITED"
      ? `Maximum profit is unlimited as ${input.symbol.toUpperCase()} rises.`
      : formatMaxLossRegion(input.symbol, maxProfitZones)?.replace("Maximum Loss Occurs", "Maximum Profit Occurs") || null;
  const exceedsPremium =
    ext.maxLoss == null ||
    (prem.netCredit > 0 && ext.maxLoss > prem.netCredit + 0.51) ||
    (prem.netDebit > 0 && ext.maxLoss > prem.netDebit + 0.51);
  const basis = effectiveCostBasis(input.legs, stock);
  const longPut = input.legs.find((l) => l.right === "put" && l.side === "buy");
  const shortCall = input.legs.find((l) => l.right === "call" && l.side === "sell");
  const upsideCap = ext.maxProfitStatus === "LIMITED" && shortCall ? shortCall.strike : null;
  const downsideProtection = stock && longPut ? longPut.strike : null;
  const warning = classifyRiskWarning({
    maxLoss: ext.maxLoss,
    maxLossStatus: ext.maxLossStatus,
    netDebit: prem.netDebit,
    netCredit: prem.netCredit,
    premiumPaid: prem.premiumPaid,
    usesStock: Boolean(stock),
  });
  const expirationPnl = pnlAt(input.legs, input.spot, stock, residual);
  return {
    symbol: input.symbol.toUpperCase(),
    name: input.name || input.symbol.toUpperCase(),
    spot: input.spot,
    strategy_id: input.strategyId,
    strategy_label: input.strategyLabel,
    expiration: input.expiration,
    far_expiration: input.farExpiration || null,
    contracts,
    contract_multiplier: multiplier,
    cash_today: cash,
    option_premium: optionPrem,
    premium_paid: prem.premiumPaid,
    premium_received: prem.premiumReceived,
    net_debit: prem.netDebit,
    net_credit: prem.netCredit,
    entry_label: optionPrem < 0 ? `Debit ${usdAbs(optionPrem)}` : optionPrem > 0 ? `Credit ${usdAbs(optionPrem)}` : "Even",
    max_profit: ext.maxProfit,
    max_loss: ext.maxLoss,
    max_profit_status: ext.maxProfitStatus,
    max_loss_status: ext.maxLossStatus,
    risk_beyond_credit: ext.maxLoss != null && prem.netCredit > 0 ? roundCents(ext.maxLoss - prem.netCredit) : null,
    loss_to_premium_ratio: lossToPremiumRatio(ext.maxLoss, prem.netPremium),
    risk_reward: riskReward(ext.maxProfit, ext.maxLoss),
    breakevens: breaks,
    profit_zones: profitZones,
    loss_zones: lossZones,
    max_profit_zones: maxProfitZones,
    max_loss_zones: maxLossZones,
    max_loss_region: maxLossRegion,
    max_profit_region: maxProfitRegion,
    side_losses: wingLosses(input.legs, stock, residual, input.spot),
    effective_cost_basis: basis,
    required_capital: requiredCapital(input.legs, stock, ext.maxLoss),
    upside_cap: upsideCap,
    downside_protection: downsideProtection,
    strike_rows: strikeLevelRows(input.legs, input.spot, stock, residual, breaks, ext.signedMin, ext.signedMax, prem.netPremium),
    curve: priceCurve(input.legs, input.spot, stock, residual),
    chart_domain: chartDomain(input.legs, input.spot, stock, breaks, ext.maxLossStatus),
    scenarios: scenarioRows(input.legs, input.spot, stock, residual),
    at_spot_pnl: expirationPnl,
    expiration_pnl_at_spot: expirationPnl,
    current_estimated_pnl: markToMarketPnl(input.legs, input.spot, stock),
    explanation: describePosition({
      symbol: input.symbol,
      name: input.name,
      strategyLabel: input.strategyLabel,
      expiration: input.expiration,
      farExpiration: input.farExpiration,
      contracts,
      spot: input.spot,
      legs: input.legs,
      stock,
      cash: optionPrem,
      maxProfit: ext.maxProfit,
      maxLoss: ext.maxLoss,
      breakevens: breaks,
      profitZones,
      maxLossRegion,
      exceedsPremium,
    }),
    risk_explanation: explainStrategyRisk({
      strategyId: input.strategyId,
      strategyLabel: input.strategyLabel,
      symbol: input.symbol,
      premiumPaid: prem.premiumPaid,
      premiumReceived: prem.premiumReceived,
      netDebit: prem.netDebit,
      netCredit: prem.netCredit,
      maxProfit: ext.maxProfit,
      maxLoss: ext.maxLoss,
      maxLossRegion,
      effectiveBasis: basis,
      stock,
    }),
    warning,
    validation,
    residual: Boolean(residual),
    residual_years: residual?.years || 0,
    stock,
    legs: input.legs.map((l) => ({
      ...l,
      moneyness: moneyness(l.right, input.spot, l.strike),
      cash: roundCents((l.side === "buy" ? -1 : 1) * l.premium * contractMultiplierOf(l) * l.quantity),
      label: `${l.side === "buy" ? "Buy" : "Sell"} ${l.quantity} ${l.right.toUpperCase()} $${l.strike.toFixed(2)} @ $${l.premium.toFixed(2)}`,
      entry_source: l.priceSource ? `Live ${l.priceSource}` : l.side === "buy" ? "Live Ask" : "Live Bid",
    })),
  };
}
