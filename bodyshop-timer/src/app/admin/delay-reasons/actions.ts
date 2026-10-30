"use server";

import { requireAdmin } from "@/lib/auth";
import { back, friendly } from "@/lib/flash";
import { str } from "@/lib/form";

const PATH = "/admin/delay-reasons";

export async function addReason(form: FormData) {
  const { supabase } = await requireAdmin();
  const label = str(form, "label");
  if (!label) back(PATH, { error: "Enter a reason." });
  const { error } = await supabase.from("delay_reasons").insert({ label });
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: `“${label}” added.` });
}

// System reasons (e.g. "Switched job") are used by the app itself and can't be edited.
export async function updateReason(form: FormData) {
  const { supabase } = await requireAdmin();
  const label = str(form, "label");
  if (!label) back(PATH, { error: "Enter a reason." });
  const { error } = await supabase
    .from("delay_reasons")
    .update({ label, active: form.get("active") === "on" })
    .eq("id", str(form, "id"))
    .eq("system", false);
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: `“${label}” saved.` });
}
