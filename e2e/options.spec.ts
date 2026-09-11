import { expect, test } from "@playwright/test";

test("options visualizer shows live P/L for a selected contract", async ({ page }) => {
  await page.goto("/options");
  await expect(page.getByRole("heading", { name: "Options Visualizer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Call", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Butterfly", exact: true })).toBeVisible();
  await expect(page.getByText("PAYOFF AT EXPIRATION")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("payoff-chart")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("DAY-BY-DAY MONEY PATH")).toBeVisible();
  await expect(page.getByText("Max loss")).toBeVisible();
  await expect(page.getByText("WHAT IF AT EXPIRATION")).toBeVisible();
});
