import { expect, test } from "@playwright/test";

test("crypto sits below scalp analyzer and renders a 24/7 market terminal", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav").first();
  await expect(nav.getByRole("link", { name: "Scalp Analyzer" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Crypto" })).toBeVisible();
  await nav.getByRole("link", { name: "Crypto" }).click();
  await expect(page).toHaveURL(/\/crypto/);
  await expect(page.getByRole("heading", { name: "Crypto Market Intelligence" })).toBeVisible();
  await expect(page.getByTestId("crypto-market")).toBeVisible();
  await expect(page.getByText("24/7 CRYPTO")).toBeVisible();
  await expect(page.getByText(/Pre-market|After-hours/)).toHaveCount(0);

  const shell = page.getByTestId("crypto-market");
  const error = page.getByText(/DATA UNAVAILABLE/i);
  await expect(shell.or(error)).toBeVisible({ timeout: 60_000 });

  if (await page.getByTestId("crypto-kpi-btc").isVisible()) {
    const btcText = await page.getByTestId("crypto-kpi-btc").innerText();
    const price = Number((btcText.match(/[\d,]+(?:\.\d+)?/) || ["0"])[0].replace(/,/g, ""));
    expect(price).toBeGreaterThan(0);
    await expect(page.getByTestId("crypto-kpi-total")).toBeVisible();
    await expect(page.getByTestId("crypto-kpi-btc-dom")).toBeVisible();
    await expect(page.getByTestId("crypto-top-table")).toBeVisible();
    await expect(page.getByRole("button", { name: "Top 20" })).toBeVisible();
    await page.getByRole("button", { name: "Top 20" }).click();
    await expect(page.getByTestId("crypto-breadth")).toBeVisible();
    await expect(page.getByTestId("crypto-rotation")).toBeVisible();
    await expect(page.getByTestId("crypto-timeframes").getByRole("button", { name: "1H" })).toBeVisible();
    await page.getByTestId("crypto-timeframes").getByRole("button", { name: "4H" }).click();
    await expect(page.getByTestId("crypto-summary")).toBeVisible();
    await expect(page.getByText(/CoinGecko/)).toBeVisible();
    const search = page.getByLabel(/Search cryptocurrency/i);
    await search.fill("ETH");
    await expect(page.getByRole("button", { name: /ETH/ }).first()).toBeVisible({ timeout: 15_000 });
  }
});
