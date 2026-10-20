import { expect, test } from "@playwright/test";

test("stock buying engine sits under signal analyzer and uses the global ticker", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav").first();
  await expect(nav.getByRole("link", { name: "Signal Analyzer" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Stock Buying Engine" })).toBeVisible();
  await nav.getByRole("link", { name: "Stock Buying Engine" }).click();
  await expect(page).toHaveURL(/\/stock-buying-engine/);
  await expect(page.getByRole("heading", { name: "Decision workspace" })).toBeVisible();
  await expect(page.getByTestId("buying-horizons")).toBeVisible();

  await page.getByRole("button", { name: "Long Term" }).click();
  await page.getByRole("button", { name: "Swing" }).click();
  await page.getByRole("button", { name: "Day Trade" }).click();
  await page.getByRole("button", { name: "Scalp" }).click();

  const search = page.getByLabel(/Search ticker/i);
  if (await search.isVisible()) {
    await search.fill("AAPL");
    const hit = page.getByRole("button", { name: /AAPL/ }).first();
    if (await hit.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await hit.click();
    } else {
      await search.press("Enter");
    }
  }

  const engine = page.getByTestId("stock-buying-engine");
  const error = page.getByText(/Market data temporarily unavailable/i);
  await expect(engine.or(error)).toBeVisible({ timeout: 60_000 });

  if (await page.getByTestId("buying-decision").isVisible()) {
    await expect(page.getByTestId("buying-rr")).toBeVisible();
    await expect(page.getByTestId("buying-size")).toBeVisible();
    await page.getByRole("button", { name: "ADVANCED" }).click();
    await expect(page.getByText(/documented weighted sum/i)).toBeVisible();
    await page.getByRole("button", { name: "SIMPLE" }).click();
  }
});
