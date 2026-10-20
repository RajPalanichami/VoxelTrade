import { expect, test } from "@playwright/test";

test("scalp analyzer searches a ticker and exposes 5M/15M/30M condition states", async ({ page }) => {
  await page.goto("/scalp-analyzer");
  await expect(page.getByRole("heading", { name: "Scalp Analyzer" })).toBeVisible();
  await expect(page.getByTestId("scalp-timeframes").getByRole("button", { name: "15M" })).toBeVisible();

  const search = page.getByLabel(/Search ticker/i).last();
  await search.fill("AAPL");
  await search.press("Enter");

  await expect(page.getByTestId("scalp-analyzer")).toBeVisible();
  const snapshot = page.getByTestId("scalp-snapshot");
  const error = page.getByText(/DATA UNAVAILABLE/i);
  await expect(snapshot.or(error)).toBeVisible({ timeout: 60_000 });

      if (await snapshot.isVisible()) {
        await expect(page.getByTestId("ticker-session-strip")).toBeVisible();
        await expect(page.getByTestId("scalp-state")).toContainText(/CONFIRMED|SETUP FORMING|WAIT|NO TRADE|INSUFFICIENT DATA/);
    await expect(page.getByTestId("scalp-mtf")).toBeVisible();
    await expect(page.getByTestId("scalp-levels")).toContainText(/Previous Day High|VWAP|Opening Range/);
    await expect(page.getByTestId("scalp-momentum")).toContainText(/RSI/);
    await expect(page.getByTestId("scalp-risk")).toContainText(/Entry|Stop|R:R/);
    await page.getByRole("button", { name: "5M" }).click();
    await expect(page.getByTestId("scalp-tf-5m")).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "30M" }).click();
    await expect(page.getByTestId("scalp-tf-30m")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/STRONG BUY|STRONG SELL/)).toHaveCount(0);
  }
});
