import { chromium } from "@playwright/test";
import { writeFileSync } from "fs";

const base = process.env.BASE_URL || "http://localhost:3000";
const routes = ["/", "/dashboard", "/signals", "/technical", "/crypto", "/login"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];

for (const route of routes) {
  const requests = [];
  const onRequest = (req) => requests.push(req.url());
  page.on("request", onRequest);
  const started = Date.now();
  const response = await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  const nav = await page.evaluate(() => {
    const navEntry = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByType("paint");
    return {
      ttfb: navEntry ? Math.round(navEntry.responseStart) : null,
      dom: navEntry ? Math.round(navEntry.domContentLoadedEventEnd) : null,
      load: navEntry ? Math.round(navEntry.loadEventEnd) : null,
      fcp: Math.round(paint.find((item) => item.name === "first-contentful-paint")?.startTime || 0) || null,
    };
  });
  page.off("request", onRequest);
  const next = requests.filter((url) => url.includes("/_next/"));
  results.push({
    route,
    status: response?.status() ?? 0,
    elapsedMs: Date.now() - started,
    requests: requests.length,
    nextAssets: next.length,
    ...nav,
  });
}

async function api(path) {
  const started = Date.now();
  const response = await fetch(base + path);
  const text = await response.text();
  return { path, status: response.status, ms: Date.now() - started, bytes: text.length };
}

const apis = [];
apis.push(await api("/api/v1/stocks/MSFT/quote"));
apis.push(await api("/api/v1/stocks/MSFT/quote"));
apis.push(await api("/api/v1/market/pulse?range=1D"));
apis.push(await api("/api/v1/market/pulse?range=1D"));

const report = { measuredAt: new Date().toISOString(), base, routes: results, apis };
writeFileSync("docs/performance/baseline.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
