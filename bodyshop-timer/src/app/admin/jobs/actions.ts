"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { back, friendly } from "@/lib/flash";
import { num, optStr, str } from "@/lib/form";
import { PROCEDURES, type Procedure } from "@/lib/types";
import { COMPLETE } from "@/lib/stages";
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
    eta: optStr(form, "eta"),
    customer_name: optStr(form, "customer_name"),
    customer_phone: optStr(form, "customer_phone"),
    insurer: optStr(form, "insurer"),
    claim_number: optStr(form, "claim_number"),
    work_summary: optStr(form, "work_summary"),
  };
}

export async function createJob(form: FormData) {
  const { supabase } = await requireAdmin();
  const fields = jobFields(form);
  if (!fields.rego) back("/admin/jobs/new", { error: "Rego is required." });
  const { data, error } = await supabase.from("jobs").insert(fields).select("id").single();
  if (error) back("/admin/jobs/new", { error: friendly(error) });
  redirect(`/admin/jobs/${data.id}?ok=${encodeURIComponent("Job created. Now add its quote lines.")}`);
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

// Admin can reopen a finished job (spec: "admin can reopen it"). Lines stay as they are.
export async function setJobStatus(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const status = str(form, "status") as "open" | "in_progress" | "done";
  const { error } = await supabase.from("jobs").update({ status }).eq("id", id);
  if (error) back(`/admin/jobs/${id}`, { error: friendly(error) });
  back(`/admin/jobs/${id}`, { ok: status === "done" ? "Job marked done." : "Job reopened." });
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
  const { error } = await supabase.from("quote_lines").update({ completed_at: null }).eq("id", str(form, "id"));
  if (error) back(path, { error: friendly(error) });
  // A job with an open line can't be "done".
  await supabase.from("jobs").update({ status: "in_progress" }).eq("id", jobId).eq("status", "done");
  back(path, { ok: "Quote line reopened." });
}

// Spec: each item goes to a technician who does that procedure, picking the one with the fewest open hours.
// Only fills unassigned lines, so manual choices are never overwritten.
export async function autoAssign(form: FormData) {
  const { supabase } = await requireAdmin();
  const jobId = str(form, "job_id");
  const path = `/admin/jobs/${jobId}`;

  const [{ data: lines, error: e1 }, { data: load, error: e2 }] = await Promise.all([
    supabase.from("quote_lines").select("id, procedure, quoted_hours").eq("job_id", jobId).is("assigned_technician_id", null).is("completed_at", null),
    supabase.from("v_technician_open_hours").select("technician_id, procedures, active, open_hours"),
  ]);
  if (e1 || e2) back(path, { error: friendly(e1 ?? e2) });
  if (!lines?.length) back(path, { ok: "Every open line already has a technician." });

  const openHours = new Map<string, number>((load ?? []).filter((t) => t.active).map((t) => [t.technician_id, Number(t.open_hours)]));
  const does = new Map<string, Procedure[]>((load ?? []).map((t) => [t.technician_id, t.procedures]));

  const skipped: string[] = [];
  for (const line of lines) {
    const candidates = [...openHours.entries()].filter(([id]) => does.get(id)?.includes(line.procedure));
    if (!candidates.length) {
      skipped.push(line.procedure);
      continue;
    }
    candidates.sort((a, b) => a[1] - b[1]);
    const [techId] = candidates[0];
    const { error } = await supabase.from("quote_lines").update({ assigned_technician_id: techId }).eq("id", line.id);
    if (error) back(path, { error: friendly(error) });
    openHours.set(techId, candidates[0][1] + Number(line.quoted_hours)); // keep the balance as we go
  }

  back(path, skipped.length
    ? { error: `Assigned what I could. No active technician does: ${[...new Set(skipped)].join(", ")}.` }
    : { ok: `Assigned ${lines.length} line${lines.length === 1 ? "" : "s"}.` });
}


// ---------------------------------------------------------------- Workshop OS: stage, collection, damage, photos

// "ADVANCE STAGE" / "MARK COMPLETE" on the job page.
export async function advanceStage(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const { data: job } = await supabase.from("jobs").select("stage").eq("id", id).single();
  if (!job || job.stage >= COMPLETE) back(`/admin/jobs/${id}`, { error: "This job is already complete." });
  const { error } = await supabase.from("jobs").update({ stage: job.stage + 1 }).eq("id", id);
  if (error) back(`/admin/jobs/${id}`, { error: friendly(error) });
  back(`/admin/jobs/${id}`, { ok: job.stage + 1 >= COMPLETE ? "Job complete · ready to collect." : "Stage advanced." });
}

// Correction: move the job back one stage (e.g. advanced by mistake, or QC failed).
export async function stageBack(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const { data: job } = await supabase.from("jobs").select("stage").eq("id", id).single();
  if (!job || job.stage <= 0) back(`/admin/jobs/${id}`, { error: "Already at the first stage." });
  const { error } = await supabase.from("jobs").update({ stage: job.stage - 1 }).eq("id", id);
  if (error) back(`/admin/jobs/${id}`, { error: friendly(error) });
  back(`/admin/jobs/${id}`, { ok: "Moved back a stage." });
}

export async function markCollected(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const { error } = await supabase.from("jobs").update({ collected_at: new Date().toISOString(), stage: COMPLETE }).eq("id", id);
  if (error) back(`/admin/jobs/${id}`, { error: friendly(error) });
  back(`/admin/jobs/${id}`, { ok: "Marked as collected. The job leaves the workshop dashboard." });
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
