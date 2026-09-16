import { expect, test } from "@playwright/test";

test("comparison page analyzes user-selected tickers for a selected timeframe", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/comparison");
  await expect(page.getByRole("heading", { name: "Comparison", exact: true })).toBeVisible();
  await expect(page.getByText("There are no default symbols on this page.")).toBeVisible();
  await expect(page.getByTestId("basket-compare-row-NVDA")).toHaveCount(0);
  await page.getByLabel("Add ticker").fill("AAPL");
  await page.getByLabel("Add ticker").press("Enter");
  await page.getByLabel("Add ticker").fill("MSFT");
  await page.getByLabel("Add ticker").press("Enter");
  await expect(page.getByText("Analyzing selected tickers").or(page.getByText("DETAILED COMPARISON"))).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("DETAILED COMPARISON")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId("basket-compare-row-AAPL")).toBeVisible();
  await expect(page.getByTestId("basket-compare-row-MSFT")).toBeVisible();
  await expect(page.getByTestId("basket-compare-chart")).toBeVisible();
  await page.getByLabel("Timeframe").selectOption("1d");
  await expect(page.getByText("DETAILED COMPARISON · DAILY")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByTestId("basket-compare-row-AAPL")).toBeVisible();
  await expect(page.getByTestId("basket-compare-row-MSFT")).toBeVisible();
});
