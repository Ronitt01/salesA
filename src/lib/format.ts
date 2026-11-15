/**
 * Formatting helpers. Locale and currency are parameters so the interface can be
 * localised later; the defaults suit the initial India deployment.
 */

const DEFAULT_LOCALE = "en-IN";

export function formatNumber(value: number | null | undefined, locale = DEFAULT_LOCALE): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** Indian compact currency: ₹45K, ₹9.1L, ₹1.2Cr. */
export function formatInrCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const trim = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ""));
  if (abs >= 10_000_000) return `${sign}₹${trim(abs / 10_000_000)}Cr`;
  if (abs >= 100_000) return `${sign}₹${trim(abs / 100_000)}L`;
  if (abs >= 1_000) return `${sign}₹${trim(abs / 1_000)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

export function formatInr(value: number | null | undefined, locale = DEFAULT_LOCALE): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${value.toFixed(digits).replace(/\.0$/, "")}%`;
}

export function formatDate(
  value: string | Date | null | undefined,
  timeZone = "Asia/Kolkata",
  locale = DEFAULT_LOCALE,
): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone }).format(
    new Date(value),
  );
}

export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone = "Asia/Kolkata",
  locale = DEFAULT_LOCALE,
): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(value));
}

export function formatShortDate(value: string | Date, timeZone = "Asia/Kolkata", locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone }).format(new Date(value));
}

/** "3h ago", "in 2d". `now` is passed in so server and client agree. */
export function formatRelative(value: string | Date | null | undefined, now: Date): string {
  if (!value) return "–";
  const diffMs = new Date(value).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const units: Array<[number, string]> = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      return diffMs < 0 ? `${n}${label} ago` : `in ${n}${label}`;
    }
  }
  return "just now";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
