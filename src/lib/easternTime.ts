export const EASTERN_ZONE = "America/New_York";
export const EST_LABEL = "EST (Eastern Standard Time)";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function part(date: Date, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: EASTERN_ZONE, ...opts }).format(date);
}

function numericParts(date: Date) {
  const bits = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => bits.find((p) => p.type === type)?.value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAYS.indexOf(get("weekday") as (typeof WEEKDAYS)[number]),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/** Instant that displays as the given civil time in America/New_York. */
export function instantFromEastern(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  for (const offsetHours of [4, 5, 3, 6]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute, second));
    const p = numericParts(candidate);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute && p.second === second) {
      return candidate;
    }
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 4, minute, second));
}

export function easternWeekWindow(now = new Date()) {
  const p = numericParts(now);
  const sunday = new Date(instantFromEastern(p.year, p.month, p.day).getTime() - p.weekday * 86_400_000);
  const startParts = numericParts(sunday);
  const start = instantFromEastern(startParts.year, startParts.month, startParts.day, 0, 0, 0);
  const end = new Date(start.getTime() + 7 * 86_400_000 - 1);
  return { start, end };
}

export function inEasternWeek(date: Date, now = new Date()) {
  const { start, end } = easternWeekWindow(now);
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export function formatEstDate(date: Date) {
  return part(date, { month: "long", day: "numeric", year: "numeric" });
}

export function formatEstClock(date: Date) {
  return part(date, { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatEstDateTime(date: Date) {
  return `${formatEstDate(date)}, ${formatEstClock(date)} ${EST_LABEL}`;
}

export function formatEstTimeLine(date: Date | null) {
  if (!date) return `Time not released ${EST_LABEL}`;
  return `${formatEstClock(date)} ${EST_LABEL}`;
}

export function isoDateEastern(date: Date) {
  const p = numericParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function hourWithMeridiem(hour: number, mer?: string | null) {
  const ap = (mer || "").toLowerCase().replace(/[.\s]/g, "");
  if (ap === "pm" && hour < 12) return hour + 12;
  if (ap === "am" && hour === 12) return 0;
  return hour;
}

function fromParts(
  year: number,
  month: number,
  day: number,
  hour: number | null,
  minute: number,
  second: number,
  assumeUtc: boolean,
) {
  if (hour == null) return instantFromEastern(year, month, day, 0, 0, 0);
  if (assumeUtc) return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return instantFromEastern(year, month, day, hour, minute, second);
}

export function parseCalendarTime(raw: string, assumeUtc = true): Date | null {
  const text = raw.trim();
  if (!text) return null;
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?/i,
  );
  if (iso) {
    const hour = iso[4] != null ? hourWithMeridiem(Number(iso[4]), iso[7]) : null;
    return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]), hour, Number(iso[5] || 0), Number(iso[6] || 0), assumeUtc);
  }
  const us = text.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?/i,
  );
  if (us) {
    const hour = us[4] != null ? hourWithMeridiem(Number(us[4]), us[7]) : null;
    return fromParts(Number(us[3]), Number(us[1]), Number(us[2]), hour, Number(us[5] || 0), Number(us[6] || 0), assumeUtc);
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}
