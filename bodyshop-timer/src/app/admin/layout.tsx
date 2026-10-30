import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";

const NAV = [
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/technicians", label: "Technicians" },
  { href: "/admin/technician-jobs", label: "Technician jobs" },
  { href: "/admin/delay-reasons", label: "Delay reasons" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/board", label: "Wall board ↗" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email, supabase } = await requireAdmin();
  const { count: toReview } = await supabase.from("v_review_queue").select("id", { count: "exact", head: true });
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin/jobs" className="font-semibold text-brand">
            Bodyshop Job Timer
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-stone-600 hover:text-stone-900">
                {n.label}
                {n.href === "/admin/review" && !!toReview && (
                  <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{toReview}</span>
                )}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-3 text-sm text-stone-500">
            <span className="hidden sm:inline">{email}</span>
            <button className="text-stone-600 underline hover:text-stone-900">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
