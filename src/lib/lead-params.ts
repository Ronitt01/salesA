/**
 * URL parameter helpers for the Lead Explorer. Pure and shared by server and client,
 * so links, saved filters and exports all describe a view the same way.
 */

export type LeadParams = Record<string, string>;

const DEFAULTS: LeadParams = { sort: "opportunity_score", dir: "desc", page: "1", per: "25" };

/** Parameters that narrow results, as opposed to ordering or paging them. */
export const FILTER_KEYS = [
  "q",
  "industry",
  "state",
  "employees",
  "score_min",
  "score_max",
  "signal",
  "service",
  "stage",
  "verification",
  "source",
  "researched",
  "qualified",
  "tag",
] as const;

/** Turns parsed filters into a minimal parameter record, dropping empties and defaults. */
export function toLeadParams(filters: Record<string, unknown>): LeadParams {
  const out: LeadParams = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    const text = Array.isArray(value) ? value.join(",") : String(value);
    if (text === "" || DEFAULTS[key] === text) continue;
    out[key] = text;
  }
  return out;
}

export function leadHref(params: LeadParams, changes: Record<string, string | null> = {}, basePath = "/leads"): string {
  const next: LeadParams = { ...params };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "" || DEFAULTS[key] === value) delete next[key];
    else next[key] = value;
  }
  const query = new URLSearchParams(next).toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function onlyFilters(params: LeadParams): LeadParams {
  return Object.fromEntries(Object.entries(params).filter(([key]) => (FILTER_KEYS as readonly string[]).includes(key)));
}
