import { redirect } from "next/navigation";

export type FlashParams = Promise<{ error?: string; ok?: string }>;

// Redirect back to a page with a message the page shows via <Flash>.
export function back(path: string, msg: { error?: string; ok?: string }): never {
  const q = new URLSearchParams(msg as Record<string, string>).toString();
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}

// Turn a Supabase/Postgres error into something a front-office user can act on.
export function friendly(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return "Something went wrong";
  if (e.code === "23505") return "That already exists (duplicate value).";
  if (e.code === "23503") return "It's still in use by other records, so it can't be removed. Mark it inactive instead.";
  if (e.code === "42501") return "You don't have permission to do that.";
  return e.message ?? "Something went wrong";
}
