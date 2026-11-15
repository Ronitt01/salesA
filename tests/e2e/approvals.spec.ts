import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local", quiet: true });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Draft {
  id: string;
  conversation_id: string;
}

let tenantId: string;
let all: Draft[] = [];
let active: Draft[] = [];
let paused: Draft[] = [];

test.beforeAll(async () => {
  const workspace = await admin.from("workspaces").select("id").eq("slug", "demo-agency").single();
  if (workspace.error) throw workspace.error;
  tenantId = workspace.data.id;
  const pending = await admin
    .from("messages")
    .select("id, conversation_id, campaign_contacts(campaigns(status))")
    .eq("tenant_id", tenantId)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true });
  if (pending.error) throw pending.error;

  const statusOf = (row: (typeof pending.data)[number]) => {
    const enrolment = Array.isArray(row.campaign_contacts) ? row.campaign_contacts[0] : row.campaign_contacts;
    const campaign = enrolment ? (Array.isArray(enrolment.campaigns) ? enrolment.campaigns[0] : enrolment.campaigns) : null;
    return campaign?.status ?? null;
  };
  all = pending.data.map((r) => ({ id: r.id, conversation_id: r.conversation_id }));
  active = pending.data.filter((r) => statusOf(r) === "active").map((r) => ({ id: r.id, conversation_id: r.conversation_id }));
  paused = pending.data.filter((r) => statusOf(r) === "paused").map((r) => ({ id: r.id, conversation_id: r.conversation_id }));
  expect(active.length, "the demo dataset should contain at least 3 drafts in active campaigns").toBeGreaterThanOrEqual(3);
});

test.afterAll(async () => {
  // Put the demo workspace back exactly as it was.
  await admin.from("workspaces").update({ outbound_kill_switch: false }).eq("id", tenantId);
  await admin
    .from("messages")
    .update({ status: "pending_approval", approved_by: null, approved_at: null, gate_result: null, processing_history: [] })
    .in("id", all.map((d) => d.id));
});

const status = async (id: string) => (await admin.from("messages").select("status, sent_at, approved_by").eq("id", id).single()).data!;

test.describe("approval queue and compliance gate", () => {
  test("approving runs the gate and, with live sending off, records approval without sending", async ({ page }) => {
    const draft = active[0];
    await page.goto(`/conversations?view=approvals&c=${draft.conversation_id}`);
    await expect(page.getByText("Waiting for a person to approve. It has not been sent.")).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved by a person and cleared by the compliance gate. Not sent: live sending is switched off.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);

    await page.getByText("Compliance gate: all checks passed").click();
    await expect(page.getByText(/Passed: Kill switch/)).toBeVisible();
    await expect(page.getByText(/Passed: Not on the suppression list/)).toBeVisible();

    const after = await status(draft.id);
    expect(after.status).toBe("approved");
    expect(after.sent_at).toBeNull();
    expect(after.approved_by).not.toBeNull();
  });

  test("the kill switch blocks approval and the message stays unsent", async ({ page }) => {
    const draft = active[1];
    await admin.from("workspaces").update({ outbound_kill_switch: true }).eq("id", tenantId);

    await page.goto(`/conversations?view=approvals&c=${draft.conversation_id}`);
    await page.getByRole("button", { name: "Approve" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Blocked by the compliance gate" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("kill switch");
    expect((await status(draft.id)).status).toBe("pending_approval");

    // The header reports the stop as well.
    await page.reload();
    await page.getByRole("button", { name: /System status: Attention needed/ }).click();
    await expect(page.getByText("Stopped by kill switch")).toBeVisible();

    await admin.from("workspaces").update({ outbound_kill_switch: false }).eq("id", tenantId);
  });

  test("a draft in a paused campaign cannot be approved", async ({ page }) => {
    test.skip(paused.length === 0, "the demo dataset has no draft in a paused campaign");
    const draft = paused[0];
    await page.goto(`/conversations?view=approvals&c=${draft.conversation_id}`);
    await page.getByRole("button", { name: "Approve" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "Blocked by the compliance gate" });
    await expect(alert).toContainText("The campaign is paused, not active.");
    expect((await status(draft.id)).status).toBe("pending_approval");
  });

  test("a draft can be rejected with a reason and is never sent", async ({ page }) => {
    const draft = active[2];
    await page.goto(`/conversations?view=approvals&c=${draft.conversation_id}`);
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await page.getByRole("textbox", { name: "Reason for rejecting" }).fill("Tone is too pushy for a first message.");
    await page.getByRole("button", { name: "Reject draft" }).click();
    await expect(page.getByText("Rejected by a person. It was never sent.")).toBeVisible();

    const after = await status(draft.id);
    expect(after.status).toBe("rejected");
    expect(after.sent_at).toBeNull();
  });

  test("every decision is written to the audit log", async () => {
    const { data } = await admin
      .from("audit_logs")
      .select("action, entity_id")
      .eq("tenant_id", tenantId)
      .in("entity_id", active.slice(0, 3).map((d) => d.id));
    const byMessage = new Map((data ?? []).map((r) => [`${r.entity_id}:${r.action}`, true]));
    expect(byMessage.has(`${active[0].id}:message.approved`)).toBe(true);
    expect(byMessage.has(`${active[1].id}:message.approval_blocked`)).toBe(true);
    expect(byMessage.has(`${active[2].id}:message.rejected`)).toBe(true);
  });
});
