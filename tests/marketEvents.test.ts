import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventImpact, filterUpcomingThisWeek, mergeMarketEvents, sortMarketEvents, toMarketEvent, weekRangeLabel } from "@/src/engines/marketEvents";
import { EST_LABEL, formatEstDateTime, formatEstTimeLine, inEasternWeek, instantFromEastern, isFridayAfternoonEastern, nextEasternWeekAnchor } from "@/src/lib/easternTime";
import { cacheClear } from "@/src/lib/cache";
import { resetSettings } from "@/src/config/env";
import { forexFactoryWeekSlug, parseForexFactoryCalendarHtml } from "@/src/providers/economicCalendar";
import { buildMarketEvents, prepareNextWeekMarketEvents, resetMarketEventsRuntime, shouldPrepareNextWeek } from "@/src/services/marketEvents";
import { dispatchV1 } from "@/src/server/apiRouter";

const NOW = new Date("2026-09-14T14:05:00.000Z");

describe("eastern time labels", () => {
  it("formats civil time in America/New_York with an explicit EST label", () => {
    const stamp = formatEstDateTime(NOW);
    expect(stamp).toMatch(/September 14, 2026, 10:05\sAM EST \(Eastern Standard Time\)/);
    expect(stamp).toContain(EST_LABEL);
    expect(stamp.includes(" ET")).toBe(false);
    expect(formatEstTimeLine(new Date("2026-09-16T17:00:00.000Z"))).toMatch(/1:00\sPM EST \(Eastern Standard Time\)/);
  });

  it("keeps September 16, 2026 inside the Eastern week of September 14", () => {
    expect(inEasternWeek(new Date("2026-09-16T17:00:00.000Z"), NOW)).toBe(true);
    expect(inEasternWeek(new Date("2026-09-10T17:00:00.000Z"), NOW)).toBe(false);
    expect(inEasternWeek(instantFromEastern(2026, 9, 21), NOW)).toBe(false);
  });
});

describe("market event mapping", () => {
  it("maps live calendar rows without hardcoded event dates", () => {
    const event = toMarketEvent(
      {
        name: "FOMC Interest Rate Decision",
        country: "US",
        time: "2026-09-16 17:00:00",
        impact: "high",
        previous: "4.50",
        forecast: "4.25",
        actual: null,
        unit: "%",
        source: "Finnhub",
      },
      NOW,
    );
    expect(event).toBeTruthy();
    expect(event!.dateLabel).toBe("September 16, 2026");
    expect(event!.timeLabel).toBe("1:00 PM EST (Eastern Standard Time)");
    expect(event!.impact).toBe("Critical");
    expect(event!.category).toBe("Monetary Policy");
    expect(event!.status).toBe("upcoming");
    expect(event!.forecast).toBe("4.25%");
    expect(event!.previous).toBe("4.50%");
    expect(event!.actual).toBeNull();
  });

  it("marks a print as released when the actual arrives and drops events outside this week", () => {
    const rows = mergeMarketEvents(
      [
        {
          name: "CPI",
          country: "US",
          time: "2026-09-15T12:30:00Z",
          actual: "0.3%",
          forecast: "0.2%",
          previous: "0.2%",
          impact: "high",
          source: "Finnhub",
        },
        {
          name: "Old CPI",
          country: "US",
          time: "2026-09-08T12:30:00Z",
          impact: "high",
          source: "Finnhub",
        },
        {
          name: "Cancelled auction",
          country: "US",
          time: "2026-09-17T14:00:00Z",
          status: "cancelled",
          source: "FRED",
        },
      ],
      NOW,
    );
    expect(rows.map((r) => r.name)).toEqual(["CPI", "Cancelled auction"]);
    expect(rows[0].status).toBe("released");
    expect(rows[1].status).toBe("cancelled");
  });

  it("treats FOMC as critical even when the vendor impact is medium", () => {
    expect(eventImpact("medium", "FOMC Interest Rate Decision")).toBe("Critical");
  });

  it("converts a live ISO timestamp with offset into EST clock labels", () => {
    const event = toMarketEvent(
      {
        name: "FOMC Statement",
        country: "USD",
        time: "2026-09-16T14:00:00-04:00",
        impact: "High",
        forecast: "4.00%",
        previous: "3.75%",
        source: "Live economic calendar",
      },
      NOW,
    );
    expect(event?.dateLabel).toBe("September 16, 2026");
    expect(event?.timeLabel).toMatch(/2:00\sPM EST \(Eastern Standard Time\)/);
    expect(event?.forecast).toBe("4.00%");
  });

  it("maps a Forex Factory GMT clock onto EST (Eastern Standard Time)", () => {
    const event = toMarketEvent(
      {
        name: "FOMC Statement",
        country: "USD",
        time: "09-16-2026 6:00pm",
        timeIsUtc: true,
        impact: "High",
        forecast: "4.00%",
        previous: "3.75%",
        source: "Live economic calendar",
      },
      NOW,
    );
    expect(event?.dateLabel).toBe("September 16, 2026");
    expect(event?.timeLabel).toMatch(/2:00\sPM EST \(Eastern Standard Time\)/);
  });

  it("keeps Federal Reserve civil clocks in Eastern time", () => {
    const event = toMarketEvent(
      {
        name: "FOMC Meeting",
        country: "US",
        time: "2026-09-16 2:00 p.m.",
        timeIsUtc: false,
        impact: "critical",
        source: "Federal Reserve",
      },
      NOW,
    );
    expect(event?.dateLabel).toBe("September 16, 2026");
    expect(event?.timeLabel).toMatch(/2:00\sPM EST \(Eastern Standard Time\)/);
  });
});

