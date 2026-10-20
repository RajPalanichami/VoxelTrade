import { describe, expect, it } from "vitest";
import { emptyIndicators } from "@/src/types/domain";
import {
  applyHardOverrides,
  classifyBreakoutStatus,
  classifyMaAlignment,
  classifyMacd,
  classifyRsi,
  classifyRvol,
  classifyVolumePrice,
  labelFromScore,
  toneFromLabel,
} from "@/src/engines/stockDecisionScore";

describe("score bands", () => {
  it("maps 78 to BULLISH and Bullish", () => {
    expect(labelFromScore(78)).toBe("BULLISH");
    expect(toneFromLabel("BULLISH")).toBe("Bullish");
    expect(labelFromScore(44)).toBe("CAUTION");
    expect(labelFromScore(12)).toBe("STRONG BEARISH");
  });
});

describe("RSI classification", () => {
  it("treats 55–70 with rising slope as strong bullish", () => {
    const row = classifyRsi(63, 60);
    expect(row.stance).toBe("Strong Bullish");
    expect(row.score).toBeGreaterThanOrEqual(75);
  });

  it("does not flip RSI > 70 to bearish", () => {
    const row = classifyRsi(74, 72);
    expect(row.stance).toMatch(/Bullish/);
    expect(row.overextended).toBe(true);
    expect(row.why).toMatch(/overbought/);
  });

  it("keeps RSI < 30 with falling slope as strong bearish", () => {
    expect(classifyRsi(24, 28).stance).toBe("Strong Bearish");
  });
});

describe("MACD classification", () => {
  it("requires histogram and zero-line for strong bullish", () => {
    expect(classifyMacd(1.2, 0.4, 0.8, 0.3).stance).toBe("Strong Bullish");
    expect(classifyMacd(-1.2, -0.4, -0.8, -0.3).stance).toBe("Strong Bearish");
    expect(classifyMacd(0.02, 0.01, 0.005, 0.006).stance).toBe("Bullish");
  });
});

describe("MA alignment and overextension", () => {
  it("penalizes a fully stacked tape that is stretched from the 20 EMA", () => {
    const stacked = classifyMaAlignment(120, { e9: 118, e20: 110, e50: 100, e100: 90, e200: 80 });
    expect(stacked.stance).toMatch(/Caution|Strong Bullish|Bullish/);
    expect(stacked.extended).toBe(true);
    expect(stacked.score).toBeLessThan(90);
  });
});

describe("RVOL and price-volume", () => {
  it("classifies participation bands without using raw share count", () => {
    expect(classifyRvol(2.1).label).toMatch(/Very strong/);
    expect(classifyRvol(0.6).label).toMatch(/Weak/);
  });

  it("does not call a down-move on falling volume automatically bullish", () => {
    const row = classifyVolumePrice(-1.1, 0.6);
    expect(row.stance).toBe("Bearish");
    expect(row.why).toMatch(/not automatically bullish/);
  });

  it("labels up + expanding volume as accumulation", () => {
    expect(classifyVolumePrice(1.4, 1.8).why).toMatch(/accumulation/);
  });
});

describe("breakout confirmation", () => {
  it("rejects a wick and requires 1.5 RVOL after a close", () => {
    expect(classifyBreakoutStatus(741, 739, 740, 2).status).toBe("NOT_CONFIRMED");
    expect(classifyBreakoutStatus(741, 741, 740, 0.9).status).toBe("BREAKOUT_PENDING");
    expect(classifyBreakoutStatus(741, 741, 740, 1.6).status).toBe("BREAKOUT_CONFIRMED");
  });
});

describe("hard overrides", () => {
  it("will not print Strong Bullish below a declining 200 MA with bearish structure", () => {
    const result = applyHardOverrides({
      score: 82,
      label: "STRONG BULLISH",
      factors: [{ id: "structure", tone: "bearish", raw: {} } as never],
      price: 90,
      ema50: 95,
      ema50Slope: -0.02,
      ema200: 110,
    });
    expect(result.decision).toBe("Caution");
    expect(result.label).toBe("CONFLICTING");
    expect(result.score).toBeLessThanOrEqual(44);
  });

  it("can upgrade a confirmed 2x RVOL breakout", () => {
    const result = applyHardOverrides({
      score: 62,
      label: "CAUTIOUSLY BULLISH",
      factors: [
        { id: "structure", tone: "bullish", raw: {} } as never,
        { id: "breakout", tone: "bullish", raw: { status: "BREAKOUT_CONFIRMED", rvol: 2.2 } } as never,
      ],
      price: 110,
      ema50: 100,
      ema50Slope: 0.01,
      ema200: 90,
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.override).toMatch(/2× RVOL|2x RVOL|2/);
  });
});

describe("missing data", () => {
  it("returns no-data rather than inventing RSI or MACD", () => {
    expect(classifyRsi(null, null).stance).toBe("No Data");
    expect(classifyMacd(null, null, null, null).stance).toBe("No Data");
    expect(classifyRvol(null).stance).toBe("No Data");
    expect(emptyIndicators().rsi ?? null).toBeNull();
  });
});
