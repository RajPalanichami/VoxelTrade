import { ChainContract, OptionChain, OptionLeg, OptionRight } from "./optionsMath";

export type StrategyId =
  | "long_call"
  | "long_put"
  | "covered_call"
  | "cash_secured_put"
  | "bull_call_spread"
  | "bear_call_spread"
  | "bull_put_spread"
  | "bear_put_spread"
  | "straddle"
  | "strangle"
  | "butterfly"
  | "iron_butterfly"
  | "iron_condor"
  | "calendar"
  | "diagonal";

export type StrategyDef = {
  id: StrategyId;
  label: string;
  group: string;
  what: string;
  when: string;
  needsFar?: boolean;
  usesStock?: boolean;
};

export const STRATEGIES: StrategyDef[] = [
  { id: "long_call", label: "Call", group: "Basic", what: "You buy a call. You pay a premium for the right to buy the stock at the strike.", when: "Used when you think the stock will rise enough to cover the premium." },
  { id: "long_put", label: "Put", group: "Basic", what: "You buy a put. You pay a premium for the right to sell the stock at the strike.", when: "Used when you think the stock will fall enough to cover the premium." },
  { id: "covered_call", label: "Covered Call", group: "Income", what: "You own 100 shares and sell one call against them. You collect a premium.", when: "Used when you already own the stock and are okay selling it if it rallies to the strike.", usesStock: true },
  { id: "cash_secured_put", label: "Cash-Secured Put", group: "Income", what: "You sell a put and set aside cash to buy the stock if it is put to you.", when: "Used when you would be willing to buy the stock at a lower price and want income while you wait." },
  { id: "bull_call_spread", label: "Bull Call Spread", group: "Spreads", what: "Buy a call and sell a higher-strike call. Cost and upside are both capped.", when: "Used when you are moderately bullish and want a cheaper call." },
  { id: "bear_call_spread", label: "Bear Call Spread", group: "Spreads", what: "Sell a call and buy a higher-strike call. You collect a credit; risk is defined.", when: "Used when you think the stock will stay below the short strike." },
  { id: "bull_put_spread", label: "Bull Put Spread", group: "Spreads", what: "Sell a put and buy a lower-strike put. You collect a credit; risk is defined.", when: "Used when you think the stock will stay above the short put strike." },
  { id: "bear_put_spread", label: "Bear Put Spread", group: "Spreads", what: "Buy a put and sell a lower-strike put. Cost and downside profit are capped.", when: "Used when you are moderately bearish." },
  { id: "straddle", label: "Straddle", group: "Volatility", what: "Buy a call and a put at the same strike. You pay both premiums.", when: "Used when you expect a big move but are not sure of the direction." },
  { id: "strangle", label: "Strangle", group: "Volatility", what: "Buy an out-of-the-money call and put. Cheaper than a straddle; needs a larger move.", when: "Used when you expect a large move in either direction." },
  { id: "butterfly", label: "Butterfly", group: "Range", what: "Buy one lower call, sell two middle calls, buy one higher call. Profit peaks at the middle strike.", when: "Used when you think the stock will finish near the middle strike." },
  { id: "iron_butterfly", label: "Iron Butterfly", group: "Range", what: "Sell an at-the-money call and put, and buy wings for protection.", when: "Used when you expect the stock to stay pinned near today's price." },
  { id: "iron_condor", label: "Iron Condor", group: "Range", what: "Sell an out-of-the-money put and call, and buy further-out options as a cap.", when: "Used when you expect the stock to stay inside a range." },
  { id: "calendar", label: "Calendar Spread", group: "Time", what: "Sell a nearer-dated option and buy a later-dated option at the same strike.", when: "Used when you expect the stock to stay near the strike while the near option decays faster.", needsFar: true },
  { id: "diagonal", label: "Diagonal Spread", group: "Time", what: "Sell a nearer option and buy a later option at a different strike.", when: "Used when you have a mild directional view and want time decay on the short option.", needsFar: true },
];

function nearest(rows: ChainContract[], target: number) {
  if (!rows.length) return null;
  return rows.reduce((best, r) => (Math.abs(r.strike - target) < Math.abs(best.strike - target) ? r : best), rows[0]);
}

function above(rows: ChainContract[], strike: number, steps = 1) {
  const higher = rows.filter((r) => r.strike > strike + 1e-6).sort((a, b) => a.strike - b.strike);
  return higher[Math.min(steps, higher.length) - 1] || null;
}

function below(rows: ChainContract[], strike: number, steps = 1) {
  const lower = rows.filter((r) => r.strike < strike - 1e-6).sort((a, b) => b.strike - a.strike);
  return lower[Math.min(steps, lower.length) - 1] || null;
}

function L(c: ChainContract, side: "buy" | "sell", qty: number, right?: OptionRight): OptionLeg {
  return { right: right || c.right, side, strike: c.strike, premium: c.premium, quantity: qty };
}

export type BuiltStrategy = {
  legs: OptionLeg[];
  contracts: ChainContract[];
  underlyingShares: number;
  underlyingEntry: number | null;
  missing: string | null;
};

