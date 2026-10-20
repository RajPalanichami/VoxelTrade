import { expect, test } from "@playwright/test";

test("technical chart studio loads and keeps the timeframe when the ticker changes", async ({ page }) => {
  await page.goto("/technical");
  const studio = page.getByTestId("technical-studio");
  await expect(studio).toBeVisible();
  await expect(page.getByRole("button", { name: "1m", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "1M", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "1D", exact: true }).click();
  await expect(page.getByRole("button", { name: "1D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "SOXL", exact: true }).click();
  await expect(page.getByTestId("chart-symbol")).toContainText("SOXL");
  await expect(page.getByRole("button", { name: "1D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "AAPL", exact: true }).click();
  await expect(page.getByTestId("chart-symbol")).toContainText("AAPL");
  await expect(page.getByTestId("chart-symbol")).not.toContainText("SOXL");
  const outcome = page.getByTestId("technical-summary").or(page.getByTestId("chart-error"));
  await expect(outcome.first()).toBeVisible({ timeout: 45_000 });
});
