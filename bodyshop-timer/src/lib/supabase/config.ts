// Public project settings. The publishable key is meant to be shipped to browsers (RLS protects the data),
// so it has a built-in default; env vars override it for another project.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://cszuyvrxmootnlieiovy.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_Sj2bZ5d8bpQ9koFDoHkO5A_b_uLqub8";
