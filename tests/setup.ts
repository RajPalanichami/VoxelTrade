import fs from "fs";
import os from "os";
import path from "path";
import { afterAll } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voxel-store-"));
process.env.ENVIRONMENT = "test";
process.env.DATABASE_URL = `file:${path.join(dir, "protrader.json")}`;

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});
