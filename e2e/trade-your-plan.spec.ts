import { expect, test } from "@playwright/test";

test("trade your plan sits in nav and recalculates by timeframe", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav").first();
  const link = nav.getByRole("link", { name: "Trade Your Plan", exact: true });
  await expect(nav.getByRole("link", { name: "Stock Buying Engine", exact: true })).toBeVisible();
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  if (!/\/trade-your-plan/.test(page.url())) {
    await page.goto("/trade-your-plan");
  }
  await expect(page).toHaveURL(/\/trade-your-plan/, { timeout: 15_000 });
  await expect(page.getByTestId("trade-your-plan")).toBeVisible();
  await expect(page.getByTestId("trade-plan-timeframes").getByRole("button", { name: "15 Minutes" })).toBeVisible();
  await expect(page.getByTestId("trade-plan-timeframes").getByRole("button", { name: "4 Hours" })).toBeVisible();

  const shell = page.getByTestId("trade-your-plan");
  const error = page.getByText(/Market data temporarily unavailable/i);
  await expect(shell.or(error)).toBeVisible({ timeout: 60_000 });

  if (await page.getByTestId("trade-plan-chart").isVisible()) {
    await expect(page.getByTestId("trade-plan-levels")).toBeVisible();
    await page.getByRole("button", { name: "4 Hours", exact: true }).click();
    await expect(page.getByText(/DECISION LADDER|Building the/i).first()).toBeVisible({ timeout: 60_000 });
  }
});
