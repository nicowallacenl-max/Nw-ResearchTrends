import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { requireStaff } from "@/lib/auth";
import { Logo } from "@/components/ui";

// Owner dashboard: owners and admins.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role, email } = await requireStaff();
  if (!role) redirect("/no-access");
  return (
    <div className="ab-shell grid-bg min-h-screen text-ink">
      <header className="flex flex-wrap items-center gap-6 border-b border-line bg-white/95 px-8 py-[18px] max-sm:px-4">
        <div className="flex grow items-baseline gap-3">
          <Link href="/dashboard" className="plain no-underline"><Logo /></Link>
          <span className="font-mono text-[12px] uppercase tracking-[.12em] text-muted">// Reports</span>
        </div>
        <nav className="flex flex-wrap gap-5 font-display text-[14px] font-semibold uppercase tracking-[.08em]">
          {role === "admin" && <Link href="/admin">Workshop</Link>}
          <form action={signOut} className="flex items-center gap-3">
            <span className="hidden font-sans text-[13px] normal-case tracking-normal text-muted sm:inline">{email}</span>
            <button className="cursor-pointer font-display uppercase text-accent">Sign out</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-8 py-8 max-sm:px-4">{children}</main>
    </div>
  );
}
