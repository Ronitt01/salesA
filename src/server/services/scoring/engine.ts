/**
 * Deterministic lead qualification engine.
 *
 * Pure functions only: the same input always produces the same output, with no clock,
 * randomness, network or model call. `now` is always passed in explicitly.
 *
 * A model can supply research, but it cannot set a score. Scores come only from here.
 */

export const SCORING_ENGINE_VERSION = "1.0.0";

export const SCORE_WEIGHTS = {
  icpFit: 30,
  problemEvidence: 25,
  decisionMakerAccess: 15,
  commercialPotential: 15,
  timingSignal: 10,
  deliveryFit: 5,
} as const;

export const PRIORITY_THRESHOLDS = { A: 80, B: 65 } as const;

/** Minimum evidence and contact quality before a lead may count as qualified. */
export const QUALIFICATION_RULES = {
  minObservedFacts: 2,
  minActiveSignals: 1,
  minContactReliability: 60,
} as const;

export type EmployeeRange = "1-9" | "10-49" | "50-99" | "100-200" | "201-500" | "500+";
export type ContactRole =
  | "owner_founder"
  | "director_cxo"
  | "operations"
  | "sales_marketing"
  | "it"
  | "finance"
  | "other";
export type VerificationStatus = "unverified" | "valid" | "risky" | "catch_all" | "invalid" | "unknown";
export type SourceKind =
  | "search_provider"
  | "website"
  | "directory"
  | "referral"
  | "inbound_form"
  | "manual"
  | "import"
  | "event"
  | "partner"
  | "demo_seed";
export type Priority = "A" | "B" | "C";

export interface SignalInput {
  observedAt: string;
  expiresAt: string;
  verification: "unverified" | "verified" | "rejected";
}

export interface ContactInput {
  role: ContactRole;
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string | null;
  sourceKind: SourceKind | null;
  email: string | null;
  hasPhone: boolean;
  suppressed: boolean;
  doNotContact: boolean;
}

export interface ScoringInput {
  targetCountry: string;
  company: {
    country: string;
    domain: string | null;
    employeeRange: EmployeeRange | null;
    branchCount: number | null;
    /** True when the company's industry is in the active catalogue. */
    industryInCatalogue: boolean;
  };
  /** Observed facts that carry an evidence URL. Hypotheses never count. */
  observedFactCount: number;
  signals: SignalInput[];
  /** The contact outreach would go to, if any. */
  contact: ContactInput | null;
  /** How many contacts are on record for the company. */
  contactCount: number;
  opportunity: {
    /** True when a recommended service exists and is active in the catalogue. */
    hasActiveServiceMatch: boolean;
    estimatedValueInr: number | null;
  } | null;
}

export interface FactorLine {
  label: string;
  points: number;
}

export interface FactorResult {
  points: number;
  max: number;
  lines: FactorLine[];
}

export interface ContactReliabilityResult {
  score: number;
  lines: FactorLine[];
  blocked: boolean;
}

export interface ScoreResult {
  engineVersion: string;
  total: number;
  priority: Priority;
  isQualified: boolean;
  disqualificationReasons: string[];
  factors: {
    icpFit: FactorResult;
    problemEvidence: FactorResult;
    decisionMakerAccess: FactorResult;
    commercialPotential: FactorResult;
    timingSignal: FactorResult;
    deliveryFit: FactorResult;
  };
  contactReliability: ContactReliabilityResult | null;
  activeSignalCount: number;
}

const DAY_MS = 86_400_000;
const ICP_RANGES: readonly EmployeeRange[] = ["10-49", "50-99", "100-200"];
const SENIOR_ROLES: readonly ContactRole[] = ["owner_founder", "director_cxo"];
const FUNCTIONAL_ROLES: readonly ContactRole[] = ["operations", "sales_marketing", "it", "finance"];

function factor(max: number, lines: FactorLine[]): FactorResult {
  const raw = lines.reduce((sum, line) => sum + line.points, 0);
  return { points: Math.max(0, Math.min(max, raw)), max, lines };
}

