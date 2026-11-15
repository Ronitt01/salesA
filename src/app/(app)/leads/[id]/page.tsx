import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  FileText,
  Lightbulb,
  Mail,
  MessagesSquare,
  Radar,
  ShieldCheck,
  StickyNote,
  Target,
  Users,
} from "lucide-react";
import { EditLeadDialog, NoteForm, RescoreButton } from "@/components/leads/lead-detail-actions";
import {
  IntentBadge,
  MeetingStatusBadge,
  MessageStatusBadge,
  OpportunityStageBadge,
  Pill,
  ScoreBadge,
  StageBadge,
  VerificationBadge,
} from "@/components/shared/badges";
import { DemoTag, EmptyState, Panel } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatInr, formatRelative } from "@/lib/format";
import {
  ACQUISITION_CHANNEL_LABEL,
  CONTACT_ROLE_LABEL,
  PRIORITY_LABEL,
  SIGNAL_TYPE_LABEL,
  SOURCE_KIND_LABEL,
} from "@/lib/labels";
import { canWrite, getSessionContext } from "@/server/auth/context";
import { getLeadDetail, getLeadFilterOptions } from "@/server/repositories/leads";

export const metadata: Metadata = { title: "Lead details" };

type Params = Promise<{ id: string }>;

const factorSchema = z.object({
  points: z.number(),
  max: z.number(),
  lines: z.array(z.object({ label: z.string(), points: z.number() })),
});
const explanationSchema = z.object({
  factors: z.object({
    icpFit: factorSchema,
    problemEvidence: factorSchema,
    decisionMakerAccess: factorSchema,
    commercialPotential: factorSchema,
    timingSignal: factorSchema,
    deliveryFit: factorSchema,
  }),
  contactReliability: z
    .object({ score: z.number(), blocked: z.boolean(), lines: z.array(z.object({ label: z.string(), points: z.number() })) })
    .nullable(),
});

const FACTOR_LABEL = {
  icpFit: "ICP fit",
  problemEvidence: "Evidence of relevant problems",
  decisionMakerAccess: "Decision-maker accessibility",
  commercialPotential: "Commercial potential",
  timingSignal: "Timing and recent signal",
  deliveryFit: "Delivery fit",
} as const;

