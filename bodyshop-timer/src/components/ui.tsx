// Shared admin UI primitives (plain Tailwind; server-component friendly).
import type { ComponentProps, ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      {title && <h2 className="mb-4 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Button({ variant = "primary", ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
    danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function Badge({ tone = "stone", children }: { tone?: "stone" | "green" | "amber" | "red" | "blue"; children: ReactNode }) {
  const styles = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

// Shows ?error= / ?ok= messages set by Server Actions after a redirect.
export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div
      className={`mb-6 rounded-md border px-4 py-3 text-sm ${
        error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"
      }`}
    >
      {error ?? ok}
    </div>
  );
}

export const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500";
export const td = "px-3 py-2 align-middle";
