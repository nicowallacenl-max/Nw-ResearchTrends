"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { back, friendly } from "@/lib/flash";
import { num, optStr, str } from "@/lib/form";
import { PROCEDURES, PROCEDURE_LABEL, STATUS_REASONS, STATUS_REASON_LABEL, type Procedure, type StatusReason } from "@/lib/types";
import { BODY_TYPES, DAMAGE_TYPES, SEVERITIES, type BodyType } from "@/lib/vehicle";

function jobFields(form: FormData) {
  return {
    rego: str(form, "rego").toUpperCase(),
    make: optStr(form, "make"),
    model: optStr(form, "model"),
    colour: optStr(form, "colour"),
    ibodyshop_ref: optStr(form, "ibodyshop_ref"),
    photo_url: optStr(form, "photo_url"),
    body_type: (BODY_TYPES as readonly string[]).includes(str(form, "body_type")) ? (str(form, "body_type") as BodyType) : "sedan",
    vin: optStr(form, "vin")?.toUpperCase() ?? null,
    bay: optStr(form, "bay"),
    due_in: optStr(form, "due_in"),
    due_out: optStr(form, "due_out"),
    customer_name: optStr(form, "customer_name"),
    customer_phone: optStr(form, "customer_phone"),
    insurer: optStr(form, "insurer"),
    claim_number: optStr(form, "claim_number"),
    work_summary: optStr(form, "work_summary"),
  };
}

type Db = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
type AssignResult = { error: null; assigned: number; skipped: string[] } | { error: string; assigned?: never; skipped?: never };

// The standard quote: one line per procedure, in workshop order, 0 h (hours come from the assessment, or from
// Crashzone once integrated). Only added to a job with no lines. Owners are then auto-assigned.
async function insertStandardLines(supabase: Db, jobId: string): Promise<AssignResult> {
  const { count, error: e0 } = await supabase.from("quote_lines").select("id", { count: "exact", head: true }).eq("job_id", jobId);
  if (e0) return { error: friendly(e0) };
  if (count) return { error: "This job already has quote lines." };
  const { error } = await supabase.from("quote_lines").insert(
    PROCEDURES.map((p) => ({ job_id: jobId, procedure: p, description: PROCEDURE_LABEL[p], quoted_hours: 0 })),
  );
  if (error) return { error: friendly(error) };
  return assignOpenLines(supabase, jobId);
}

export async function createJob(form: FormData) {
  const { supabase } = await requireAdmin();
  const fields = jobFields(form);
  if (!fields.rego) back("/admin/jobs/new", { error: "Rego is required." });
  const { data, error } = await supabase.from("jobs").insert(fields).select("id").single();
  if (error) back("/admin/jobs/new", { error: friendly(error) });
  if (form.get("standard_lines") !== "on") {
    redirect(`/admin/jobs/${data.id}?ok=${encodeURIComponent("Job created. Now add its quote lines.")}`);
  }
  const r = await insertStandardLines(supabase, data.id);
  const flash: Record<string, string> = r.error !== null
    ? { error: `Job created, but the standard quote lines weren't added: ${r.error}` }
    : r.skipped.length
      ? { error: `Job created with the standard quote lines. No active technician does: ${r.skipped.join(", ")}. Pick an owner for those.` }
      : { ok: "Job created with the standard quote lines. Add hours and prices once it's assessed." };
  redirect(`/admin/jobs/${data.id}?${new URLSearchParams(flash)}`);
}

// "Add standard lines" on a job that has none (e.g. the box was unticked, or jobs from before this existed).
export async function addStandardLines(form: FormData) {
  const { supabase } = await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const r = await insertStandardLines(supabase, jobId);
  if (r.error !== null) back(path, { error: r.error });
  back(path, r.skipped!.length
    ? { error: `Standard lines added. No active technician does: ${r.skipped.join(", ")}. Pick an owner for those.` }
    : { ok: "Standard quote lines added. Add hours and prices once it's assessed." });
}

export async function updateJob(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const fields = jobFields(form);
  if (!fields.rego) back(`/admin/jobs/${id}`, { error: "Rego is required." });
  const { error } = await supabase.from("jobs").update(fields).eq("id", id);
  if (error) back(`/admin/jobs/${id}`, { error: friendly(error) });
  back(`/admin/jobs/${id}`, { ok: "Job saved." });
}

export async function deleteJob(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) {
    back(`/admin/jobs/${id}`, {
      error: error.code === "23503" ? "Time has already been logged on this job, so it can't be deleted." : friendly(error),
    });
  }
  revalidatePath("/admin/jobs");
  back("/admin/jobs", { ok: "Job deleted." });
}

function lineFields(form: FormData) {
  const procedure = str(form, "procedure") as Procedure;
  return {
    description: str(form, "description"),
    procedure,
    quoted_hours: num(form, "quoted_hours"),
    assigned_technician_id: optStr(form, "assigned_technician_id"),
    price: num(form, "price"), // ex GST; empty = not priced yet
  };
}

