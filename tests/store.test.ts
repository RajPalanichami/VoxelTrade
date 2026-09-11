import fs from "fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addSnapshot,
  addWatch,
  persistSnapshot,
  resetStoreForTests,
  storeBackend,
  storeFilePath,
} from "@/src/repositories/store";

function erofs(file: string) {
  return Object.assign(new Error(`EROFS: read-only file system, open '${file}'`), { code: "EROFS" });
}

const originalDatabaseUrl = process.env.DATABASE_URL;

const snap = {
  symbol: "AAPL",
  timeframe: "1h",
  score: 70,
  signal: "WAIT",
  confidence: "MEDIUM",
  evidence: {},
  data_timestamp: "2026-09-11T15:00:00.000Z",
  algorithm_version: "1.0.0",
};

afterEach(() => {
  vi.restoreAllMocks();
  resetStoreForTests();
  process.env.DATABASE_URL = originalDatabaseUrl;
  delete process.env.VERCEL;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.LAMBDA_TASK_ROOT;
});

describe("local JSON store on serverless / read-only disks", () => {
  it("does not resolve DATABASE_URL onto /var/task when Vercel is set", () => {
    process.env.VERCEL = "1";
    process.env.DATABASE_URL = "file:./data/protrader.json";
    expect(storeFilePath().replace(/\\/g, "/")).toBe("/tmp/voxel-trading/protrader.json");
  });

  it("keeps snapshots after EROFS by switching to memory", () => {
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementation((file) => {
      throw erofs(String(file));
    });
    const row = addSnapshot(snap);
    expect(row.symbol).toBe("AAPL");
    expect(storeBackend()).toBe("memory");
    const second = addSnapshot({ ...snap, symbol: "MSFT", timeframe: "4h" });
    expect(second.symbol).toBe("MSFT");
    expect(spy).toHaveBeenCalled();
  });

  it("keeps watchlist writes after EROFS", () => {
    vi.spyOn(fs, "writeFileSync").mockImplementation((file) => {
      throw erofs(String(file));
    });
    const item = addWatch("EROFSTICKER");
    expect(item.symbol).toBe("EROFSTICKER");
    expect(storeBackend()).toBe("memory");
  });

  it("persistSnapshot never throws when the disk rejects every write", () => {
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    });
    vi.spyOn(fs, "writeFileSync").mockImplementation((file) => {
      throw erofs(String(file));
    });
    expect(() => persistSnapshot(snap)).not.toThrow();
    const row = persistSnapshot(snap);
    expect(row === null || row.symbol === "AAPL").toBe(true);
  });
});
