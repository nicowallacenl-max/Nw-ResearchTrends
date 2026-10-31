import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addDamage, addLine, advanceStage, autoAssign, deleteDamage, deleteJob, deleteLine, deletePhoto, markCollected,
  reopenLine, setJobStatus, stageBack, updateJob, updateLine,
} from "../actions";
import { JobFields } from "../JobFields";
import { CopyLink } from "@/components/CopyLink";
import { DamageScan } from "@/components/DamageScan";
import { PhotoGallery } from "@/components/PhotoGallery";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Badge, Button, Card, Field, Flash, Input, Select, buttonCls, td, th, theadCls } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { photoUrl } from "@/lib/photos";
import { COMPLETE, STAGE_COUNT, STAGES, isComplete } from "@/lib/stages";
import {
  JOB_STATUS_LABEL, PROCEDURE_LABEL, PROCEDURES, SUBSTATUS_TONE, durationSince, substatusLabel,
  type JobFull, type JobSubstatus, type Procedure, type QuoteLine, type Technician,
} from "@/lib/types";
import { DAMAGE_TYPES, SEVERITIES, panelLabel, panelsFor, type Damage } from "@/lib/vehicle";

type Line = QuoteLine & { price: number | null };
type Activity = { at: string; kind: string; message: string };
type PhotoRow = { id: string; path: string; caption: string | null; damage_id: string | null };

const STATE_TONE = { done: "stone", locked: "amber", running: "green", ready: "blue" } as const;
const STATE_LABEL = { done: "Done", locked: "Locked", running: "Running", ready: "Ready" } as const;
const rowKey = (r: object) => JSON.stringify(r); // uncontrolled rows redraw after a save
const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

function TechOptions({ techs, procedure }: { techs: Technician[]; procedure?: Procedure }) {
  return (
    <>
      <option value="">— Unassigned —</option>
      {techs.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}{procedure && !t.procedures.includes(procedure) ? ` (doesn't do ${PROCEDURE_LABEL[procedure]})` : ""}{!t.active ? " (inactive)" : ""}
        </option>
      ))}
    </>
  );
}
const ProcedureOptions = () => <>{PROCEDURES.map((p) => <option key={p} value={p}>{PROCEDURE_LABEL[p]}</option>)}</>;

