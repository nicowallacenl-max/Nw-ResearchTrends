import { Field, Input, Select, Textarea } from "@/components/ui";
import type { JobFull } from "@/lib/types";
import { BODY_TYPES, BODY_TYPE_LABEL } from "@/lib/vehicle";

export function JobFields({ job }: { job?: Partial<JobFull> }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Rego *"><Input name="rego" required defaultValue={job?.rego} className="uppercase" /></Field>
      <Field label="Make"><Input name="make" defaultValue={job?.make ?? ""} /></Field>
      <Field label="Model"><Input name="model" defaultValue={job?.model ?? ""} /></Field>
      <Field label="Body type">
        <Select name="body_type" defaultValue={job?.body_type ?? "sedan"}>
          {BODY_TYPES.map((b) => <option key={b} value={b}>{BODY_TYPE_LABEL[b]}</option>)}
        </Select>
      </Field>
      <Field label="Colour / paint code"><Input name="colour" defaultValue={job?.colour ?? ""} placeholder="e.g. Glacier White 040" /></Field>
      <Field label="VIN"><Input name="vin" defaultValue={job?.vin ?? ""} className="uppercase" /></Field>
      <Field label="Bay"><Input name="bay" defaultValue={job?.bay ?? ""} placeholder="e.g. 01" /></Field>
      <Field label="ETA"><Input name="eta" type="date" defaultValue={job?.eta ?? ""} /></Field>
      <Field label="Customer name"><Input name="customer_name" defaultValue={job?.customer_name ?? ""} /></Field>
      <Field label="Customer phone"><Input name="customer_phone" type="tel" defaultValue={job?.customer_phone ?? ""} /></Field>
      <Field label="Insurer (blank = private)"><Input name="insurer" defaultValue={job?.insurer ?? ""} placeholder="e.g. Suncorp" /></Field>
      <Field label="Claim #"><Input name="claim_number" defaultValue={job?.claim_number ?? ""} /></Field>
      <Field label="iBodyshop ref"><Input name="ibodyshop_ref" defaultValue={job?.ibodyshop_ref ?? ""} /></Field>
      <Field label="Board photo URL"><Input name="photo_url" type="url" defaultValue={job?.photo_url ?? ""} placeholder="https://…" /></Field>
      <Field label="Work summary" className="sm:col-span-2"><Textarea name="work_summary" rows={1} defaultValue={job?.work_summary ?? ""} placeholder="e.g. Rear quarter + tray" /></Field>
    </div>
  );
}
