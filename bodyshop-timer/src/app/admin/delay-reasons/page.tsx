import { addReason, updateReason } from "./actions";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, td, th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import type { FlashParams } from "@/lib/flash";
import type { DelayReason } from "@/lib/types";

export default async function DelayReasonsPage({ searchParams }: { searchParams: FlashParams }) {
  const { error, ok } = await searchParams;
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("delay_reasons").select("*").order("system").order("label").returns<DelayReason[]>();

  return (
    <>
      <PageHeader title="Delay reasons" />
      <Flash error={error} ok={ok} />
      <p className="mb-6 text-sm text-stone-600">Technicians pick one of the active reasons every time they pause a job on the wall board.</p>

      <Card title="Add reason">
        <form key={String(Date.now())} action={addReason} className="flex flex-wrap items-end gap-3">
          <Field label="Reason" className="min-w-64 flex-1">
            <Input name="label" required placeholder="e.g. Waiting on sublet" />
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200">
            <tr>
              <th className={th}>Reason</th>
              <th className={th}>Active</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(data ?? []).map((r) =>
              r.system ? (
                <tr key={r.id} className="text-stone-500">
                  <td className={td}>{r.label} <Badge>Automatic</Badge></td>
                  <td className={td} colSpan={2}>Used by the app when someone clocks onto another job.</td>
                </tr>
              ) : (
                <tr key={JSON.stringify(r)} className={r.active ? "" : "text-stone-400"}>
                  <td className={td}>
                    <form id={`r-${r.id}`} action={updateReason}>
                      <input type="hidden" name="id" value={r.id} />
                    </form>
                    <Input form={`r-${r.id}`} name="label" defaultValue={r.label} required className="w-full" />
                  </td>
                  <td className={td}>
                    <input form={`r-${r.id}`} type="checkbox" name="active" defaultChecked={r.active} className="size-4 accent-brand" />
                  </td>
                  <td className={`${td} text-right`}>
                    <Button form={`r-${r.id}`} type="submit" variant="secondary">Save</Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-stone-500">Reasons aren't deleted, so past pauses keep their label. Untick “Active” to hide one from the wall board.</p>
      </Card>
    </>
  );
}