function validateLine(path: string, f: ReturnType<typeof lineFields>) {
  if (!f.description) back(path, { error: "Description is required." });
  if (!PROCEDURES.includes(f.procedure)) back(path, { error: "Pick a procedure." });
  if (f.quoted_hours === null || f.quoted_hours < 0) back(path, { error: "Quoted hours must be 0 or more." });
  if (f.price !== null && f.price < 0) back(path, { error: "Price can't be negative." });
}

export async function addLine(form: FormData) {
  const { supabase } = await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const fields = lineFields(form);
  validateLine(path, fields);
  const { error } = await supabase.from("quote_lines").insert({ ...fields, job_id: jobId });
  if (error) back(path, { error: friendly(error) });
  back(path, { ok: "Quote line added." });
}

export async function updateLine(form: FormData) {
  const { supabase } = await requireAdmin();
  const path = `/admin/jobs/${str(form, "job_id")}`;
  const fields = lineFields(form);
  validateLine(path, fields);
  const { error } = await supabase.from("quote_lines").update(fields).eq("id", str(form, "id"));
  if (error) back(path, { error: friendly(error) });
  back(path, { ok: "Quote line saved." });
}

export async function deleteLine(form: FormData) {
  const { supabase } = await requireAdmin();
  const path = `/admin/jobs/${str(form, "job_id")}`;
  const { error } = await supabase.from("quote_lines").delete().eq("id", str(form, "id"));
  if (error) {
    back(path, {
      error: error.code === "23503" ? "Time has been logged on this line, so it can't be deleted." : friendly(error),
    });
  }
  back(path, { ok: "Quote line deleted." });
}

export async function reopenLine(form: FormData) {
  const { supabase } = await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const { data: line, error } = await supabase.from("quote_lines").update({ completed_at: null }).eq("id", str(form, "id")).select("description").single();
  if (error) back(path, { error: friendly(error) });
  await supabase.from("job_events").insert({ job_id: jobId, kind: "line_reopened", message: `Office reopened ${line.description}` });
  // A job with an open line can't be "done".
  await supabase.from("jobs").update({ status: "in_progress" }).eq("id", jobId).eq("status", "done");
  back(path, { ok: "Quote line reopened." });
}

// Spec: each item goes to a technician who does that procedure, picking the one with the fewest open hours.
// Only fills unassigned lines, so manual choices are never overwritten.
async function assignOpenLines(supabase: Db, jobId: string): Promise<AssignResult> {
  const [{ data: lines, error: e1 }, { data: load, error: e2 }] = await Promise.all([
    supabase.from("quote_lines").select("id, procedure, quoted_hours").eq("job_id", jobId).is("assigned_technician_id", null).is("completed_at", null),
    supabase.from("v_technician_open_hours").select("technician_id, procedures, active, open_hours"),
  ]);
  if (e1 || e2) return { error: friendly(e1 ?? e2) };

  const openHours = new Map<string, number>((load ?? []).filter((t) => t.active).map((t) => [t.technician_id, Number(t.open_hours)]));
  const does = new Map<string, Procedure[]>((load ?? []).map((t) => [t.technician_id, t.procedures]));

  const skipped: string[] = [];
  let assigned = 0;
  for (const line of lines ?? []) {
    const candidates = [...openHours.entries()].filter(([id]) => does.get(id)?.includes(line.procedure));
    if (!candidates.length) {
      skipped.push(line.procedure);
      continue;
    }
    candidates.sort((a, b) => a[1] - b[1]);
    const [techId] = candidates[0];
    const { error } = await supabase.from("quote_lines").update({ assigned_technician_id: techId }).eq("id", line.id);
    if (error) return { error: friendly(error) };
    // Keep the balance as we go. Count a 0 h line as a little load so a fresh 5-line job spreads across the team.
    openHours.set(techId, candidates[0][1] + Math.max(Number(line.quoted_hours), 0.01));
    assigned++;
  }
  return { error: null, assigned, skipped: [...new Set(skipped)].map((p) => PROCEDURE_LABEL[p as Procedure] ?? p) };
}

export async function autoAssign(form: FormData) {
  const { supabase } = await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const r = await assignOpenLines(supabase, jobId);
  if (r.error !== null) back(path, { error: r.error });
  if (!r.assigned && !r.skipped.length) back(path, { ok: "Every open line already has a technician." });
  back(path, r.skipped.length
    ? { error: `Assigned what I could. No active technician does: ${r.skipped.join(", ")}.` }
    : { ok: `Assigned ${r.assigned} line${r.assigned === 1 ? "" : "s"}.` });
}


// ---------------------------------------------------------------- status reason (header dropdown)

