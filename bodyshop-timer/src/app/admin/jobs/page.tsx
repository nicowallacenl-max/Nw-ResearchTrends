import Link from "next/link";
import { createJob } from "./actions";
import { JobFields } from "./JobFields";
import { Badge, Button, Card, Flash, PageHeader, td, th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { JOB_STATUS_LABEL, SUBSTATUS_TONE, durationSince, substatusLabel, type JobStatus, type JobSubstatus } from "@/lib/types";

const COLOUR_TONE = { green: "green", amber: "amber", red: "red" } as const;
const fmt = (n: number | null) => (n === null ? "–" : Number(n).toFixed(1));

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; show?: string }> }) {
  const { error, ok, show } = await searchParams;
  const { supabase } = await requireAdmin();

  let q = supabase.from("jobs").select("id, rego, make, model, colour, ibodyshop_ref, status, created_at").order("created_at", { ascending: false });
  if (show !== "all") q = q.neq("status", "done");
  const now = Date.now();
  const [{ data: allJobs }, { data: summary }, { data: subs }] = await Promise.all([
    q,
    supabase.from("v_job_summary").select("job_id, quoted_hours, actual_hours, board_colour"),
    supabase.from("v_job_substatus").select("job_id, substatus, reason, since, working_count").returns<JobSubstatus[]>(),
  ]);
  const byJob = new Map((summary ?? []).map((s) => [s.job_id, s]));
  const subByJob = new Map((subs ?? []).map((s) => [s.job_id, s]));
  const jobs = show === "paused" ? (allJobs ?? []).filter((j) => subByJob.get(j.id)?.substatus === "paused") : allJobs;
  const pausedCount = (subs ?? []).filter((s) => s.substatus === "paused").length;

  return (
    <>
      <PageHeader title="Jobs">
        <div className="flex gap-2 text-sm">
          <Link href="/admin/jobs" className={!show ? "font-semibold" : "text-stone-500"}>Active</Link>
          <span className="text-stone-300">|</span>
          <Link href="/admin/jobs?show=paused" className={show === "paused" ? "font-semibold" : "text-stone-500"}>
            Paused{pausedCount ? ` (${pausedCount})` : ""}
          </Link>
          <span className="text-stone-300">|</span>
          <Link href="/admin/jobs?show=all" className={show === "all" ? "font-semibold" : "text-stone-500"}>All</Link>
        </div>
      </PageHeader>
      <Flash error={error} ok={ok} />

      <Card title="New job">
        <form key={String(Date.now())} action={createJob} className="flex flex-col gap-4">
          <JobFields />
          <div>
            <Button type="submit">Create job</Button>
          </div>
        </form>
      </Card>

      <Card>
        {!jobs?.length ? (
          <p className="text-sm text-stone-500">{show === "paused" ? "No paused jobs." : "No jobs yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200">
                <tr>
                  <th className={th}>Rego</th>
                  <th className={th}>Vehicle</th>
                  <th className={th}>iBodyshop</th>
                  <th className={th}>Status</th>
                  <th className={th}>Substatus</th>
                  <th className={`${th} text-right`}>Quoted h</th>
                  <th className={`${th} text-right`}>Actual h</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {jobs.map((j) => {
                  const s = byJob.get(j.id);
                  return (
                    <tr key={j.id} className="hover:bg-stone-50">
                      <td className={`${td} font-mono font-semibold`}>
                        <Link href={`/admin/jobs/${j.id}`} className="hover:text-brand">{j.rego}</Link>
                      </td>
                      <td className={td}>{[j.colour, j.make, j.model].filter(Boolean).join(" ") || "–"}</td>
                      <td className={td}>{j.ibodyshop_ref ?? "–"}</td>
                      <td className={td}>
                        <Badge tone={j.status === "done" ? "stone" : "blue"}>{JOB_STATUS_LABEL[j.status as JobStatus]}</Badge>
                      </td>
                      <td className={td}>
                        {(() => {
                          const sub = subByJob.get(j.id);
                          if (!sub) return "–";
                          return (
                            <>
                              <Badge tone={SUBSTATUS_TONE[sub.substatus]}>{substatusLabel(sub)}</Badge>
                              {(sub.substatus === "paused" || sub.substatus === "working") && sub.since && (
                                <span className="ml-1 text-xs text-stone-500">{durationSince(sub.since, now)}</span>
                              )}
                            </>
                          );
                        })()}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{fmt(s?.quoted_hours ?? null)}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {s ? (
                          <Badge tone={COLOUR_TONE[s.board_colour as keyof typeof COLOUR_TONE] ?? "stone"}>{fmt(s.actual_hours)}</Badge>
                        ) : "–"}
                      </td>
                      <td className={`${td} text-right`}>
                        <Link href={`/admin/jobs/${j.id}`} className="text-brand hover:underline">Open →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
