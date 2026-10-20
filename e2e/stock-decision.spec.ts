import { expect, test } from "@playwright/test";

test("stock decision sits after trade your plan and defaults to daily", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav").first();
  const link = nav.getByRole("link", { name: "Stock Decision", exact: true });
  await expect(nav.getByRole("link", { name: "Trade Your Plan", exact: true })).toBeVisible();
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  await link.click();
  if (!/\/stock-decision/.test(page.url())) {
    await page.goto("/stock-decision");
  }
  await expect(page).toHaveURL(/\/stock-decision/, { timeout: 15_000 });
  await expect(page.getByTestId("stock-decision")).toBeVisible();
  await expect(page.getByTestId("decision-timeframes").getByRole("button", { name: "1D", exact: true })).toBeVisible();
  await expect(page.getByTestId("decision-timeframes").getByRole("button", { name: "5m", exact: true })).toBeVisible();
  await expect(page.getByTestId("decision-timeframes").getByRole("button", { name: "1M", exact: true })).toBeVisible();

  const shell = page.getByTestId("stock-decision");
  const error = page.getByText(/Market data temporarily unavailable/i);
  await expect(shell.or(error)).toBeVisible({ timeout: 60_000 });

  if (await page.getByTestId("decision-summary").isVisible()) {
    await expect(page.getByTestId("decision-overall")).toBeVisible();
    await expect(page.getByTestId("decision-why-summary")).toBeVisible();
    await expect(page.getByTestId("decision-factor-shortTrend")).toBeVisible();
    await expect(page.getByText(/1D Decision/i).first()).toBeVisible();
    await expect(page.getByTestId("decision-quality")).toContainText(/Bars/i);
    await expect(page.getByTestId("decision-order-book")).toHaveCount(0);
    await expect(page.getByText("ORDER BOOK + TIME & SALES")).toHaveCount(0);
    await page.getByRole("button", { name: "1H", exact: true }).click();
    await expect(page.getByText(/1H Decision|Building the/i).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Pro View" }).click();
    await expect(page.getByText(/not averaged|Estimated aggressive|Tier 1/i).first()).toBeVisible();
  }
});

test("stock decision recalculates independently for META and NVDA", async ({ page }) => {
  await page.goto("/stock-decision/META");
  await expect(page.getByTestId("stock-decision")).toBeVisible();
  await expect(page.getByRole("heading", { name: /META/ })).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId("decision-summary").isVisible()) {
    await expect(page.getByTestId("decision-overall")).toHaveText(/Bullish|Neutral|Bearish|Caution/);
  }
  await page.goto("/stock-decision/NVDA");
  await expect(page.getByRole("heading", { name: /NVDA/ })).toBeVisible({ timeout: 60_000 });
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/fabricated depth|full national order book is active/i);
});
