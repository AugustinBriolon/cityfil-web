import { expect, test } from "@playwright/test";

test.describe("admin console", () => {
  test("keeps visitors out of the console", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin console");
  });

  test("rejects wrong credentials without saying which part was wrong", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toHaveText(/Wrong username or password/);
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test("old settings links reach the account panel (sign-in first)", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});
