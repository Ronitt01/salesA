import { expect, test as setup } from "@playwright/test";

setup("sign in as the demo user", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Backend connected")).toBeVisible();
  await page.getByRole("button", { name: "Sign in as demo user" }).click();
  await page.waitForURL("**/overview");
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
  await page.context().storageState({ path: "test-results/.auth/demo.json" });
});