describe("upcoming this-week filter", () => {
  const row = (name: string, time: string, extra: Record<string, unknown> = {}) => ({
    name,
    country: "US",
    time,
    impact: "high",
    source: "test",
    ...extra,
  });

  it("keeps tomorrow and later this week, drops yesterday, past week, next week, and released prints", () => {
    const merged = mergeMarketEvents(
      [
        row("Yesterday CPI", "2026-09-13T12:30:00Z"),
        row("Past-week CPI", "2026-09-08T12:30:00Z"),
        row("Tomorrow CPI", "2026-09-15T12:30:00Z"),
        row("Friday FOMC", "2026-09-18T18:00:00Z"),
        row("Next-week CPI", "2026-09-21T12:30:00Z"),
        row("Released CPI", "2026-09-15T12:30:00Z", { actual: "0.3%" }),
      ],
      NOW,
    );
    const upcoming = filterUpcomingThisWeek(merged, NOW);
    expect(upcoming.map((e) => e.name)).toEqual(["Tomorrow CPI", "Friday FOMC"]);
  });

  it("expires an event after it occurs and sorts remaining rows earliest first", () => {
    const afterNoon = new Date("2026-09-14T17:00:00.000Z");
    const merged = mergeMarketEvents(
      [
        row("Later CPI", "2026-09-16T17:00:00Z"),
        row("Morning print", "2026-09-14T12:30:00Z"),
        row("Midweek", "2026-09-16T12:00:00Z"),
      ],
      afterNoon,
    );
    const upcoming = filterUpcomingThisWeek(merged, afterNoon);
    expect(upcoming.map((e) => e.name)).toEqual(["Later CPI", "Midweek"]);
    expect(upcoming[0].impact).toBe("Critical");
    expect(upcoming[1].impact).toBe("High");
  });

  it("converts UTC, Eastern, and Central stamps into the same Eastern week window", () => {
    const utc = toMarketEvent(row("UTC CPI", "2026-09-16T17:00:00Z"), NOW);
    const et = toMarketEvent({ ...row("ET CPI", "2026-09-16 1:00 p.m."), timeIsUtc: false }, NOW);
    const ct = toMarketEvent(row("CT CPI", "2026-09-16T12:00:00-05:00"), NOW);
    expect(utc && et && ct).toBeTruthy();
    expect(filterUpcomingThisWeek([utc!, et!, ct!], NOW)).toHaveLength(3);
  });

  it("handles the spring DST week without leaking the previous or next week", () => {
    const dstNow = instantFromEastern(2026, 3, 10, 10, 0, 0);
    const prev = toMarketEvent(row("Pre-DST", "2026-03-07T15:00:00Z"), dstNow);
    const inside = toMarketEvent({ ...row("DST week", "2026-03-11 10:00"), timeIsUtc: false }, dstNow);
    const next = toMarketEvent(row("After DST week", "2026-03-16T14:00:00Z"), dstNow);
    expect(prev).toBeNull();
    expect(inside).toBeTruthy();
    expect(next).toBeNull();
    expect(filterUpcomingThisWeek([inside!], dstNow).map((e) => e.name)).toEqual(["DST week"]);
  });

  it("uses Sunday–Saturday Eastern civil boundaries, including the November DST weekend", () => {
    const monday = NOW;
    expect(toMarketEvent({ ...row("Week open", "2026-09-13 00:00"), timeIsUtc: false }, monday)).toBeTruthy();
    expect(toMarketEvent({ ...row("Week close", "2026-09-19 23:59"), timeIsUtc: false }, monday)).toBeTruthy();
    expect(toMarketEvent({ ...row("Next week", "2026-09-20 00:00"), timeIsUtc: false }, monday)).toBeNull();

    const fallNow = instantFromEastern(2026, 11, 1, 10, 0, 0);
    expect(toMarketEvent(row("Saturday before", "2026-10-31T15:00:00Z"), fallNow)).toBeNull();
    expect(toMarketEvent({ ...row("Sunday open", "2026-11-01 9:00"), timeIsUtc: false }, fallNow)).toBeTruthy();
    expect(toMarketEvent(row("Next Sunday", "2026-11-08T15:00:00Z"), fallNow)).toBeNull();
  });

  it("keeps a date-only event visible until the end of its Eastern day", () => {
    const noon = new Date("2026-09-16T16:00:00.000Z");
    const event = toMarketEvent(
      {
        name: "Jackson Hole (date only)",
        country: "US",
        time: "2026-09-16",
        dateOnly: true,
        timeIsUtc: false,
        source: "test",
      },
      noon,
    );
    expect(event?.status).toBe("upcoming");
    expect(filterUpcomingThisWeek([event!], noon)).toHaveLength(1);
    const nextMorning = new Date("2026-09-17T12:00:00.000Z");
    expect(filterUpcomingThisWeek([event!], nextMorning)).toHaveLength(0);
  });
});

