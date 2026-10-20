import { getSettings } from "@/src/config/env";
import { cacheGet, cacheSet } from "@/src/lib/cache";
import { httpGetJson, httpGetText } from "@/src/lib/http";
import { isoDateEastern, easternWeekWindow, easternDateParts } from "@/src/lib/easternTime";
import type { RawCalendarEvent } from "@/src/engines/marketEvents";
import fs from "fs";
import path from "path";

type CalendarFetch = { skipped?: boolean; rows: RawCalendarEvent[] };

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function fetchFinnhubCalendar(from: Date, to: Date): Promise<CalendarFetch> {
  const settings = getSettings();
  if (!settings.finnhubApiKey) return { skipped: true, rows: [] };
  const data = await httpGetJson<{ economicCalendar?: Array<Record<string, unknown>> }>(
    `${settings.finnhubBaseUrl.replace(/\/$/, "")}/calendar/economic`,
    {
      from: ymd(from),
      to: ymd(to),
      token: settings.finnhubApiKey,
    },
  );
  const rows = data.economicCalendar || [];
  return {
    rows: rows.map((row) => ({
      name: String(row.event || row.name || ""),
      country: String(row.country || ""),
      time: row.time ? String(row.time) : null,
      impact: (row.impact as string) || null,
      previous: row.prev as string | number | null,
      forecast: (row.estimate as string | number | null) ?? (row.forecast as string | number | null),
      actual: row.actual as string | number | null,
      unit: row.unit ? String(row.unit) : null,
      source: "Finnhub",
    })),
  };
}

export async function fetchTwelveDataCalendar(from: Date, to: Date): Promise<CalendarFetch> {
  const settings = getSettings();
  if (!settings.twelveDataApiKey) return { skipped: true, rows: [] };
  const data = await httpGetJson<{
    status?: string;
    message?: string;
    data?: Array<Record<string, unknown>>;
    economic_calendar?: Array<Record<string, unknown>>;
    values?: Array<Record<string, unknown>>;
  }>(`${settings.twelveDataBaseUrl.replace(/\/$/, "")}/economic_calendar`, {
    country: "United States",
    start_date: ymd(from),
    end_date: ymd(to),
    apikey: settings.twelveDataApiKey,
  });
  if (data.status === "error") throw new Error(data.message || "Twelve Data calendar error");
  const rows = data.data || data.economic_calendar || data.values || [];
  return {
    rows: rows.map((row) => ({
      name: String(row.event || row.title || row.name || ""),
      country: String(row.country || "United States"),
      time: row.datetime ? String(row.datetime) : row.date ? String(row.date) : null,
      impact: (row.importance as string) || (row.impact as string) || null,
      previous: (row.previous as string | number | null) ?? null,
      forecast: (row.forecast as string | number | null) ?? (row.consensus as string | number | null) ?? null,
      actual: (row.actual as string | number | null) ?? null,
      source: "Twelve Data",
    })),
  };
}

const FRED_WATCH =
  /cpi|employment situation|payroll|gdp|fomc|federal funds|pce|ppi|retail sales|jobless|initial claims|ism|jolts|consumer sentiment|housing starts|durable goods|industrial production|personal income|bea|treasury/i;

export async function fetchFredReleaseDates(from: Date, to: Date): Promise<CalendarFetch> {
  const settings = getSettings();
  if (!settings.fredApiKey) return { skipped: true, rows: [] };
  const data = await httpGetJson<{ release_dates?: Array<{ release_id?: number; release_name?: string; date?: string }> }>(
    "https://api.stlouisfed.org/fred/releases/dates",
    {
      api_key: settings.fredApiKey,
      file_type: "json",
      realtime_start: isoDateEastern(from),
      realtime_end: isoDateEastern(to),
      include_release_dates_with_no_data: "true",
    },
  );
  return {
    rows: (data.release_dates || [])
      .filter((row) => row.release_name && row.date && FRED_WATCH.test(row.release_name))
      .map((row) => ({
        name: String(row.release_name),
        country: "US",
        time: row.date,
        dateOnly: true,
        impact: /fomc|cpi|employment|payroll|gdp|pce/i.test(row.release_name || "") ? "high" : "medium",
        source: "FRED",
      })),
  };
}

type FedMeeting = {
  d?: string;
  date?: string;
  t?: number;
  m?: string;
  title?: string;
  description?: string;
  time?: string;
  month?: string;
  days?: string;
  type?: string;
};

