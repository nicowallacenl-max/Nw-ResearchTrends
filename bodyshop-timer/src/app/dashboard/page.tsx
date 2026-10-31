import Link from "next/link";
import { QuotedVsActual, SingleBars } from "./Charts";
import { Card, PageHeader, td, th , theadCls } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { PROCEDURE_LABEL, PROCEDURES, type Procedure } from "@/lib/types";

const DELAY_PERIODS = { week: "This week", month: "This month", all: "All time" } as const;
type DelayPeriod = keyof typeof DELAY_PERIODS;

const n = (v: unknown) => Number(v ?? 0);
const h1 = (v: number) => v.toFixed(1);
const money = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;

function TableToggle({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-stone-500 hover:text-stone-800">Show as table</summary>
      <table className="mt-2 w-full">
        <thead className={theadCls}>
          <tr>{head.map((x, i) => <th key={x} className={`${th} ${i ? "text-right" : ""}`}>{x}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])}>{r.map((c, i) => <td key={i} className={`${td} ${i ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="cut flex flex-col gap-2 border border-line bg-bg px-5 py-4">
      <div className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">{label}</div>
      <div className="font-display text-[40px] font-bold leading-none tabular-nums">{value}</div>
      {note && <div className="mt-1 text-xs text-stone-500">{note}</div>}
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ delays?: string }> }) {
  const { delays: d } = await searchParams;
  const delayPeriod: DelayPeriod = d && d in DELAY_PERIODS ? (d as DelayPeriod) : "month";
  const { supabase } = await requireStaff();

  const [{ data: jobs }, { data: jobSum }, { data: procs }, { data: techs }, { data: delays }, { data: helpers }, { data: lines }] = await Promise.all([
    supabase.from("jobs").select("id, rego, make, model, created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("v_job_summary").select("job_id, quoted_hours, actual_hours, labour_cost, quoted_labour_cost"),
    supabase.from("v_procedure_summary").select("procedure, quoted_hours, actual_hours"),
    supabase.from("v_technician_summary").select("technician_id, name, hours_logged, owner_hours, helper_hours, quoted_hours_owned, labour_cost"),
    supabase.from("v_delay_by_reason").select("delay_reason, pauses, hours_lost, hours_lost_this_week, hours_lost_this_month"),
    supabase.from("v_helper_report").select("helper_reason, procedure, owner_name, helper_segments, distinct_helpers, helper_hours, helper_cost"),
    supabase.from("v_line_actuals").select("quoted_hours, actual_hours, completed_at"),
  ]);

  const sumBy = new Map((jobSum ?? []).map((s) => [s.job_id, s]));
  const jobRows = (jobs ?? []).map((j) => {
    const s = sumBy.get(j.id);
    return { name: j.rego, quoted: n(s?.quoted_hours), actual: n(s?.actual_hours), cost: n(s?.labour_cost), quotedCost: n(s?.quoted_labour_cost) };
  });
  const procRows = PROCEDURES.map((p) => {
    const r = (procs ?? []).find((x) => x.procedure === p);
    return r ? { name: PROCEDURE_LABEL[p as Procedure], quoted: n(r.quoted_hours), actual: n(r.actual_hours) } : null;
  }).filter(Boolean) as { name: string; quoted: number; actual: number }[];
  const techRows = (techs ?? []).filter((t) => n(t.hours_logged) > 0 || n(t.quoted_hours_owned) > 0)
    .map((t) => ({ name: t.name as string, quoted: n(t.quoted_hours_owned), actual: n(t.hours_logged), owner: n(t.owner_hours), helper: n(t.helper_hours), cost: n(t.labour_cost) }));
  const delayKey = { week: "hours_lost_this_week", month: "hours_lost_this_month", all: "hours_lost" }[delayPeriod] as "hours_lost";
  const delayRows = (delays ?? []).map((r) => ({ name: r.delay_reason as string, value: n(r[delayKey]), pauses: n(r.pauses) }))
    .filter((r) => r.value > 0).sort((a, b) => b.value - a.value);

  // Headline numbers
  const done = (lines ?? []).filter((l) => l.completed_at);
  const doneQuoted = done.reduce((s, l) => s + n(l.quoted_hours), 0);
  const doneActual = done.reduce((s, l) => s + n(l.actual_hours), 0);
  const lostWeek = (delays ?? []).reduce((s, r) => s + n(r.hours_lost_this_week), 0);
  const totalHours = (techs ?? []).reduce((s, t) => s + n(t.hours_logged), 0);
  const helperHours = (techs ?? []).reduce((s, t) => s + n(t.helper_hours), 0);

  return (
    <>
      <PageHeader eyebrow="// REPORTS" title="Owner dashboard" />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Completed items: actual vs quoted" value={doneQuoted ? `${Math.round((doneActual / doneQuoted) * 100)}%` : "–"}
          note={`${h1(doneActual)} h actual / ${h1(doneQuoted)} h quoted, ${done.length} items`} />
        <Stat label="Hours over / under quote" value={done.length ? `${doneActual - doneQuoted >= 0 ? "+" : ""}${h1(doneActual - doneQuoted)} h` : "–"} note="completed items only" />
        <Stat label="Hours lost to delays" value={`${h1(lostWeek)} h`} note="this week" />
        <Stat label="Helper share of hours" value={totalHours ? `${Math.round((helperHours / totalHours) * 100)}%` : "–"} note={`${h1(helperHours)} of ${h1(totalHours)} h`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Quoted vs actual hours by job">
          <p className="-mt-2 mb-3 text-xs text-stone-500">Latest 12 jobs</p>
          <QuotedVsActual rows={jobRows} />
          <TableToggle head={["Job", "Quoted h", "Actual h", "Variance h"]} rows={jobRows.map((r) => [r.name, h1(r.quoted), h1(r.actual), h1(r.actual - r.quoted)])} />
        </Card>

        <Card title="Labour cost vs quoted labour by job">
          <p className="-mt-2 mb-3 text-xs text-stone-500">Quoted labour = quoted hours × the owner&apos;s cost rate</p>
          <QuotedVsActual rows={jobRows.map((r) => ({ name: r.name, quoted: r.quotedCost, actual: r.cost }))} unit="$" quotedLabel="Quoted labour" actualLabel="Actual labour" />
          <TableToggle head={["Job", "Quoted labour", "Actual labour", "Difference"]} rows={jobRows.map((r) => [r.name, money(r.quotedCost), money(r.cost), money(r.cost - r.quotedCost)])} />
        </Card>

        <Card title="Quoted vs actual hours by procedure">
          <QuotedVsActual rows={procRows} />
          <TableToggle head={["Procedure", "Quoted h", "Actual h", "Variance h"]} rows={procRows.map((r) => [r.name, h1(r.quoted), h1(r.actual), h1(r.actual - r.quoted)])} />
        </Card>

        <Card title="Quoted vs actual hours by technician">
          <p className="-mt-2 mb-3 text-xs text-stone-500">Quoted = hours on items they own · Actual = all hours they logged, including helping</p>
          <QuotedVsActual rows={techRows} />
          <TableToggle head={["Technician", "Quoted h", "Actual h", "As helper h", "Labour cost"]} rows={techRows.map((r) => [r.name, h1(r.quoted), h1(r.actual), h1(r.helper), money(r.cost)])} />
        </Card>
      </div>

      <Card title="Hours lost by delay reason">
        <div className="-mt-2 mb-3 flex gap-2 text-sm">
          {(Object.keys(DELAY_PERIODS) as DelayPeriod[]).map((k, i) => (
            <span key={k} className="flex gap-2">
              {i > 0 && <span className="text-stone-300">|</span>}
              <Link href={`/dashboard?delays=${k}`} scroll={false} className={k === delayPeriod ? "font-semibold" : "text-stone-500"}>{DELAY_PERIODS[k]}</Link>
            </span>
          ))}
        </div>
        <SingleBars rows={delayRows} label="Hours lost" />
        <TableToggle head={["Reason", "Hours lost", "Pauses (all time)"]} rows={delayRows.map((r) => [r.name, h1(r.value), r.pauses])} />
        <p className="mt-2 text-xs text-stone-500">Counted from each pause until the item was picked up again, completed, or knock-off that day.</p>
      </Card>

      <Card title="Helper report">
        <p className="-mt-2 mb-3 text-sm text-stone-600">How often a second person helped on someone else&apos;s procedure, and why.</p>
        {!helpers?.length ? (
          <p className="text-sm text-stone-500">No helper time logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Reason</th>
                <th className={th}>Procedure</th>
                <th className={th}>Owner</th>
                <th className={`${th} text-right`}>Times</th>
                <th className={`${th} text-right`}>Helpers</th>
                <th className={`${th} text-right`}>Hours</th>
                <th className={`${th} text-right`}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {[...helpers].sort((a, b) => n(b.helper_hours) - n(a.helper_hours)).map((r) => (
                <tr key={`${r.helper_reason}-${r.procedure}-${r.owner_name}`}>
                  <td className={td}>{r.helper_reason}</td>
                  <td className={td}>{PROCEDURE_LABEL[r.procedure as Procedure]}</td>
                  <td className={td}>{r.owner_name ?? "–"}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.helper_segments}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.distinct_helpers}</td>
                  <td className={`${td} text-right tabular-nums`}>{h1(n(r.helper_hours))}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(n(r.helper_cost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
