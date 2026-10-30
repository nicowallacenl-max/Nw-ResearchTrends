import { createTechnician, setPin, updateTechnician } from "./actions";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, td, th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import type { FlashParams } from "@/lib/flash";
import { PROCEDURE_LABEL, PROCEDURES, type Technician } from "@/lib/types";

function ProcedureChecks({ selected = [], form }: { selected?: string[]; form?: string }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {PROCEDURES.map((p) => (
        <label key={p} className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="procedures" value={p} form={form} defaultChecked={selected.includes(p)} className="accent-brand" />
          {PROCEDURE_LABEL[p]}
        </label>
      ))}
    </div>
  );
}

const pinInput = { name: "pin", inputMode: "numeric" as const, pattern: "\\d{4}", maxLength: 4, minLength: 4, required: true, autoComplete: "off" };

export default async function TechniciansPage({ searchParams }: { searchParams: FlashParams }) {
  const { error, ok } = await searchParams;
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("technicians")
    .select("id, name, hourly_cost_rate, procedures, active, locked_until")
    .order("active", { ascending: false })
    .order("name")
    .returns<Technician[]>();
  const techs = data ?? [];
  const now = Date.now();

  return (
    <>
      <PageHeader title="Technicians" />
      <Flash error={error} ok={ok} />

      <Card title="Add technician">
        <form key={String(Date.now())} action={createTechnician} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_9rem_7rem]">
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Cost rate ($/h)">
            <Input name="hourly_cost_rate" type="number" step="0.01" min="0" required />
          </Field>
          <Field label="4-digit PIN">
            <Input {...pinInput} type="password" />
          </Field>
          <div className="sm:col-span-3">
            <span className="mb-1 block text-sm font-medium text-stone-600">Procedures they do</span>
            <ProcedureChecks />
          </div>
          <div>
            <Button type="submit">Add technician</Button>
          </div>
        </form>
      </Card>

      <Card>
        {!techs.length ? (
          <p className="text-sm text-stone-500">No technicians yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200">
                <tr>
                  <th className={th}>Name</th>
                  <th className={`${th} w-28`}>$/h</th>
                  <th className={th}>Procedures</th>
                  <th className={th}>Active</th>
                  <th className={th}></th>
                  <th className={th}>Change PIN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {techs.map((t) => {
                  const fid = `tech-${t.id}`;
                  const locked = t.locked_until && new Date(t.locked_until).getTime() > now;
                  return (
                    <tr key={JSON.stringify(t)} className={t.active ? "" : "text-stone-400"}>
                      <td className={td}>
                        <form id={fid} action={updateTechnician}>
                          <input type="hidden" name="id" value={t.id} />
                        </form>
                        <Input form={fid} name="name" defaultValue={t.name} required className="w-full min-w-40" />
                        {locked && <div className="mt-1"><Badge tone="red">PIN locked</Badge></div>}
                      </td>
                      <td className={td}>
                        <Input form={fid} name="hourly_cost_rate" type="number" step="0.01" min="0" defaultValue={t.hourly_cost_rate} required className="w-24" />
                      </td>
                      <td className={td}><ProcedureChecks selected={t.procedures} form={fid} /></td>
                      <td className={td}>
                        <input form={fid} type="checkbox" name="active" defaultChecked={t.active} className="size-4 accent-brand" />
                      </td>
                      <td className={td}>
                        <Button form={fid} type="submit" variant="secondary">Save</Button>
                      </td>
                      <td className={td}>
                        <form key={String(Date.now())} action={setPin} className="flex gap-2">
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="name" value={t.name} />
                          <Input {...pinInput} type="password" placeholder="••••" className="w-20" />
                          <Button variant="secondary">Set</Button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-stone-500">
          Untick “Active” for someone who has left. Their past time stays in the reports. A new PIN also clears a wrong-PIN lockout.
        </p>
      </Card>
    </>
  );
}
