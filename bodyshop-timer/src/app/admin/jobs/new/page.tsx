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
          <JobFields />
          <p className="m-0 text-muted">A job number (AB-…) is assigned automatically. You&apos;ll add quote lines, damage and photos on the next screen.</p>
          <div><Button type="submit">Create job</Button></div>
        </form>
      </Card>
    </>
  );
}
