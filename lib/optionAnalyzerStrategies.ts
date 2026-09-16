import type { ChainContract, OptionChain } from "./optionsMath";
import {
  createAnalyzerLeg,
  DEFAULT_CONTRACT_MULTIPLIER,
  resolveEntryPremium,
  type AnalyzerLeg,
  type PremiumSource,
  type StockPosition,
} from "@/src/engines/optionAnalyzerPayoff";

export type AnalyzerStrategyId =
  | "long_call"
  | "long_put"
  | "short_call"
  | "short_put"
  | "bull_call_spread"
  | "bear_call_spread"
  | "bull_put_spread"
  | "bear_put_spread"
  | "straddle"
  | "strangle"
  | "butterfly"
  | "iron_butterfly"
  | "condor"
  | "iron_condor"
  | "covered_call"
  | "protective_put"
  | "collar"
  | "cash_secured_put"
  | "calendar"
  | "diagonal";

export type AnalyzerStrategyDef = {
  id: AnalyzerStrategyId;
  label: string;
  group: string;
  needsFar?: boolean;
  usesStock?: boolean;
};

export const ANALYZER_STRATEGIES: AnalyzerStrategyDef[] = [
  { id: "long_call", label: "Long Call", group: "Basic" },
  { id: "long_put", label: "Long Put", group: "Basic" },
  { id: "short_call", label: "Short Call", group: "Basic" },
  { id: "short_put", label: "Short Put", group: "Basic" },
  { id: "bull_call_spread", label: "Bull Call Spread", group: "Spreads" },
  { id: "bear_call_spread", label: "Bear Call Spread", group: "Spreads" },
  { id: "bull_put_spread", label: "Bull Put Spread", group: "Spreads" },
  { id: "bear_put_spread", label: "Bear Put Spread", group: "Spreads" },
  { id: "straddle", label: "Straddle", group: "Volatility" },
  { id: "strangle", label: "Strangle", group: "Volatility" },
  { id: "butterfly", label: "Butterfly", group: "Range" },
  { id: "iron_butterfly", label: "Iron Butterfly", group: "Range" },
  { id: "condor", label: "Condor", group: "Range" },
  { id: "iron_condor", label: "Iron Condor", group: "Range" },
  { id: "covered_call", label: "Covered Call", group: "Income", usesStock: true },
  { id: "cash_secured_put", label: "Cash-Secured Put", group: "Income" },
  { id: "protective_put", label: "Protective Put", group: "Hedges", usesStock: true },
  { id: "collar", label: "Collar", group: "Hedges", usesStock: true },
  { id: "calendar", label: "Calendar Spread", group: "Time", needsFar: true },
  { id: "diagonal", label: "Diagonal Spread", group: "Time", needsFar: true },
];

export const ANALYZER_GROUPS = ["Basic", "Spreads", "Volatility", "Range", "Income", "Hedges", "Time"];

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

export type BuildAnalyzerOpts = {
  priceSource?: PremiumSource;
  customPremiums?: Record<string, number>;
  contractMultiplier?: number;
};

function toLeg(c: ChainContract, side: "buy" | "sell", qty: number, expiration: string, opts?: BuildAnalyzerOpts): AnalyzerLeg {
  const key = c.contract || `${c.right}-${c.strike}-${expiration}`;
  const resolved = resolveEntryPremium({
    side,
    bid: c.bid,
    ask: c.ask,
    mid: c.premium,
    last: c.last,
    source: opts?.priceSource,
    custom: opts?.customPremiums?.[key],
  });
  return createAnalyzerLeg({
    right: c.right,
    side,
    strike: c.strike,
    premium: resolved.premium,
    quantity: qty,
    expiration,
    iv: c.iv,
    bid: c.bid,
    ask: c.ask,
    last: c.last,
    contract: c.contract,
    contractMultiplier: opts?.contractMultiplier ?? DEFAULT_CONTRACT_MULTIPLIER,
    priceSource: resolved.source,
  });
}

export type BuiltAnalyzer = {
  legs: AnalyzerLeg[];
  contracts: ChainContract[];
  stock: StockPosition | null;
  missing: string | null;
};

const empty: BuiltAnalyzer = { legs: [], contracts: [], stock: null, missing: "Not enough listed strikes for this strategy." };