function daysBetween(fromIso: string, to: Date): number {
  return (to.getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

/** Signals that are neither expired nor rejected at `now`. */
export function activeSignals(signals: SignalInput[], now: Date): SignalInput[] {
  return signals.filter(
    (s) => s.verification !== "rejected" && new Date(s.expiresAt).getTime() > now.getTime(),
  );
}

function emailDomain(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at === -1 ? null : email.slice(at + 1).trim().toLowerCase();
}

export function normaliseDomain(domain: string | null): string | null {
  if (!domain) return null;
  const cleaned = domain
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.)?/, "")
    .replace(/[/?#].*$/, "");
  return cleaned.length > 0 ? cleaned : null;
}

export function scoreContactReliability(
  contact: ContactInput,
  companyDomain: string | null,
  now: Date,
): ContactReliabilityResult {
  if (contact.suppressed || contact.doNotContact) {
    return {
      score: 0,
      blocked: true,
      lines: [
        {
          label: contact.suppressed
            ? "Address is on the suppression list"
            : "Contact is marked do-not-contact",
          points: 0,
        },
      ],
    };
  }

  const lines: FactorLine[] = [];

  const sourcePoints: Record<SourceKind, number> = {
    inbound_form: 25,
    referral: 25,
    partner: 22,
    event: 20,
    website: 20,
    manual: 15,
    directory: 12,
    search_provider: 10,
    import: 10,
    demo_seed: 10,
  };
  lines.push(
    contact.sourceKind
      ? { label: `Contact source: ${contact.sourceKind.replace("_", " ")}`, points: sourcePoints[contact.sourceKind] }
      : { label: "Contact source not recorded", points: 0 },
  );

  const verificationPoints: Record<VerificationStatus, number> = {
    valid: 35,
    catch_all: 18,
    risky: 12,
    unknown: 8,
    unverified: 5,
    invalid: 0,
  };
  lines.push({
    label: `Verification result: ${contact.verificationStatus.replace("_", " ")}`,
    points: verificationPoints[contact.verificationStatus],
  });

  const contactDomain = emailDomain(contact.email);
  const company = normaliseDomain(companyDomain);
  if (!contactDomain) {
    lines.push({ label: "No email address on record", points: 0 });
  } else if (company && (contactDomain === company || contactDomain.endsWith(`.${company}`))) {
    lines.push({ label: "Email domain matches company domain", points: 15 });
  } else if (!company) {
    lines.push({ label: "Company domain unknown, match not checked", points: 5 });
  } else {
    lines.push({ label: "Email domain differs from company domain", points: 3 });
  }

  lines.push(
    SENIOR_ROLES.includes(contact.role)
      ? { label: "Owner or director-level role", points: 15 }
      : FUNCTIONAL_ROLES.includes(contact.role)
        ? { label: "Relevant functional role", points: 10 }
        : { label: "Role relevance unclear", points: 4 },
  );

  if (!contact.lastVerifiedAt) {
    lines.push({ label: "Never verified", points: 0 });
  } else {
    const age = daysBetween(contact.lastVerifiedAt, now);
    lines.push(
      age <= 30
        ? { label: "Verified within 30 days", points: 10 }
        : age <= 90
          ? { label: "Verified within 90 days", points: 7 }
          : age <= 180
            ? { label: "Verified within 180 days", points: 4 }
            : { label: "Verification older than 180 days", points: 0 },
    );
  }

  const score = Math.max(0, Math.min(100, lines.reduce((sum, l) => sum + l.points, 0)));
  return { score, lines, blocked: false };
}

export function priorityFor(total: number): Priority {
  if (total >= PRIORITY_THRESHOLDS.A) return "A";
  if (total >= PRIORITY_THRESHOLDS.B) return "B";
  return "C";
}

export function scoreLead(input: ScoringInput, now: Date): ScoreResult {
  const { company, contact, opportunity } = input;
  const live = activeSignals(input.signals, now);
  const factCount = Math.max(0, Math.floor(input.observedFactCount));

  // --- ICP fit (30) -------------------------------------------------------
  const sizePoints: Record<EmployeeRange, number> = {
    "1-9": 3,
    "10-49": 14,
    "50-99": 14,
    "100-200": 14,
    "201-500": 6,
    "500+": 2,
  };
  const icpFit = factor(SCORE_WEIGHTS.icpFit, [
    company.country === input.targetCountry
      ? { label: `Located in target country (${input.targetCountry})`, points: 8 }
      : { label: "Outside the target country", points: 0 },
    company.employeeRange
      ? {
          label: ICP_RANGES.includes(company.employeeRange)
            ? `Employee range ${company.employeeRange} is inside the 10–200 target`
            : `Employee range ${company.employeeRange} is outside the 10–200 target`,
          points: sizePoints[company.employeeRange],
        }
      : { label: "Employee range unknown", points: 4 },
    company.industryInCatalogue
      ? { label: "Industry is in the active catalogue", points: 4 }
      : { label: "Industry is not in the active catalogue", points: 0 },
    normaliseDomain(company.domain)
      ? { label: "Company website identified", points: 4 }
      : { label: "No company website identified", points: 0 },
  ]);

  // --- Evidence of relevant problems (25) ---------------------------------
  const problemEvidence = factor(SCORE_WEIGHTS.problemEvidence, [
    {
      label: `${factCount} observed fact${factCount === 1 ? "" : "s"} with evidence (3 each, up to 4)`,
      points: Math.min(factCount, 4) * 3,
    },
    {
      label: `${live.length} live buying signal${live.length === 1 ? "" : "s"} (3 each, up to 3)`,
      points: Math.min(live.length, 3) * 3,
    },
    opportunity?.hasActiveServiceMatch && factCount > 0
      ? { label: "An evidenced problem maps to a catalogue service", points: 4 }
      : { label: "No evidenced problem mapped to a service yet", points: 0 },
  ]);

  // --- Decision-maker accessibility (15) ----------------------------------
  const dmLines: FactorLine[] = [];
  if (!contact) {
    dmLines.push({ label: "No contact identified", points: 0 });
  } else {
    dmLines.push(
      SENIOR_ROLES.includes(contact.role)
        ? { label: "Contact is an owner or director", points: 8 }
        : FUNCTIONAL_ROLES.includes(contact.role)
          ? { label: "Contact leads a relevant function", points: 5 }
          : { label: "Contact role is not a clear decision-maker", points: 2 },
    );
    dmLines.push(
      contact.verificationStatus === "valid"
        ? { label: "Email verified as valid", points: 5 }
        : contact.verificationStatus === "catch_all" || contact.verificationStatus === "risky"
          ? { label: "Email only partly verifiable", points: 2 }
          : { label: "Email not verified", points: 0 },
    );
    dmLines.push(
      contact.hasPhone || input.contactCount > 1
        ? { label: "A second route to the company exists", points: 2 }
        : { label: "Single route to the company", points: 0 },
    );
  }
  const decisionMakerAccess = factor(SCORE_WEIGHTS.decisionMakerAccess, dmLines);

  // --- Commercial potential (15) ------------------------------------------
  const budgetProxy: Record<EmployeeRange, number> = {
    "1-9": 1,
    "10-49": 4,
    "50-99": 6,
    "100-200": 7,
    "201-500": 7,
    "500+": 7,
  };
  const branches = company.branchCount ?? 0;
  const value = opportunity?.estimatedValueInr ?? 0;
  const commercialPotential = factor(SCORE_WEIGHTS.commercialPotential, [
    company.employeeRange
      ? { label: `Team size ${company.employeeRange} as a budget proxy`, points: budgetProxy[company.employeeRange] }
      : { label: "Team size unknown", points: 2 },
    branches >= 3
      ? { label: `${branches} locations`, points: 3 }
      : branches === 2
        ? { label: "2 locations", points: 2 }
        : { label: "Single or unknown location count", points: 0 },
    value >= 500_000
      ? { label: "Estimated engagement of ₹5 lakh or more", points: 5 }
      : value >= 200_000
        ? { label: "Estimated engagement of ₹2–5 lakh", points: 3 }
        : value > 0
          ? { label: "Estimated engagement under ₹2 lakh", points: 2 }
          : { label: "No engagement estimate yet", points: 0 },
  ]);

  // --- Timing and recent signal (10) --------------------------------------
  const timingLines: FactorLine[] = [];
  if (live.length === 0) {
    timingLines.push({ label: "No live buying signal", points: 0 });
  } else {
    const freshest = Math.min(...live.map((s) => daysBetween(s.observedAt, now)));
    timingLines.push(
      freshest <= 30
        ? { label: "Freshest signal observed within 30 days", points: 6 }
        : freshest <= 60
          ? { label: "Freshest signal observed within 60 days", points: 4 }
          : { label: "Freshest signal is older than 60 days", points: 2 },
    );
    timingLines.push(
      live.some((s) => s.verification === "verified")
        ? { label: "At least one signal has been verified", points: 2 }
        : { label: "No signal verified by a person yet", points: 0 },
    );
    timingLines.push(
      live.length >= 2
        ? { label: "Multiple independent signals", points: 2 }
        : { label: "Single signal", points: 0 },
    );
  }
  const timingSignal = factor(SCORE_WEIGHTS.timingSignal, timingLines);

  // --- Delivery fit (5) ----------------------------------------------------
  const deliveryFit = factor(SCORE_WEIGHTS.deliveryFit, [
    opportunity?.hasActiveServiceMatch
      ? { label: "Need maps to a service we deliver", points: 3 }
      : { label: "No matching service identified", points: 0 },
    company.country === input.targetCountry
      ? { label: "Same country and working hours", points: 2 }
      : { label: "Different country", points: 0 },
  ]);

  const total =
    icpFit.points +
    problemEvidence.points +
    decisionMakerAccess.points +
    commercialPotential.points +
    timingSignal.points +
    deliveryFit.points;

  const contactReliability = contact ? scoreContactReliability(contact, company.domain, now) : null;
  const priority = priorityFor(total);

  // --- Qualification gate ---------------------------------------------------
  // A high score alone never qualifies a lead.
  const reasons: string[] = [];
  if (total < PRIORITY_THRESHOLDS.B) {
    reasons.push(`Score ${total} is below the qualification threshold of ${PRIORITY_THRESHOLDS.B}`);
  }
  if (factCount < QUALIFICATION_RULES.minObservedFacts) {
    reasons.push(
      `Only ${factCount} observed fact${factCount === 1 ? "" : "s"} with evidence; ${QUALIFICATION_RULES.minObservedFacts} required`,
    );
  }
  if (live.length < QUALIFICATION_RULES.minActiveSignals) {
    reasons.push("No live buying signal");
  }
  if (!company.employeeRange) {
    reasons.push("Employee range unknown");
  } else if (company.employeeRange === "1-9" || company.employeeRange === "500+") {
    reasons.push(`Employee range ${company.employeeRange} is outside the target market`);
  }
  if (!contact || !contactReliability) {
    reasons.push("No contact identified");
  } else if (contactReliability.blocked) {
    reasons.push("Contact is suppressed or marked do-not-contact");
  } else {
    if (contact.verificationStatus === "invalid" || contact.verificationStatus === "unverified") {
      reasons.push(`Contact email is ${contact.verificationStatus}`);
    }
    if (contactReliability.score < QUALIFICATION_RULES.minContactReliability) {
      reasons.push(
        `Contact reliability ${contactReliability.score} is below ${QUALIFICATION_RULES.minContactReliability}`,
      );
    }
  }

  return {
    engineVersion: SCORING_ENGINE_VERSION,
    total,
    priority,
    isQualified: reasons.length === 0,
    disqualificationReasons: reasons,
    factors: {
      icpFit,
      problemEvidence,
      decisionMakerAccess,
      commercialPotential,
      timingSignal,
      deliveryFit,
    },
    contactReliability,
    activeSignalCount: live.length,
  };
}
