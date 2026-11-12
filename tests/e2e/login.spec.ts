import { expect, test } from "@playwright/test";

test.describe("sign-in", () => {
  test("presents the globe and Strava as the way in", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveTitle("Sign in · Cityfil");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every street you've run, filled in.");
    await expect(page.getByRole("region", { name: "Planet preview" }).locator("canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect with Strava" })).toBeEnabled();
    await expect(page.getByRole("link", { name: "Get Cityfil on the App Store" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Garmin/i })).toHaveCount(0);
  });

  test("explains a declined Strava authorization", async ({ page }) => {
    await page.goto("/login?error=AccessDenied");
    await expect(page.getByRole("alert").filter({ hasText: "Strava access was declined" })).toBeVisible();
  });

  test("keeps signed-out visitors away from the globe", async ({ page }) => {
    await page.goto("/globe");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("public pages", () => {
  test("presents the app on the home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Run every street in your city.");
    await expect(page.getByRole("link", { name: "Download on the App Store" }).first()).toHaveAttribute(
      "href",
      /apps\.apple\.com/,
    );
    await expect(page.getByRole("link", { name: "Sign in on the web" })).toHaveAttribute("href", "/login");
  });

  test("answers common questions on the support page", async ({ page }) => {
    await page.goto("/support");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("How can we help?");
    await expect(page.getByRole("heading", { name: "How do I delete my account?" })).toBeVisible();
  });
});
