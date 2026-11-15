import { cn } from "@/lib/utils";
import {
  EXECUTION_STATUS_LABEL,
  LEAD_STAGE_LABEL,
  MEETING_STATUS_LABEL,
  MESSAGE_STATUS_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  REPLY_INTENT_LABEL,
  VERIFICATION_LABEL,
} from "@/lib/labels";
import type { Database } from "@/server/db/database.types";

type Enums = Database["public"]["Enums"];
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "ai";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/25 bg-info/10 text-info",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-danger",
  ai: "border-ai/25 bg-ai/10 text-ai",
};

export function Pill({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STAGE_TONE: Record<Enums["lead_stage"], Tone> = {
  discovered: "neutral",
  researched: "neutral",
  verified: "info",
  qualified: "info",
  contacted: "info",
  positive_reply: "success",
  meeting: "success",
  proposal: "warning",
  customer: "success",
  nurture: "neutral",
  rejected: "danger",
};

export function StageBadge({ stage }: { stage: Enums["lead_stage"] }) {
  return <Pill tone={STAGE_TONE[stage]}>{LEAD_STAGE_LABEL[stage]}</Pill>;
}

const OPP_TONE: Record<Enums["opportunity_stage"], Tone> = {
  identified: "neutral",
  qualified: "info",
  meeting_scheduled: "info",
  proposal_sent: "warning",
  negotiation: "warning",
  won: "success",
  lost: "danger",
};

export function OpportunityStageBadge({ stage }: { stage: Enums["opportunity_stage"] }) {
  return <Pill tone={OPP_TONE[stage]}>{OPPORTUNITY_STAGE_LABEL[stage]}</Pill>;
}

/** Score with its priority band. The number is text; the band colours only the chip. */
export function ScoreBadge({ score, priority }: { score: number | null; priority: Enums["lead_priority"] | null }) {
  if (score === null) return <span className="text-xs text-subtle">Not scored</span>;
  const tone: Tone = priority === "A" ? "success" : priority === "B" ? "info" : "neutral";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular text-sm font-semibold">{score}</span>
      <Pill tone={tone}>{priority ?? "–"}</Pill>
    </span>
  );
}

const VERIFICATION_TONE: Record<Enums["verification_status"], Tone> = {
  valid: "success",
  catch_all: "warning",
  risky: "warning",
  unknown: "neutral",
  unverified: "neutral",
  invalid: "danger",
};

export function VerificationBadge({ status }: { status: Enums["verification_status"] }) {
  return <Pill tone={VERIFICATION_TONE[status]}>{VERIFICATION_LABEL[status]}</Pill>;
}

const INTENT_TONE: Record<Enums["reply_intent"], Tone> = {
  interested: "success",
  wants_meeting: "success",
  wants_pricing: "success",
  requests_information: "info",
  objection: "warning",
  not_interested: "neutral",
  unsubscribe: "danger",
  out_of_office: "neutral",
  complaint: "danger",
  human_review: "warning",
};

export function IntentBadge({ intent }: { intent: Enums["reply_intent"] }) {
  return <Pill tone={INTENT_TONE[intent]}>{REPLY_INTENT_LABEL[intent]}</Pill>;
}

const MEETING_TONE: Record<Enums["meeting_status"], Tone> = {
  proposed: "neutral",
  booked: "info",
  rescheduled: "info",
  cancelled: "danger",
  attended: "success",
  no_show: "warning",
};

export function MeetingStatusBadge({ status }: { status: Enums["meeting_status"] }) {
  return <Pill tone={MEETING_TONE[status]}>{MEETING_STATUS_LABEL[status]}</Pill>;
}

const MESSAGE_TONE: Record<Enums["message_status"], Tone> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "info",
  scheduled: "info",
  sent: "success",
  delivered: "success",
  bounced: "danger",
  failed: "danger",
  rejected: "danger",
  cancelled: "neutral",
  received: "info",
};

export function MessageStatusBadge({ status }: { status: Enums["message_status"] }) {
  return <Pill tone={MESSAGE_TONE[status]}>{MESSAGE_STATUS_LABEL[status]}</Pill>;
}

const EXECUTION_TONE: Record<Enums["execution_status"], Tone> = {
  queued: "neutral",
  running: "info",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
};

export function ExecutionStatusBadge({ status }: { status: Enums["execution_status"] }) {
  return <Pill tone={EXECUTION_TONE[status]}>{EXECUTION_STATUS_LABEL[status]}</Pill>;
}
