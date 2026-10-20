import { expect, test } from "@playwright/test";

test("chart pattern page shows daily/weekly/monthly tiles and one trade plan", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/patterns");
  await expect(page.getByRole("heading", { name: "Chart Pattern Analysis" })).toBeVisible();
  await expect(page.getByText("Chart Patterns")).toBeVisible();
  await expect(page.getByTestId("chart-pattern-ticker")).toHaveText(/MSFT/i, { timeout: 120_000 });
  await expect(page.getByTestId("pattern-tile-daily")).toBeVisible();
  await expect(page.getByTestId("pattern-tile-weekly")).toBeVisible();
  await expect(page.getByTestId("pattern-tile-monthly")).toBeVisible();
  await expect(page.getByTestId("pattern-tile-daily")).toContainText(/Current Pattern/);
  await expect(page.getByTestId("pattern-tile-daily")).toContainText(/BULLISH|BEARISH|NEUTRAL/);
  await expect(page.getByTestId("chart-pattern-trade")).toBeVisible();
  await expect(page.getByTestId("chart-pattern-name")).toHaveCount(1);
  await expect(page.getByTestId("chart-pattern-stop")).toContainText("$");
  await expect(page.getByTestId("chart-pattern-target-1")).toContainText("$");
  await expect(page.getByTestId("chart-pattern-target-2")).toContainText("$");
  await expect(page.getByTestId("chart-pattern-target-3")).toContainText("$");
  await expect(page.getByTestId("chart-pattern-decision")).toContainText(/ENTER|WAIT FOR BREAKOUT|AVOID \/ NO TRADE/);
  await expect(page.getByText("Charting by TradingView")).toHaveCount(0);
  await expect(page.getByTestId("chart-pattern-why")).toBeVisible();
  await expect(page.getByRole("button", { name: "Why This Pattern?" })).toBeVisible();

  await page.getByTestId("pattern-timeframe").locator("select").selectOption("15m");
  await expect(page.getByTestId("chart-pattern-trade-heading")).toContainText("15-Minute Day Trading", {
    timeout: 120_000,
  });
  await expect(page.getByTestId("chart-pattern-entry")).toBeVisible();
  await expect(page.getByTestId("chart-pattern-name")).toHaveCount(1);
});
