// Shop-local time helpers. Values for <input type="datetime-local"> are wall-clock "YYYY-MM-DDTHH:mm" in the shop's time zone.
export function toLocalInput(iso: string, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export const showTime = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const hoursBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

export type Period = "today" | "week" | "month" | "all";
export const PERIOD_LABEL: Record<Period, string> = { today: "Today", week: "This week", month: "This month", all: "All time" };

// Start of today / this week (Monday) / this month in the shop's time zone, as an ISO instant.
export function periodStart(period: Period, tz: string, now = new Date()): string | null {
  if (period === "all") return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  let y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
  if (period === "week") d -= ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  if (period === "month") d = 1;
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Shift by the zone's UTC offset at that moment (Brisbane has no DST, but this handles zones that do).
  const offset = Date.parse(new Date(utcMidnight).toLocaleString("en-US", { timeZone: tz })) - Date.parse(new Date(utcMidnight).toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utcMidnight - offset).toISOString();
}
