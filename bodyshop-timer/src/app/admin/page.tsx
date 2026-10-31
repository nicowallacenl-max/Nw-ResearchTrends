import Link from "next/link";
import { Badge, PageHeader, td, th, theadCls } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isComplete, progressPct, stageChip } from "@/lib/stages";
import { durationSince, type JobSubstatus } from "@/lib/types";

type Row = {
  id: string; job_number: string | null; rego: string; make: string | null; model: string | null; bay: string | null;
  customer_name: string | null; insurer: string | null; work_summary: string | null; eta: string | null; stage: number;
};

const vehicleName = (j: Row) => [j.make, j.model].filter(Boolean).join(" ") || "Vehicle";
const etaText = (iso: string | null, tz: string) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).replace(",", "") : null;

function Kpi({ label, value, note, tone = "ink", featured }: { label: string; value: number; note: string; tone?: "ink" | "hazard" | "complete"; featured?: boolean }) {
  const colour = { ink: "text-ink", hazard: "text-hazard-text", complete: "text-complete" }[tone];
  return (
    <div className={`cut flex flex-col gap-2.5 bg-bg px-[22px] py-5 ${featured ? "border border-neon shadow-[0_0_24px_rgba(0,238,234,.25)]" : "border border-line"}`}>
      <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">{label}</span>
      <span className={`font-display text-[48px] font-bold leading-none ${colour}`}>{value}</span>
      <span className="text-[12px] text-muted">{note}</span>
    </div>
  );
}

