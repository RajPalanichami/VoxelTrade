import { expect, test } from "@playwright/test";

test("ticker comparison uses the typed ticker 2 instead of a hardcoded symbol", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/compare");
  await expect(page.getByRole("heading", { name: "Ticker Comparison" })).toBeVisible();
  await page.getByLabel("Ticker 1").fill("AAPL");
  await page.getByLabel("Ticker 2").fill("TSLA");
  await page.getByRole("button", { name: "ANALYZE" }).click();
  await expect(page.getByTestId("compare-loading").or(page.getByText("CATEGORY SCORE COMPARISON"))).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("CATEGORY SCORE COMPARISON")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId("compare-card-AAPL")).toBeVisible();
  await expect(page.getByTestId("compare-card-TSLA")).toBeVisible();
  await expect(page.getByTestId("compare-card-AMD")).toHaveCount(0);
  await expect(page.getByTestId("compare-chart")).toBeVisible();
  await expect(page.getByTestId("compare-data-quality")).toBeVisible();
});
