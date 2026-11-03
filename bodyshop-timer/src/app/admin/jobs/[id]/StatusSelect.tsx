"use client";

import { useRef } from "react";
import { setStatusReason } from "../actions";
import { STATUS_REASONS, STATUS_REASON_LABEL, type StatusReason } from "@/lib/types";

// Status reason dropdown in the job header. Saves as soon as a new value is picked; the server checks the rules
// (approve needs an owner + Due in, Completed is automatic, nobody clocked on for Review / Picked up).
export function StatusSelect({ jobId, value, disabled }: { jobId: string; value: StatusReason; disabled: Partial<Record<StatusReason, string>> }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={setStatusReason}>
      <input type="hidden" name="id" value={jobId} />
      <select
        name="status_reason"
        aria-label="Status reason"
        defaultValue={value}
        key={value}
        onChange={() => form.current?.requestSubmit()}
        className="cut-sm min-h-9 cursor-pointer border border-line bg-bg-subtle px-2 font-display text-[16px] font-semibold text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-neon/40"
      >
        {STATUS_REASONS.map((r) => (
          <option key={r} value={r} disabled={r !== value && !!disabled[r]}>
            {STATUS_REASON_LABEL[r]}{r !== value && disabled[r] ? ` (${disabled[r]})` : ""}
          </option>
        ))}
      </select>
    </form>
  );
}
