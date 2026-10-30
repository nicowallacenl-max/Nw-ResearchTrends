export const PROCEDURES = ["strip", "repair", "prep", "paint", "refit"] as const;
export type Procedure = (typeof PROCEDURES)[number];

export const PROCEDURE_LABEL: Record<Procedure, string> = {
  strip: "Strip",
  repair: "Repair",
  prep: "Prep",
  paint: "Paint",
  refit: "Refit",
};

export type JobStatus = "open" | "in_progress" | "done";
export const JOB_STATUS_LABEL: Record<JobStatus, string> = { open: "Open", in_progress: "In progress", done: "Done" };

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
};