export default async function WorkshopFloor() {
  const { supabase } = await requireAdmin();
  const [{ data: jobs }, { data: subs }, { data: running }, { data: lines }, { data: techs }, { data: s }] = await Promise.all([
    supabase.from("jobs").select("id, job_number, rego, make, model, bay, customer_name, insurer, work_summary, eta, stage").is("collected_at", null).order("job_number").returns<Row[]>(),
    supabase.from("v_job_substatus").select("job_id, substatus, reason, since, working_count").returns<JobSubstatus[]>(),
    supabase.from("work_segments").select("technician_id, quote_lines(job_id, procedure)").is("ended_at", null),
    supabase.from("quote_lines").select("job_id, description, procedure, assigned_technician_id, completed_at").order("created_at"),
    supabase.from("technicians").select("id, name"),
    supabase.from("settings").select("time_zone").single<{ time_zone: string }>(),
  ]);
  const tz = s?.time_zone ?? "Australia/Brisbane";
  const now = Date.now();
  const all = jobs ?? [];
  const sub = new Map((subs ?? []).map((x) => [x.job_id, x]));
  const techName = new Map((techs ?? []).map((t) => [t.id, t.name as string]));
  const short = (n?: string) => (n ? n.replace(/\s*\(.*\)/, "").replace(/^(\S+)\s+(\S).*$/, "$1 $2.") : "—");
  type RunRow = { technician_id: string; quote_lines: { job_id: string; procedure: string } | null };
  const run = (running ?? []) as unknown as RunRow[];

  // Who's on it: someone clocked on now, else the owner of the next open item.
  const techFor = (jobId: string) => {
    const r = run.find((x) => x.quote_lines?.job_id === jobId);
    if (r) return short(techName.get(r.technician_id));
    const next = (lines ?? []).find((l) => l.job_id === jobId && !l.completed_at && l.assigned_technician_id);
    return short(next ? techName.get(next.assigned_technician_id!) : undefined);
  };
  const work = (j: Row) => j.work_summary || (lines ?? []).filter((l) => l.job_id === j.id).slice(0, 2).map((l) => l.description).join(" + ") || "—";
  const partsWait = (id: string) => { const x = sub.get(id); return x?.substatus === "paused" && /part/i.test(x.reason ?? "") ? x : null; };

  const active = all.filter((j) => !isComplete(j.stage));
  const ready = all.filter((j) => isComplete(j.stage));
  const painting = active.filter((j) => j.stage === 4);
  const paintingNow = new Set(run.filter((r) => ["paint", "prep"].includes(r.quote_lines?.procedure ?? "")).map((r) => r.quote_lines!.job_id)).size;
  const parts = active.filter((j) => partsWait(j.id));
  const longestParts = parts.map((j) => partsWait(j.id)!.since).filter(Boolean).sort()[0] ?? null;
  const bays = all.filter((j) => j.bay).sort((a, b) => a.bay!.localeCompare(b.bay!, undefined, { numeric: true }));

  const clock = new Date(now).toLocaleString("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" })
    .replace(/,/g, "").toUpperCase().replace(/^(\w+ \d+ \w+) (\d\d:\d\d) (.+)$/, "$1 · $2 $3");

  return (
    <div className="flex flex-col gap-7">
      <PageHeader eyebrow="SYS.STATUS // ONLINE" title="Workshop floor">
        <span className="font-mono text-[13px] text-muted">{clock}</span>
      </PageHeader>

      <section aria-label="Key numbers" className="-mt-7 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Kpi featured label="ACTIVE JOBS" value={active.length} note={`${new Set(active.filter((j) => j.bay).map((j) => j.bay)).size} bays occupied`} />
        <Kpi label="IN PAINT BOOTH" value={painting.length} note={paintingNow ? `${paintingNow} being painted now` : "Nobody painting right now"} />
        <Kpi label="AWAITING PARTS" value={parts.length} tone="hazard" note={longestParts ? `Longest wait ${durationSince(longestParts, now)}` : "Nothing held up"} />
        <Kpi label="READY FOR PICKUP" value={ready.length} tone="complete" note="Complete · awaiting collection" />
      </section>

      <section aria-labelledby="bays" className="flex flex-col gap-3.5">
        <h2 id="bays" className="m-0 font-display text-[18px] uppercase tracking-[.14em]">Repair bays</h2>
        {!bays.length ? (
          <p className="cut border border-line bg-bg px-5 py-4 text-muted">No bays assigned yet. Set a bay on each job to see it here.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {bays.map((j) => {
              const done = isComplete(j.stage);
              const p = partsWait(j.id);
              const chip = stageChip(j.stage, p?.reason);
              const eta = done ? "Complete · ready to collect" : p ? `Waiting on parts · ${durationSince(p.since, now)}` : etaText(j.eta, tz) ? `ETA ${etaText(j.eta, tz)}` : "No ETA set";
              return (
                <Link key={j.id} href={`/admin/jobs/${j.id}`}
                  className={`plain cut flex flex-col gap-2.5 bg-bg px-5 py-[18px] text-inherit no-underline ${done ? "border border-complete" : p ? "border border-hazard" : "border border-line"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] uppercase tracking-[.14em] text-muted">BAY {j.bay}</span>
                    <Badge tone={chip.tone}>{chip.label}</Badge>
                  </div>
                  <span className="font-display text-[20px] font-semibold text-ink">{vehicleName(j)}</span>
                  <span className="font-mono text-[13px] text-muted">{j.rego} · {techFor(j.id)}</span>
                  <div className="h-1.5 bg-line"><div className={`h-1.5 ${done ? "bg-complete" : "bg-progress"}`} style={{ width: `${progressPct(j.stage)}%` }} /></div>
                  <span className="text-[12px] text-muted">{eta}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="pipeline" className="flex flex-col gap-3.5">
        <h2 id="pipeline" className="m-0 font-display text-[18px] uppercase tracking-[.14em]">Job pipeline</h2>
        <div className="cut overflow-x-auto border border-line bg-bg">
          <table className="w-full min-w-[760px] border-collapse text-[14px]">
            <thead className={theadCls}>
              <tr>
                <th className={th}>JOB #</th><th className={th}>VEHICLE</th><th className={th}>CUSTOMER</th>
                <th className={th}>WORK</th><th className={th}>PAYER</th><th className={th}>STAGE</th>
              </tr>
            </thead>
            <tbody>
              {all.map((j) => {
                const chip = stageChip(j.stage, partsWait(j.id)?.reason);
                return (
                  <tr key={j.id}>
                    <td className={`${td} font-mono`}><Link href={`/admin/jobs/${j.id}`}>{j.job_number}</Link></td>
                    <td className={`${td} text-ink`}>{vehicleName(j)}</td>
                    <td className={`${td} text-body`}>{j.customer_name || "—"}</td>
                    <td className={`${td} text-body`}>{work(j)}</td>
                    <td className={`${td} text-body`}>{j.insurer || "Private"}</td>
                    <td className={td}><Badge tone={chip.tone}>{chip.label}</Badge></td>
                  </tr>
                );
              })}
              {!all.length && <tr><td className={`${td} text-muted`} colSpan={6}>No active jobs. Use New job to add one.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
