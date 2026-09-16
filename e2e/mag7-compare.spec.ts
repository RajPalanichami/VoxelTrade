import { expect, test } from "@playwright/test";

test("mag 7 comparison page analyzes all seven names for a selected timeframe", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/mag7-compare");
  await expect(page.getByRole("heading", { name: "Mag 7 Comparison" })).toBeVisible();
  await expect(page.getByLabel("Timeframe")).toBeVisible();
  await expect(page.getByText("Analyzing Mag 7").or(page.getByText("MAG 7 DETAILED COMPARISON"))).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("MAG 7 DETAILED COMPARISON")).toBeVisible({ timeout: 150_000 });
  for (const symbol of ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]) {
    await expect(page.getByTestId(`mag7-compare-row-${symbol}`)).toBeVisible();
  }
  await expect(page.getByTestId("mag7-compare-chart")).toBeVisible();
  await expect(page.getByTestId("mag7-compare-quality")).toBeVisible();
  await page.getByLabel("Timeframe").selectOption("1d");
  await expect(page.getByText("MAG 7 DETAILED COMPARISON · DAILY")).toBeVisible({ timeout: 150_000 });
});
