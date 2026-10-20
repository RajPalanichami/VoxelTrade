import { expect, test } from "@playwright/test";

test("opportunity monitor is in nav and renders the workspace", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav").first();
  await expect(nav.getByRole("link", { name: "Opportunity Monitor" })).toBeVisible();
  await nav.getByRole("link", { name: "Opportunity Monitor" }).click();
  await expect(page).toHaveURL(/\/opportunity/);
  await expect(page.getByTestId("opportunity-monitor")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Opportunity Monitor" })).toBeVisible();
  await expect(page.getByText("20-Ticker Breakout & 2–3 Week Swing Opportunity Engine")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Universe" })).toBeVisible();
  await expect(page.getByText(/NVDA/)).toBeVisible({ timeout: 90_000 });
});
