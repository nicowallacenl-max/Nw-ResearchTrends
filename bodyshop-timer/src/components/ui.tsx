// Shared Workshop OS UI primitives (docs/mockups): cut-corner panels, mono labels, Chakra Petch headings.
import type { ComponentProps, ReactNode } from "react";

export const mono = "font-mono uppercase tracking-[.14em]";
export const display = "font-display uppercase";

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span
      className="font-display font-bold tracking-[.14em] text-ink"
      style={{ fontSize: size, borderBottom: "3px solid var(--neon)", paddingBottom: 2 }}
    >
      AUTOBODIES
    </span>
  );
}

// Mono eyebrow + big uppercase title, like "SYS.STATUS // ONLINE / Workshop floor".
export function PageHeader({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        {eyebrow && <span className="font-mono text-[12px] uppercase tracking-[.18em] text-accent">{eyebrow}</span>}
        <h1 className="m-0 font-display text-[40px] font-bold uppercase leading-tight tracking-[.04em] text-ink">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, className = "", aside }: { title?: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`cut mb-6 border border-line bg-bg px-6 py-[22px] ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="m-0 font-display text-[18px] uppercase tracking-[.14em] text-ink">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "min-h-11 border border-line bg-bg-subtle px-3.5 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:bg-bg focus:outline-none focus:ring-2 focus:ring-neon/40";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputCls} py-2.5 ${props.className ?? ""}`} />;
}

type Variant = "primary" | "secondary" | "danger" | "complete";
export const buttonCls = (variant: Variant = "primary") =>
  `cut-sm inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 px-[18px] font-display text-[13px] font-bold uppercase tracking-[.1em] disabled:cursor-default disabled:opacity-50 ${
    {
      primary: "border-0 bg-neon text-on-neon hover:brightness-95",
      secondary: "border border-ink bg-bg text-ink hover:bg-bg-subtle",
      danger: "border border-progress bg-bg text-progress hover:bg-red-50",
      complete: "border-0 bg-complete text-white",
    }[variant]
  }`;

export function Button({ variant = "primary", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...props} className={`${buttonCls(variant)} ${props.className ?? ""}`} />;
}

// Status chip (mono, uppercase, cut corner) — matches the mockup's stage chips.
export type Tone = "stone" | "green" | "amber" | "red" | "blue" | "neon";
const CHIP: Record<Tone, string> = {
  stone: "bg-line text-body",
  green: "bg-complete text-white",
  amber: "bg-hazard text-on-neon",
  red: "bg-progress text-white",
  blue: "bg-neon text-on-neon",
  neon: "bg-neon text-on-neon",
};
export function Badge({ tone = "stone", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`cut-sm inline-block px-2.5 py-1 font-mono text-[11px] uppercase tracking-[.12em] ${CHIP[tone]}`}>{children}</span>;
}

// Shows ?error= / ?ok= messages set by Server Actions after a redirect.
export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div
      role="status"
      className={`cut-sm mb-6 border px-4 py-3 text-[14px] ${
        error ? "border-progress bg-red-50 text-progress" : "border-complete bg-green-50 text-complete"
      }`}
    >
      {error ?? ok}
    </div>
  );
}

export const th = "px-[18px] py-3.5 text-left font-mono text-[11px] font-medium uppercase tracking-[.14em] text-muted";
export const td = "px-[18px] py-3.5 align-middle border-b border-divider";
export const theadCls = "bg-bg-subtle border-b border-line";
