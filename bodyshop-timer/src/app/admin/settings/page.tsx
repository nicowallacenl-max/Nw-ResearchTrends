import { saveSettings } from "./actions";
import { Button, Card, Field, Flash, Input, PageHeader, Select } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import type { FlashParams } from "@/lib/flash";
import { HELPER_POLICY_LABEL, type Settings } from "@/lib/types";

export default async function SettingsPage({ searchParams }: { searchParams: FlashParams }) {
  const { error, ok } = await searchParams;
  const { supabase } = await requireAdmin();
  const { data: s } = await supabase.from("settings").select("*").single<Settings>();
  if (!s) return <Flash error="Settings row is missing. Re-run the database migrations." />;

  return (
    <>
      <PageHeader title="Settings" />
      <Flash error={error} ok={ok} />
      <form key={JSON.stringify(s)} action={saveSettings}>
        <Card title="Workshop day">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Knock-off time (running timers are closed and flagged for review)">
              <Input name="knock_off_time" type="time" defaultValue={s.knock_off_time.slice(0, 5)} required />
            </Field>
            <Field label="Shop time zone">
              <Input name="time_zone" defaultValue={s.time_zone} required />
            </Field>
          </div>
        </Card>
        <Card title="Wall board">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Helpers on someone else's procedure">
              <Select name="helper_policy" defaultValue={s.helper_policy}>
                {Object.entries(HELPER_POLICY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tile turns amber at (% of quoted hours)">
              <Input name="warn_pct" type="number" min="1" max="100" defaultValue={s.warn_pct} required />
            </Field>
            <Field label="Wrong PINs before lockout">
              <Input name="pin_max_attempts" type="number" min="1" defaultValue={s.pin_max_attempts} required />
            </Field>
            <Field label="Lockout length (minutes)">
              <Input name="pin_lock_minutes" type="number" min="1" defaultValue={s.pin_lock_minutes} required />
            </Field>
          </div>
        </Card>
        <Button type="submit">Save settings</Button>
      </form>
    </>
  );
}
