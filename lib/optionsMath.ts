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

export function intrinsic(right: OptionRight, spot: number, strike: number) {
  return right === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

export function legPnl(leg: OptionLeg, spot: number) {
  const sign = leg.side === "buy" ? 1 : -1;
  return sign * (intrinsic(leg.right, spot, leg.strike) - leg.premium) * MULTIPLIER * leg.quantity;
}

export function portfolioPnl(legs: OptionLeg[], spot: number) {
  return legs.reduce((sum, leg) => sum + legPnl(leg, spot), 0);
}

export function cashToday(legs: OptionLeg[]) {
  return legs.reduce((sum, leg) => {
    const sign = leg.side === "buy" ? -1 : 1;
    return sum + sign * leg.premium * MULTIPLIER * leg.quantity;
  }, 0);
}

export type ChainContract = {
  contract: string;
  right: OptionRight;
  strike: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  premium: number;
  volume: number;
  open_interest: number;
  iv: number | null;
  in_the_money: boolean;
};

export type OptionChain = {
  symbol: string;
  name: string;
  spot: number;
  expiration: string;
  expirations: string[];
  calls: ChainContract[];
  puts: ChainContract[];
  source: string;
  as_of: string;
};

export type OptionPayoff = {
  symbol?: string;
  expiration?: string;
  spot: number;
  multiplier: number;
  cash_today: number;
  max_gain: number | null;
  max_loss: number | null;
  breakevens: number[];
  curve: { price: number; pnl: number }[];
  scenarios: { label: string; price: number; pnl: number }[];
  at_spot_pnl: number;
  plain: {
    title: string;
    pay: string;
    lose: string;
    make: string;
    need: string;
    if_up?: string;
    if_down?: string;
    if_flat?: string;
  };
};

export function interpolatePnl(curve: { price: number; pnl: number }[], price: number) {
  if (!curve.length) return 0;
  if (price <= curve[0].price) return curve[0].pnl;
  if (price >= curve[curve.length - 1].price) return curve[curve.length - 1].pnl;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (price <= b.price) {
      const t = (price - a.price) / (b.price - a.price || 1);
      return a.pnl + (b.pnl - a.pnl) * t;
    }
  }
  return curve[curve.length - 1].pnl;
}
