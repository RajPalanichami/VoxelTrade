export type OptionRight = "call" | "put";
export type OptionSide = "buy" | "sell";

export type OptionLeg = {
  right: OptionRight;
  side: OptionSide;
  strike: number;
  premium: number;
  quantity: number;
};

export const MULTIPLIER = 100;

export function createLeg(input: {
  right: string;
  side: string;
  strike: number;
  premium: number;
  quantity?: number;
}): OptionLeg {
  const right = input.right.toLowerCase();
  const side = input.side.toLowerCase();
  if (right !== "call" && right !== "put") throw new Error("right must be call or put");
  if (side !== "buy" && side !== "sell") throw new Error("side must be buy or sell");
  if (input.strike <= 0 || input.premium < 0 || (input.quantity ?? 1) <= 0) {
    throw new Error("strike, premium, and quantity must be valid");
  }
  return { right, side, strike: input.strike, premium: input.premium, quantity: input.quantity ?? 1 };
}

export function intrinsic(right: OptionRight, spot: number, strike: number): number {
  return right === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

export function legPnl(leg: OptionLeg, spot: number): number {
  const sign = leg.side === "buy" ? 1 : -1;
  return sign * (intrinsic(leg.right, spot, leg.strike) - leg.premium) * MULTIPLIER * leg.quantity;
}

export function portfolioPnl(legs: OptionLeg[], spot: number): number {
  return legs.reduce((sum, leg) => sum + legPnl(leg, spot), 0);
}

export function cashToday(legs: OptionLeg[], underlyingShares = 0, underlyingEntry = 0): number {
  let total = 0;
  for (const leg of legs) {
    const sign = leg.side === "buy" ? -1 : 1;
    total += sign * leg.premium * MULTIPLIER * leg.quantity;
  }
  if (underlyingShares) total -= underlyingShares * underlyingEntry;
  return total;
}

export function totalPnl(legs: OptionLeg[], spot: number, underlyingShares = 0, underlyingEntry = 0): number {
  const stock = underlyingShares ? (spot - underlyingEntry) * underlyingShares : 0;
  return portfolioPnl(legs, spot) + stock;
}

export function priceGrid(spot: number, strikes: number[], steps = 161): number[] {
  const lo = Math.max(0.01, Math.min(spot, ...strikes) * 0.55);
  let hi = Math.max(spot, ...strikes) * 1.55;
  if (hi <= lo) hi = lo * 2;
  const step = (hi - lo) / (steps - 1);
  return Array.from({ length: steps }, (_, i) => Math.round((lo + i * step) * 10000) / 10000);
}

export function breakevens(legs: OptionLeg[], prices: number[], underlyingShares = 0, underlyingEntry = 0): number[] {
  const found: number[] = [];
  let prevP = prices[0];
  let prevV = totalPnl(legs, prices[0], underlyingShares, underlyingEntry);
  for (const price of prices.slice(1)) {
    const value = totalPnl(legs, price, underlyingShares, underlyingEntry);
    if (prevV === 0) found.push(Math.round(prevP * 10000) / 10000);
    else if (value === 0) found.push(Math.round(price * 10000) / 10000);
    else if (prevV * value < 0) {
      const frac = Math.abs(prevV) / (Math.abs(prevV) + Math.abs(value));
      found.push(Math.round((prevP + (price - prevP) * frac) * 10000) / 10000);
    }
    prevP = price;
    prevV = value;
  }
  const uniq: number[] = [];
  for (const b of found) {
    if (!uniq.length || Math.abs(b - uniq[uniq.length - 1]) > 0.02) uniq.push(b);
  }
  return uniq;
}

export function extremes(
  legs: OptionLeg[],
  prices: number[],
  underlyingShares = 0,
  underlyingEntry = 0,
): [number | null, number | null] {
  const values = prices.map((p) => totalPnl(legs, p, underlyingShares, underlyingEntry));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const left = values[0];
  const right = values[values.length - 1];
  let maxGain: number | null = high;
  let maxLoss: number | null = low;
  if (right > values[values.length - 2] + 1e-6 && right >= high - 1e-6) maxGain = null;
  if (left > values[1] + 1e-6 && left >= high - 1e-6) maxGain = null;
  if (right < values[values.length - 2] - 1e-6 && right <= low + 1e-6) maxLoss = null;
  if (left < values[1] - 1e-6 && left <= low + 1e-6) maxLoss = null;
  return [maxGain, maxLoss];
}

function usd(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function explain(
  legs: OptionLeg[],
  spot: number,
  debit: number,
  maxGain: number | null,
  maxLoss: number | null,
  breaks: number[],
  upPnl: number,
  downPnl: number,
  flatPnl: number,
): Record<string, string> {
  const first = legs[0];
  let title = `${first.side === "buy" ? "Buy" : "Sell"} ${first.quantity} ${first.right.toUpperCase()} @ $${first.strike.toFixed(2)}`;
  if (legs.length > 1) {
    title = legs
      .map((l) => `${l.side === "buy" ? "Buy" : "Sell"} ${l.quantity} ${l.right.toUpperCase()} $${l.strike.toFixed(2)}`)
      .join(" + ");
  }
  let pay: string;
  if (debit < 0) pay = `You pay ${usd(debit)} today. That is the starting money at risk (a debit).`;
  else if (debit > 0) pay = `You receive ${usd(debit)} today (a credit). That credit is income only if the short options expire worthless.`;
  else pay = "No net premium is exchanged.";
  const lose = maxLoss == null ? "Loss can keep growing if the stock moves against you." : `The most you can lose is ${usd(maxLoss)} if this is held to expiration.`;
  const make = maxGain == null ? "Profit can keep growing if the stock keeps moving in your favor." : `The most you can make is ${usd(maxGain)} if held to expiration.`;
  let need: string;
  if (breaks.length) {
    const be = breaks[0];
    const needPct = spot ? (be / spot - 1) * 100 : 0;
    const direction = be >= spot ? "rise" : "fall";
    need = `Breakeven at expiration is about $${be.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${direction} ${Math.abs(needPct).toFixed(1)}% from $${spot.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`;
  } else need = "No single breakeven was found on this price range.";
  const outcome = (pnl: number, move: string) => {
    if (pnl > 5) return `If the stock ${move}, this selection is estimated to gain about ${usd(pnl)} at expiration.`;
    if (pnl < -5) return `If the stock ${move}, this selection is estimated to lose about ${usd(pnl)} at expiration.`;
    return `If the stock ${move}, this selection is estimated to finish near breakeven.`;
  };
  return {
    title,
    pay,
    lose,
    make,
    need,
    if_up: outcome(upPnl, "goes up about 10%"),
    if_down: outcome(downPnl, "goes down about 10%"),
    if_flat: outcome(flatPnl, "stays around the same price"),
  };
}

export function buildPayoff(
  legs: OptionLeg[],
  spot: number,
  underlyingShares = 0,
  underlyingEntry?: number | null,
): Record<string, unknown> {
  if (!legs.length) throw new Error("At least one option leg is required");
  if (spot <= 0) throw new Error("Spot price must be positive");
  const entry = underlyingEntry ?? spot;
  const strikes = legs.map((l) => l.strike);
  const prices = priceGrid(spot, strikes);
  const curve = prices.map((p) => ({ price: p, pnl: Math.round(totalPnl(legs, p, underlyingShares, entry) * 100) / 100 }));
  const debit = Math.round(cashToday(legs, underlyingShares, entry) * 100) / 100;
  const [maxGain, maxLoss] = extremes(legs, prices, underlyingShares, entry);
  const breaks = breakevens(legs, prices, underlyingShares, entry);
  const scenarios = (["-20%", 0.8, "-10%", 0.9, "Unchanged", 1, "+10%", 1.1, "+20%", 1.2] as const);
  const scenarioRows: { label: string; price: number; pnl: number }[] = [];
  for (let i = 0; i < scenarios.length; i += 2) {
    const label = scenarios[i] as string;
    const mult = scenarios[i + 1] as number;
    const px = Math.round(spot * mult * 10000) / 10000;
    scenarioRows.push({ label, price: px, pnl: Math.round(totalPnl(legs, px, underlyingShares, entry) * 100) / 100 });
  }
  const upPnl = scenarioRows.find((s) => s.label === "+10%")!.pnl;
  const downPnl = scenarioRows.find((s) => s.label === "-10%")!.pnl;
  const flatPnl = scenarioRows.find((s) => s.label === "Unchanged")!.pnl;
  return {
    spot,
    multiplier: MULTIPLIER,
    cash_today: debit,
    max_gain: maxGain == null ? null : Math.round(maxGain * 100) / 100,
    max_loss: maxLoss == null ? null : Math.round(maxLoss * 100) / 100,
    breakevens: breaks,
    curve,
    scenarios: scenarioRows,
    at_spot_pnl: Math.round(totalPnl(legs, spot, underlyingShares, entry) * 100) / 100,
    plain: explain(legs, spot, debit, maxGain, maxLoss, breaks, upPnl, downPnl, flatPnl),
    underlying_shares: underlyingShares,
    underlying_entry: underlyingShares ? entry : null,
    legs: legs.map((l) => ({ right: l.right, side: l.side, strike: l.strike, premium: l.premium, quantity: l.quantity })),
  };
}