describe("market event priority sort", () => {
  it("orders Critical, High, Medium, Low and only then earliest time", () => {
    const now = NOW;
    const events = sortMarketEvents(
      [
        toMarketEvent({ name: "Housing Starts", country: "US", time: "2026-09-14T14:00:00Z", impact: "low", source: "test" }, now)!,
        toMarketEvent({ name: "ISM Manufacturing", country: "US", time: "2026-09-15T14:00:00Z", impact: "medium", source: "test" }, now)!,
        toMarketEvent({ name: "Retail Sales", country: "US", time: "2026-09-16T14:00:00Z", impact: "high", source: "test" }, now)!,
        toMarketEvent({ name: "FOMC Statement", country: "US", time: "2026-09-18T18:00:00Z", impact: "low", source: "test" }, now)!,
        toMarketEvent({ name: "Early High Print", country: "US", time: "2026-09-14T15:00:00Z", impact: "high", source: "test" }, now)!,
      ].filter(Boolean),
    );
    expect(events.map((e) => e.name)).toEqual(["FOMC Statement", "Early High Print", "Retail Sales", "ISM Manufacturing", "Housing Starts"]);
  });
});

describe("Friday next-week preparation window", () => {
  it("treats Friday 3:00 PM Eastern as Friday afternoon and points at the next Sunday week", () => {
    const friday = instantFromEastern(2026, 9, 18, 15, 0, 0);
    expect(isFridayAfternoonEastern(friday)).toBe(true);
    expect(shouldPrepareNextWeek(friday)).toBe(true);
    expect(shouldPrepareNextWeek(NOW)).toBe(false);
    const next = nextEasternWeekAnchor(friday);
    expect(weekRangeLabel(next)).toMatch(/September 20, 2026/);
  });
});