// Review -> Approved -> Completed -> Picked up. Completed is automatic (all lines done); the database keeps
// collected_at and the activity log in step. Rules here are the friendly checks before the change.
export async function setStatusReason(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const path = `/admin/jobs/${id}`;
  const to = str(form, "status_reason") as StatusReason;
  if (!(STATUS_REASONS as readonly string[]).includes(to)) back(path, { error: "Pick a status." });

  const [{ data: job }, { data: lines }, { count: running }] = await Promise.all([
    supabase.from("jobs").select("status_reason, due_in").eq("id", id).single<{ status_reason: StatusReason; due_in: string | null }>(),
    supabase.from("quote_lines").select("assigned_technician_id, completed_at").eq("job_id", id),
    supabase.from("work_segments").select("id, quote_lines!inner(job_id)", { count: "exact", head: true }).eq("quote_lines.job_id", id).is("ended_at", null),
  ]);
  if (!job) back(path, { error: "Job not found." });
  if (job.status_reason === to) back(path, { ok: `Status is already ${STATUS_REASON_LABEL[to]}.` });
  const all = lines ?? [];
  const allDone = all.length > 0 && all.every((l) => l.completed_at);

  if ((to === "review" || to === "picked_up") && running) {
    back(path, { error: `Someone is clocked on to this job. They need to pause or complete before it can be set to ${STATUS_REASON_LABEL[to]}.` });
  }
  if (to === "review" || to === "approved") {
    if (allDone) back(path, { error: "Every job line is complete, so the job is Completed. Reopen a line to move it back." });
  }
  if (to === "approved") {
    const missing = [
      !all.some((l) => l.assigned_technician_id) && "at least one job line with an owner",
      !job.due_in && "a Due in date",
    ].filter(Boolean);
    if (missing.length) back(path, { error: `Before approving, add ${missing.join(" and ")}.` });
  }
  if (to === "completed" && !allDone) {
    back(path, { error: "Completed is set automatically when every job line is complete." });
  }

  const { error } = await supabase.from("jobs").update({ status_reason: to }).eq("id", id);
  if (error) back(path, { error: friendly(error) });
  back(path, {
    ok: {
      review: "Status set to Review. The job is off the wall board.",
      approved: "Approved. The job shows on the wall board from its Due in date.",
      completed: "Status set to Completed.",
      picked_up: "Picked up. The job is now inactive.",
    }[to],
  });
}

export async function addDamage(form: FormData) {
  const { supabase } = await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const panel = str(form, "panel"), type = str(form, "type"), severity = str(form, "severity") || "moderate";
  if (!panel) back(path, { error: "Pick a panel." });
  if (!(DAMAGE_TYPES as readonly string[]).includes(type)) back(path, { error: "Pick a damage type." });
  if (!(SEVERITIES as readonly string[]).includes(severity)) back(path, { error: "Pick a severity." });
  const { error } = await supabase.from("job_damage").insert({ job_id: jobId, panel, type, severity, note: optStr(form, "note") });
  if (error) back(path, { error: friendly(error) });
  back(path, { ok: "Damage added." });
}

export async function deleteDamage(form: FormData) {
  const { supabase } = await requireAdmin();
  const path = `/admin/jobs/${str(form, "job_id")}`;
  const { error } = await supabase.from("job_damage").delete().eq("id", str(form, "id"));
  if (error) back(path, { error: friendly(error) });
  back(path, { ok: "Damage removed." });
}

// Called by the browser after it uploads the file straight to Supabase Storage (keeps big phone photos off the server).
export async function recordPhoto(input: { jobId: string; path: string; caption: string; damageId: string | null }) {
  const { supabase } = await requireAdmin();
  if (!input.path.startsWith(`${input.jobId}/`)) return { ok: false, error: "Bad photo path." };
  const { error } = await supabase.from("job_photos").insert({ job_id: input.jobId, path: input.path, caption: input.caption || null, damage_id: input.damageId });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true };
}

// One activity-log line per upload batch ("3 photos added"), not one per photo.
export async function logPhotosAdded(input: { jobId: string; count: number }) {
  const { supabase } = await requireAdmin();
  if (input.count > 0) {
    await supabase.from("job_events").insert({ job_id: input.jobId, kind: "photo", message: `${input.count} photo${input.count === 1 ? "" : "s"} added` });
  }
  revalidatePath(`/admin/jobs/${input.jobId}`);
}

export async function deletePhoto(form: FormData) {
  const { supabase } = await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;
  const { data: photo } = await supabase.from("job_photos").select("path").eq("id", str(form, "id")).single();
  if (photo) await supabase.storage.from("job-photos").remove([photo.path]);
  const { error } = await supabase.from("job_photos").delete().eq("id", str(form, "id"));
  if (error) back(path, { error: friendly(error) });
  back(path, { ok: "Photo removed." });
}
