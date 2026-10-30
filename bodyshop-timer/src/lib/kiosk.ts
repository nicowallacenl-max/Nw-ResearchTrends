import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// The wall tablet holds a device key in this httpOnly cookie (set when an admin pairs it).
export const KIOSK_COOKIE = "kiosk_key";
export const KIOSK_COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // browsers cap cookies at ~400 days

export async function kioskKey() {
  return (await cookies()).get(KIOSK_COOKIE)?.value ?? "";
}

// Anonymous client: the kiosk_* database functions check the device key and PINs themselves.
export function kioskDb() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
}

export type KioskResult = { ok: boolean; error?: string; detail?: string | null; role?: string; switched_from?: string | null; job_done?: boolean };

export type BoardData = {
  ok: true;
  now: string;
  settings: { helper_policy: "allowed" | "owner_approval" | "not_allowed"; warn_pct: number; time_zone: string };
  technicians: { id: string; name: string; procedures: string[] }[];
  delay_reasons: { id: string; label: string }[];
  jobs: BoardJob[];
  running: { id: string; line_id: string; technician_id: string; role: "owner" | "helper"; started_at: string }[];
};

export type BoardJob = {
  id: string;
  rego: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  photo_url: string | null;
  status: string;
  board_colour: "green" | "amber" | "red";
  quoted_hours: number;
  actual_hours: number;
  lines: BoardLine[];
};

export type BoardLine = {
  id: string;
  description: string;
  procedure: "strip" | "repair" | "prep" | "paint" | "refit";
  quoted_hours: number;
  owner_id: string | null;
  state: "ready" | "locked" | "running" | "done";
  actual_hours: number;
};
