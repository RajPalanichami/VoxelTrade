import { expect, test } from "@playwright/test";

test("login page exposes every provider and email form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Facebook" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Instagram" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with X" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.getByText("Forgot password?")).toBeVisible();
  await expect(page.getByText("Create account")).toBeVisible();
});

test("signup requires matching passwords", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Continue with Instagram" })).toBeVisible();
  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password1");
  await page.getByLabel("Confirm Password").fill("password2");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText(/do not match|Supabase is not configured/i)).toBeVisible();
});

test("password reset page is reachable from login", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Forgot password?").click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset email" })).toBeVisible();
});

test("callback rejects an external next parameter", async ({ page }) => {
  await page.goto("/auth/callback?next=https://evil.example");
  await expect(page).not.toHaveURL(/evil\.example/);
});
