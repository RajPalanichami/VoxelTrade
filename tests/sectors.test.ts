import { describe, expect, it } from "vitest";
import { SECTORS, getSector } from "@/src/data/sectors";

describe("sectors", () => {
  it("has twelve unique sector pages", () => {
    expect(Object.keys(SECTORS).length).toBe(12);
    expect(new Set(Object.values(SECTORS).map((s) => s.slug)).size).toBe(12);
    expect(new Set(Object.values(SECTORS).map((s) => s.etf)).size).toBe(12);
  });

  it("each sector has eight members", () => {
    for (const [slug, meta] of Object.entries(SECTORS)) {
      expect(getSector(slug)).toBe(meta);
      expect(meta.members.length).toBe(8);
      expect(new Set(meta.members.map(([s]) => s)).size).toBe(8);
    }
  });
});
