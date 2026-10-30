"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { back } from "@/lib/flash";
import { str } from "@/lib/form";

export async function signIn(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: str(form, "email"), password: str(form, "password") });
  if (error) back("/login", { error: "Wrong email or password." });
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
