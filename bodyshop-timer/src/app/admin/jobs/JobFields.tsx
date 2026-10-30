import { Field, Input } from "@/components/ui";
import type { Job } from "@/lib/types";

export function JobFields({ job }: { job?: Job }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="Rego *">
        <Input name="rego" required defaultValue={job?.rego} className="uppercase" />
      </Field>
      <Field label="iBodyshop ref">
        <Input name="ibodyshop_ref" defaultValue={job?.ibodyshop_ref ?? ""} />
      </Field>
      <Field label="Colour">
        <Input name="colour" defaultValue={job?.colour ?? ""} />
      </Field>
      <Field label="Make">
        <Input name="make" defaultValue={job?.make ?? ""} />
      </Field>
      <Field label="Model">
        <Input name="model" defaultValue={job?.model ?? ""} />
      </Field>
      <Field label="Photo URL">
        <Input name="photo_url" type="url" defaultValue={job?.photo_url ?? ""} placeholder="https://…" />
      </Field>
    </div>
  );
}