describe("market events service", () => {
  beforeEach(() => {
    cacheClear();
    resetMarketEventsRuntime();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.FINNHUB_API_KEY = "test-token";
    resetSettings();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.FINNHUB_API_KEY;
    resetSettings();
    cacheClear();
    resetMarketEventsRuntime();
  });

  it("synchronizes from the calendar API and never invents a missing print", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/calendar/economic")) {
        expect(url.searchParams.get("token")).toBe("test-token");
        return Response.json({
          economicCalendar: [
            {
              event: "FOMC Interest Rate Decision",
              country: "US",
              time: "2026-09-16 17:00:00",
              impact: "high",
              prev: 4.5,
              estimate: 4.25,
              actual: null,
              unit: "%",
            },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    });
    const body = await buildMarketEvents(NOW);
    expect(body.data_status).toBe("LIVE");
    expect(body.last_updated_est).toContain("EST (Eastern Standard Time)");
    expect(body.events).toHaveLength(1);
    expect(body.events[0].name).toBe("FOMC Interest Rate Decision");
    expect(body.events[0].dateLabel).toBe("September 16, 2026");
    expect(body.events[0].timeLabel).toContain("EST (Eastern Standard Time)");
    expect(body.events[0].actual).toBeNull();
    expect(body.source).toContain("Finnhub");
  });

  it("stays unavailable instead of fabricating events when every calendar source fails", async () => {
    delete process.env.FINNHUB_API_KEY;
    resetSettings();
    vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));
    const body = await buildMarketEvents(NOW);
    expect(body.data_status).toBe("UNAVAILABLE");
    expect(body.events).toEqual([]);
  });

  it("falls back to the XML week calendar when the JSON feed is rate-limited", async () => {
    delete process.env.FINNHUB_API_KEY;
    resetSettings();
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith(".json") && url.hostname.includes("faireconomy")) {
        return new Response("Rate Limited", { status: 429 });
      }
      if (url.pathname.endsWith(".xml")) {
        return new Response(
          `<?xml version="1.0"?><weeklyevents><event><title>FOMC Statement</title><country>USD</country><date><![CDATA[09-16-2026]]></date><time><![CDATA[6:00pm]]></time><impact><![CDATA[High]]></impact><forecast><![CDATA[4.00%]]></forecast><previous><![CDATA[3.75%]]></previous></event></weeklyevents>`,
          { headers: { "content-type": "text/xml" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    const body = await buildMarketEvents(NOW);
    expect(body.data_status).toBe("LIVE");
    expect(body.events[0]?.name).toBe("FOMC Statement");
    expect(body.events[0]?.dateLabel).toBe("September 16, 2026");
    expect(body.events[0]?.timeLabel).toMatch(/2:00\sPM EST \(Eastern Standard Time\)/);
    expect(body.source).toContain("Live economic calendar");
  });

  it("re-filters cached events so expired rows cannot bypass the week window", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/calendar/economic")) {
        return Response.json({
          economicCalendar: [
            {
              event: "FOMC Interest Rate Decision",
              country: "US",
              time: "2026-09-14 16:00:00",
              impact: "high",
              prev: 4.5,
              estimate: 4.25,
              actual: null,
              unit: "%",
            },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    });
    const live = await buildMarketEvents(new Date("2026-09-14T14:05:00.000Z"));
    expect(live.events.map((e) => e.name)).toEqual(["FOMC Interest Rate Decision"]);
    const later = await buildMarketEvents(new Date("2026-09-14T21:05:00.000Z"));
    expect(later.events).toEqual([]);
  });

  it("prepares next week's calendar on Friday afternoon and does not replace a valid snapshot with a failed fetch", async () => {
    const friday = instantFromEastern(2026, 9, 18, 15, 0, 0);
    vi.setSystemTime(friday);
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/calendar/economic")) {
        return Response.json({
          economicCalendar: [
            {
              event: "Retail Sales",
              country: "US",
              time: "2026-09-22 14:00:00",
              impact: "high",
              actual: null,
            },
            {
              event: "FOMC Statement",
              country: "US",
              time: "2026-09-23 18:00:00",
              impact: "low",
              actual: null,
            },
          ],
        });
      }
      return new Response("not found", { status: 404 });
    });
    const prepared = await prepareNextWeekMarketEvents(friday);
    expect(prepared?.weekStart).toBe("2026-09-20");
    expect(prepared?.payload.events.map((e) => e.name)).toEqual(["FOMC Statement", "Retail Sales"]);
    expect(prepared?.payload.week_label).toMatch(/September 20, 2026/);

    vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));
    const retry = await prepareNextWeekMarketEvents(friday);
    expect(retry?.weekStart).toBe("2026-09-20");
    expect(retry?.payload.events.map((e) => e.name)).toEqual(["FOMC Statement", "Retail Sales"]);

    const served = await buildMarketEvents(friday);
    expect(served.week_label).toMatch(/September 20, 2026/);
    expect(served.events.map((e) => e.name)).toEqual(["FOMC Statement", "Retail Sales"]);
    expect(served.events.every((event) => event.occursAt && event.occursAt >= "2026-09-20")).toBe(true);
  });

  it("parses a dated Forex Factory week page so Friday can load next week's US prints", () => {
    const friday = instantFromEastern(2026, 10, 2, 15, 0, 0);
    expect(forexFactoryWeekSlug(nextEasternWeekAnchor(friday))).toBe("oct4.2026");
    const html = `days: [{"date":"Wed <span>Oct 7</span>","events":[{"name":"FOMC Meeting Minutes","country":"US","currency":"USD","dateline":${Math.floor(Date.parse("2026-10-07T18:00:00.000Z") / 1000)},"timeLabel":"2:00pm","timeMasked":false,"impactName":"high","actual":"","previous":"","forecast":""},{"name":"Spanish Services PMI","country":"EUR","currency":"EUR","dateline":${Math.floor(Date.parse("2026-10-05T07:15:00.000Z") / 1000)},"timeLabel":"3:15am","impactName":"low"}]}]`;
    const rows = parseForexFactoryCalendarHtml(html);
    expect(rows.map((row) => row.name)).toEqual(["FOMC Meeting Minutes", "Spanish Services PMI"]);
    const merged = mergeMarketEvents(rows, friday, nextEasternWeekAnchor(friday));
    expect(merged.map((event) => event.name)).toEqual(["FOMC Meeting Minutes"]);
  });

  it("exposes the events route separately from pulse movers", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.includes("/calendar/economic")) {
        return Response.json({ economicCalendar: [] });
      }
      return new Response("not found", { status: 404 });
    });
    const res = await dispatchV1(new Request("http://localhost/api/v1/market/events"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.last_updated_est).toContain("EST (Eastern Standard Time)");
    expect(json.data.events).toEqual([]);
  });
});
