import { defineConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const appRoot = __dirname;
loadEnvFile(path.join(appRoot, "..", ".env"));
loadEnvFile(path.join(appRoot, ".env"));
loadEnvFile(path.join(appRoot, ".env.local"));
loadEnvFile(path.join(appRoot, ".env.development"));

const baseURL = (process.env.BASE_URL || "http://localhost:3000").trim();
const timeoutMs = Number(process.env.PLAYWRIGHT_TIMEOUT_MS || 60_000);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: timeoutMs,
  use: { baseURL, trace: "off" },
  projects: [
    { name: "desktop-1920", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 800 } } },
    { name: "tablet-768", use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
