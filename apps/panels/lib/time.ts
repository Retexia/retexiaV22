/** Date helpers in the business's own time zone. */

export function localDate(tz: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
}

export function timeIn(tz: string, iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** Offset of a time zone from UTC in minutes at a given moment. */
function tzOffsetMinutes(tz: string, at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return (asUtc - at.getTime()) / 60000;
}

/** "2026-10-05" + "13:00" in Asia/Colombo → UTC ISO string. */
export function zonedToUtc(date: string, time: string, tz: string) {
  const guess = new Date(`${date}T${time}:00Z`);
  const offset = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - offset * 60000).toISOString();
}

/** Edits and denies close 15 minutes before the slot (the publish job needs that time). */
export const LOCK_MINUTES = 15;
export const isLocked = (scheduledAt: string, now = Date.now()) => now >= new Date(scheduledAt).getTime() - LOCK_MINUTES * 60000;

export function relative(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const mins = Math.round(Math.abs(diff) / 60000);
  const text = mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} days`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** True when an ISO time is less than `days` days away (or already past). */
export const withinDays = (iso: string | null, days: number) => Boolean(iso && new Date(iso).getTime() - Date.now() < days * 86_400_000);

/** ISO timestamp `days` days ago. */
export const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Whole days between an ISO time and now. */
export const daysSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
