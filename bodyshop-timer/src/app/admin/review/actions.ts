"use server";

import { requireAdmin } from "@/lib/auth";
import { back, friendly } from "@/lib/flash";
import { str } from "@/lib/form";

const PATH = "/admin/review";
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// Approve a flagged segment. Times are only sent when the admin changed them (the inputs have minute
// precision, so re-sending an untouched value would look like a correction and drop the seconds).
export async function approveSegment(form: FormData) {
  const { supabase } = await requireAdmin();
  const changed = (field: string) => {
    const v = str(form, field);
    if (!LOCAL.test(v)) back(PATH, { error: "Enter a full date and time." });
    return v === str(form, `${field}_was`) ? null : `${v.replace("T", " ")}:00`;
  };
  const { error } = await supabase.rpc("review_segment", {
    p_id: str(form, "id"),
    p_started_local: changed("started"),
    p_ended_local: changed("ended"),
  });
  if (error) back(PATH, { error: friendly(error) });
  back(PATH, { ok: "Approved." });
}
