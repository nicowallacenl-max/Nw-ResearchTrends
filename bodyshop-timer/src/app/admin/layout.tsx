import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { SideNav, type NavItem } from "@/components/SideNav";
import { Logo, buttonCls } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email, supabase } = await requireAdmin();
  const { count: toReview } = await supabase.from("v_review_queue").select("id", { count: "exact", head: true });
  const nav: NavItem[] = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/jobs", label: "Jobs" },
    { href: "/admin/technicians", label: "Technicians" },
    { href: "/admin/technician-jobs", label: "Tech hours" },
    { href: "/admin/review", label: "Review", badge: toReview ?? 0 },
    { href: "/admin/delay-reasons", label: "Delay reasons" },
    { href: "/admin/settings", label: "Settings" },
    { href: "/dashboard", label: "Reports" },
    { href: "/board", label: "Wall board" },
  ];

  return (
    <div className="ab-shell grid-bg flex min-h-screen flex-col text-ink">
      <header className="flex flex-wrap items-center gap-6 border-b border-line bg-white/95 px-8 py-[18px] max-sm:gap-3 max-sm:px-4">
        <div className="flex grow items-baseline gap-3">
          <Link href="/admin" className="plain no-underline" aria-label="Autobodies dashboard"><Logo /></Link>
          <span className="font-mono text-[12px] uppercase tracking-[.12em] text-muted max-md:hidden">// Workshop OS</span>
        </div>
        <form action="/admin/jobs" role="search" className="cut-sm flex min-w-[260px] flex-[0_1_360px] items-center gap-2.5 border border-line bg-bg-subtle px-3.5 py-2.5 max-sm:order-3 max-sm:min-w-0 max-sm:basis-full">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <label htmlFor="q" className="sr-only">Search jobs</label>
          <input id="q" name="q" type="search" placeholder="Search rego, job #, customer" className="w-full min-w-0 grow bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
        </form>
        <Link href="/admin/jobs/new" className={`${buttonCls("primary")} plain gap-2 px-5 text-[14px] no-underline`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          New job
        </Link>
      </header>

      <div className="flex grow flex-wrap">
        <nav aria-label="Main" className="flex flex-[1_1_220px] flex-col gap-1 border-r border-line bg-bg-subtle/85 px-4 py-7 md:max-w-[240px] max-md:w-full max-md:border-r-0 max-md:border-b max-md:py-4">
          <SideNav items={nav} />
          <div className="cut mt-auto flex flex-col gap-2 border border-line bg-bg p-4 max-md:mt-3">
            <span className="font-mono text-[11px] uppercase tracking-[.12em] text-muted">Signed in</span>
            <span className="truncate text-[13px] text-body">{email}</span>
            <form action={signOut}>
              <button className="cursor-pointer font-display text-[13px] font-semibold uppercase tracking-[.08em] text-accent hover:text-accent-hover">Sign out</button>
            </form>
          </div>
        </nav>
        <main className="min-w-0 flex-[999_1_640px] px-8 pb-10 pt-7 max-sm:px-4">{children}</main>
      </div>
    </div>
  );
}
