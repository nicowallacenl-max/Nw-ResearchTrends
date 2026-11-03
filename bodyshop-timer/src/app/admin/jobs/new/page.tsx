import { createJob } from "../actions";
import { JobFields } from "../JobFields";
import { Button, Card, Flash, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import type { FlashParams } from "@/lib/flash";

export default async function NewJobPage({ searchParams }: { searchParams: FlashParams }) {
  const { error } = await searchParams;
  await requireAdmin();
  return (
    <>
      <PageHeader eyebrow="// JOBS / NEW" title="New job" />
      <Flash error={error} />
      <Card title="Vehicle & customer">
        <form action={createJob} className="flex flex-col gap-5">
          <JobFields lookup />
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="standard_lines" defaultChecked className="mt-1 size-5 accent-[var(--neon)]" />
            <span>
              <span className="font-semibold text-ink">Add standard quote lines</span>
              <span className="block text-muted">Strip → Repair → Prep → Paint → Refit at 0 h, owners auto-assigned. Untick for a one-off job (e.g. paint only).</span>
            </span>
          </label>
          <p className="m-0 text-muted">A job number (AB-…) is assigned automatically. Start typing the rego to pick a known vehicle or look it up in the registry. You&apos;ll add hours, prices, damage and photos on the next screen.</p>
          <div><Button type="submit">Create job</Button></div>
        </form>
      </Card>
    </>
  );
}