/** Synthetic evidence points at reserved .example domains, so it is shown but not linked. */
function EvidenceLink({ url, isDemo }: { url: string; isDemo: boolean }) {
  if (isDemo) {
    return (
      <span className="font-mono text-[11px] break-all text-muted-foreground" title="Synthetic URL. It does not resolve.">
        {url}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 font-mono text-[11px] break-all text-info hover:underline"
    >
      {url}
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

async function LeadDetail({ params }: { params: Params }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const ctx = await getSessionContext();
  const [detail, options] = await Promise.all([getLeadDetail(ctx, id), getLeadFilterOptions(ctx)]);
  if (!detail) notFound();

  const now = new Date();
  const tz = ctx.workspace.timezone;
  const { company, contacts, research, signals, opportunities, snapshots, messages, meetings, activities } = detail;
  const writer = canWrite(ctx.role);

  const summary = research.find((r) => r.kind === "summary");
  const facts = research.filter((r) => r.kind === "observed_fact");
  const hypotheses = research.filter((r) => r.kind === "ai_hypothesis");
  const latest = snapshots[0] ?? null;
  const explanation = latest ? explanationSchema.safeParse(latest.explanations) : null;
  const breakdown = explanation?.success ? explanation.data : null;
  const outbound = messages.filter((m) => m.direction === "outbound");
  const inbound = messages.filter((m) => m.direction === "inbound");
  const liveSignals = signals.filter((s) => new Date(s.expires_at) > now && s.verification_status !== "rejected");
  const staleSignals = signals.filter((s) => !liveSignals.includes(s));
  const primary = contacts[0] ?? null;

  return (
    <>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Lead Explorer
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {company.name}
            {company.is_demo ? <DemoTag /> : null}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StageBadge stage={company.lead_stage} />
            <ScoreBadge score={company.opportunity_score} priority={company.priority} />
            {company.is_qualified ? (
              <Pill tone="success">Qualified</Pill>
            ) : company.opportunity_score !== null ? (
              <Pill>Not qualified</Pill>
            ) : null}
            <span>{company.industries?.name ?? "Industry not set"}</span>
            <span>·</span>
            <span>{[company.city, company.state].filter(Boolean).join(", ") || "Location not set"}</span>
          </div>
        </div>
        {writer ? (
          <div className="flex items-center gap-2">
            <RescoreButton companyId={company.id} />
            <EditLeadDialog
              industries={options.industries}
              initial={{
                id: company.id,
                name: company.name,
                industryId: company.industry_id ?? "",
                city: company.city ?? "",
                state: company.state ?? "",
                employeeRange: company.employee_range ?? "",
                branchCount: company.branch_count === null ? "" : String(company.branch_count),
                description: company.description ?? "",
                stage: "",
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="Company overview">
            {summary ? <p className="mb-4 text-sm leading-relaxed">{summary.statement}</p> : null}
            {company.description && !summary ? <p className="mb-4 text-sm leading-relaxed">{company.description}</p> : null}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
              <Field label="Website">
                {company.website_url ? <EvidenceLink url={company.website_url} isDemo={company.is_demo} /> : "Not identified"}
              </Field>
              <Field label="Industry">{company.industries?.name ?? "Not set"}</Field>
              <Field label="Employee range">
                {company.employee_range ?? "Unknown"}
                {company.employee_count_estimate ? (
                  <span className="text-muted-foreground"> (about {company.employee_count_estimate})</span>
                ) : null}
              </Field>
              <Field label="Location">{[company.city, company.state, company.country].filter(Boolean).join(", ")}</Field>
              <Field label="Locations">{company.branch_count ?? "Unknown"}</Field>
              <Field label="Acquisition channel">{ACQUISITION_CHANNEL_LABEL[company.acquisition_channel]}</Field>
              <Field label="Discovered">{formatDate(company.discovered_at, tz)}</Field>
              <Field label="Last researched">
                {company.last_researched_at ? formatDate(company.last_researched_at, tz) : "Never"}
              </Field>
              <Field label="Source">
                {company.sources ? (
                  <>
                    {SOURCE_KIND_LABEL[company.sources.kind]}
                    <span className="block text-xs text-muted-foreground">{company.sources.label}</span>
                  </>
                ) : (
                  "Not recorded"
                )}
              </Field>
            </dl>
            {company.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {company.tags.map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel
            title="Research"
            description="Observed facts carry evidence. Hypotheses are assumptions to validate, and are kept separate."
          >
            {facts.length === 0 && hypotheses.length === 0 ? (
              <EmptyState icon={FileText} title="Not researched yet" description="Website research records facts with evidence URLs here." className="py-8" />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wider text-success uppercase">
                    <CircleCheck className="size-3.5" />
                    Verified facts ({facts.length})
                  </h3>
                  {facts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No observed facts recorded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {facts.map((fact) => (
                        <li key={fact.id} className="rounded-lg border border-success/20 bg-success/5 p-3">
                          <p className="text-sm leading-relaxed">{fact.statement}</p>
                          {fact.evidence_quote ? (
                            <p className="mt-1.5 border-l-2 border-border pl-2 text-xs text-muted-foreground italic">
                              {fact.evidence_quote}
                            </p>
                          ) : null}
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>Evidence:</span>
                            {fact.evidence_url ? <EvidenceLink url={fact.evidence_url} isDemo={fact.is_demo} /> : "missing"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wider text-ai uppercase">
                    <Lightbulb className="size-3.5" />
                    AI hypotheses ({hypotheses.length})
                  </h3>
                  {hypotheses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hypotheses generated.</p>
                  ) : (
                    <ul className="space-y-2">
                      {hypotheses.map((h) => (
                        <li key={h.id} className="rounded-lg border border-dashed border-ai/30 bg-ai/5 p-3">
                          <p className="text-sm leading-relaxed">{h.statement}</p>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Assumption, not an observed fact. Validate with the prospect before relying on it.
                            {h.model ? ` Generated by: ${h.model}.` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Buying signals" description="A signal suggests timing. It is never treated as proof of purchasing intent.">
            {signals.length === 0 ? (
              <EmptyState icon={Radar} title="No signals recorded" description="Signals are detected during research and expire when they go stale." className="py-8" />
            ) : (
              <ul className="space-y-2">
                {[...liveSignals, ...staleSignals].map((signal) => {
                  const live = liveSignals.includes(signal);
                  return (
                    <li key={signal.id} className={cn("rounded-lg border p-3", !live && "opacity-60")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={live ? "info" : "neutral"}>{SIGNAL_TYPE_LABEL[signal.signal_type]}</Pill>
                        {signal.verification_status === "verified" ? <Pill tone="success">Verified</Pill> : null}
                        {signal.verification_status === "rejected" ? <Pill tone="danger">Rejected</Pill> : null}
                        {!live && signal.verification_status !== "rejected" ? <Pill>Expired</Pill> : null}
                        <span className="text-xs text-muted-foreground">
                          Observed {formatDate(signal.observed_at, tz)} · {Math.round(Number(signal.confidence) * 100)}% confidence ·{" "}
                          {live ? `expires ${formatDate(signal.expires_at, tz)}` : `expired ${formatDate(signal.expires_at, tz)}`}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm">{signal.evidence_summary}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>Evidence:</span>
                        <EvidenceLink url={signal.source_url} isDemo={signal.is_demo} />
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Opportunities" description="Hypotheses about fit. No savings, ROI or delivery dates are promised.">
            {opportunities.length === 0 ? (
              <EmptyState icon={Target} title="No opportunity identified" description="Service matching creates an opportunity once research finds an evidenced problem." className="py-8" />
            ) : (
              <ul className="space-y-3">
                {opportunities.map((opp) => (
                  <li key={opp.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{opp.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Recommended solution: {opp.service_catalogue?.name ?? "not matched"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular text-sm font-medium">{formatInr(opp.estimated_value_inr)}</span>
                        <OpportunityStageBadge stage={opp.stage} />
                      </div>
                    </div>
                    <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                      {opp.observed_facts.length > 0 ? (
                        <div className="md:col-span-2">
                          <dt className="text-xs text-success">Observed facts</dt>
                          <dd>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4">
                              {opp.observed_facts.map((f) => (
                                <li key={f}>{f}</li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ) : null}
                      {opp.problem_hypothesis ? (
                        <div>
                          <dt className="text-xs text-ai">Possible operational problem (hypothesis)</dt>
                          <dd className="mt-1">{opp.problem_hypothesis}</dd>
                        </div>
                      ) : null}
                      {opp.relevance_rationale ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Why this solution is relevant</dt>
                          <dd className="mt-1">{opp.relevance_rationale}</dd>
                        </div>
                      ) : null}
                      {opp.possible_impact ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Possible business impact</dt>
                          <dd className="mt-1">{opp.possible_impact}</dd>
                        </div>
                      ) : null}
                      {opp.outreach_angle ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Suggested outreach angle</dt>
                          <dd className="mt-1">{opp.outreach_angle}</dd>
                        </div>
                      ) : null}
                      {opp.validation_questions.length > 0 ? (
                        <div className="md:col-span-2">
                          <dt className="text-xs text-muted-foreground">Questions to validate the problem</dt>
                          <dd>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4">
                              {opp.validation_questions.map((q) => (
                                <li key={q}>{q}</li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Outreach history" description={`${outbound.length} outbound message${outbound.length === 1 ? "" : "s"}`}>
              {outbound.length === 0 ? (
                <EmptyState icon={Mail} title="No outreach yet" description="Drafts and sent messages appear here." className="py-6" />
              ) : (
                <ul className="space-y-2">
                  {outbound.map((m) => (
                    <li key={m.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{m.subject ?? "(no subject)"}</span>
                        <MessageStatusBadge status={m.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        To {m.contacts?.full_name ?? "contact"} · {m.sent_at ? `sent ${formatDateTime(m.sent_at, tz)}` : `drafted ${formatDateTime(m.created_at, tz)}`}
                        {m.sequence_step !== null ? ` · step ${m.sequence_step + 1}` : ""}
                      </p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-info">Show message</summary>
                        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{m.body}</p>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Reply history" description={`${inbound.length} repl${inbound.length === 1 ? "y" : "ies"} received`}>
              {inbound.length === 0 ? (
                <EmptyState icon={MessagesSquare} title="No replies yet" description="Replies are stored with their intent classification." className="py-6" />
              ) : (
                <ul className="space-y-2">
                  {inbound.map((m) => (
                    <li key={m.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{m.contacts?.full_name ?? "Contact"}</span>
                        {m.intent ? <IntentBadge intent={m.intent} /> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Received {formatDateTime(m.received_at, tz)}
                        {m.intent_confidence !== null ? ` · classification confidence ${Math.round(Number(m.intent_confidence) * 100)}%` : ""}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel title="Meeting history" description="Booked and attended are recorded separately.">
            {meetings.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No meetings" description="A meeting is only booked after the prospect selects a slot." className="py-6" />
            ) : (
              <ul className="divide-y divide-border/60">
                {meetings.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{m.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(m.starts_at, tz)} with {m.contacts?.full_name ?? "contact"}
                        {m.booked_at ? ` · booked ${formatDate(m.booked_at, tz)}` : " · no slot chosen yet"}
                        {m.attended_at ? ` · attended ${formatDate(m.attended_at, tz)}` : ""}
                      </p>
                      {m.outcome_notes ? <p className="mt-1 text-xs text-muted-foreground">{m.outcome_notes}</p> : null}
                    </div>
                    <MeetingStatusBadge status={m.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Notes and activity">
            {writer ? (
              <div className="mb-4">
                <NoteForm companyId={company.id} />
              </div>
            ) : null}
            {activities.length === 0 ? (
              <EmptyState icon={StickyNote} title="No activity yet" description="Notes, stage changes and system events are listed here." className="py-6" />
            ) : (
              <ol className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        a.type === "note" ? "bg-warning" : a.actor_type === "user" ? "bg-info" : "bg-subtle",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{a.type === "note" ? a.body : a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.actor_type === "user" ? (a.users?.full_name ?? a.users?.email ?? "A team member") : a.actor_type === "ai" ? "AI" : "System"}{" "}
                        · {formatDateTime(a.occurred_at, tz)} · {formatRelative(a.occurred_at, now)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel
            title="Lead score breakdown"
            description={latest ? `Engine ${latest.engine_version} · computed ${formatDateTime(latest.computed_at, tz)}` : "Not scored yet"}
          >
            {!latest ? (
              <EmptyState icon={Target} title="Not scored" description="A score is computed once research exists. It always comes from the deterministic engine." className="py-6" />
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <p className="text-4xl leading-none font-semibold">
                    {latest.total_score}
                    <span className="text-base font-normal text-muted-foreground"> / 100</span>
                  </p>
                  <Pill tone={latest.priority === "A" ? "success" : latest.priority === "B" ? "info" : "neutral"}>
                    {PRIORITY_LABEL[latest.priority]}
                  </Pill>
                </div>

                {latest.is_qualified ? (
                  <p className="mt-3 flex items-start gap-2 rounded-lg border border-success/25 bg-success/10 p-2.5 text-xs text-success">
                    <CircleCheck className="mt-px size-3.5 shrink-0" />
                    Qualified: the score, evidence and contact-quality rules are all met.
                  </p>
                ) : (
                  <div className="mt-3 rounded-lg border border-warning/25 bg-warning/10 p-2.5 text-xs text-warning">
                    <p className="flex items-center gap-2 font-medium">
                      <CircleAlert className="size-3.5 shrink-0" />
                      Not qualified
                    </p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                      {latest.disqualification_reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {breakdown ? (
                  <ul className="mt-4 space-y-3">
                    {(Object.keys(FACTOR_LABEL) as Array<keyof typeof FACTOR_LABEL>).map((key) => {
                      const factor = breakdown.factors[key];
                      return (
                        <li key={key}>
                          <details className="group">
                            <summary className="cursor-pointer list-none">
                              <span className="flex items-center justify-between text-sm">
                                <span>{FACTOR_LABEL[key]}</span>
                                <span className="tabular font-medium">
                                  {factor.points}
                                  <span className="font-normal text-muted-foreground"> / {factor.max}</span>
                                </span>
                              </span>
                              {/* Meter: the track is a lighter step of the fill's own hue. */}
                              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-info/15">
                                <span className="block h-full rounded-full bg-info" style={{ width: `${(factor.points / factor.max) * 100}%` }} />
                              </span>
                              <span className="mt-1 block text-[11px] text-info group-open:hidden">Why this score</span>
                            </summary>
                            <ul className="mt-2 space-y-1 border-l pl-3">
                              {factor.lines.map((line) => (
                                <li key={line.label} className="flex justify-between gap-3 text-xs text-muted-foreground">
                                  <span>{line.label}</span>
                                  <span className="tabular shrink-0">+{line.points}</span>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">The factor explanation for this snapshot is not available.</p>
                )}

                {snapshots.length > 1 ? (
                  <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    Previous scores: {snapshots.slice(1).map((s) => `${s.total_score} (${formatDate(s.computed_at, tz)})`).join(", ")}
                  </p>
                ) : null}
              </>
            )}
          </Panel>

          <Panel title="Decision-maker and contacts" description={`${contacts.length} contact${contacts.length === 1 ? "" : "s"} on record`}>
            {contacts.length === 0 ? (
              <EmptyState icon={Users} title="No contact identified" description="A lead cannot qualify without a reliable, verified contact." className="py-6" />
            ) : (
              <ul className="space-y-3">
                {contacts.map((c) => (
                  <li key={c.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {c.full_name} {c.is_primary ? <Pill tone="info" className="ml-1">Primary</Pill> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.job_title ?? "Title unknown"} · {CONTACT_ROLE_LABEL[c.role_category]}
                        </p>
                      </div>
                      <VerificationBadge status={c.verification_status} />
                    </div>
                    {c.do_not_contact ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-danger">
                        <CircleAlert className="size-3.5" />
                        Do not contact. This person cannot be enrolled in any campaign.
                      </p>
                    ) : null}
                    <dl className="mt-2 space-y-1 text-xs">
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">Email</dt>
                        <dd className="break-all">{c.email ?? "–"}</dd>
                      </div>
                      {c.phone ? (
                        <div className="flex gap-2">
                          <dt className="w-24 shrink-0 text-muted-foreground">Phone</dt>
                          <dd>{c.phone}</dd>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">Reliability</dt>
                        <dd>{c.reliability_score === null ? "Not scored" : `${c.reliability_score} / 100`}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 shrink-0 text-muted-foreground">Provenance</dt>
                        <dd>
                          {c.sources ? `${SOURCE_KIND_LABEL[c.sources.kind]}: ${c.sources.label}` : "Source not recorded"}
                          {c.provenance_note ? <span className="block text-muted-foreground">{c.provenance_note}</span> : null}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-2 border-t pt-2">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck className="size-3.5" />
                        Verification history
                      </p>
                      {c.contact_verifications.length === 0 ? (
                        <p className="mt-1 text-xs text-subtle">Never verified.</p>
                      ) : (
                        <ul className="mt-1 space-y-0.5">
                          {c.contact_verifications.map((v) => (
                            <li key={v.id} className="flex justify-between gap-2 text-xs text-muted-foreground">
                              <span>
                                {formatDate(v.checked_at, tz)} · {v.provider}
                              </span>
                              <span>{v.result.replace("_", " ")}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {primary && breakdown?.contactReliability ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-info">How the primary contact&apos;s reliability was scored</summary>
                <ul className="mt-2 space-y-1 border-l pl-3">
                  {breakdown.contactReliability.lines.map((line) => (
                    <li key={line.label} className="flex justify-between gap-3 text-muted-foreground">
                      <span>{line.label}</span>
                      <span className="tabular shrink-0">+{line.points}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Panel>
        </div>
      </div>
    </>
  );
}

export default function LeadDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LeadDetail params={params} />
    </Suspense>
  );
}
