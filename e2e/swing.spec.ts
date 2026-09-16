import { expect, test, type Page } from "@playwright/test";

const STRATEGY_NAMES = [
  "ELLIPSE / Bidirectional Swing Trading",
  "Swing High/Low Support & Resistance",
  "Fibonacci Clusters",
  "Liquidity Sweep Confirmation",
  "AetherEdge-Style Liquidity Analysis",
  "Swing Trader Algo",
  "Big Trend Catcher",
  "Multi-Timeframe Swing Analysis",
  "Multi-Indicator Weighted Swing Strategy",
  "Target Isolator / Swing Setup Scoring",
];

async function waitForSwing(page: Page) {
  await expect(page.getByText(/Retrieve market data, then run all 10 swing strategies/i)).toBeHidden({ timeout: 90_000 });
  await expect(page.getByTestId("swing-overall-score")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("DATA UNAVAILABLE")).toHaveCount(0);
}

async function selectSwingTimeframe(page: Page, label: string) {
  const control = page.getByTestId("swing-timeframe");
  await control.getByRole("button").first().click();
  await control.getByRole("button", { name: label, exact: true }).click();
}

test.describe("Swing Trading Strategies", () => {
  test.setTimeout(180_000);

  test("searches a ticker, runs all 10 strategies, and recalculates every timeframe", async ({ page }) => {
    const failures: string[] = [];
    page.on("pageerror", (err) => failures.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") failures.push(msg.text());
    });

    await page.goto("/swing");
    await waitForSwing(page);
    await expect(page.getByRole("heading", { name: /MSFT — 4 Hours Swing Trading Analysis/i })).toBeVisible();
    await expect(page.getByTestId("swing-overall-score")).toHaveText(/\d+ \/ 100/);
    await expect(page.getByTestId("swing-action")).toBeVisible();

    for (const name of STRATEGY_NAMES) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("swing-summary-table")).toBeVisible();
    await expect(page.locator("[data-testid^='swing-chart-']")).toHaveCount(10);
    await expect(page.getByText(/Entry:|NO TRADE|PREFERRED ENTRY/i).first()).toBeVisible();

    const search = page.getByPlaceholder(/search|ticker|symbol/i).first();
    await search.fill("NVDA");
    await page.getByRole("button", { name: /NVDA/i }).first().click();
    await waitForSwing(page);
    await expect(page.getByRole("heading", { name: /NVDA — 4 Hours Swing Trading Analysis/i })).toBeVisible();

    for (const label of ["15 Minutes", "30 Minutes", "1 Hour", "4 Hours", "Daily", "Weekly"]) {
      await selectSwingTimeframe(page, label);
      await waitForSwing(page);
      await expect(page.getByRole("heading", { name: new RegExp(`NVDA — ${label} Swing Trading Analysis`, "i") })).toBeVisible();
      await expect(page.getByTestId("swing-overall-score")).toHaveText(/\d+ \/ 100/);
      await expect(page.locator("[data-testid^='swing-strategy-']")).toHaveCount(10);
      await expect(page.locator("[data-testid^='swing-chart-']")).toHaveCount(10);
    }

    expect(failures.filter((m) => !m.includes("favicon"))).toEqual([]);
  });
});
