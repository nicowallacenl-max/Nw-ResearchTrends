export const PROCEDURES = ["strip", "panel", "repair", "prep", "paint", "refit"] as const;
export type Procedure = (typeof PROCEDURES)[number];

export const PROCEDURE_LABEL: Record<Procedure, string> = {
  strip: "Strip",
  panel: "Panel",
  repair: "Repair",
  prep: "Prep",
  paint: "Paint",
  refit: "Refit",
};

// Internal work status (kept in sync by the database). The office works with Status + Status reason below.
export type JobStatus = "open" | "in_progress" | "done";

// Job lifecycle. Status is Active until the vehicle is picked up, then Inactive.
export const STATUS_REASONS = ["review", "approved", "completed", "picked_up"] as const;
export type StatusReason = (typeof STATUS_REASONS)[number];
export const STATUS_REASON_LABEL: Record<StatusReason, string> = { review: "Review", approved: "Approved", completed: "Completed", picked_up: "Picked up" };
export const STATUS_REASON_TONE: Record<StatusReason, "stone" | "neon" | "green" | "blue"> = { review: "stone", approved: "neon", completed: "green", picked_up: "blue" };
export const isActive = (r: StatusReason) => r !== "picked_up";

export type HelperPolicy = "allowed" | "owner_approval" | "not_allowed";
export const HELPER_POLICY_LABEL: Record<HelperPolicy, string> = {
  allowed: "Allowed",
  owner_approval: "Allowed with owner's OK",
  not_allowed: "Not allowed",
};

export type Job = {
  id: string;
  ibodyshop_ref: string | null;
  rego: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  photo_url: string | null;
  status: JobStatus;
  status_reason: StatusReason;
  created_at: string;
};

export type QuoteLine = {
  id: string;
  job_id: string;
  description: string;
  procedure: Procedure;
  quoted_hours: number;
  assigned_technician_id: string | null;
  completed_at: string | null;
};

export type Technician = {
  id: string;
  name: string;
  hourly_cost_rate: number;
  procedures: Procedure[];
  active: boolean;
  locked_until: string | null;
};

export type DelayReason = { id: string; label: string; active: boolean; system: boolean };

export type Settings = {
  knock_off_time: string;
  time_zone: string;
  helper_policy: HelperPolicy;
  pin_max_attempts: number;
  pin_lock_minutes: number;
  warn_pct: number;
  shop_phone: string | null;
  gst_rate: number;
  board_show_timers: boolean;
};

// Job substatus, derived from the timers (v_job_substatus).
export type Substatus = "not_started" | "working" | "paused" | "stopped" | "idle" | "done";
export type JobSubstatus = { job_id: string; substatus: Substatus; reason: string | null; since: string | null; working_count: number };

export const SUBSTATUS_TONE: Record<Substatus, "stone" | "green" | "amber" | "red" | "blue"> = {
  not_started: "stone",
  working: "green",
  paused: "amber",
  stopped: "red",
  idle: "blue",
  done: "stone",
};

export function substatusLabel(s: Pick<JobSubstatus, "substatus" | "reason" | "working_count">) {
  switch (s.substatus) {
    case "not_started": return "Not started";
    case "working": return s.working_count > 1 ? `Being worked on (${s.working_count})` : "Being worked on";
    case "paused": return `Paused – ${s.reason}`;
    case "stopped": return "Stopped at knock-off";
    case "idle": return "Idle – ready to continue";
    case "done": return "Done";
  }
}

// "2h 15m" / "40m" since an ISO time.
export function durationSince(iso: string | null, now = Date.now()) {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

// Workshop OS job fields (migration 11).
export type JobFull = Job & {
  job_number: string | null; bay: string | null; customer_name: string | null; customer_phone: string | null;
  insurer: string | null; claim_number: string | null; vin: string | null; body_type: import("./vehicle").BodyType;
  due_in: string | null; due_out: string | null; work_summary: string | null; track_token: string; collected_at: string | null;
};
