import { expect, test } from "@playwright/test";

test("breakout potential is in nav and renders the scanner", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav").first();
  await expect(nav.getByRole("link", { name: "Breakout Potential" })).toBeVisible();
  await nav.getByRole("link", { name: "Breakout Potential" }).click();
  await expect(page).toHaveURL(/\/breakout-potential/);
  await expect(page.getByTestId("breakout-potential")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Breakout Potential" })).toBeVisible();
  await expect(page.getByText("Early Demand & Momentum Transition")).toBeVisible();
  await expect(page.getByRole("button", { name: "Scan Now" })).toBeVisible();
  await expect(page.getByText(/NVDA|INSUFFICIENT|Scanning/)).toBeVisible({ timeout: 90_000 });
});
