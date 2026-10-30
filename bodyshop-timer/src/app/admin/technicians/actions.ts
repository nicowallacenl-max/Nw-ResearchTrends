"use server";

import { requireAdmin } from "@/lib/auth";
import { back, friendly } from "@/lib/flash";
import { num, str } from "@/lib/form";
import { PROCEDURES, type Procedure } from "@/lib/types";

const PATH = "/admin/technicians";
const PIN_RE = /^\d{4}$/;

const procedures = (form: FormData) =>
  form.getAll("procedures").map(String).filter((p): p is Procedure => (PROCEDURES as readonly string[]).includes(p));

export async function createTechnician(form: FormData) {
  const { supabase } = await requireAdmin();
  const name = str(form, "name");
  const rate = num(form, "hourly_cost_rate");
  const pin = str(form, "pin");
  if (!name) back(PATH, { error: "Name is required." });
  if (rate === null || rate < 0) back(PATH, { error: "Hourly cost rate must be 0 or more." });
  if (!PIN_RE.test(pin)) back(PATH, { error: "PIN must be exactly 4 digits." });

  // PIN is hashed inside the database; the plain PIN is never stored.
  const { error } = await supabase.rpc("create_technician", { p_name: name, p_rate: rate, p_procedures: procedures(form), p_pin: pin });
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: `${name} added.` });
}

export async function updateTechnician(form: FormData) {
  const { supabase } = await requireAdmin();
  const name = str(form, "name");
  const rate = num(form, "hourly_cost_rate");
  if (!name) back(PATH, { error: "Name is required." });
  if (rate === null || rate < 0) back(PATH, { error: "Hourly cost rate must be 0 or more." });
  const { error } = await supabase
    .from("technicians")
    .update({ name, hourly_cost_rate: rate, procedures: procedures(form), active: form.get("active") === "on" })
    .eq("id", str(form, "id"));
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: `${name} saved.` });
}

// Setting a new PIN also clears any wrong-PIN lockout.
export async function setPin(form: FormData) {
  const { supabase } = await requireAdmin();
  const pin = str(form, "pin");
  if (!PIN_RE.test(pin)) back(PATH, { error: "PIN must be exactly 4 digits." });
  const { error } = await supabase.rpc("set_technician_pin", { p_technician: str(form, "id"), p_pin: pin });
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: `PIN updated for ${str(form, "name")}.` });
}
