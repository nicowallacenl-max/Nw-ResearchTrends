import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { requireStaff } from "@/lib/auth";

// Owner dashboard: owners and admins.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role, email } = await requireStaff();
  if (!role) redirect("/no-access");
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="font-semibold text-brand">Bodyshop Job Timer</Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/dashboard" className="text-stone-900">Dashboard</Link>
            {role === "admin" && <Link href="/admin/jobs" className="text-stone-600 hover:text-stone-900">Admin</Link>}
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
