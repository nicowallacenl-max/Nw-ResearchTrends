import { approveSegment } from "./actions";
import { Badge, Button, Card, Flash, Input, PageHeader, td, th , theadCls } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import type { FlashParams } from "@/lib/flash";
import { hoursBetween, showTime, toLocalInput } from "@/lib/time";

type Queued = {
  id: string; technician_name: string; rego: string; description: string; role: "owner" | "helper";
  started_at: string; ended_at: string; end_type: string;
};
type Reviewed = {
  id: string; started_at: string; ended_at: string; original_started_at: string | null; original_ended_at: string | null;
  reviewed_at: string; edited_by: string | null;
  technicians: { name: string } | null; quote_lines: { description: string; jobs: { rego: string } | null } | null;
};

export default async function ReviewPage({ searchParams }: { searchParams: FlashParams }) {
  const { error, ok } = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: s }, { data: queue }, { data: recent }] = await Promise.all([
    supabase.from("settings").select("time_zone, knock_off_time").single<{ time_zone: string; knock_off_time: string }>(),
    supabase.from("v_review_queue").select("id, technician_name, rego, description, role, started_at, ended_at, end_type").order("started_at").returns<Queued[]>(),
    supabase
      .from("work_segments")
      .select("id, started_at, ended_at, original_started_at, original_ended_at, reviewed_at, edited_by, technicians(name), quote_lines(description, jobs(rego))")
      .not("reviewed_at", "is", null)
      .order("reviewed_at", { ascending: false })
      .limit(20)
      .returns<Reviewed[]>(),
  ]);
  const tz = s?.time_zone ?? "Australia/Brisbane";
  const knockOff = s?.knock_off_time?.slice(0, 5) ?? "17:30";

  return (
    <>
      <PageHeader title="Review" />
      <Flash error={error} ok={ok} />

      <Card title={`Needs review (${queue?.length ?? 0})`}>
        <p className="mb-4 text-sm text-stone-600">
          Timers still running at knock-off ({knockOff}) are stopped automatically at that time. Check each one with the technician,
          correct the times if needed, then approve. Original times are kept in the audit trail.
        </p>
        {!queue?.length ? (
          <p className="text-sm text-stone-500">Nothing to review.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={theadCls}>
                <tr>
                  <th className={th}>Technician</th>
                  <th className={th}>Job</th>
                  <th className={th}>Started</th>
                  <th className={th}>Ended</th>
                  <th className={`${th} text-right`}>Hours</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => {
                  const fid = `rev-${q.id}`;
                  const started = toLocalInput(q.started_at, tz);
                  const ended = toLocalInput(q.ended_at, tz);
                  return (
                    <tr key={JSON.stringify(q)}>
                      <td className={td}>
                        <form id={fid} action={approveSegment}>
                          <input type="hidden" name="id" value={q.id} />
                          <input type="hidden" name="started_was" value={started} />
                          <input type="hidden" name="ended_was" value={ended} />
                        </form>
                        {q.technician_name}
                        {q.role === "helper" && <span className="ml-1 text-stone-500">(helper)</span>}
                        <div><Badge tone="amber">{q.end_type === "auto_closed" ? "Auto clock-off" : "Flagged"}</Badge></div>
                      </td>
                      <td className={td}>
                        <span className="font-mono font-semibold">{q.rego}</span> · {q.description}
                      </td>
                      <td className={td}><Input form={fid} type="datetime-local" name="started" defaultValue={started} required /></td>
                      <td className={td}><Input form={fid} type="datetime-local" name="ended" defaultValue={ended} required /></td>
                      <td className={`${td} text-right tabular-nums`}>{hoursBetween(q.started_at, q.ended_at).toFixed(2)}</td>
                      <td className={`${td} text-right`}><Button form={fid} type="submit">Approve</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Recently reviewed">
        {!recent?.length ? (
          <p className="text-sm text-stone-500">None yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className={theadCls}>
              <tr>
                <th className={th}>Technician</th>
                <th className={th}>Job</th>
                <th className={th}>Time</th>
                <th className={th}>Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{r.technicians?.name}</td>
                  <td className={td}>
                    <span className="font-mono font-semibold">{r.quote_lines?.jobs?.rego}</span> · {r.quote_lines?.description}
                  </td>
                  <td className={td}>
                    {showTime(r.started_at, tz)} → {showTime(r.ended_at, tz)} ({hoursBetween(r.started_at, r.ended_at).toFixed(2)} h)
                    {r.edited_by && r.original_started_at && r.original_ended_at && (
                      <div className="text-xs text-stone-500">
                        Corrected. Was {showTime(r.original_started_at, tz)} → {showTime(r.original_ended_at, tz)}
                      </div>
                    )}
                  </td>
                  <td className={td}>{showTime(r.reviewed_at, tz)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
