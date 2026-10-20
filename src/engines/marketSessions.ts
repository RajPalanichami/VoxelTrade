import type { MarketSession } from "@/lib/extendedHours";
import { easternDateParts, instantFromEastern, isoDateEastern, shiftEasternDate } from "@/src/lib/easternTime";

type Civil = { year: number; month: number; day: number };

function nthWeekday(year: number, month: number, weekday: number, n: number): Civil {
  const first = instantFromEastern(year, month, 1);
  const firstWd = easternDateParts(first).weekday;
  const delta = (weekday - firstWd + 7) % 7;
  const day = 1 + delta + (n - 1) * 7;
  return { year, month, day };
}

function lastWeekday(year: number, month: number, weekday: number): Civil {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const last = shiftEasternDate(next.year, next.month, 1, -1);
  const lastDate = instantFromEastern(last.year, last.month, last.day);
  const lastWd = easternDateParts(lastDate).weekday;
  const delta = (lastWd - weekday + 7) % 7;
  return shiftEasternDate(last.year, last.month, last.day, -delta);
}

function observed(year: number, month: number, day: number): Civil {
  const d = instantFromEastern(year, month, day);
  const wd = easternDateParts(d).weekday;
  if (wd === 6) return shiftEasternDate(year, month, day, -1);
  if (wd === 0) return shiftEasternDate(year, month, day, 1);
  return { year, month, day };
}

const GOOD_FRIDAY: Record<number, Civil> = {
  2025: { year: 2025, month: 4, day: 18 },
  2026: { year: 2026, month: 4, day: 3 },
  2027: { year: 2027, month: 3, day: 26 },
  2028: { year: 2028, month: 4, day: 14 },
};

function key(c: Civil) {
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

export function nyseHolidays(year: number): Set<string> {
  const days = [
    observed(year, 1, 1),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    GOOD_FRIDAY[year],
    lastWeekday(year, 5, 1),
    observed(year, 6, 19),
    observed(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observed(year, 12, 25),
  ].filter(Boolean) as Civil[];
  return new Set(days.map(key));
}

export function isNyseHoliday(date: Date): boolean {
  const p = easternDateParts(date);
  return nyseHolidays(p.year).has(key({ year: p.year, month: p.month, day: p.day }));
}

export function nyseEarlyCloseMinutes(date: Date): number | null {
  const p = easternDateParts(date);
  const thanksgiving = nthWeekday(p.year, 11, 4, 4);
  const dayAfterTg = shiftEasternDate(thanksgiving.year, thanksgiving.month, thanksgiving.day, 1);
  const july3 = { year: p.year, month: 7, day: 3 };
  const christmasEve = { year: p.year, month: 12, day: 24 };
  const candidates = [dayAfterTg, july3, christmasEve];
  const today = key({ year: p.year, month: p.month, day: p.day });
  if (candidates.some((c) => key(c) === today) && !isNyseHoliday(date)) return 13 * 60;
  return null;
}

export function tradingDateEastern(now = new Date()): string {
  const p = easternDateParts(now);
  const mins = p.hour * 60 + p.minute;
  if (mins >= 20 * 60) {
    const next = shiftEasternDate(p.year, p.month, p.day, 1);
    return key(next);
  }
  return isoDateEastern(now);
}

export type SessionWindow = { start: Date; end: Date };

export function sessionWindows(tradingDate: string, earlyCloseMinutes: number | null = null): Record<"overnight" | "preMarket" | "regular" | "afterHours", SessionWindow> {
  const [year, month, day] = tradingDate.split("-").map(Number);
  const prev = shiftEasternDate(year, month, day, -1);
  const regularEndMins = earlyCloseMinutes ?? 16 * 60;
  const regularEnd = instantFromEastern(year, month, day, Math.floor(regularEndMins / 60), regularEndMins % 60);
  return {
    overnight: { start: instantFromEastern(prev.year, prev.month, prev.day, 20, 0), end: instantFromEastern(year, month, day, 4, 0) },
    preMarket: { start: instantFromEastern(year, month, day, 4, 0), end: instantFromEastern(year, month, day, 9, 30) },
    regular: { start: instantFromEastern(year, month, day, 9, 30), end: regularEnd },
    afterHours: { start: regularEnd, end: instantFromEastern(year, month, day, 20, 0) },
  };
}

export function inWindow(ts: Date, window: SessionWindow) {
  const t = ts.getTime();
  return t >= window.start.getTime() && t < window.end.getTime();
}

export function classifyMarketSession(now = new Date()): MarketSession {
  const p = easternDateParts(now);
  const mins = p.hour * 60 + p.minute + p.second / 60;
  const weekday = p.weekday;
  const holiday = isNyseHoliday(now);
  const early = nyseEarlyCloseMinutes(now);

  if (weekday === 6) {
    if (mins < 4 * 60) return "OVERNIGHT";
    return "CLOSED";
  }
  if (weekday === 0) {
    if (mins >= 20 * 60) return "OVERNIGHT";
    return "CLOSED";
  }
  if (holiday) {
    if (mins < 4 * 60) return "OVERNIGHT";
    if (mins >= 20 * 60) return "OVERNIGHT";
    return "CLOSED";
  }
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "PRE_MARKET";
  const regularEnd = early ?? 16 * 60;
  if (mins >= 9 * 60 + 30 && mins < regularEnd) return "REGULAR";
  if (mins >= regularEnd && mins < 20 * 60) return "AFTER_HOURS";
  return "OVERNIGHT";
}

export function sessionHasStarted(session: Exclude<MarketSession, "CLOSED">, now = new Date()) {
  const current = classifyMarketSession(now);
  const order: MarketSession[] = ["OVERNIGHT", "PRE_MARKET", "REGULAR", "AFTER_HOURS"];
  if (current === "CLOSED") {
    const p = easternDateParts(now);
    const mins = p.hour * 60 + p.minute;
    if (p.weekday === 0 || p.weekday === 6) return session === "OVERNIGHT" ? mins >= 20 * 60 || mins < 4 * 60 : true;
    return order.indexOf(session) < order.indexOf(classifyMarketSession(now) === "CLOSED" ? "OVERNIGHT" : current);
  }
  return order.indexOf(session) <= order.indexOf(current);
}

export function sessionHasEnded(session: Exclude<MarketSession, "CLOSED">, now = new Date()) {
  const current = classifyMarketSession(now);
  if (current === "CLOSED") {
    const p = easternDateParts(now);
    if (p.weekday === 0 || p.weekday === 6) return !(session === "OVERNIGHT" && (p.hour * 60 + p.minute < 4 * 60 || p.hour >= 20));
    return true;
  }
  const order: MarketSession[] = ["OVERNIGHT", "PRE_MARKET", "REGULAR", "AFTER_HOURS"];
  return order.indexOf(session) < order.indexOf(current);
}