function lastCalendarDay(days?: string) {
  const parts = String(days || "")
    .split(/[-–]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || "";
}

function mapFedEvent(row: FedMeeting): RawCalendarEvent | null {
  const title = String(row.title || row.m || "").trim();
  const type = String(row.type || "");
  const blob = `${title} ${type} ${row.description || ""}`;
  if (!/fomc|beige/i.test(blob) && row.t !== 0 && row.t !== 1) return null;

  const compact = String(row.d || row.date || "").replace(/-/g, "");
  if (/^\d{8}$/.test(compact)) {
    const y = compact.slice(0, 4);
    const m = compact.slice(4, 6);
    const d = compact.slice(6, 8);
    return {
      name: /fomc|beige/i.test(title) ? title || "FOMC meeting" : title || `FOMC ${type || "meeting"}`,
      country: "US",
      time: `${y}-${m}-${d}`,
      dateOnly: true,
      timeIsUtc: false,
      impact: /fomc/i.test(blob) ? "critical" : "high",
      category: /beige/i.test(blob) ? "Economic Release" : "Monetary Policy",
      source: "Federal Reserve",
    };
  }

  const day = lastCalendarDay(row.days);
  const [year, month] = String(row.month || "").split("-");
  if (!year || !month || !/^\d{1,2}$/.test(day)) return null;
  const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const clock = String(row.time || "").trim();
  const dateOnly = !clock || /tbd|tentative|all day/i.test(clock);
  return {
    name: title || ( /beige/i.test(blob) ? "Beige Book" : "FOMC meeting"),
    country: "US",
    time: dateOnly ? isoDate : `${isoDate} ${clock}`,
    dateOnly,
    timeIsUtc: false,
    impact: /fomc/i.test(blob) ? "critical" : "high",
    category: /beige/i.test(blob) ? "Economic Release" : "Monetary Policy",
    source: "Federal Reserve",
  };
}

export async function fetchFedFomcCalendar(): Promise<CalendarFetch> {
  const settings = getSettings();
  const urls = [
    "https://www.federalreserve.gov/json/calendar.json",
    "https://www.federalreserve.gov/json/ne-meetings.json",
  ];
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const data = await httpGetJson<FedMeeting[] | { meetings?: FedMeeting[]; events?: FedMeeting[] }>(
        url,
        undefined,
        { "User-Agent": settings.secUserAgent || "Voxel Trading research@localhost" },
      );
      const rows = Array.isArray(data) ? data : data.meetings || data.events || [];
      const out = rows.map(mapFedEvent).filter((row): row is RawCalendarEvent => Boolean(row));
      if (out.length) return { rows: out };
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(failures.join("; ") || "Federal Reserve calendar unavailable");
}

const DEFAULT_WEEK_CALENDAR = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const DEFAULT_WEEK_CALENDAR_XML = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";

function xmlTag(block: string, tag: string) {
  const open = block.match(new RegExp(`<${tag}\\b[^>]*>`, "i"));
  if (!open) return "";
  if (/\/>$/.test(open[0])) return "";
  const rest = block.slice(block.indexOf(open[0]) + open[0].length);
  const end = rest.toLowerCase().indexOf(`</${tag.toLowerCase()}>`);
  const inner = end >= 0 ? rest.slice(0, end) : rest;
  return inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

export function parseForexFactoryXml(xml: string): RawCalendarEvent[] {
  return (xml.match(/<event\b[\s\S]*?<\/event>/gi) || []).flatMap((block) => {
    const name = xmlTag(block, "title");
    if (!name) return [];
    const date = xmlTag(block, "date");
    const clock = xmlTag(block, "time");
    const dateOnly = !clock || /all day|tentative|tbd/i.test(clock);
    return [
      {
        name,
        country: xmlTag(block, "country"),
        time: dateOnly ? date || null : `${date} ${clock}`,
        dateOnly,
        timeIsUtc: !dateOnly,
        impact: xmlTag(block, "impact") || null,
        previous: xmlTag(block, "previous") || null,
        forecast: xmlTag(block, "forecast") || null,
        actual: xmlTag(block, "actual") || null,
        source: "Live economic calendar",
      },
    ];
  });
}

function publicClock(date: string | null, time: string | null) {
  if (!date) return time;
  if (!time || date.includes(time) || /T\d{2}:\d{2}/.test(date) || /all day|tentative|tbd/i.test(time)) return date;
  return `${date} ${time}`;
}

function mapPublicRow(row: Record<string, unknown>): RawCalendarEvent {
  const date = row.date ? String(row.date) : row.datetime ? String(row.datetime) : null;
  const time = row.time ? String(row.time) : null;
  const combined = publicClock(date, time);
  const dateOnly = !combined || !/\d{1,2}:\d{2}/.test(combined);
  return {
    name: String(row.title || row.event || row.name || ""),
    country: String(row.country || row.currency || ""),
    time: combined,
    dateOnly,
    timeIsUtc: !dateOnly,
    impact: (row.impact as string) || null,
    previous: (row.previous as string | number | null) ?? null,
    forecast: (row.forecast as string | number | null) ?? null,
    actual: (row.actual as string | number | null) ?? null,
    source: "Live economic calendar",
  };
}

const PUBLIC_CACHE_TTL = 1_800;
const PUBLIC_DISK = path.join(process.cwd(), "data", "economic-calendar-week.json");
const NEXT_WEEK_JSON = "https://nfs.faireconomy.media/ff_calendar_nextweek.json";
const NEXT_WEEK_XML = "https://nfs.faireconomy.media/ff_calendar_nextweek.xml";
const FF_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

function inTest() {
  return Boolean(process.env.VITEST);
}

function weekStartKey(weekRef = new Date()) {
  return isoDateEastern(easternWeekWindow(weekRef).start);
}

function publicCacheKey(weekStart: string) {
  return `econ-cal:public-week:v2:${weekStart}`;
}

export function forexFactoryWeekSlug(weekRef = new Date()) {
  const p = easternDateParts(easternWeekWindow(weekRef).start);
  return `${FF_MONTHS[p.month - 1]}${p.day}.${p.year}`;
}

function extractJsonArray(html: string, start: number) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

type FfEmbeddedEvent = {
  name?: string;
  soloTitle?: string;
  country?: string;
  currency?: string;
  dateline?: number;
  timeLabel?: string;
  timeMasked?: boolean;
  impactName?: string;
  actual?: string;
  previous?: string;
  forecast?: string;
};

export function parseForexFactoryCalendarHtml(html: string): RawCalendarEvent[] {
  const marker = html.indexOf("days: [");
  if (marker < 0) return [];
  const start = html.indexOf("[", marker);
  const raw = extractJsonArray(html, start);
  if (!raw) return [];
  const days = JSON.parse(raw) as Array<{ events?: FfEmbeddedEvent[] }>;
  return days.flatMap((day) =>
    (day.events || []).flatMap((event) => {
      const name = String(event.name || event.soloTitle || "").trim();
      if (!name) return [];
      const when = event.dateline != null ? new Date(Number(event.dateline) * 1000) : null;
      if (!when || Number.isNaN(when.getTime())) return [];
      const dateOnly = Boolean(event.timeMasked) || /all day|tentative|tbd/i.test(String(event.timeLabel || ""));
      return [
        {
          name,
          country: event.country || event.currency || "",
          time: when.toISOString(),
          dateOnly,
          timeIsUtc: true,
          impact: event.impactName || null,
          previous: event.previous || null,
          forecast: event.forecast || null,
          actual: event.actual || null,
          source: "Live economic calendar",
        } satisfies RawCalendarEvent,
      ];
    }),
  );
}

function readPublicDisk(weekStart: string): RawCalendarEvent[] | null {
  if (inTest()) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(PUBLIC_DISK, "utf8")) as { weekStart?: string; rows?: RawCalendarEvent[] };
    if (parsed.weekStart !== weekStart) return null;
    if (!Array.isArray(parsed.rows) || !parsed.rows.length) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

function writePublicDisk(rows: RawCalendarEvent[], weekStart: string) {
  if (inTest()) return;
  try {
    fs.mkdirSync(path.dirname(PUBLIC_DISK), { recursive: true });
    fs.writeFileSync(PUBLIC_DISK, JSON.stringify({ weekStart, rows }));
  } catch {
    /* dest filesystem may be read-only */
  }
}

function xmlFallbackUrls(jsonUrl: string) {
  const fromJson = jsonUrl.replace(/\.json(\?.*)?$/i, ".xml$1");
  const preferXml = /\.xml(\?.*)?$/i.test(jsonUrl) ? [jsonUrl] : [];
  return [...new Set([...preferXml, fromJson, DEFAULT_WEEK_CALENDAR_XML].filter(Boolean))];
}

function rememberPublicRows(rows: RawCalendarEvent[], weekStart: string) {
  cacheSet(publicCacheKey(weekStart), { rows }, PUBLIC_CACHE_TTL);
  writePublicDisk(rows, weekStart);
  return { rows };
}

async function fetchCurrentWeekExport(headers: Record<string, string>, failures: string[]): Promise<RawCalendarEvent[]> {
  const settings = getSettings();
  const jsonUrl = settings.economicCalendarUrl || DEFAULT_WEEK_CALENDAR;
  for (const url of xmlFallbackUrls(jsonUrl)) {
    try {
      const xml = await httpGetText(url, undefined, { ...headers, Accept: "application/xml, text/xml, */*" });
      const rows = parseForexFactoryXml(xml);
      if (rows.length) return rows;
      failures.push(`${url} returned no calendar rows`);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  try {
    const data = await httpGetJson<Array<Record<string, unknown>> | { events?: Array<Record<string, unknown>> }>(
      jsonUrl,
      undefined,
      headers,
    );
    const rows = Array.isArray(data) ? data : data.events;
    if (!Array.isArray(rows)) throw new Error("Public economic calendar returned an unexpected payload");
    if (rows.length) return rows.map(mapPublicRow);
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
  }
  return [];
}

async function fetchDatedWeekCalendar(weekRef: Date, headers: Record<string, string>, failures: string[]): Promise<RawCalendarEvent[]> {
  const slug = forexFactoryWeekSlug(weekRef);
  const urls = [`https://www.forexfactory.com/calendar?week=${slug}`, NEXT_WEEK_JSON, NEXT_WEEK_XML];
  for (const url of urls) {
    try {
      if (url.endsWith(".xml")) {
        const xml = await httpGetText(url, undefined, { ...headers, Accept: "application/xml, text/xml, */*" });
        const rows = parseForexFactoryXml(xml);
        if (rows.length) return rows;
        failures.push(`${url} returned no calendar rows`);
        continue;
      }
      if (url.endsWith(".json")) {
        const data = await httpGetJson<Array<Record<string, unknown>> | { events?: Array<Record<string, unknown>> }>(url, undefined, headers);
        const rows = Array.isArray(data) ? data : data.events;
        if (Array.isArray(rows) && rows.length) return rows.map(mapPublicRow);
        failures.push(`${url} returned no calendar rows`);
        continue;
      }
      const html = await httpGetText(url, undefined, { ...headers, Accept: "text/html, */*" });
      const rows = parseForexFactoryCalendarHtml(html);
      if (rows.length) return rows;
      failures.push(`${url} returned no calendar rows`);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  return [];
}

export async function fetchPublicWeekCalendar(weekRef = new Date()): Promise<CalendarFetch> {
  const weekStart = weekStartKey(weekRef);
  const liveStart = weekStartKey();
  const cached = cacheGet<{ rows: RawCalendarEvent[] }>(publicCacheKey(weekStart));
  if (cached?.rows?.length) return { rows: cached.rows };

  const settings = getSettings();
  const headers = { "User-Agent": settings.secUserAgent || "Mozilla/5.0 Voxel Trading calendar" };
  const failures: string[] = [];
  const rows =
    weekStart === liveStart
      ? await fetchCurrentWeekExport(headers, failures)
      : await fetchDatedWeekCalendar(weekRef, headers, failures);
  if (rows.length) return rememberPublicRows(rows, weekStart);

  if (weekStart === liveStart) {
    const disk = readPublicDisk(weekStart);
    if (disk?.length) return rememberPublicRows(disk, weekStart);
  }
  throw new Error(failures.join("; ") || "Public economic calendar unavailable");
}

export async function collectRawCalendarEvents(weekRef = new Date()): Promise<{ rows: RawCalendarEvent[]; sources: string[]; errors: string[] }> {
  const { start, end } = easternWeekWindow(weekRef);
  const from = new Date(start.getTime() - 86_400_000);
  const to = new Date(end.getTime() + 86_400_000);
  const jobs: Array<[string, Promise<CalendarFetch>]> = [
    ["Live economic calendar", fetchPublicWeekCalendar(weekRef)],
    ["Finnhub", fetchFinnhubCalendar(from, to)],
    ["Twelve Data", fetchTwelveDataCalendar(from, to)],
    ["FRED", fetchFredReleaseDates(from, to)],
    ["Federal Reserve", fetchFedFomcCalendar()],
  ];
  const rows: RawCalendarEvent[] = [];
  const sources: string[] = [];
  const errors: string[] = [];
  const settled = await Promise.allSettled(jobs.map(([, p]) => p));
  settled.forEach((result, i) => {
    const name = jobs[i][0];
    if (result.status === "fulfilled") {
      if (result.value.skipped) return;
      rows.push(...result.value.rows);
      sources.push(name);
    } else {
      errors.push(`${name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  });
  return { rows, sources, errors };
}
