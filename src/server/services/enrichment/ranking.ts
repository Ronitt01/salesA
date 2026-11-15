import type { Database } from "@/server/db/database.types";

/**
 * Deterministic relevance ranking for discovered people.
 *
 * The priorities are search preferences, not evidence: a business that has no CTO
 * simply has no match for that rule. Ranking is configurable by passing a different
 * RankingConfig; the default reflects HUNTER's target buyers.
 */

export type ContactRole = Database["public"]["Enums"]["contact_role"];

export interface RolePriority {
  id: string;
  label: string;
  pattern: RegExp;
  weight: number;
  role: ContactRole;
}

export interface RankingConfig {
  priorities: RolePriority[];
  seniorityWeights: Record<string, number>;
  departmentWeights: Record<string, number>;
  decisionMakerBonus: number;
  /** Candidates below this score are not added as new contacts. */
  minRelevance: number;
}

const LEAD = String.raw`(?:head|director|vp|vice president|gm|general manager|chief)`;

export const DEFAULT_ROLE_PRIORITIES: RolePriority[] = [
  { id: "founder", label: "Founder", pattern: /\b(co-?)?founder\b/i, weight: 100, role: "owner_founder" },
  { id: "owner", label: "Owner", pattern: /\b(owner|proprietor)\b/i, weight: 95, role: "owner_founder" },
  { id: "ceo", label: "CEO", pattern: /\b(ceo|chief executive)\b/i, weight: 92, role: "director_cxo" },
  { id: "managing_director", label: "Managing Director", pattern: /\b(managing director|md)\b/i, weight: 90, role: "owner_founder" },
  {
    id: "operations_head",
    label: "Operations Head",
    pattern: new RegExp(String.raw`\b(coo|chief operating officer|${LEAD}\b[^,;]{0,20}\boperations?|operations?\s+(head|director|manager))\b`, "i"),
    weight: 80,
    role: "operations",
  },
  {
    id: "sales_head",
    label: "Head of Sales",
    pattern: new RegExp(String.raw`\b(chief (sales|revenue|commercial) officer|${LEAD}\b[^,;]{0,20}\bsales|sales\s+(head|director))\b`, "i"),
    weight: 75,
    role: "sales_marketing",
  },
  {
    id: "cto",
    label: "CTO",
    pattern: /\b(cto|cio|chief (technology|technical|information|digital) officer)\b/i,
    weight: 72,
    role: "it",
  },
  {
    id: "it_head",
    label: "IT Head",
    pattern: new RegExp(String.raw`\b(${LEAD}\b[^,;]{0,20}\b(it|technology|information technology)|it\s+(head|director|manager))\b`, "i"),
    weight: 70,
    role: "it",
  },
];

export const DEFAULT_RANKING: RankingConfig = {
  priorities: DEFAULT_ROLE_PRIORITIES,
  seniorityWeights: { executive: 30, senior: 15, junior: 0 },
  departmentWeights: { executive: 15, management: 10, operations: 8, sales: 6, it: 6, finance: 3 },
  decisionMakerBonus: 10,
  minRelevance: 30,
};

export interface RankablePerson {
  email: string;
  position: string | null;
  seniority: string | null;
  department: string | null;
  decisionMaker: boolean | null;
  confidence: number | null;
}

export interface Relevance {
  score: number;
  matchedPriority: string | null;
  role: ContactRole;
}

const DEPARTMENT_ROLE: Record<string, ContactRole> = {
  executive: "director_cxo",
  management: "director_cxo",
  operations: "operations",
  sales: "sales_marketing",
  marketing: "sales_marketing",
  it: "it",
  finance: "finance",
};

/** The best-matching priority rule for a position, if any. */
export function matchPriority(position: string | null, config: RankingConfig = DEFAULT_RANKING): RolePriority | null {
  if (!position) return null;
  let best: RolePriority | null = null;
  for (const rule of config.priorities) if (rule.pattern.test(position) && (!best || rule.weight > best.weight)) best = rule;
  return best;
}

export function classifyContactRole(position: string | null, department: string | null, seniority: string | null = null): ContactRole {
  const rule = matchPriority(position, DEFAULT_RANKING);
  if (rule) return rule.role;
  if (position && /\b(director|chief|head|president)\b/i.test(position)) return "director_cxo";
  if (department && DEPARTMENT_ROLE[department.toLowerCase()]) return DEPARTMENT_ROLE[department.toLowerCase()];
  if (seniority?.toLowerCase() === "executive") return "director_cxo";
  return "other";
}

export function relevance(person: RankablePerson, config: RankingConfig = DEFAULT_RANKING): Relevance {
  const rule = matchPriority(person.position, config);
  const score =
    (rule?.weight ?? 0) +
    (config.seniorityWeights[person.seniority?.toLowerCase() ?? ""] ?? 0) +
    (config.departmentWeights[person.department?.toLowerCase() ?? ""] ?? 0) +
    (person.decisionMaker ? config.decisionMakerBonus : 0);
  return { score, matchedPriority: rule?.id ?? null, role: classifyContactRole(person.position, person.department, person.seniority) };
}

/** Sorts by relevance, then confidence, then email, so the order is always the same. */
export function rankPeople<T extends RankablePerson>(people: T[], config: RankingConfig = DEFAULT_RANKING): Array<T & { relevance: Relevance }> {
  return people
    .map((p) => ({ ...p, relevance: relevance(p, config) }))
    .sort(
      (a, b) =>
        b.relevance.score - a.relevance.score || (b.confidence ?? -1) - (a.confidence ?? -1) || a.email.localeCompare(b.email),
    );
}
