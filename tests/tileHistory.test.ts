import { describe, expect, it } from "vitest";
import { compareLevels } from "@/src/engines/tileHistory";

const DAY = 86_400_000;

function utc(iso: string) {
  return Date.parse(iso);
}

function daily(startIso: string, count: number, closeAt: (index: number) => number) {
  const start = utc(startIso);
  return Array.from({ length: count }, (_, index) => ({
    time: start + index * DAY,
    close: closeAt(index),
  }));
}

describe("compareLevels", () => {
  it("uses the official previous close and skips the current session bar", () => {
    const now = utc("2026-10-06T14:30:00Z");
    const points = [
      { time: utc("2025-10-06T20:00:00Z"), close: 100 },
      { time: utc("2026-09-06T20:00:00Z"), close: 110 },
      { time: utc("2026-09-29T20:00:00Z"), close: 120 },
      { time: utc("2026-10-05T20:00:00Z"), close: 130 },
      { time: utc("2026-10-06T20:00:00Z"), close: 140 },
    ];
    const history = compareLevels({
      points,
      now,
      mode: "trading",
      zone: "et",
      previousClose: 131.5,
    });
    expect(history.previousClose).toBe(131.5);
    expect(history.oneWeekAgo).toBe(120);
    expect(history.oneMonthAgo).toBe(110);
    expect(history.oneYearAgo).toBe(100);
  });

  it("reads Bitcoin from the matching calendar day, including weekends", () => {
    const now = utc("2026-10-06T18:00:00Z");
    const points = daily("2025-10-06T00:00:00Z", 366, (index) => 10_000 + index);
    const history = compareLevels({
      points,
      now,
      mode: "calendar",
      zone: "utc",
      previousClose: 10_000 + 364,
    });
    expect(history.previousClose).toBe(10_364);
    expect(history.oneWeekAgo).toBe(10_000 + 358);
    expect(history.oneMonthAgo).toBe(10_000 + 335);
    expect(history.oneYearAgo).toBe(10_000);
  });

  it("uses the prior published print for monthly CPI and leaves the weekly row empty", () => {
    const points = [
      { time: utc("2024-09-01T12:00:00Z"), close: 2.4 },
      { time: utc("2025-09-01T12:00:00Z"), close: 2.9 },
      { time: utc("2026-08-01T12:00:00Z"), close: 3.1 },
      { time: utc("2026-09-01T12:00:00Z"), close: 3.4 },
    ];
    const history = compareLevels({
      points,
      now: utc("2026-10-06T14:00:00Z"),
      mode: "monthly",
      zone: "utc",
      currentIsLatestPoint: true,
    });
    expect(history.previousClose).toBe(3.1);
    expect(history.oneWeekAgo).toBeNull();
    expect(history.oneMonthAgo).toBe(3.1);
    expect(history.oneYearAgo).toBe(2.9);
  });

  it("uses the prior completed session, not the older chart baseline", () => {
    const history = compareLevels({
      points: [
        { time: utc("2026-09-29T13:30:00Z"), close: 764.2 },
        { time: utc("2026-10-05T13:30:00Z"), close: 774.83 },
        { time: utc("2026-10-06T13:30:00Z"), close: 779.77 },
      ],
      now: utc("2026-10-06T19:00:00Z"),
      mode: "trading",
      zone: "et",
    });
    expect(history.previousClose).toBe(774.83);
    expect(history.oneWeekAgo).toBe(764.2);
  });

  it("steps back one session when today has no print", () => {
    const history = compareLevels({
      points: [
        { time: utc("2026-10-01T13:30:00Z"), close: 10 },
        { time: utc("2026-10-02T13:30:00Z"), close: 11 },
      ],
      now: utc("2026-10-03T15:00:00Z"),
      mode: "trading",
      zone: "et",
    });
    expect(history.previousClose).toBe(10);
  });

  it("does not borrow a far print when the lookback is missing", () => {
    const history = compareLevels({
      points: [{ time: utc("2026-10-05T20:00:00Z"), close: 19 }],
      now: utc("2026-10-06T14:30:00Z"),
      mode: "trading",
      zone: "et",
      previousClose: 19,
    });
    expect(history.previousClose).toBe(19);
    expect(history.oneWeekAgo).toBeNull();
    expect(history.oneMonthAgo).toBeNull();
    expect(history.oneYearAgo).toBeNull();
  });

  it("treats the latest treasury print as current and the prior business day as previous close", () => {
    const history = compareLevels({
      points: [
        { time: utc("2025-10-03T12:00:00Z"), close: 4.1 },
        { time: utc("2026-09-04T12:00:00Z"), close: 4.2 },
        { time: utc("2026-09-25T12:00:00Z"), close: 4.3 },
        { time: utc("2026-10-02T12:00:00Z"), close: 4.4 },
        { time: utc("2026-10-05T12:00:00Z"), close: 4.5 },
      ],
      mode: "trading",
      zone: "utc",
      currentIsLatestPoint: true,
    });
    expect(history.previousClose).toBe(4.4);
    expect(history.oneWeekAgo).toBe(4.3);
    expect(history.oneMonthAgo).toBe(4.2);
    expect(history.oneYearAgo).toBe(4.1);
  });
});
