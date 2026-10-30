import Link from "next/link";
import { notFound } from "next/navigation";
import { addLine, autoAssign, deleteJob, deleteLine, reopenLine, setJobStatus, updateJob, updateLine } from "../actions";
import { JobFields } from "../JobFields";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Select, td, th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import {
  JOB_STATUS_LABEL, PROCEDURE_LABEL, PROCEDURES, SUBSTATUS_TONE, durationSince, substatusLabel,
  type Job, type JobSubstatus, type Procedure, type QuoteLine, type Technician,
} from "@/lib/types";

// Rows are uncontrolled forms: keying by the saved values makes them redraw after a save.
const rowKey = (r: object) => JSON.stringify(r);

const STATE_TONE = { done: "stone", locked: "amber", running: "green", ready: "blue" } as const;
const STATE_LABEL = { done: "Done", locked: "Locked", running: "Running", ready: "Ready" } as const;

function TechOptions({ techs, procedure }: { techs: Technician[]; procedure?: Procedure }) {
  return (
    <>
      <option value="">— Unassigned —</option>
      {techs.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {procedure && !t.procedures.includes(procedure) ? ` (doesn't do ${PROCEDURE_LABEL[procedure]})` : ""}
          {!t.active ? " (inactive)" : ""}
        </option>
      ))}
    </>
  );
}

