import { OfficeCalendar } from "./OfficeCalendar";
import { Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { calRange, shopToday, type CalMode } from "@/lib/calendar";
import type { BoardJob } from "@/lib/kiosk";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ mode?: string; date?: string }> }) {
  const { mode: m, date } = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: s } = await supabase.from("settings").select("time_zone").single<{ time_zone: string }>();
  const today = shopToday(s?.time_zone ?? "Australia/Brisbane");
  const mode: CalMode = m === "day" ? "day" : "week";
  const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const { from, to } = calRange(mode, anchor);
  const { data, error } = await supabase.rpc("calendar_jobs", { p_from: from, p_to: to });

  return (
    <>
      <PageHeader eyebrow="// JOBS / DUE IN · DUE OUT" title="Calendar" />
      <Flash error={error ? "Couldn't load the calendar. Refresh to try again." : undefined} />
      <OfficeCalendar jobs={(data?.jobs ?? []) as BoardJob[]} today={(data?.today as string) ?? today} mode={mode} anchor={anchor} />
    </>
  );
}
