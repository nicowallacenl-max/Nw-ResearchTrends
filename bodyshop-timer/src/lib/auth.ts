import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "owner";

// Returns the signed-in staff member, or redirects to /login.
export async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase.from("app_users").select("email, role").eq("id", user.id).maybeSingle();
  return { supabase, user, role: (appUser?.role ?? null) as AppRole | null, email: user.email ?? "" };
}

// Admin screens only. Signed-in non-admins see /no-access. The database enforces this too (RLS).
export async function requireAdmin() {
  const staff = await requireStaff();
  if (staff.role === "owner") redirect("/dashboard");
  if (staff.role !== "admin") redirect("/no-access");
  return staff;
}
