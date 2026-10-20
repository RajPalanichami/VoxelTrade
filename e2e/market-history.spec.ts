import { expect, test } from "@playwright/test";

test("overview keeps its market pulse and adds 30-day history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Market Pulse", { exact: true })).toBeVisible();
  const history = page.getByTestId("market-history");
  await expect(history).toBeVisible();
  await expect(history.getByRole("heading", { name: "30-DAY MARKET HISTORY" })).toBeVisible();

  const ready = history.getByTestId("market-history-table").or(history.getByTestId("market-history-unavailable")).or(history.getByTestId("market-history-empty"));
  await expect(ready).toBeVisible({ timeout: 60_000 });

  await expect(page.getByTestId("market-tile-row").or(page.getByText("Loading market tiles…"))).toBeVisible();

  const table = history.getByTestId("market-history-table");
  if (await table.count()) {
    await expect(table.locator("tbody tr").first()).toBeVisible();
    await expect(history.getByTestId("history-card-vix")).toBeVisible();
    await expect(history.getByTestId("history-card-brent")).toBeVisible();
    await expect(history.getByTestId("history-card-spy")).toBeVisible();
    await expect(history.getByTestId("history-card-brent").getByText("Crude oil futures")).toBeVisible();
    await expect(history.getByTestId("history-card-brent")).toContainText("USD/bbl");
    const sort = history.getByTestId("history-sort-spyChange");
    await sort.click();
    await expect(sort).toHaveAttribute("aria-pressed", "true");
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return main.scrollWidth - main.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
