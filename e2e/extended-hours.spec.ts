import { expect, test } from "@playwright/test";

test("ticker search loads shared extended-hours context on analysis pages", async ({ page }) => {
  await page.goto("/scalp-analyzer");
  const search = page.getByLabel(/Search ticker/i).last();
  await search.fill("MSFT");
  await search.press("Enter");
  await expect(page.getByTestId("ticker-session-strip")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("ticker-session-strip")).toContainText(/PREMARKET|REGULAR|AFTER-HOURS|OVERNIGHT|CLOSED/);
  await expect(page.getByTestId("ticker-session-strip")).toContainText(/Prev close|Overnight|Premarket/);

  await page.goto("/signals");
  await expect(page.getByTestId("ticker-session-strip")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("ticker-session-strip")).toContainText(/PREMARKET|REGULAR|AFTER-HOURS|OVERNIGHT|CLOSED/);
});
