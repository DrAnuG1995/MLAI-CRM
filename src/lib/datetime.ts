// Everything in the CRM is shown in Melbourne time — MLAI's events, sponsor
// calls and committee meetings all happen there, so a committee member in
// another timezone still sees the date the event is actually on.
export const CRM_LOCALE = "en-AU";
export const CRM_TIMEZONE = "Australia/Melbourne";

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(CRM_LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: iso.length === 10 ? undefined : CRM_TIMEZONE, ...opts });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(CRM_LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: CRM_TIMEZONE });
}

/** Today's calendar date in Melbourne as YYYY-MM-DD. */
export function todayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CRM_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function daysSince(iso: string | null | undefined) {
  if (!iso) return Infinity;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return (Date.now() - d.getTime()) / 86_400_000;
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "never";
  const d = daysSince(iso);
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 7) return `${Math.floor(d)} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} wk ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}

export const formatAUD = (n: number | null | undefined) =>
  new Intl.NumberFormat(CRM_LOCALE, { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(n) || 0);
