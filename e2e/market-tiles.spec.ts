import { expect, test } from "@playwright/test";

test("market tiles stay in one lane and include 2Y + BTC", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Market Pulse", { exact: true })).toBeVisible();
  const row = page.getByTestId("market-tile-row");
  await expect(row).toBeVisible({ timeout: 45_000 });

  const box = await row.boundingBox();
  expect(box).toBeTruthy();
  const tiles = row.locator(":scope > *");
  const count = await tiles.count();
  expect(count).toBeGreaterThanOrEqual(2);

  for (let i = 0; i < count; i++) {
    const t = await tiles.nth(i).boundingBox();
    if (!t || !box) continue;
    expect(t.y).toBeGreaterThanOrEqual(box.y - 4);
    expect(t.y + 8).toBeLessThan(box.y + box.height);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const symbols = await tiles.allTextContents();
  const joined = symbols.join(" ");
  if (joined.includes("US2Y") || joined.includes("2Y")) {
    await expect(page.getByTestId("tile-US2Y")).toBeVisible();
  }
  if (joined.includes("BTC")) {
    await expect(page.getByTestId("tile-BTC")).toBeVisible();
  }

  const ids = await page.locator("[data-testid^='tile-']").evaluateAll((els) =>
    els.map((e) => (e.getAttribute("data-testid") || "").replace("tile-", "")),
  );
  const lead = ["BTC", "VIX", "BRENT", "WTI", "SPY", "IWM", "US2Y", "US10Y", "CPI"];
  const present = lead.filter((s) => ids.includes(s));
  const positions = present.map((s) => ids.indexOf(s));
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("overview keeps Top Market Movers and shows live Market Events This Week", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Market Pulse", { exact: true })).toBeVisible();
  await expect(page.getByText("TOP MARKET MOVERS")).toBeVisible({ timeout: 45_000 });
  const events = page.getByTestId("market-events");
  await expect(events).toBeVisible({ timeout: 45_000 });
  await expect(events.getByText("MARKET EVENTS THIS WEEK")).toBeVisible();
  await expect(page.getByTestId("market-events-updated")).toContainText("EST (Eastern Standard Time)");
  await expect(page.getByTestId("market-event-row").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("No U.S. market events were scheduled")).toHaveCount(0);
  const eventsBox = await events.boundingBox();
  const movers = page.getByTestId("top-market-movers");
  await expect(movers).toBeVisible();
  const moversBox = await movers.boundingBox();
  expect(eventsBox).toBeTruthy();
  expect(moversBox).toBeTruthy();
  expect(moversBox!.y).toBeGreaterThan(eventsBox!.y);
});

test("overview shows a Login button and not the auth form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Market Pulse", { exact: true })).toBeVisible();
  await expect(page.getByTestId("header-login")).toBeVisible();
  await expect(page.getByText("Continue with Google")).toHaveCount(0);
  await page.getByTestId("header-login").click();
  await expect(page.getByTestId("auth-modal")).toBeVisible();
  await expect(page.getByText("Continue with Google")).toBeVisible();
  await expect(page.getByText("Market Pulse", { exact: true })).toBeVisible();
});

test("watchlist add prompts login instead of replacing overview", async ({ page }) => {
  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Add ticker" }).click();
  await expect(page.getByTestId("auth-modal")).toContainText("Please log in to create and manage your watchlist");
  await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible();
});

test("auth pages still render for deep links", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Continue with Google")).toBeVisible();
  await expect(page.getByText("Continue with Facebook")).toBeVisible();
  await page.goto("/signup");
  await expect(page.getByText("Confirm Password")).toBeVisible();
  await page.goto("/forgot-password");
  await expect(page.getByText("Reset password")).toBeVisible();
});
