"use server";

import { requireAdmin } from "@/lib/auth";
import { back, friendly } from "@/lib/flash";
import { num, str } from "@/lib/form";
import { HELPER_POLICY_LABEL, type HelperPolicy } from "@/lib/types";

const PATH = "/admin/settings";

export async function saveSettings(form: FormData) {
  const { supabase } = await requireAdmin();
  const knock_off_time = str(form, "knock_off_time");
  const time_zone = str(form, "time_zone");
  const helper_policy = str(form, "helper_policy") as HelperPolicy;
  const warn_pct = num(form, "warn_pct");
  const pin_max_attempts = num(form, "pin_max_attempts");
  const pin_lock_minutes = num(form, "pin_lock_minutes");

  if (!/^\d{2}:\d{2}$/.test(knock_off_time)) back(PATH, { error: "Knock-off time must be HH:MM." });
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: time_zone });
  } catch {
    back(PATH, { error: `“${time_zone}” isn't a valid time zone (e.g. Australia/Brisbane).` });
  }
  if (!(helper_policy in HELPER_POLICY_LABEL)) back(PATH, { error: "Pick a helper policy." });
  if (warn_pct === null || warn_pct < 1 || warn_pct > 100) back(PATH, { error: "Amber warning must be 1–100%." });
  if (pin_max_attempts === null || pin_max_attempts < 1) back(PATH, { error: "Wrong-PIN attempts must be at least 1." });
  if (pin_lock_minutes === null || pin_lock_minutes < 1) back(PATH, { error: "Lockout must be at least 1 minute." });

  const { error } = await supabase
    .from("settings")
    .update({ knock_off_time, time_zone, helper_policy, warn_pct, pin_max_attempts, pin_lock_minutes })
    .eq("id", true);
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: "Settings saved." });
}
