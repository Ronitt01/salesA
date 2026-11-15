import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";

config({ path: ".env.local", quiet: true });

const ROUTES: Array<[string, string]> = [
  ["Overview", "/overview"],
  ["Lead Explorer", "/leads"],
  ["Companies", "/companies"],
  ["Contacts", "/contacts"],
  ["Opportunities", "/opportunities"],
  ["Campaigns", "/campaigns"],
  ["Conversation Centre", "/conversations"],
  ["Meetings", "/meetings"],
  ["Market Intelligence", "/market-intelligence"],
  ["Automations", "/automations"],
  ["Analytics", "/analytics"],
  ["Settings", "/settings"],
];

const E2E_PREFIX = "E2E Test";

/** Fails the test if the page logged an error or rendered an error boundary. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.afterAll(async () => {
  // Remove anything these tests created.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await admin.from("companies").delete().ilike("name", `${E2E_PREFIX}%`);
  await admin.from("saved_filters").delete().ilike("name", `${E2E_PREFIX}%`);
});

test.describe("authentication", () => {
  test("signed-out visitors are redirected to the login page", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const response = await page.goto("/leads");
    expect(page.url()).toContain("/login");
    expect(page.url()).toContain("next=%2Fleads");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    await context.close();
  });

  test("wrong credentials show one generic message", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await context.close();
  });
});

test.describe("navigation", () => {
  test("every sidebar item opens a working page", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/overview");
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const [label, path] of ROUTES) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await page.waitForURL(`**${path}`);
      await expect(page.getByRole("heading", { level: 1, name: label, exact: true })).toBeVisible();
      await expect(page.getByText("This page could not be loaded")).toHaveCount(0);
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    }
    expect(errors).toEqual([]);
  });

  test("the sidebar collapses and remembers the choice", async ({ page }) => {
    await page.goto("/overview");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByText("Lead Explorer")).toBeVisible();
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(nav.getByText("Lead Explorer")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(nav.getByText("Lead Explorer")).toBeVisible();
  });

  test("the header shows the demo label, system status and notifications", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByText("Demo · synthetic data")).toBeVisible();
    await page.getByRole("button", { name: /System status/ }).click();
    await expect(page.getByText("Mock (deterministic)")).toBeVisible();
    await expect(page.getByText("Off (nothing is sent)")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Notifications/ }).click();
    await expect(page.getByText(/waiting for approval/)).toBeVisible();
  });

  test("global search opens the Lead Explorer filtered", async ({ page }) => {
    await page.goto("/overview");
    await page.getByRole("textbox", { name: "Search companies and contacts" }).fill("Northstar");
    await page.keyboard.press("Enter");
    await page.waitForURL("**/leads?q=Northstar");
    await expect(page.getByRole("link", { name: "Northstar Industrial Components" })).toBeVisible();
  });
});

test.describe("dashboard", () => {
  test("renders eight KPI cards, six charts and the supporting sections from stored data", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/overview");
    const kpis = page.getByRole("region", { name: "Key metrics" });
    for (const label of [
      "New qualified leads today",
      "Total qualified prospects",
      "High-priority prospects",
      "Positive replies",
      "Meetings booked",
      "Active opportunities",
      "Estimated pipeline value",
      "Workflow success rate",
    ]) {
      await expect(kpis.getByText(label, { exact: true })).toBeVisible();
    }
    for (const title of [
      "Lead generation over time",
      "Lead acquisition funnel",
      "Sales pipeline",
      "Industry performance",
      "Acquisition channel performance",
      "Workflow monitoring",
      "Daily insights",
      "Today's top opportunities",
      "Latest positive replies",
      "Upcoming meetings",
      "Recent buying signals",
      "Industry recommendations",
      "Recent automation failures",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: title, exact: true })).toBeVisible();
    }
    // Recharts drew real marks, not an empty frame.
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    await expect(page.locator(".recharts-line-curve, .recharts-area-curve").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("KPI tooltips explain the metric", async ({ page }) => {
    await page.goto("/overview");
    // Keyboard focus opens the tooltip, the same as hovering.
    await page.getByRole("button", { name: "About Meetings booked" }).focus();
    await expect(page.getByText(/Booked is not the same as attended/).first()).toBeVisible();
  });

  test("date filters change the period, including a custom range", async ({ page }) => {
    await page.goto("/overview");
    await page.getByRole("link", { name: "Last 7 days" }).click();
    await page.waitForURL("**/overview?range=7d");
    await expect(page.getByText("Last 7 days", { exact: false }).first()).toBeVisible();
    await page.getByRole("link", { name: "Today", exact: true }).click();
    await page.waitForURL("**/overview?range=today");

    await page.getByRole("button", { name: "Custom range" }).click();
    await page.locator("#range-from").fill("2026-10-01");
    await page.locator("#range-to").fill("2026-10-31");
    await page.getByRole("button", { name: "Apply range" }).click();
    await page.waitForURL("**/overview?range=custom&from=2026-10-01&to=2026-10-31");
    await expect(page.getByText("2026-10-01 to 2026-10-31").first()).toBeVisible();
  });

  test("the industry chart switches metric and offers a table view", async ({ page }) => {
    await page.goto("/overview?range=90d");
    await page.getByRole("combobox", { name: "Metric" }).click();
    await page.getByRole("option", { name: "Revenue" }).click();
    await expect(page.getByRole("combobox", { name: "Metric" })).toContainText("Revenue");
    await page.getByRole("button", { name: "Show as table" }).click();
    await expect(page.getByRole("columnheader", { name: "Gross profit" })).toBeVisible();
  });
});

