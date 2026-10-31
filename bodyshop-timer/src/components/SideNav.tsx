"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number };

// Left nav from the mockup: numbered, uppercase Chakra Petch, active item with a cyan bar.
export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <>
      {items.map((n, i) => {
        const on = active(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={on ? "page" : undefined}
            className={`plain flex min-h-11 items-center gap-2.5 border-l-[3px] px-3 font-display text-[14px] font-semibold uppercase tracking-[.08em] no-underline ${
              on ? "border-neon bg-neon/[.18] text-ink" : "border-transparent text-body hover:bg-neon/[.08]"
            }`}
          >
            <span className="w-[22px] font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
            <span>{n.label}</span>
            {!!n.badge && <span className="cut-sm ml-auto bg-hazard px-1.5 font-mono text-[11px] text-on-neon">{n.badge}</span>}
          </Link>
        );
      })}
    </>
  );
}
