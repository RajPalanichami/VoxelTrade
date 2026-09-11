import { ChainContract, OptionLeg, OptionRight, intrinsic, MULTIPLIER } from "./optionsMath";

export type ScenarioKind = "up" | "flat" | "down";

export type DayRow = {
  day: string;
  dayIndex: number;
  stockPrice: number;
  optionValuePerShare: number;
  optionValue: number;
  dailyPnl: number;
  cumulativePnl: number;
  returnPct: number;
  status: string;
  theoretical: boolean;
};

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

export function blackScholes(right: OptionRight, spot: number, strike: number, years: number, iv: number, rate = 0.04) {
  if (years <= 1 / 365 || iv <= 0 || spot <= 0) return intrinsic(right, spot, strike);
  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * iv * iv) * years) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  if (right === "call") return spot * normCdf(d1) - strike * Math.exp(-rate * years) * normCdf(d2);
  return strike * Math.exp(-rate * years) * normCdf(-d2) - spot * normCdf(-d1);
}

export function daysToExpiration(expiration?: string) {
  if (!expiration) return 7;
  const end = Date.parse(`${expiration}T20:00:00-04:00`);
  if (Number.isNaN(end)) return 7;
  return Math.max(1, Math.ceil((end - Date.now()) / 86_400_000));
}

function pathPrice(spot: number, day: number, dte: number, kind: ScenarioKind) {
  const t = dte <= 0 ? 1 : day / dte;
  if (kind === "up") return spot * (1 + 0.08 * t);
  if (kind === "down") return Math.max(0.01, spot * (1 - 0.08 * t));
  return spot;
}

function ivFor(leg: OptionLeg, contracts: ChainContract[]) {
  const hit = contracts.find((c) => c.right === leg.right && Math.abs(c.strike - leg.strike) < 1e-6);
  const iv = hit?.iv;
  return iv && iv > 0.03 ? Math.min(iv, 2) : 0.28;
}

function markLegs(legs: OptionLeg[], contracts: ChainContract[], spot: number, yearsLeft: number, farYears?: number) {
  return legs.reduce((sum, leg, i) => {
    const sign = leg.side === "buy" ? 1 : -1;
    const y = farYears != null && i === legs.length - 1 ? farYears : yearsLeft;
    const theo = y <= 0 ? intrinsic(leg.right, spot, leg.strike) : blackScholes(leg.right, spot, leg.strike, y, ivFor(leg, contracts));
    return sum + sign * theo * MULTIPLIER * leg.quantity;
  }, 0);
}

function entryMark(legs: OptionLeg[], shares: number, entry: number | null) {
  const opt = legs.reduce((sum, leg) => {
    const sign = leg.side === "buy" ? 1 : -1;
    return sum + sign * leg.premium * MULTIPLIER * leg.quantity;
  }, 0);
  return opt + (shares && entry ? shares * entry : 0);
}

export function premiumSummary(legs: OptionLeg[]) {
  const debit = legs.reduce((sum, leg) => {
    const sign = leg.side === "buy" ? 1 : -1;
    return sum + sign * leg.premium * MULTIPLIER * leg.quantity;
  }, 0);
  const perShare = legs.reduce((sum, leg) => {
    const sign = leg.side === "buy" ? 1 : -1;
    return sum + sign * leg.premium * leg.quantity;
  }, 0);
  return {
    premiumPerShare: perShare,
    multiplier: MULTIPLIER,
    totalPremium: debit,
  };
}

export function projectDays(opts: {
  legs: OptionLeg[];
  contracts: ChainContract[];
  spot: number;
  expiration?: string;
  kind: ScenarioKind;
  shares?: number;
  entry?: number | null;
  farExpiration?: string | null;
}): DayRow[] {
  const dte = daysToExpiration(opts.expiration);
  const shares = opts.shares || 0;
  const stockEntry = opts.entry ?? opts.spot;
  const startOpt = entryMark(opts.legs, 0, null);
  const startAll = startOpt + shares * stockEntry;
  const steps: number[] = [0];
  const cap = Math.min(dte, 12);
  if (dte <= 12) {
    for (let d = 1; d <= dte; d++) steps.push(d);
  } else {
    for (let i = 1; i <= cap; i++) steps.push(Math.round((i * dte) / cap));
    if (steps[steps.length - 1] !== dte) steps.push(dte);
  }

  const rows: DayRow[] = [];
  let prevPnl = 0;
  for (const day of steps) {
    const px = pathPrice(opts.spot, day, dte, opts.kind);
    const years = Math.max(0, (dte - day) / 365);
    const farDte = opts.farExpiration ? daysToExpiration(opts.farExpiration) : undefined;
    const farYears = farDte != null ? Math.max(0, (farDte - day) / 365) : undefined;
    const optMark = day === 0 ? startOpt : markLegs(opts.legs, opts.contracts, px, years, farYears);
    const stockMark = shares ? px * shares : 0;
    const current = optMark + stockMark;
    const pnl = current - startAll;
    const daily = day === 0 ? 0 : pnl - prevPnl;
    let status = "Estimate";
    if (day === 0) status = "Entry (live quote)";
    else if (day === dte) status = "Expiration (theoretical)";
    else if (opts.kind === "flat") status = "Time decay (theoretical)";
    else if (opts.kind === "up") status = px > opts.spot ? "Stock increased (theoretical)" : "Estimate";
    else status = px < opts.spot ? "Stock decreased (theoretical)" : "Estimate";
    const invested = Math.abs(startAll) || 1;
    rows.push({
      day: day === 0 ? "Today" : day === dte ? "Expiration" : `Day ${day}`,
      dayIndex: day,
      stockPrice: px,
      optionValuePerShare: optMark / MULTIPLIER,
      optionValue: optMark,
      dailyPnl: daily,
      cumulativePnl: pnl,
      returnPct: (pnl / invested) * 100,
      status,
      theoretical: day !== 0,
    });
    prevPnl = pnl;
  }
  return rows;
}

export function snapshotFromRows(rows: DayRow[], startAbs: number) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : first;
  if (!last) {
    return {
      startingInvestment: startAbs,
      currentValue: startAbs,
      todayChange: 0,
      totalPnl: 0,
      returnPct: 0,
      entryValue: 0,
    };
  }
  return {
    startingInvestment: startAbs,
    currentValue: startAbs + last.cumulativePnl,
    todayChange: last.dailyPnl,
    totalPnl: last.cumulativePnl,
    returnPct: last.returnPct,
    entryValue: first?.optionValue ?? 0,
  };
}
