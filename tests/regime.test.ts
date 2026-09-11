import { describe, expect, it } from "vitest";
import { attachMacroStatus, cpiStatus, dxyStatus, oilStatus, treasuryStatus, vixStatus } from "@/src/engines/regime";

describe("regime", () => {
  it("vix bands", () => {
    expect(vixStatus(14)?.tone).toBe("HEALTHY");
    expect(vixStatus(24)?.tone).toBe("CAUTION");
    expect(vixStatus(32)?.tone).toBe("STRESS");
  });

  it("wti eighty threshold", () => {
    expect(oilStatus(72, "WTI")?.tone).toBe("HEALTHY");
    expect(oilStatus(82, "WTI")?.tone).toBe("CAUTION");
    expect(oilStatus(91, "WTI")?.tone).toBe("STRESS");
  });

  it("brent premium thresholds", () => {
    expect(oilStatus(84, "BRENT")?.tone).toBe("HEALTHY");
    expect(oilStatus(88, "BRENT")?.tone).toBe("CAUTION");
  });

  it("cpi near target", () => {
    expect(cpiStatus(2.1)?.tone).toBe("HEALTHY");
    expect(cpiStatus(3.8)?.tone).toBe("CAUTION");
    expect(cpiStatus(5.2)?.tone).toBe("STRESS");
  });

  it("treasury direction and level", () => {
    expect(treasuryStatus(4.2, "falling")?.tone).toBe("HEALTHY");
    expect(treasuryStatus(4.9, "stable")?.tone).toBe("CAUTION");
    expect(treasuryStatus(4.3, "stable", 0.25)?.tone).toBe("STRESS");
  });

  it("us2y uses same treasury rules", () => {
    const card = attachMacroStatus({ symbol: "US2Y", price: 4.9 });
    expect((card.status as { tone: string; reason: string }).tone).toBe("CAUTION");
    expect((card.status as { reason: string }).reason).toContain("2Y");
  });

  it("dxy strong dollar", () => {
    expect(dxyStatus(102)?.tone).toBe("HEALTHY");
    expect(dxyStatus(107)?.tone).toBe("CAUTION");
    expect(dxyStatus(111)?.tone).toBe("STRESS");
  });
});