export function buildAnalyzerStrategy(
  id: AnalyzerStrategyId,
  near: OptionChain,
  qty: number,
  selected: ChainContract | null,
  far?: OptionChain | null,
  opts?: BuildAnalyzerOpts,
): BuiltAnalyzer {
  const q = Math.max(1, qty);
  const exp = near.expiration;
  const spot = near.spot;
  const calls = near.calls;
  const puts = near.puts;
  const mult = opts?.contractMultiplier ?? DEFAULT_CONTRACT_MULTIPLIER;
  const focusCall = selected?.right === "call" ? selected : nearest(calls, spot);
  const focusPut = selected?.right === "put" ? selected : nearest(puts, spot);
  const leg = (c: ChainContract, side: "buy" | "sell", quantity = q) => toLeg(c, side, quantity, exp, opts);

  switch (id) {
    case "long_call": {
      if (!focusCall) return empty;
      return { legs: [leg(focusCall, "buy")], contracts: [focusCall], stock: null, missing: null };
    }
    case "long_put": {
      if (!focusPut) return empty;
      return { legs: [leg(focusPut, "buy")], contracts: [focusPut], stock: null, missing: null };
    }
    case "short_call": {
      if (!focusCall) return empty;
      return { legs: [leg(focusCall, "sell")], contracts: [focusCall], stock: null, missing: null };
    }
    case "short_put": {
      if (!focusPut) return empty;
      return { legs: [leg(focusPut, "sell")], contracts: [focusPut], stock: null, missing: null };
    }
    case "bull_call_spread": {
      const buy = focusCall;
      const sell = buy ? above(calls, buy.strike) : null;
      if (!buy || !sell) return empty;
      return { legs: [leg(buy, "buy"), leg(sell, "sell")], contracts: [buy, sell], stock: null, missing: null };
    }
    case "bear_call_spread": {
      const sell = focusCall;
      const buy = sell ? above(calls, sell.strike) : null;
      if (!sell || !buy) return empty;
      return { legs: [leg(sell, "sell"), leg(buy, "buy")], contracts: [sell, buy], stock: null, missing: null };
    }
    case "bull_put_spread": {
      const sell = focusPut;
      const buy = sell ? below(puts, sell.strike) : null;
      if (!sell || !buy) return empty;
      return { legs: [leg(sell, "sell"), leg(buy, "buy")], contracts: [sell, buy], stock: null, missing: null };
    }
    case "bear_put_spread": {
      const buy = focusPut;
      const sell = buy ? below(puts, buy.strike) : null;
      if (!buy || !sell) return empty;
      return { legs: [leg(buy, "buy"), leg(sell, "sell")], contracts: [buy, sell], stock: null, missing: null };
    }
    case "straddle": {
      const k = (focusCall || focusPut)?.strike;
      const call = k != null ? nearest(calls, k) : null;
      const put = k != null ? nearest(puts, k) : null;
      if (!call || !put) return empty;
      return { legs: [leg(call, "buy"), leg(put, "buy")], contracts: [call, put], stock: null, missing: null };
    }
    case "strangle": {
      const put = focusPut ? below(puts, focusPut.strike) : null;
      const call = focusCall ? above(calls, focusCall.strike) : null;
      if (!put || !call) return empty;
      return { legs: [leg(put, "buy"), leg(call, "buy")], contracts: [put, call], stock: null, missing: null };
    }
    case "butterfly": {
      const mid = focusCall;
      const low = mid ? below(calls, mid.strike) : null;
      const high = mid ? above(calls, mid.strike) : null;
      if (!mid || !low || !high) return empty;
      return {
        legs: [leg(low, "buy"), toLeg(mid, "sell", q * 2, exp, opts), leg(high, "buy")],
        contracts: [low, mid, high],
        stock: null,
        missing: null,
      };
    }
    case "iron_butterfly": {
      const call = focusCall;
      const put = focusPut;
      const longCall = call ? above(calls, call.strike) : null;
      const longPut = put ? below(puts, put.strike) : null;
      if (!call || !put || !longCall || !longPut) return empty;
      return {
        legs: [leg(longPut, "buy"), leg(put, "sell"), leg(call, "sell"), leg(longCall, "buy")],
        contracts: [longPut, put, call, longCall],
        stock: null,
        missing: null,
      };
    }
    case "condor": {
      const low = focusCall ? below(calls, focusCall.strike, 2) : null;
      const shortLow = low ? above(calls, low.strike) : null;
      const shortHigh = shortLow ? above(calls, shortLow.strike) : null;
      const high = shortHigh ? above(calls, shortHigh.strike) : null;
      if (!low || !shortLow || !shortHigh || !high) return empty;
      return {
        legs: [leg(low, "buy"), leg(shortLow, "sell"), leg(shortHigh, "sell"), leg(high, "buy")],
        contracts: [low, shortLow, shortHigh, high],
        stock: null,
        missing: null,
      };
    }
    case "iron_condor": {
      const shortPut = focusPut ? below(puts, focusPut.strike) : null;
      const longPut = shortPut ? below(puts, shortPut.strike) : null;
      const shortCall = focusCall ? above(calls, focusCall.strike) : null;
      const longCall = shortCall ? above(calls, shortCall.strike) : null;
      if (!shortPut || !longPut || !shortCall || !longCall) return empty;
      return {
        legs: [leg(longPut, "buy"), leg(shortPut, "sell"), leg(shortCall, "sell"), leg(longCall, "buy")],
        contracts: [longPut, shortPut, shortCall, longCall],
        stock: null,
        missing: null,
      };
    }
    case "covered_call": {
      const short = selected?.right === "call" ? selected : above(calls, (focusCall?.strike || spot) - 0.01) || focusCall;
      if (!short) return empty;
      return { legs: [leg(short, "sell")], contracts: [short], stock: { shares: mult * q, entry: spot, side: "LONG" }, missing: null };
    }
    case "cash_secured_put": {
      const short = selected?.right === "put" ? selected : below(puts, (focusPut?.strike || spot) + 0.01) || focusPut;
      if (!short) return empty;
      return { legs: [leg(short, "sell")], contracts: [short], stock: null, missing: null };
    }
    case "protective_put": {
      const put = focusPut || nearest(puts, spot);
      if (!put) return empty;
      return { legs: [leg(put, "buy")], contracts: [put], stock: { shares: mult * q, entry: spot, side: "LONG" }, missing: null };
    }
    case "collar": {
      const put = focusPut ? below(puts, focusPut.strike) || focusPut : nearest(puts, spot * 0.95);
      const call = focusCall ? above(calls, focusCall.strike) || focusCall : nearest(calls, spot * 1.05);
      if (!put || !call) return empty;
      return {
        legs: [leg(put, "buy"), leg(call, "sell")],
        contracts: [put, call],
        stock: { shares: mult * q, entry: spot, side: "LONG" },
        missing: null,
      };
    }
    case "calendar": {
      if (!far) return { ...empty, missing: "A later expiration is required for a calendar." };
      const strike = (focusCall || focusPut)?.strike;
      if (!strike) return empty;
      const shortC = nearest(calls, strike);
      const longC = nearest(far.calls, strike);
      if (!shortC || !longC) return empty;
      return {
        legs: [leg(shortC, "sell"), toLeg({ ...longC, iv: longC.iv ?? shortC.iv }, "buy", q, far.expiration, opts)],
        contracts: [shortC, longC],
        stock: null,
        missing: null,
      };
    }
    case "diagonal": {
      if (!far) return { ...empty, missing: "A later expiration is required for a diagonal." };
      const shortC = focusCall ? above(calls, focusCall.strike) || focusCall : null;
      const longC = shortC ? nearest(far.calls, shortC.strike - 1e-6) || nearest(far.calls, focusCall?.strike || shortC.strike) : null;
      if (!shortC || !longC) return empty;
      return {
        legs: [leg(shortC, "sell"), toLeg({ ...longC, iv: longC.iv ?? shortC.iv }, "buy", q, far.expiration, opts)],
        contracts: [shortC, longC],
        stock: null,
        missing: null,
      };
    }
    default:
      return empty;
  }
}

export function pickFarExpiration(expirations: string[], nearExp: string) {
  const later = expirations.filter((d) => d > nearExp);
  return later[Math.min(2, later.length - 1)] || later[0] || null;
}
