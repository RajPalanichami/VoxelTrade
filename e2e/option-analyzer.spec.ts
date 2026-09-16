import { expect, test } from "@playwright/test";

test("option analyzer shows live strategy menus and a payoff from listed contracts", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/option-analyzer");
  await expect(page.getByRole("heading", { name: "Option Analyzer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Long Call", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Short Call", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Protective Put", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iron Condor", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Calendar Spread", exact: true })).toBeVisible();
  await expect(page.getByTestId("analyzer-ticker")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("analyzer-legs")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("analyzer-payoff-chart")).toBeVisible();
  await expect(page.getByTestId("analyzer-entry")).toBeVisible();
  await expect(page.getByTestId("analyzer-breakeven")).toBeVisible();
  await expect(page.getByTestId("analyzer-scenarios")).toBeVisible();
  await expect(page.getByTestId("analyzer-risk-summary")).toBeVisible();
  await expect(page.getByTestId("analyzer-max-loss-warning")).toBeVisible();
  await expect(page.getByTestId("analyzer-strike-table")).toBeVisible();
  await expect(page.getByTestId("analyzer-disclaimer")).toBeVisible();
  await expect(page.getByTestId("analyzer-explanation")).toContainText(/MSFT|AAPL|NVDA|[A-Z]{1,5}/);
  await page.getByRole("button", { name: "Bull Call Spread", exact: true }).click();
  await expect(page.getByTestId("analyzer-legs")).toBeVisible();
  await expect(page.getByText("OPTION LEGS")).toBeVisible();
});