test.describe("lead explorer", () => {
  test("filters, sorts and shows an empty state when nothing matches", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.getByText(/1–25 of 50 leads/)).toBeVisible();

    await page.getByRole("combobox", { name: "Score" }).click();
    await page.getByRole("option", { name: "Priority A (80+)" }).click();
    await page.waitForURL("**/leads?score_min=80");
    await expect(page.getByRole("button", { name: "Remove filter Score ≥ 80" })).toBeVisible();

    await page.getByRole("link", { name: /Sort by Company/ }).click();
    await page.waitForURL(/sort=company_name/);

    await page.getByRole("textbox", { name: "Search leads" }).fill("zzz-no-such-company");
    await page.keyboard.press("Enter");
    await expect(page.getByText("No leads match these filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await page.waitForURL("**/leads");
    await expect(page.getByText(/of 50 leads/)).toBeVisible();
  });

  test("paginates", async ({ page }) => {
    await page.goto("/leads");
    await page.getByRole("link", { name: "Next page" }).click();
    await page.waitForURL("**/leads?page=2");
    await expect(page.getByText(/26–50 of 50 leads/)).toBeVisible();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
  });

  test("a lead can be created, is scored, rejects a duplicate, and can be edited", async ({ page }) => {
    const stamp = Date.now();
    const name = `${E2E_PREFIX} Traders ${stamp}`;
    const domain = `e2e-${stamp}.example`;

    await page.goto("/leads");
    await page.getByRole("button", { name: "New lead" }).click();
    await page.getByLabel("Company name").fill(name);
    await page.getByLabel("Website domain").fill(`https://www.${domain}/about`);
    await page.getByLabel("City").fill("Pune");
    await page.getByLabel("Full name").fill("Asha Kulkarni");
    await page.getByLabel("Business email").fill(`asha@${domain}`);
    await page.getByRole("button", { name: "Create lead" }).click();

    await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    // Scored by the engine straight away, and not qualified: there is no evidence yet.
    await expect(page.getByText("Not qualified").first()).toBeVisible();
    await expect(page.getByText(/observed facts with evidence; 2 required/)).toBeVisible();
    await expect(page.getByText(domain).first()).toBeVisible();
    await expect(page.getByText("Lead created manually")).toBeVisible();

    // Evidence and notes are visible on the detail page.
    await page.getByRole("textbox", { name: "New note" }).fill("Met the owner at a trade fair.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Met the owner at a trade fair.")).toBeVisible();

    // Edit
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Company name").fill(`${name} Edited`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: `${name} Edited` })).toBeVisible();

    // Duplicate domain is refused.
    await page.goto("/leads");
    await page.getByRole("button", { name: "New lead" }).click();
    await page.getByLabel("Company name").fill(`${E2E_PREFIX} Duplicate ${stamp}`);
    await page.getByLabel("Website domain").fill(domain.toUpperCase());
    await page.getByRole("button", { name: "Create lead" }).click();
    await expect(page.getByText(/already exists/)).toBeVisible();
  });

  test("lead detail separates observed facts from AI hypotheses and explains the score", async ({ page }) => {
    await page.goto("/leads?q=Greenacre");
    await page.getByRole("link", { name: "Greenacre Realty" }).click();
    await expect(page.getByRole("heading", { name: /Verified facts \(\d+\)/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /AI hypotheses \(\d+\)/ })).toBeVisible();
    await expect(page.getByText("Assumption, not an observed fact.").first()).toBeVisible();
    await expect(page.getByText(/Evidence:/).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Lead score breakdown" })).toBeVisible();
    await page.getByText("ICP fit").click();
    await expect(page.getByText("Located in target country (IN)")).toBeVisible();
    for (const section of ["Buying signals", "Opportunities", "Outreach history", "Reply history", "Meeting history", "Notes and activity", "Decision-maker and contacts"]) {
      await expect(page.getByRole("heading", { level: 2, name: section })).toBeVisible();
    }
  });

  test("bulk tagging and saved filters work", async ({ page }) => {
    const tag = `e2e-${Date.now()}`;
    await page.goto("/leads?q=Northstar");
    await page.getByRole("checkbox", { name: "Select Northstar Industrial Components" }).check();
    await page.getByRole("textbox", { name: "Tag name" }).fill(tag);
    await page.getByRole("button", { name: "Add tag" }).click();
    await expect(page.getByText(tag, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^Saved/ }).click();
    await page.getByRole("menuitem", { name: "Save current filters…" }).click();
    await page.getByRole("textbox", { name: "Saved filter name" }).fill(`${E2E_PREFIX} filter`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: /^Saved/ }).click();
    await expect(page.getByRole("menuitem", { name: new RegExp(`${E2E_PREFIX} filter`) })).toBeVisible();
    await page.keyboard.press("Escape");

    // Clean up the tag.
    await page.getByRole("checkbox", { name: "Select Northstar Industrial Components" }).check();
    await page.getByRole("textbox", { name: "Tag name" }).fill(tag);
    await page.getByRole("button", { name: "Remove tag" }).click();
    await expect(page.getByText(tag, { exact: true })).toHaveCount(0);
  });

  test("CSV export returns permitted columns and labels demo rows", async ({ page }) => {
    await page.goto("/leads");
    const response = await page.request.get("/api/export/leads?score_min=80");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    const csv = await response.text();
    const header = csv.split("\r\n")[0];
    expect(header).toContain("Company");
    expect(header).toContain("Demo record");
    expect(header).not.toContain("Phone");
    expect(csv).toContain("Yes (synthetic)");
  });
});

test.describe("responsive layout", () => {
  test("on a phone the navigation moves into a drawer and the page does not scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/overview");
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Opportunities" }).click();
    await page.waitForURL("**/opportunities");
    await expect(page.getByRole("heading", { level: 1, name: "Opportunities" })).toBeVisible();
    for (const path of ["/overview", "/leads", "/settings"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});
