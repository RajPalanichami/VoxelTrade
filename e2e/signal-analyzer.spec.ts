import { expect, test, type Page } from "@playwright/test";

async function waitForSignal(page: Page) {
  await expect(page.getByText("Fetching market data and calculating 10 signals…")).toBeHidden({ timeout: 60_000 });
  await expect(page.getByText(/Minutes SIGNAL|Hour SIGNAL|Hours SIGNAL|Daily SIGNAL/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("DATA UNAVAILABLE")).toHaveCount(0);
}

async function selectTimeframe(page: Page, label: string) {
  await page.getByRole("button", { name: /Minutes|Hour|Hours|Daily/ }).first().click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

test("Signal Analyzer stays consistent across timeframes and tickers", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (err) => failures.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") failures.push(msg.text());
  });

  await page.goto("/signals");
  await waitForSignal(page);
  await expect(page.getByText("MSFT").first()).toBeVisible();

  for (const label of ["30 Minutes", "1 Hour", "4 Hours", "Daily"]) {
    await selectTimeframe(page, label);
    await waitForSignal(page);
    await expect(page.getByText(`${label.toUpperCase()} SIGNAL`).or(page.getByText(`${label} SIGNAL`))).toBeVisible();
  }

  const search = page.getByPlaceholder(/search|ticker|symbol/i).first();
  await search.fill("AAPL");
  await page.getByRole("button", { name: /AAPL/i }).first().click();
  await waitForSignal(page);
  await expect(page.getByText("AAPL").first()).toBeVisible();

  await selectTimeframe(page, "30 Minutes");
  await waitForSignal(page);
  await selectTimeframe(page, "Daily");
  await waitForSignal(page);

  expect(failures.filter((m) => !m.includes("favicon"))).toEqual([]);
});