function ProcedureOptions() {
  return PROCEDURES.map((p) => (
    <option key={p} value={p}>{PROCEDURE_LABEL[p]}</option>
  ));
}

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const [{ id }, { error, ok }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();

  const [{ data: job }, { data: lines }, { data: techs }, { data: actuals }, { data: states }, { data: sub }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).maybeSingle<Job>(),
    supabase.from("quote_lines").select("*").eq("job_id", id).returns<QuoteLine[]>(),
    supabase.from("technicians").select("id, name, hourly_cost_rate, procedures, active, locked_until").order("name").returns<Technician[]>(),
    supabase.from("v_line_actuals").select("quote_line_id, actual_hours, helper_hours").eq("job_id", id),
    supabase.from("v_quote_line_state").select("quote_line_id, state").eq("job_id", id),
    supabase.from("v_job_substatus").select("job_id, substatus, reason, since, working_count").eq("job_id", id).maybeSingle<JobSubstatus>(),
  ]);
  if (!job) notFound();

  const sorted = [...(lines ?? [])].sort(
    (a, b) => PROCEDURES.indexOf(a.procedure) - PROCEDURES.indexOf(b.procedure) || a.description.localeCompare(b.description),
  );
  const actual = new Map((actuals ?? []).map((a) => [a.quote_line_id, a]));
  const state = new Map((states ?? []).map((s) => [s.quote_line_id, s.state as keyof typeof STATE_LABEL]));
  const allTechs = techs ?? [];
  const quotedTotal = sorted.reduce((sum, l) => sum + Number(l.quoted_hours), 0);
  const unassigned = sorted.filter((l) => !l.assigned_technician_id && !l.completed_at).length;

  return (
    <>
      <Link href="/admin/jobs" className="mb-2 inline-block text-sm text-stone-500 hover:text-stone-800">← All jobs</Link>
      <PageHeader title={`${job.rego} · ${[job.colour, job.make, job.model].filter(Boolean).join(" ") || "Vehicle"}`}>
        <div className="flex items-center gap-3">
          <Badge tone={job.status === "done" ? "stone" : "blue"}>{JOB_STATUS_LABEL[job.status]}</Badge>
          {sub && sub.substatus !== "done" && (
            <Badge tone={SUBSTATUS_TONE[sub.substatus]}>
              {substatusLabel(sub)}
              {(sub.substatus === "paused" || sub.substatus === "working") && sub.since ? ` · ${durationSince(sub.since)}` : ""}
            </Badge>
          )}
          <form action={setJobStatus}>
            <input type="hidden" name="id" value={job.id} />
            {job.status === "done" ? (
              <Button variant="secondary" name="status" value="in_progress">Reopen job</Button>
            ) : (
              <Button variant="secondary" name="status" value="done">Mark done</Button>
            )}
          </form>
        </div>
      </PageHeader>
      <Flash error={error} ok={ok} />

      <Card title={`Quote lines · ${quotedTotal.toFixed(1)} h quoted`}>
        <p className="mb-4 text-sm text-stone-500">
          Procedures unlock in order: Strip → Repair → Prep → Paint → Refit. The assigned technician owns the line and is the only one who can complete it.
        </p>

        {sorted.length > 0 && (
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200">
                <tr>
                  <th className={th}>Procedure</th>
                  <th className={th}>Description</th>
                  <th className={`${th} w-24`}>Quoted h</th>
                  <th className={th}>Owner</th>
                  <th className={`${th} text-right`}>Actual h</th>
                  <th className={th}>State</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {sorted.map((l) => {
                  const fid = `line-${l.id}`;
                  const a = actual.get(l.id);
                  const st = state.get(l.id) ?? "ready";
                  const over = a && Number(l.quoted_hours) > 0 && Number(a.actual_hours) > Number(l.quoted_hours);
                  return (
                    <tr key={rowKey(l)}>
                      <td className={td}>
                        <form id={fid} action={updateLine}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="job_id" value={job.id} />
                        </form>
                        <Select form={fid} name="procedure" defaultValue={l.procedure}><ProcedureOptions /></Select>
                      </td>
                      <td className={td}>
                        <Input form={fid} name="description" defaultValue={l.description} required className="w-full min-w-48" />
                      </td>
                      <td className={td}>
                        <Input form={fid} name="quoted_hours" type="number" step="0.1" min="0" defaultValue={l.quoted_hours} required className="w-20" />
                      </td>
                      <td className={td}>
                        <Select form={fid} name="assigned_technician_id" defaultValue={l.assigned_technician_id ?? ""} className="w-56">
                          <TechOptions techs={allTechs} procedure={l.procedure} />
                        </Select>
                      </td>
                      <td className={`${td} text-right tabular-nums ${over ? "font-semibold text-red-700" : ""}`}>
                        {Number(a?.actual_hours ?? 0).toFixed(1)}
                        {Number(a?.helper_hours ?? 0) > 0 && (
                          <span className="block text-xs font-normal text-stone-500">incl. {Number(a?.helper_hours).toFixed(1)} helper</span>
                        )}
                      </td>
                      <td className={td}><Badge tone={STATE_TONE[st]}>{STATE_LABEL[st]}</Badge></td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        <div className="flex justify-end gap-2">
                          <Button form={fid} type="submit" variant="secondary">Save</Button>
                          {l.completed_at ? (
                            <form action={reopenLine}>
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="job_id" value={job.id} />
                              <Button variant="secondary">Reopen</Button>
                            </form>
                          ) : (
                            <form action={deleteLine}>
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="job_id" value={job.id} />
                              <Button variant="danger" title="Only possible if no time has been logged">Delete</Button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {unassigned > 0 && (
          <form action={autoAssign} className="mb-6 flex flex-wrap items-center gap-3 rounded-md bg-amber-50 px-4 py-3 text-sm">
            <input type="hidden" name="job_id" value={job.id} />
            <span>{unassigned} open line{unassigned === 1 ? " has" : "s have"} no owner.</span>
            <Button variant="secondary">Auto-assign (fewest open hours)</Button>
          </form>
        )}

        <form key={String(Date.now())} action={addLine} className="grid grid-cols-1 items-end gap-3 border-t border-stone-100 pt-5 sm:grid-cols-[10rem_1fr_7rem_14rem_auto]">
          <input type="hidden" name="job_id" value={job.id} />
          <Field label="Procedure">
            <Select name="procedure" defaultValue="repair"><ProcedureOptions /></Select>
          </Field>
          <Field label="Description">
            <Input name="description" required placeholder="e.g. Left bumper – repair" />
          </Field>
          <Field label="Quoted hours">
            <Input name="quoted_hours" type="number" step="0.1" min="0" required />
          </Field>
          <Field label="Owner">
            <Select name="assigned_technician_id" defaultValue="">
              <TechOptions techs={allTechs.filter((t) => t.active)} />
            </Select>
          </Field>
          <Button type="submit">Add line</Button>
        </form>
      </Card>

      <Card title="Vehicle details">
        <form key={rowKey(job)} action={updateJob} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={job.id} />
          <JobFields job={job} />
          <div className="flex items-center justify-between">
            <Button type="submit">Save details</Button>
          </div>
        </form>
        <form action={deleteJob} className="mt-4 border-t border-stone-100 pt-4">
          <input type="hidden" name="id" value={job.id} />
          <Button variant="danger" title="Only possible if no time has been logged">Delete job</Button>
        </form>
      </Card>
    </>
  );
}
