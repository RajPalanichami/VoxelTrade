import {
  EST_LABEL,
  easternWeekWindow,
  formatEstClock,
  formatEstDate,
  formatEstDateTime,
  formatEstTimeLine,
  inEasternWeek,
  isoDateEastern,
  parseCalendarTime,
} from "@/src/lib/easternTime";

export type MarketEventImpact = "Critical" | "High" | "Medium" | "Low";
export type MarketEventStatus = "upcoming" | "released" | "cancelled" | "delayed";

export type RawCalendarEvent = {
  name: string;
  country?: string | null;
  time?: string | Date | null;
  dateOnly?: boolean;
  timeIsUtc?: boolean;
  impact?: string | number | null;
  category?: string | null;
  previous?: string | number | null;
  forecast?: string | number | null;
  actual?: string | number | null;
  status?: string | null;
  source: string;
  unit?: string | null;
};

export type MarketEvent = {
  id: string;
  name: string;
  category: string;
  dateLabel: string;
  timeLabel: string;
  timeZoneLabel: string;
  datetimeEst: string;
  occursAt: string | null;
  impact: MarketEventImpact;
  previous: string | null;
  forecast: string | null;
  actual: string | null;
  status: MarketEventStatus;
  country: string;
  source: string;
  hasClock: boolean;
};

const CRITICAL = /fomc|federal funds|interest rate decision|nonfarm|non-farm|payroll|cpi|pce price|employment situation/i;

export function isUsEvent(country?: string | null, name?: string | null) {
  const c = (country || "").trim().toLowerCase();
  if (!c) return /united states|u\.s\.|federal reserve|fomc|treasury/i.test(name || "");
  return ["us", "usa", "united states", "united states of america", "u.s.", "u.s.a", "u.s.a.", "usd", "america"].includes(c);
}

export function eventCategory(name: string, fallback?: string | null) {
  if (fallback && fallback.trim()) return fallback.trim();
  const n = name.toLowerCase();
  if (/fomc|federal funds|interest rate|federal reserve|monetary policy|powell/.test(n)) return "Monetary Policy";
  if (/cpi|ppi|pce|inflation|price index/.test(n)) return "Inflation";
  if (/payroll|employment|jobless|claims|jolts|unemployment|nonfarm|nfp/.test(n)) return "Employment";
  if (/gdp|retail sales|ism|industrial production|durable|pmi/.test(n)) return "Growth";
  if (/housing|building permit|home sales|starts/.test(n)) return "Housing";
  if (/treasury|auction|budget|deficit/.test(n)) return "Treasury / Fiscal";
  return "Economic Release";
}

export function eventImpact(raw: string | number | null | undefined, name: string): MarketEventImpact {
  const n = name.toLowerCase();
  if (CRITICAL.test(n)) return "Critical";
  if (typeof raw === "number") {
    if (raw >= 3) return "High";
    if (raw >= 2) return "Medium";
    return "Low";
  }
  const s = String(raw || "").toLowerCase();
  if (["3", "high", "red", "critical"].includes(s)) return s === "critical" ? "Critical" : "High";
  if (["2", "medium", "orange", "moderate"].includes(s)) return "Medium";
  if (["1", "low", "yellow", "green"].includes(s)) return "Low";
  if (/high|red/.test(s)) return "High";
  if (/medium|moderat/.test(s)) return "Medium";
  return /low/.test(s) ? "Low" : "Medium";
}

function displayValue(value: string | number | null | undefined, unit?: string | null) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text || text === "-" || text.toLowerCase() === "n/a" || text.toLowerCase() === "null") return null;
  if (unit && !text.includes(unit) && /^[-+]?\d/.test(text)) return `${text}${unit}`;
  return text;
}

export function eventStatus(raw: RawCalendarEvent, occursAt: Date | null, now: Date): MarketEventStatus {
  const blob = `${raw.status || ""} ${raw.name} ${raw.actual ?? ""}`.toLowerCase();
  if (/cancel/.test(blob)) return "cancelled";
  if (/delay|postpon/.test(blob)) return "delayed";
  const actual = displayValue(raw.actual, raw.unit);
  if (actual) return "released";
  if (occursAt && occursAt.getTime() <= now.getTime()) return "released";
  return "upcoming";
}

function normalizeKey(name: string, day: string) {
  return `${day}|${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()}`;
}

export function toMarketEvent(raw: RawCalendarEvent, now = new Date()): MarketEvent | null {
  if (!raw.name?.trim()) return null;
  if (!isUsEvent(raw.country, raw.name)) return null;
  const assumeUtc = raw.timeIsUtc ?? !raw.dateOnly;
  const parsed = raw.time instanceof Date ? raw.time : raw.time ? parseCalendarTime(String(raw.time), assumeUtc) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  if (!inEasternWeek(parsed, now)) return null;
  const hasClock = !raw.dateOnly;
  const dateLabel = formatEstDate(parsed);
  const timeLabel = hasClock ? formatEstTimeLine(parsed) : formatEstTimeLine(null);
  return {
    id: normalizeKey(raw.name, isoDateEastern(parsed)),
    name: raw.name.trim(),
    category: eventCategory(raw.name, raw.category),
    dateLabel,
    timeLabel,
    timeZoneLabel: EST_LABEL,
    datetimeEst: hasClock ? `${dateLabel} · ${formatEstClock(parsed)} ${EST_LABEL}` : `${dateLabel} · ${EST_LABEL}`,
    occursAt: parsed.toISOString(),
    impact: eventImpact(raw.impact, raw.name),
    previous: displayValue(raw.previous, raw.unit),
    forecast: displayValue(raw.forecast, raw.unit),
    actual: displayValue(raw.actual, raw.unit),
    status: eventStatus(raw, parsed, now),
    country: "United States",
    source: raw.source,
    hasClock,
  };
}

function completeness(event: MarketEvent) {
  return (event.hasClock ? 4 : 0) + (event.actual ? 3 : 0) + (event.forecast ? 2 : 0) + (event.previous ? 1 : 0);
}

export function mergeMarketEvents(raws: RawCalendarEvent[], now = new Date()) {
  const map = new Map<string, MarketEvent>();
  for (const raw of raws) {
    const event = toMarketEvent(raw, now);
    if (!event) continue;
    const prev = map.get(event.id);
    if (!prev || completeness(event) > completeness(prev)) map.set(event.id, event);
  }
  return [...map.values()].sort((a, b) => {
    const at = a.occursAt || "";
    const bt = b.occursAt || "";
    if (at !== bt) return at.localeCompare(bt);
    return a.name.localeCompare(b.name);
  });
}

export function weekRangeLabel(now = new Date()) {
  const { start, end } = easternWeekWindow(now);
  return `${formatEstDate(start)} – ${formatEstDate(end)}`;
}

export { formatEstDateTime, EST_LABEL };
