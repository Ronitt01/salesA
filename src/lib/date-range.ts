/**
 * Date-range filter shared by the dashboard and analytics.
 * The range lives in the URL (?range=30d or ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD)
 * so views are linkable and the server computes everything.
 */

export type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";

export const RANGE_OPTIONS: Array<{ key: Exclude<RangeKey, "custom">; label: string; days: number }> = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
];

export interface ResolvedRange {
  key: RangeKey;
  label: string;
  /** Inclusive start, ISO. */
  from: string;
  /** Exclusive end, ISO. */
  to: string;
  /** Calendar dates in the workspace timezone, for the custom inputs. */
  fromDate: string;
  toDate: string;
  bucket: "day" | "week";
}

const DAY_MS = 86_400_000;

/** Minutes that `timeZone` is ahead of UTC at the given instant. */
export function tzOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function calendarDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The instant at which a calendar date begins in a timezone. */
export function startOfDateInTz(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  // Two passes handle a DST transition between the guess and the true instant.
  let result = new Date(guess.getTime() - tzOffsetMinutes(guess, timeZone) * 60_000);
  result = new Date(guess.getTime() - tzOffsetMinutes(result, timeZone) * 60_000);
  return result;
}

function isCalendarDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveRange(
  params: Record<string, string | string[] | undefined>,
  timeZone: string,
  now: Date,
): ResolvedRange {
  const requested = first(params.range);
  const today = calendarDate(now, timeZone);
  const todayStart = startOfDateInTz(today, timeZone);

  if (requested === "custom" && isCalendarDate(first(params.from)) && isCalendarDate(first(params.to))) {
    let fromDate = first(params.from) as string;
    let toDate = first(params.to) as string;
    if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
    const from = startOfDateInTz(fromDate, timeZone);
    // The end date is inclusive for the user, exclusive in queries.
    const to = new Date(startOfDateInTz(toDate, timeZone).getTime() + DAY_MS);
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
    return {
      key: "custom",
      label: `${fromDate} to ${toDate}`,
      from: from.toISOString(),
      to: to.toISOString(),
      fromDate,
      toDate,
      bucket: days > 45 ? "week" : "day",
    };
  }

  const option = RANGE_OPTIONS.find((o) => o.key === requested) ?? RANGE_OPTIONS[2];
  const from = new Date(todayStart.getTime() - (option.days - 1) * DAY_MS);
  return {
    key: option.key,
    label: option.label,
    from: from.toISOString(),
    to: now.toISOString(),
    fromDate: calendarDate(from, timeZone),
    toDate: today,
    bucket: option.days > 45 ? "week" : "day",
  };
}
