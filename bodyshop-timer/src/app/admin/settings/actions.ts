"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { KIOSK_COOKIE, KIOSK_COOKIE_MAX_AGE } from "@/lib/kiosk";
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
  const shop_phone = str(form, "shop_phone") || null;
  const gst_rate = num(form, "gst_rate");

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
  if (gst_rate === null || gst_rate < 0 || gst_rate > 1) back(PATH, { error: "GST rate must be between 0 and 1 (e.g. 0.10)." });

  const { error } = await supabase
    .from("settings")
    .update({ knock_off_time, time_zone, helper_policy, warn_pct, pin_max_attempts, pin_lock_minutes, shop_phone, gst_rate })
    .eq("id", true);
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: "Settings saved." });
}

// Pair the browser this is clicked on as a wall board: store the device key in a long-lived httpOnly cookie.
export async function pairThisDevice(form: FormData) {
  const { supabase } = await requireAdmin();
  const { data: key, error } = await supabase.rpc("pair_kiosk_device", { p_name: str(form, "name") || "Wall board" });
  if (error || !key) back(PATH, { error: friendly(error) });
  (await cookies()).set(KIOSK_COOKIE, key as string, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: KIOSK_COOKIE_MAX_AGE,
  });
  redirect("/board");
}

export async function revokeDevice(form: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("kiosk_devices").update({ revoked_at: new Date().toISOString() }).eq("id", str(form, "id"));
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: "Device revoked. It can no longer use the wall board." });
}
