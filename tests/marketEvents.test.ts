import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventImpact, mergeMarketEvents, toMarketEvent } from "@/src/engines/marketEvents";
import { EST_LABEL, formatEstDateTime, formatEstTimeLine, inEasternWeek, instantFromEastern } from "@/src/lib/easternTime";
import { cacheClear } from "@/src/lib/cache";
import { resetSettings } from "@/src/config/env";
import { buildMarketEvents } from "@/src/services/marketEvents";
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

describe("market events service", () => {
  beforeEach(() => {
    cacheClear();
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
