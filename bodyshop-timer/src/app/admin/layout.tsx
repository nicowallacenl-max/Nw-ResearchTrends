import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireAdmin } from "@/lib/auth";

const NAV = [
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/technicians", label: "Technicians" },
  { href: "/admin/delay-reasons", label: "Delay reasons" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdmin();
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