// Activity timestamps like the mockup: today -> 16:42, this week -> THU, older -> 12 OCT.
function when(iso: string, tz: string, now: number) {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  if (day(d) === day(new Date(now))) return d.toLocaleTimeString("en-AU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (now - d.getTime() < 6 * 86400000) return d.toLocaleDateString("en-AU", { timeZone: tz, weekday: "short" }).toUpperCase();
  return d.toLocaleDateString("en-AU", { timeZone: tz, day: "numeric", month: "short" }).toUpperCase();
}

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ id }, { error, ok }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();

  const [{ data: job }, { data: lines }, { data: techs }, { data: actuals }, { data: states }, { data: sub }, { data: damage }, { data: photos }, { data: activity }, { data: running }, { data: s }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).maybeSingle<JobFull>(),
    supabase.from("quote_lines").select("*").eq("job_id", id).returns<Line[]>(),
    supabase.from("technicians").select("id, name, hourly_cost_rate, procedures, active, locked_until").order("name").returns<Technician[]>(),
    supabase.from("v_line_actuals").select("quote_line_id, actual_hours, helper_hours").eq("job_id", id),
    supabase.from("v_quote_line_state").select("quote_line_id, state").eq("job_id", id),
    supabase.from("v_job_substatus").select("job_id, substatus, reason, since, working_count").eq("job_id", id).maybeSingle<JobSubstatus>(),
    supabase.from("job_damage").select("id, panel, type, severity, note").eq("job_id", id).order("created_at").returns<(Damage & { id: string })[]>(),
    supabase.from("job_photos").select("id, path, caption, damage_id").eq("job_id", id).order("created_at").returns<PhotoRow[]>(),
    supabase.from("v_job_activity").select("at, kind, message").eq("job_id", id).order("at", { ascending: false }).limit(12).returns<Activity[]>(),
    supabase.from("work_segments").select("technician_id, quote_lines!inner(job_id)").eq("quote_lines.job_id", id).is("ended_at", null),
    supabase.from("settings").select("time_zone, gst_rate").single<{ time_zone: string; gst_rate: number }>(),
  ]);
  if (!job) notFound();

  const tz = s?.time_zone ?? "Australia/Brisbane";
  const gst = Number(s?.gst_rate ?? 0.1);
  const now = Date.now();
  const allTechs = techs ?? [];
  const techName = new Map(allTechs.map((t) => [t.id, t.name]));
  const sorted = [...(lines ?? [])].sort((a, b) => PROCEDURES.indexOf(a.procedure) - PROCEDURES.indexOf(b.procedure) || a.description.localeCompare(b.description));
  const actual = new Map((actuals ?? []).map((a) => [a.quote_line_id, a]));
  const state = new Map((states ?? []).map((x) => [x.quote_line_id, x.state as keyof typeof STATE_LABEL]));
  const quotedTotal = sorted.reduce((sum, l) => sum + Number(l.quoted_hours), 0);
  const unassigned = sorted.filter((l) => !l.assigned_technician_id && !l.completed_at).length;
  const priced = sorted.filter((l) => l.price !== null);
  const totalInc = priced.reduce((sum, l) => sum + Number(l.price), 0) * (1 + gst);
  const dmg = damage ?? [];
  const pics = photos ?? [];
  const panels = panelsFor(job.body_type);

  const complete = isComplete(job.stage);
  const current = Math.min(job.stage, COMPLETE);
  const shortName = (n?: string) => (n ? n.replace(/\s*\(.*\)/, "").replace(/^(\S+)\s+(\S).*$/, "$1 $2.") : "—");
  const runningTech = (running ?? [])[0]?.technician_id as string | undefined;
  const nextOwner = sorted.find((l) => !l.completed_at && l.assigned_technician_id)?.assigned_technician_id ?? undefined;
  const tech = shortName(techName.get(runningTech ?? nextOwner ?? ""));
  const eta = complete ? "Ready now" : job.eta ? new Date(`${job.eta}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).replace(",", "") : "Not set";

  const eyebrow = [`JOB ${job.job_number ?? ""}`, job.bay && `BAY ${job.bay}`, `${job.insurer ? `INSURANCE: ${job.insurer}` : "PRIVATE"}`].filter(Boolean).join(" · ").toUpperCase();
  const subline = [job.rego, job.colour, job.vin].filter(Boolean).join(" · ");
  const RED = "var(--progress)", GREEN = "var(--complete)", TRACK = "var(--border)";

  return (
    <div className="mx-auto flex max-w-[1376px] flex-col gap-6">
      {/* toolbar (mockup header row) */}
      <div className="flex flex-wrap items-center gap-5">
        <Link href="/admin" aria-label="Back to dashboard" className="plain cut-sm inline-flex h-11 w-11 items-center justify-center border border-line bg-bg-subtle text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </Link>
        <span className="grow font-mono text-[12px] uppercase tracking-[.12em] text-muted">// JOBS / {job.job_number}</span>
        <form action={advanceStage}>
          <input type="hidden" name="id" value={job.id} />
          {complete ? (
            <button type="button" disabled className={`${buttonCls("complete")} disabled:opacity-100`}>Job complete</button>
          ) : (
            <Button>{current === STAGE_COUNT - 1 ? "Mark complete" : "Advance stage"}</Button>
          )}
        </form>
      </div>
      <Flash error={error} ok={ok} />

      {/* title + key facts */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[12px] tracking-[.18em] text-accent">{eyebrow}</span>
          <h1 className="m-0 font-display text-[44px] font-bold uppercase leading-tight tracking-[.03em] text-ink max-sm:text-[32px]">{[job.make, job.model].filter(Boolean).join(" ") || job.rego}</h1>
          <span className="font-mono text-[14px] text-muted">{subline}</span>
        </div>
        <div className="cut flex gap-7 border border-line bg-bg px-[22px] py-4">
          <div className="flex flex-col gap-1"><span className="font-mono text-[11px] tracking-[.14em] text-muted">TECH</span><span className="font-display text-[18px] font-semibold">{tech}</span></div>
          <div className="flex flex-col gap-1"><span className="font-mono text-[11px] tracking-[.14em] text-muted">ETA</span><span className={`font-display text-[18px] font-semibold ${complete ? "text-complete" : "text-accent"}`}>{eta}</span></div>
          <div className="flex flex-col gap-1"><span className="font-mono text-[11px] tracking-[.14em] text-muted">ESTIMATE</span><span className="font-display text-[18px] font-semibold">{priced.length ? money(totalInc) : "—"}</span></div>
        </div>
      </div>

      {/* stage progress */}
      <section aria-label="Repair stages" className={`cut bg-bg px-6 py-[22px] ${complete ? "border border-complete shadow-[0_0_24px_rgba(22,163,74,.18)]" : "border border-line"}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] tracking-[.16em] text-muted">REPAIR PROGRESS</span>
          <span className={`font-mono text-[12px] font-medium tracking-[.14em] ${complete ? "text-complete" : "text-progress"}`}>
            {complete ? "COMPLETE · READY TO COLLECT" : `IN PROGRESS · ${current} OF ${STAGE_COUNT} DONE`}
            {sub && !complete && sub.substatus === "paused" ? ` · PAUSED: ${sub.reason?.toUpperCase()}` : ""}
          </span>
        </div>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 p-0">
          {STAGES.map((name, i) => {
            const done = i < current, now_ = i === current && !complete;
            const bg = complete || done ? (complete ? GREEN : RED) : now_ ? `linear-gradient(90deg,${RED} 50%,${TRACK} 50%)` : TRACK;
            const glow = complete ? "0 0 10px rgba(22,163,74,.45)" : done || now_ ? "0 0 10px rgba(225,29,46,.35)" : "none";
            return (
              <li key={name} className="flex flex-col gap-2.5">
                <div className="h-2 transition-[background] duration-300" style={{ background: bg, boxShadow: glow }} />
                <span className="font-mono text-[11px] tracking-[.14em] text-muted">{String(i + 1).padStart(2, "0")}{complete || done ? " · DONE" : now_ ? " · NOW" : ""}</span>
                <span className={`font-display text-[15px] font-semibold uppercase tracking-[.06em] ${complete ? "text-complete" : now_ ? "text-progress" : done ? "text-ink" : "text-muted"}`}>{name}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-wrap gap-6">
        {/* damage scan + photos */}
        <section aria-labelledby="dmg" className="cut scan flex min-w-0 flex-[1_1_520px] flex-col gap-4 border border-line bg-bg px-6 py-[22px]">
          <div className="flex items-center justify-between">
            <h2 id="dmg" className="m-0 font-display text-[18px] uppercase tracking-[.14em]">Damage scan</h2>
            <span className={`font-mono text-[11px] tracking-[.14em] ${dmg.length ? "text-hazard-text" : "text-muted"}`}>
              {dmg.length ? `${new Set(dmg.map((d) => d.panel)).size} PANEL${new Set(dmg.map((d) => d.panel)).size === 1 ? "" : "S"} FLAGGED` : "NO DAMAGE RECORDED"}
            </span>
          </div>
          <DamageScan body={job.body_type} damage={dmg}
            title={`Top-down ${job.body_type.replace(/_/g, " ")} outline${dmg.length ? ` with ${dmg.map((d) => `${panelLabel(job.body_type, d.panel)} (${d.type})`).join(", ")} flagged as damaged` : ", no damage recorded"}`} />
          <PhotoGallery photos={pics.map((p) => ({ url: photoUrl(p.path), caption: p.caption ?? "" }))} />
        </section>

        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-6">
          <section aria-labelledby="est" className="cut flex flex-col gap-1 border border-line bg-bg px-6 py-[22px]">
            <h2 id="est" className="m-0 mb-2.5 font-display text-[18px] uppercase tracking-[.14em]">Estimate</h2>
            {sorted.map((l) => (
              <div key={l.id} className="flex justify-between gap-4 border-b border-divider py-3">
                <span className="text-body">{l.description}</span>
                <span className="font-mono text-muted">{l.price === null ? "—" : money(Number(l.price))}</span>
              </div>
            ))}
            {!sorted.length && <p className="py-3 text-muted">No quote lines yet.</p>}
            <div className="flex justify-between pt-3.5">
              <span className="font-display font-bold tracking-[.12em]">TOTAL INC GST</span>
              <span className="font-mono text-[16px] text-accent">{priced.length ? money(totalInc) : "—"}</span>
            </div>
            {priced.length < sorted.length && <span className="text-[12px] text-muted">{sorted.length - priced.length} line(s) not priced yet. Add prices under Manage job.</span>}
          </section>

          <section aria-labelledby="log" className="cut flex flex-col gap-3.5 border border-line bg-bg px-6 py-[22px]">
            <h2 id="log" className="m-0 font-display text-[18px] uppercase tracking-[.14em]">Activity log</h2>
            {(activity ?? []).map((g, i) => (
              <div key={i} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
                <span className="font-mono text-[12px] text-accent">{when(g.at, tz, now)}</span>
                <span className="leading-normal text-body">{g.message}</span>
              </div>
            ))}
            {!activity?.length && <p className="text-muted">Nothing yet.</p>}
          </section>
        </div>
      </div>

      {/* ------------------------------------------------------------ manage */}
      <h2 className="m-0 mt-4 font-display text-[24px] font-bold uppercase tracking-[.08em]">Manage job</h2>

      <Card title={`Quote lines · ${quotedTotal.toFixed(1)} h quoted`}
        aside={<div className="flex flex-wrap items-center gap-2"><Badge tone={job.status === "done" ? "stone" : "blue"}>{JOB_STATUS_LABEL[job.status]}</Badge>
          {sub && sub.substatus !== "done" && <Badge tone={SUBSTATUS_TONE[sub.substatus] === "blue" ? "neon" : SUBSTATUS_TONE[sub.substatus]}>{substatusLabel(sub)}{(sub.substatus === "paused" || sub.substatus === "working") && sub.since ? ` · ${durationSince(sub.since)}` : ""}</Badge>}</div>}>
        <p className="mb-4 text-muted">Procedures unlock in order: Strip → Repair → Prep → Paint → Refit. The assigned technician owns the line and is the only one who can complete it. Prices are ex GST.</p>
        {sorted.length > 0 && (
          <div className="mb-6 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead className={theadCls}>
                <tr><th className={th}>Procedure</th><th className={th}>Description</th><th className={th}>Quoted h</th><th className={th}>Price $</th><th className={th}>Owner</th><th className={`${th} text-right`}>Actual h</th><th className={th}>State</th><th className={th}></th></tr>
              </thead>
              <tbody>
                {sorted.map((l) => {
                  const fid = `line-${l.id}`;
                  const a = actual.get(l.id);
                  const st = state.get(l.id) ?? "ready";
                  const over = a && Number(l.quoted_hours) > 0 && Number(a.actual_hours) > Number(l.quoted_hours);
                  return (
                    <tr key={rowKey(l)}>
                      <td className={td}>
                        <form id={fid} action={updateLine}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="job_id" value={job.id} /></form>
                        <Select form={fid} name="procedure" defaultValue={l.procedure}><ProcedureOptions /></Select>
                      </td>
                      <td className={td}><Input form={fid} name="description" defaultValue={l.description} required className="w-full min-w-44" /></td>
                      <td className={td}><Input form={fid} name="quoted_hours" type="number" step="0.1" min="0" defaultValue={l.quoted_hours} required className="w-20" /></td>
                      <td className={td}><Input form={fid} name="price" type="number" step="0.01" min="0" defaultValue={l.price ?? ""} className="w-24" /></td>
                      <td className={td}><Select form={fid} name="assigned_technician_id" defaultValue={l.assigned_technician_id ?? ""} className="w-52"><TechOptions techs={allTechs} procedure={l.procedure} /></Select></td>
                      <td className={`${td} text-right tabular-nums ${over ? "font-semibold text-progress" : ""}`}>
                        {Number(a?.actual_hours ?? 0).toFixed(1)}
                        {Number(a?.helper_hours ?? 0) > 0 && <span className="block text-[12px] font-normal text-muted">incl. {Number(a?.helper_hours).toFixed(1)} helper</span>}
                      </td>
                      <td className={td}><Badge tone={STATE_TONE[st] === "blue" ? "neon" : STATE_TONE[st]}>{STATE_LABEL[st]}</Badge></td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        <div className="flex justify-end gap-2">
                          <Button form={fid} type="submit" variant="secondary">Save</Button>
                          {l.completed_at ? (
                            <form action={reopenLine}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="job_id" value={job.id} /><Button variant="secondary">Reopen</Button></form>
                          ) : (
                            <form action={deleteLine}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="job_id" value={job.id} /><Button variant="danger" title="Only possible if no time has been logged">Delete</Button></form>
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
          <form action={autoAssign} className="cut-sm mb-6 flex flex-wrap items-center gap-3 border border-hazard bg-orange-50 px-4 py-3">
            <input type="hidden" name="job_id" value={job.id} />
            <span>{unassigned} open line{unassigned === 1 ? " has" : "s have"} no owner.</span>
            <Button variant="secondary">Auto-assign (fewest open hours)</Button>
          </form>
        )}
        <form key={String(now)} action={addLine} className="grid grid-cols-1 items-end gap-3 border-t border-divider pt-5 sm:grid-cols-[9rem_1fr_6rem_7rem_13rem_auto]">
          <input type="hidden" name="job_id" value={job.id} />
          <Field label="Procedure"><Select name="procedure" defaultValue="repair"><ProcedureOptions /></Select></Field>
          <Field label="Description"><Input name="description" required placeholder="e.g. Left bumper – repair" /></Field>
          <Field label="Quoted h"><Input name="quoted_hours" type="number" step="0.1" min="0" required /></Field>
          <Field label="Price $ ex GST"><Input name="price" type="number" step="0.01" min="0" /></Field>
          <Field label="Owner"><Select name="assigned_technician_id" defaultValue=""><TechOptions techs={allTechs.filter((t) => t.active)} /></Select></Field>
          <Button type="submit">Add line</Button>
        </form>
      </Card>

      <Card title="Job details">
        <form key={rowKey(job)} action={updateJob} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={job.id} />
          <JobFields job={job} />
          <div><Button type="submit">Save details</Button></div>
        </form>
      </Card>

      <div className="flex flex-wrap gap-6">
        <Card title="Damage" className="min-w-0 flex-[1_1_420px]">
          {dmg.length > 0 && (
            <ul className="mb-4 flex list-none flex-col p-0">
              {dmg.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 border-b border-divider py-2.5">
                  <span><b className="font-semibold text-ink">{panelLabel(job.body_type, d.panel)}</b> · {d.type} · <span className="text-muted">{d.severity}</span>{d.note ? <span className="text-muted"> · {d.note}</span> : null}</span>
                  <form action={deleteDamage}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="job_id" value={job.id} /><Button variant="danger">Remove</Button></form>
                </li>
              ))}
            </ul>
          )}
          <form key={String(now)} action={addDamage} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <input type="hidden" name="job_id" value={job.id} />
            <Field label="Panel"><Select name="panel" required defaultValue="">
              <option value="" disabled>Choose panel…</option>
              {panels.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select></Field>
            <Field label="Type"><Select name="type" defaultValue="dent">{DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
            <Field label="Severity"><Select name="severity" defaultValue="moderate">{SEVERITIES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
            <Field label="Note"><Input name="note" placeholder="optional" /></Field>
            <div><Button type="submit">Add damage</Button></div>
          </form>
          <p className="mt-3 text-[12px] text-muted">Panels follow the body type set in Job details ({job.body_type.replace(/_/g, " ")}).</p>
        </Card>

        <Card title="Photos" className="min-w-0 flex-[1_1_420px]">
          <PhotoUpload jobId={job.id} damage={dmg.map((d) => ({ id: d.id, label: `${panelLabel(job.body_type, d.panel)} · ${d.type}` }))} />
          {pics.length > 0 && (
            <ul className="mt-4 flex list-none flex-col p-0">
              {pics.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-divider py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p.path)} alt="" className="h-12 w-16 object-cover" />
                  <span className="grow"><span className="font-mono text-[11px] tracking-[.12em] text-muted">PHOTO {String(i + 1).padStart(2, "0")}</span> {p.caption}</span>
                  <form action={deletePhoto}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="job_id" value={job.id} /><Button variant="danger">Remove</Button></form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Customer & status">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">Customer tracker</span>
            <Link href={`/track/${job.track_token}`} target="_blank" className="font-mono text-[13px]">/track/{job.track_token.slice(0, 8)}…</Link>
            <CopyLink path={`/track/${job.track_token}`} label="Copy tracker link" />
            <span className="text-[12px] text-muted">Send this link to the customer. It shows progress and photos only, no prices or claim details.</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={stageBack}><input type="hidden" name="id" value={job.id} /><Button variant="secondary" disabled={job.stage <= 0}>Back a stage</Button></form>
            <form action={setJobStatus}>
              <input type="hidden" name="id" value={job.id} />
              {job.status === "done" ? <Button variant="secondary" name="status" value="in_progress">Reopen job</Button> : <Button variant="secondary" name="status" value="done">Mark all work done</Button>}
            </form>
            {!job.collected_at ? (
              <form action={markCollected}><input type="hidden" name="id" value={job.id} /><Button variant="secondary">Mark collected</Button></form>
            ) : (
              <Badge tone="green">Collected {new Date(job.collected_at).toLocaleDateString("en-AU", { timeZone: tz })}</Badge>
            )}
            <form action={deleteJob} className="ml-auto"><input type="hidden" name="id" value={job.id} /><Button variant="danger" title="Only possible if no time has been logged">Delete job</Button></form>
          </div>
        </div>
      </Card>
    </div>
  );
}
