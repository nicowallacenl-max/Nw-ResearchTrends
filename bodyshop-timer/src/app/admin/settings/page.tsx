import { pairThisDevice, revokeDevice, saveSettings } from "./actions";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Select, td, th } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import type { FlashParams } from "@/lib/flash";
import { HELPER_POLICY_LABEL, type Settings } from "@/lib/types";

const when = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("en-AU", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function SettingsPage({ searchParams }: { searchParams: FlashParams }) {
  const { error, ok } = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: s }, { data: devices }] = await Promise.all([
    supabase.from("settings").select("*").single<Settings>(),
    supabase.from("kiosk_devices").select("id, name, created_at, last_seen_at, revoked_at").order("created_at", { ascending: false }),
  ]);
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

      <div className="mt-10">
        <Card title="Wall board tablets">
          <div className="mb-5 grid gap-4 text-sm text-stone-700 md:grid-cols-2">
            <div>
              <h3 className="mb-1 font-semibold">Android tablet (Chrome)</h3>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open <b>bodyshop-timer.vercel.app/board</b> in Chrome, tap <b>⋮</b> then <b>Install app</b> (or <i>Add to home screen</i>).</li>
                <li>Open the new <b>Job Board</b> app. Tap <b>Admin sign-in</b>, sign in, open <b>Settings</b>, tap the button below.</li>
                <li>Lock it to the app: Settings → Security → <b>App pinning</b> on, then pin Job Board from the recent-apps screen.</li>
              </ol>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">iPad (Safari)</h3>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open <b>bodyshop-timer.vercel.app/board</b> in Safari, tap <b>Share</b> then <b>Add to Home Screen</b>.</li>
                <li>Open <b>Job Board</b> from the home screen and pair it from <i>inside</i> the app (sign in, Settings, button below). Pairing in Safari doesn&apos;t carry over.</li>
                <li>Lock it to the app: Settings → Accessibility → <b>Guided Access</b> on, then triple-click the side button in Job Board.</li>
              </ol>
            </div>
            <p className="text-stone-500 md:col-span-2">
              Keep the tablet on its charger and in landscape. The board keeps the screen awake while it&apos;s open, and you can sign out of
              the admin once it&apos;s paired.
            </p>
          </div>
          <form action={pairThisDevice} className="mb-6 flex flex-wrap items-end gap-3">
            <Field label="Name for this device" className="min-w-56">
              <Input name="name" defaultValue="Workshop tablet" />
            </Field>
            <Button type="submit">Use this device as the wall board</Button>
          </form>
          {!!devices?.length && (
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200">
                <tr>
                  <th className={th}>Device</th>
                  <th className={th}>Paired</th>
                  <th className={th}>Last seen</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {devices.map((d) => (
                  <tr key={d.id} className={d.revoked_at ? "text-stone-400" : ""}>
                    <td className={td}>{d.name}</td>
                    <td className={td}>{when(d.created_at, s.time_zone)}</td>
                    <td className={td}>{d.last_seen_at ? when(d.last_seen_at, s.time_zone) : "Never"}</td>
                    <td className={`${td} text-right`}>
                      {d.revoked_at ? (
                        <Badge>Revoked</Badge>
                      ) : (
                        <form action={revokeDevice}>
                          <input type="hidden" name="id" value={d.id} />
                          <Button variant="danger">Revoke</Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
