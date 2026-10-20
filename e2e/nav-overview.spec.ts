import { expect, test } from "@playwright/test";

test("sidebar order restores sector pages and keeps existing routes", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav").first();
  await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
  const labels = await nav.locator("a").allTextContents();
  const trimmed = labels.map((s) => s.replace(/\s*New\s*$/i, "").replace(/\s+/g, " ").trim());
  expect(trimmed.slice(0, 33)).toEqual([
    "Overview",
    "Dashboard",
    "Signal Analyzer",
    "Technical Analysis",
    "Scalp Analyzer",
    "Trade Your Plan",
    "Stock Decision",
    "Chart Pattern",
    "Stock Buying Engine",
    "Breakout Potential",
    "Opportunity Monitor",
    "Option Visualizer",
    "Option Analyzer",
    "Swing Trading",
    "Crypto",
    "Ticker Comparison",
    "Multi-Time Frame",
    "Watchlist",
    "News",
    "The Magnificent Seven",
    "Mag 7 Comparison",
    "Comparison",
    "Technology",
    "Semiconductors",
    "Communication",
    "Financial",
    "Energy",
    "Healthcare",
    "Consumer Discretionary",
    "Industrials",
    "Consumer Staples",
    "Materials",
    "Utilities",
  ]);
  expect(trimmed).toContain("Tools");
  expect(trimmed).toContain("Technical Analysis");
  expect(trimmed).toContain("Fundamentals");
  expect(trimmed).toContain("Alerts");
  expect(trimmed).not.toContain("Settings");
  expect(trimmed).not.toContain("Markets");
  expect(trimmed).not.toContain("Sectors");
  expect(trimmed.filter((x) => x === "Market")).toHaveLength(0);

  await expect(page.getByTestId("overview-hub")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("MARKET SUMMARY")).toBeVisible();
  await expect(page.getByText("SECTOR SUMMARY")).toBeVisible();
  await page.goto("/markets");
  await expect(page.getByText("Market Pulse", { exact: true })).toBeVisible();
  await page.goto("/market");
  await expect(page.getByRole("heading", { name: "Market & Macro" })).toBeVisible();
  await page.goto("/sectors");
  await expect(page.getByText("SECTOR PERFORMANCE")).toBeVisible();
  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();
  await page.goto("/sector/technology");
  await expect(page.getByText(/Technology/i).first()).toBeVisible();
  await page.goto("/mag7");
  await expect(page.getByText(/Magnificent/i).first()).toBeVisible();
});
