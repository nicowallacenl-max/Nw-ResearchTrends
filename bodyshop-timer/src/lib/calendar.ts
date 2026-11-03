// Calendar date helpers. Dates are shop-local calendar days as "YYYY-MM-DD" strings; maths is done in UTC so the
// browser's own time zone can't shift a day.
import type { BoardJob } from "./kiosk";

export type CalMode = "day" | "week";

const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * 86_400_000);
export const weekStart = (d: string) => addDays(d, -((new Date(toUTC(d)).getUTCDay() + 6) % 7)); // Monday
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 86_400_000);

export function calRange(mode: CalMode, anchor: string) {
  if (mode === "day") return { from: anchor, to: anchor, days: [anchor] };
  const from = weekStart(anchor);
  return { from, to: addDays(from, 6), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
}

export const dayName = (d: string) => new Date(toUTC(d)).toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" }).toUpperCase();
export const dayLabel = (d: string) =>
  new Date(toUTC(d)).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "").toUpperCase();

// Today in the shop's time zone.
export const shopToday = (tz: string, at = new Date()) => at.toLocaleDateString("en-CA", { timeZone: tz });

export type DueKind = "in" | "out";
export type DueTone = "due-in" | "due-out" | "ready" | "at-risk" | "overdue";

export const allLinesDone = (j: Pick<BoardJob, "lines" | "status" | "stage">) =>
  j.status === "done" || j.stage >= 7 || (j.lines.length > 0 && j.lines.every((l) => l.state === "done"));

// How a due-out should read: READY (all lines done), OVERDUE (date passed, not done), AT RISK (due today or
// tomorrow, not done) or plain DUE OUT.
export function dueOutTone(j: Pick<BoardJob, "lines" | "status" | "stage" | "due_out">, today: string): DueTone {
  if (allLinesDone(j)) return "ready";
  if (j.due_out && j.due_out < today) return "overdue";
  if (j.due_out && daysBetween(today, j.due_out) <= 1) return "at-risk";
  return "due-out";
}