export function buildStrategy(
  id: StrategyId,
  near: OptionChain,
  qty: number,
  selected: ChainContract | null,
  far?: OptionChain | null,
): BuiltStrategy {
  const q = Math.max(1, qty);
  const spot = near.spot;
  const calls = near.calls;
  const puts = near.puts;
  const atmCall = selected?.right === "call" ? selected : nearest(calls, spot);
  const atmPut = selected?.right === "put" ? selected : nearest(puts, spot);
  const empty: BuiltStrategy = { legs: [], contracts: [], underlyingShares: 0, underlyingEntry: null, missing: "Not enough listed strikes for this strategy." };

  switch (id) {
    case "long_call": {
      if (!atmCall) return empty;
      return { legs: [L(atmCall, "buy", q)], contracts: [atmCall], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "long_put": {
      if (!atmPut) return empty;
      return { legs: [L(atmPut, "buy", q)], contracts: [atmPut], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "covered_call": {
      const short = selected?.right === "call" ? selected : above(calls, (atmCall?.strike || spot) - 0.01) || atmCall;
      if (!short) return empty;
      return { legs: [L(short, "sell", q)], contracts: [short], underlyingShares: 100 * q, underlyingEntry: spot, missing: null };
    }
    case "cash_secured_put": {
      const short = selected?.right === "put" ? selected : below(puts, (atmPut?.strike || spot) + 0.01) || atmPut;
      if (!short) return empty;
      return { legs: [L(short, "sell", q)], contracts: [short], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "bull_call_spread": {
      const buy = atmCall;
      const sell = buy ? above(calls, buy.strike) : null;
      if (!buy || !sell) return empty;
      return { legs: [L(buy, "buy", q), L(sell, "sell", q)], contracts: [buy, sell], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "bear_call_spread": {
      const sell = atmCall;
      const buy = sell ? above(calls, sell.strike) : null;
      if (!sell || !buy) return empty;
      return { legs: [L(sell, "sell", q), L(buy, "buy", q)], contracts: [sell, buy], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "bull_put_spread": {
      const sell = atmPut;
      const buy = sell ? below(puts, sell.strike) : null;
      if (!sell || !buy) return empty;
      return { legs: [L(sell, "sell", q), L(buy, "buy", q)], contracts: [sell, buy], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "bear_put_spread": {
      const buy = atmPut;
      const sell = buy ? below(puts, buy.strike) : null;
      if (!buy || !sell) return empty;
      return { legs: [L(buy, "buy", q), L(sell, "sell", q)], contracts: [buy, sell], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "straddle": {
      const k = atmCall || atmPut;
      const call = k ? nearest(calls, k.strike) : null;
      const put = k ? nearest(puts, k.strike) : null;
      if (!call || !put) return empty;
      return { legs: [L(call, "buy", q), L(put, "buy", q)], contracts: [call, put], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "strangle": {
      const put = atmPut ? below(puts, atmPut.strike) : null;
      const call = atmCall ? above(calls, atmCall.strike) : null;
      if (!put || !call) return empty;
      return { legs: [L(put, "buy", q), L(call, "buy", q)], contracts: [put, call], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "butterfly": {
      const mid = atmCall;
      const low = mid ? below(calls, mid.strike) : null;
      const high = mid ? above(calls, mid.strike) : null;
      if (!mid || !low || !high) return empty;
      return {
        legs: [L(low, "buy", q), L(mid, "sell", q * 2), L(high, "buy", q)],
        contracts: [low, mid, high],
        underlyingShares: 0,
        underlyingEntry: null,
        missing: null,
      };
    }
    case "iron_butterfly": {
      const call = atmCall;
      const put = atmPut;
      const longCall = call ? above(calls, call.strike) : null;
      const longPut = put ? below(puts, put.strike) : null;
      if (!call || !put || !longCall || !longPut) return empty;
      return {
        legs: [L(put, "sell", q), L(call, "sell", q), L(longPut, "buy", q), L(longCall, "buy", q)],
        contracts: [put, call, longPut, longCall],
        underlyingShares: 0,
        underlyingEntry: null,
        missing: null,
      };
    }
    case "iron_condor": {
      const shortPut = atmPut ? below(puts, atmPut.strike) : null;
      const longPut = shortPut ? below(puts, shortPut.strike) : null;
      const shortCall = atmCall ? above(calls, atmCall.strike) : null;
      const longCall = shortCall ? above(calls, shortCall.strike) : null;
      if (!shortPut || !longPut || !shortCall || !longCall) return empty;
      return {
        legs: [L(longPut, "buy", q), L(shortPut, "sell", q), L(shortCall, "sell", q), L(longCall, "buy", q)],
        contracts: [longPut, shortPut, shortCall, longCall],
        underlyingShares: 0,
        underlyingEntry: null,
        missing: null,
      };
    }
    case "calendar": {
      if (!far) return { ...empty, missing: "A later expiration is required for a calendar." };
      const strike = (atmCall || atmPut)?.strike;
      if (!strike) return empty;
      const shortC = nearest(calls, strike);
      const longC = nearest(far.calls, strike);
      if (!shortC || !longC) return empty;
      return { legs: [L(shortC, "sell", q), L(longC, "buy", q)], contracts: [shortC, longC], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    case "diagonal": {
      if (!far) return { ...empty, missing: "A later expiration is required for a diagonal." };
      const shortC = atmCall ? above(calls, atmCall.strike) || atmCall : null;
      const longC = shortC ? nearest(far.calls, shortC.strike) : null;
      if (!shortC || !longC) return empty;
      return { legs: [L(shortC, "sell", q), L(longC, "buy", q)], contracts: [shortC, longC], underlyingShares: 0, underlyingEntry: null, missing: null };
    }
    default:
      return empty;
  }
}

export function pickFarExpiration(expirations: string[], nearExp: string) {
  const later = expirations.filter((d) => d > nearExp);
  return later[Math.min(2, later.length - 1)] || later[0] || null;
}
