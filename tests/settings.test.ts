import { describe, expect, it } from "vitest";
import { createSettings } from "@/src/config/env";

describe("settings", () => {
  it("local cors defaults when unset", () => {
    const s = createSettings({ environment: "development", corsOrigins: "" });
    expect(s.corsOriginList).toContain("http://localhost:3000");
  });

  it("deployed cors requires env", () => {
    const s = createSettings({ environment: "production", corsOrigins: "", secUserAgent: "Voxel Trading ops@example.com" });
    expect(() => s.corsOriginList).toThrow(/CORS_ORIGINS/);
  });

  it("deployed validate runtime requires vars", () => {
    const s = createSettings({ environment: "qa", corsOrigins: "", secUserAgent: "" });
    expect(() => s.validateRuntime()).toThrow(/Missing required environment variable/);
  });

  it("deployed validate runtime ok", () => {
    const s = createSettings({
      environment: "qa",
      corsOrigins: "https://qa.example.com",
      secUserAgent: "Voxel Trading qa@example.com",
    });
    s.validateRuntime();
    expect(s.corsOriginList).toEqual(["https://qa.example.com"]);
  });

  it("vendor urls are overridable", () => {
    const s = createSettings({ twelveDataBaseUrl: "https://mock.example/td", economicCalendarUrl: "https://mock.example/cal" });
    expect(s.twelveDataBaseUrl).toBe("https://mock.example/td");
    expect(s.economicCalendarUrl).toBe("https://mock.example/cal");
  });
});
