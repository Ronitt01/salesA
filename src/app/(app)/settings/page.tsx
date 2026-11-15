import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Pill } from "@/components/shared/badges";
import { PageHeader, Panel } from "@/components/shared/page-header";
import { DemoDataControls, IndustryManager, ServiceEditDialog, WorkspaceSettingsForm } from "@/components/settings/settings-forms";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { formatInrCompact } from "@/lib/format";
import { CHANNEL_LABEL, ROLE_LABEL } from "@/lib/labels";
import { getSessionContext, isAdmin } from "@/server/auth/context";

export const metadata: Metadata = { title: "Settings" };

const PROVIDER_LABEL: Record<string, string> = {
  llm: "AI model",
  search: "Web search",
  discovery: "Company discovery",
  website_research: "Website research",
  enrichment: "Contact enrichment",
  email_verification: "Email verification",
  email_delivery: "Email delivery",
  calendar: "Calendar",
  n8n: "Workflow engine",
};

async function Settings() {
  const ctx = await getSessionContext();
  const { supabase, tenantId, workspace } = ctx;
  const admin = isAdmin(ctx.role);

  const [industries, companies, services, policies, members, providers] = await Promise.all([
    supabase.from("industries").select("id, name, is_active, origin").eq("tenant_id", tenantId).order("name"),
    supabase.from("companies").select("industry_id").eq("tenant_id", tenantId).limit(5000),
    supabase.from("service_catalogue").select("*").eq("tenant_id", tenantId).order("name"),
    supabase.from("channel_policies").select("*").eq("tenant_id", tenantId).eq("country", workspace.country).order("channel"),
    supabase.from("memberships").select("id, role, users(full_name, email)").eq("tenant_id", tenantId).order("created_at"),
    supabase.from("provider_settings").select("category, provider, is_enabled").eq("tenant_id", tenantId).order("category"),
  ]);
  for (const r of [industries, companies, services, policies, members, providers]) {
    if (r.error) throw new Error(`Could not load settings: ${r.error.message}`);
  }

  const countByIndustry = new Map<string, number>();
  for (const c of companies.data ?? []) {
    if (c.industry_id) countByIndustry.set(c.industry_id, (countByIndustry.get(c.industry_id) ?? 0) + 1);
  }
  const live = process.env.OUTBOUND_LIVE_SENDING === "true";

  return (
    <>
      <PageHeader title="Settings" description={`${workspace.name} · ${workspace.country} · ${workspace.timezone} · ${workspace.currency}`} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Outreach and safety" description="How far automation may go, and the switch that stops it">
          <WorkspaceSettingsForm
            disabled={!admin}
            initial={{
              outreachMode: workspace.outreach_mode,
              killSwitch: workspace.outbound_kill_switch,
              dailySendLimit: String(workspace.daily_send_limit),
              dailyQualifiedTarget: String(workspace.daily_qualified_target),
              dataRetentionDays: String(workspace.data_retention_days),
            }}
          />
          <p className="mt-4 flex items-start gap-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
            {live ? <CircleAlert className="mt-px size-3.5 shrink-0 text-warning" /> : <CircleCheck className="mt-px size-3.5 shrink-0 text-success" />}
            {live
              ? "Live sending is enabled in the server environment. Messages that pass the compliance gate can leave the system."
              : "Live sending is off in the server environment (OUTBOUND_LIVE_SENDING=false). Approved messages are recorded but nothing leaves the system."}
          </p>
        </Panel>

        <Panel title="Industry catalogue" description="Industries HUNTER explores. Removing one keeps its history.">
          <IndustryManager
            disabled={!admin}
            industries={(industries.data ?? []).map((i) => ({ ...i, companies: countByIndustry.get(i.id) ?? 0 }))}
          />
        </Panel>

        <Panel className="xl:col-span-2" title="Service catalogue" description="What the agency sells. Matching, drafts and replies may only use what is recorded here." bodyClassName="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-y text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Service</th>
                  <th className="px-3 py-2 font-medium">Starting price range</th>
                  <th className="px-3 py-2 font-medium">Delivery</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(services.data ?? []).map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-md px-5 py-2.5">
                      <p className="font-medium">{s.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{s.description}</p>
                    </td>
                    <td className="tabular px-3 py-2.5 whitespace-nowrap">
                      {s.price_min_inr === null && s.price_max_inr === null
                        ? "Not set"
                        : `${formatInrCompact(s.price_min_inr)} – ${formatInrCompact(s.price_max_inr)}`}
                    </td>
                    <td className="tabular px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {s.delivery_weeks_min === null ? "Not set" : `${s.delivery_weeks_min}–${s.delivery_weeks_max ?? s.delivery_weeks_min} weeks`}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap gap-1.5">
                        <Pill tone={s.is_active ? "success" : "neutral"}>{s.is_active ? "Active" : "Inactive"}</Pill>
                        {s.needs_review ? <Pill tone="warning">Template values, review needed</Pill> : null}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {admin ? (
                        <ServiceEditDialog
                          initial={{
                            id: s.id,
                            name: s.name,
                            description: s.description,
                            idealCustomerProfile: s.ideal_customer_profile,
                            problemsSolved: s.problems_solved.join("\n"),
                            deliverables: s.deliverables.join("\n"),
                            priceMin: s.price_min_inr === null ? "" : String(s.price_min_inr),
                            priceMax: s.price_max_inr === null ? "" : String(s.price_max_inr),
                            weeksMin: s.delivery_weeks_min === null ? "" : String(s.delivery_weeks_min),
                            weeksMax: s.delivery_weeks_max === null ? "" : String(s.delivery_weeks_max),
                            implementationCost: s.est_implementation_cost_inr === null ? "" : String(s.est_implementation_cost_inr),
                            supportOptions: s.recurring_support_options.join("\n"),
                            isActive: s.is_active,
                            reviewed: !s.needs_review,
                          }}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="xl:col-span-2" title={`Channel policies · ${workspace.country}`} description="A channel with no policy row is blocked. These are operating rules, not legal advice; review them before live use." bodyClassName="px-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-y text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">Outbound</th>
                  <th className="px-3 py-2 font-medium">Automation</th>
                  <th className="px-3 py-2 font-medium">Requires</th>
                  <th className="px-3 py-2 text-right font-medium">Daily limit</th>
                  <th className="px-5 py-2 font-medium">Rule</th>
                </tr>
              </thead>
              <tbody>
                {(policies.data ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="px-5 py-2.5 font-medium whitespace-nowrap">{CHANNEL_LABEL[p.channel]}</td>
                    <td className="px-3 py-2.5">
                      <Pill tone={p.outbound_allowed ? "success" : "danger"}>{p.outbound_allowed ? "Allowed" : "Blocked"}</Pill>
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill tone={p.automation_allowed ? "info" : "neutral"}>{p.automation_allowed ? "Permitted" : "Human only"}</Pill>
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                      {[p.requires_consent ? "Recorded opt-in" : null, p.requires_inbound_initiation ? "Prospect contact first" : null]
                        .filter(Boolean)
                        .join(", ") || "Opt-out honoured"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">{p.daily_limit}</td>
                    <td className="px-5 py-2.5 text-xs leading-relaxed text-muted-foreground">{p.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Providers" description="Which integrations are live and which are mocks">
          <ul className="divide-y divide-border/60">
            {(providers.data ?? []).map((p) => {
              const mock = p.provider === "mock" || p.provider === "local_simulation";
              return (
                <li key={p.category} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="text-sm">{PROVIDER_LABEL[p.category] ?? p.category}</span>
                  <Pill tone={mock ? "warning" : "success"}>{mock ? (p.provider === "mock" ? "Mock provider" : "Local simulation") : p.provider}</Pill>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
            Mock providers return clearly labelled sample data and never contact an external service. API keys are read
            from server environment variables only and are never stored in the database or sent to the browser.
          </p>
        </Panel>

        <Panel title="Team" description="People with access to this workspace">
          <ul className="divide-y divide-border/60">
            {(members.data ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm">{m.users?.full_name ?? m.users?.email ?? "Unknown user"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.users?.email}</span>
                </span>
                <Pill tone={m.role === "owner" ? "info" : "neutral"}>{ROLE_LABEL[m.role]}</Pill>
              </li>
            ))}
          </ul>
        </Panel>

        {admin ? (
          <Panel className="xl:col-span-2" title="Demo data" description="Synthetic records for evaluation and training">
            <DemoDataControls hasDemoData={workspace.has_demo_data} demoMode={process.env.NEXT_PUBLIC_DEMO_MODE === "true"} />
          </Panel>
        ) : null}
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}
