import Link from "next/link";
import { Card, PageHeader, td, th , theadCls } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { PERIOD_LABEL, periodStart, showTime, type Period } from "@/lib/time";

type Seg = {
  segment_id: string; technician_id: string; technician_name: string; job_id: string; rego: string;
  role: "owner" | "helper"; started_at: string; ended_at: string | null; end_type: string | null;
  hours: number; cost: number; delay_reason: string | null; pause_hours: number;
};

type Totals = { hours: number; ownerHours: number; helperHours: number; cost: number; pauses: number; pauseHours: number; last: string };
const empty = (): Totals => ({ hours: 0, ownerHours: 0, helperHours: 0, cost: 0, pauses: 0, pauseHours: 0, last: "" });
function add(t: Totals, s: Seg) {
  const h = Number(s.hours);
  t.hours += h;
  if (s.role === "helper") t.helperHours += h; else t.ownerHours += h;
  t.cost += Number(s.cost);
  if (s.delay_reason) { t.pauses += 1; t.pauseHours += Number(s.pause_hours); }
  const last = s.ended_at ?? new Date().toISOString();
  if (last > t.last) t.last = last;
}

const h = (n: number) => n.toFixed(1);
const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export default async function TechnicianJobsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: p } = await searchParams;
  const period: Period = p && p in PERIOD_LABEL ? (p as Period) : "week";
  const { supabase } = await requireAdmin();
  const { data: s } = await supabase.from("settings").select("time_zone").single<{ time_zone: string }>();
  const tz = s?.time_zone ?? "Australia/Brisbane";
  const from = periodStart(period, tz);

  let q = supabase.from("v_technician_segments")
    .select("segment_id, technician_id, technician_name, job_id, rego, role, started_at, ended_at, end_type, hours, cost, delay_reason, pause_hours")
    .order("started_at");
  if (from) q = q.gte("started_at", from);
  const [{ data: segs }, { data: techs }] = await Promise.all([
    q.returns<Seg[]>(),
    supabase.from("technicians").select("id, name, active").order("name"),
  ]);

  // technician -> totals, and technician -> job -> totals
  const byTech = new Map<string, { totals: Totals; jobs: Map<string, { rego: string; totals: Totals }> }>();
  for (const seg of segs ?? []) {
    const t = byTech.get(seg.technician_id) ?? { totals: empty(), jobs: new Map() };
    add(t.totals, seg);
    const j = t.jobs.get(seg.job_id) ?? { rego: seg.rego, totals: empty() };
    add(j.totals, seg);
    t.jobs.set(seg.job_id, j);
    byTech.set(seg.technician_id, t);
  }
  const rows = (techs ?? [])
    .map((t) => ({ ...t, data: byTech.get(t.id) }))
    .filter((t) => t.active || t.data); // hide inactive people with no time in the period

  return (
    <>
      <PageHeader title="Technician jobs">
        <div className="flex gap-2 text-sm">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((k, i) => (
            <span key={k} className="flex gap-2">
              {i > 0 && <span className="text-stone-300">|</span>}
              <Link href={`/admin/technician-jobs?period=${k}`} className={k === period ? "font-semibold" : "text-stone-500"}>{PERIOD_LABEL[k]}</Link>
            </span>
          ))}
        </div>
      </PageHeader>
      <p className="mb-6 text-sm text-stone-600">
        Time worked is every timer the technician ran (as owner or helper) that started in the period. Time on pause runs from each of
        their pauses until the item was picked up again, completed, or knock-off that day, whichever came first. Automatic
        “Switched job” pauses aren&apos;t counted.
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Technician</th>
                <th className={`${th} text-right`}>Jobs worked</th>
                <th className={`${th} text-right`}>Time worked (h)</th>
                <th className={`${th} text-right`}>As owner / helper</th>
                <th className={`${th} text-right`}>Pauses</th>
                <th className={`${th} text-right`}>Time on pause (h)</th>
                <th className={`${th} text-right`}>Labour cost</th>
              </tr>
            </thead>
            {rows.map((r) => {
              const t = r.data?.totals ?? empty();
              const jobs = [...(r.data?.jobs.values() ?? [])].sort((a, b) => b.totals.last.localeCompare(a.totals.last));
              return (
                <tbody key={r.id} className="border-b border-stone-100">
                  <tr className={r.active ? "" : "text-stone-400"}>
                    <td className={`${td} font-medium`}>
                      {jobs.length ? (
                        <details className="group">
                          <summary className="cursor-pointer list-none">
                            <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                            {r.name}
                          </summary>
                          <table className="mt-2 w-full min-w-80 text-xs font-normal">
                            <thead>
                              <tr className="text-stone-500">
                                <th className="py-1 pr-3 text-left">Job</th>
                                <th className="px-3 py-1 text-right">Worked</th>
                                <th className="px-3 py-1 text-right">Paused</th>
                                <th className="py-1 pl-3 text-right">Last worked</th>
                              </tr>
                            </thead>
                            <tbody>
                              {jobs.map((j) => (
                                <tr key={j.rego + j.totals.last}>
                                  <td className="py-1 pr-3 font-mono font-semibold">{j.rego}</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{h(j.totals.hours)} h</td>
                                  <td className="px-3 py-1 text-right tabular-nums">{h(j.totals.pauseHours)} h · {j.totals.pauses} pause{j.totals.pauses === 1 ? "" : "s"}</td>
                                  <td className="py-1 pl-3 text-right text-stone-500">{showTime(j.totals.last, tz)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      ) : (
                        <span className="pl-4">{r.name}</span>
                      )}
                    </td>
                    <td className={`${td} text-right align-top tabular-nums`}>{jobs.length}</td>
                    <td className={`${td} text-right align-top tabular-nums font-semibold`}>{h(t.hours)}</td>
                    <td className={`${td} text-right align-top tabular-nums text-stone-500`}>{h(t.ownerHours)} / {h(t.helperHours)}</td>
                    <td className={`${td} text-right align-top tabular-nums`}>{t.pauses}</td>
                    <td className={`${td} text-right align-top tabular-nums ${t.pauseHours > 0 ? "text-amber-700" : ""}`}>{h(t.pauseHours)}</td>
                    <td className={`${td} text-right align-top tabular-nums`}>{money(t.cost)}</td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
        {!rows.length && <p className="text-sm text-stone-500">No technicians yet.</p>}
      </Card>
    </>
  );
}
