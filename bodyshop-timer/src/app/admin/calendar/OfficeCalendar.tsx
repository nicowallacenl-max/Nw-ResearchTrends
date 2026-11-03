"use client";

import { useRouter } from "next/navigation";
import { JobCalendar } from "@/components/JobCalendar";
import type { BoardJob } from "@/lib/kiosk";
import type { CalMode } from "@/lib/calendar";

// Office wrapper: navigation goes through the URL (?mode=&date=) and opening a job goes to its job page.
export function OfficeCalendar({ jobs, today, mode, anchor }: { jobs: BoardJob[]; today: string; mode: CalMode; anchor: string }) {
  const router = useRouter();
  return (
    <JobCalendar
      jobs={jobs}
      today={today}
      mode={mode}
      anchor={anchor}
      onNavigate={(m, a) => router.push(`/admin/calendar?mode=${m}&date=${a}`)}
      onOpen={(j) => router.push(`/admin/jobs/${j.id}`)}
    />
  );
}
