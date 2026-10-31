import type { Metadata, Viewport } from "next";
import { createClient } from "@supabase/supabase-js";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Logo } from "@/components/ui";
import { photoUrl } from "@/lib/photos";
import { COMPLETE, STAGE_COUNT, STAGES, TRACKER_STEPS } from "@/lib/stages";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your repair · Autobodies", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

type Track = {
  job_number: string; make: string | null; model: string | null; rego: string; stage: number; eta: string | null;
  collected: boolean; created_at: string; stage_times: (string | null)[]; shop_phone: string | null; photos: { path: string; caption: string | null }[];
};

const TZ = "Australia/Brisbane";
const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "short", timeZone: TZ }).toUpperCase();
const etaDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).replace(",", "");

// Public customer repair tracker (MobileTracker mockup). Reached only through the job's unguessable link.
export default async function Tracker({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data } = await db.rpc("track_job", { p_token: token });
  const t = data as Track | null;

  if (!t) {
    return (
      <main className="ab-shell grid-bg grid-bg-sm flex min-h-screen items-center justify-center p-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <Logo size={20} />
          <p className="font-display text-[20px] font-semibold uppercase">Tracker link not found</p>
          <p className="text-muted">Check the link in your message, or call the shop.</p>
        </div>
      </main>
    );
  }

  const complete = t.stage >= COMPLETE;
  const current = Math.min(t.stage, COMPLETE);
  const ring = complete ? 264 : Math.round(((current + 0.5) / STAGE_COUNT) * 264);
  const stroke = complete ? "var(--complete)" : "var(--progress)";
  const nowLabel = complete ? (t.collected ? "COLLECTED" : "COMPLETE · READY TO COLLECT") : `NOW · ${TRACKER_STEPS[current].toUpperCase()}`;
  const headline = complete ? (t.collected ? "Collected. Thanks!" : "Ready to collect") : t.eta ? `Ready ${etaDay(t.eta)}` : "Ready date to come";

  return (
    <main className="ab-shell grid-bg grid-bg-sm flex min-h-screen justify-center">
      <div className="box-border flex min-h-screen w-full max-w-[390px] flex-col gap-[18px] px-5 pb-6 pt-7 text-ink">
        <div className="flex items-center justify-between"><Logo size={20} /></div>

        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted">YOUR REPAIR · {t.job_number}</span>
          <h1 className="m-0 font-display text-[30px] font-bold uppercase leading-[1.1]">{[t.make, t.model].filter(Boolean).join(" ") || "Your vehicle"}</h1>
          <span className="font-mono text-[13px] text-muted">{t.rego}</span>
        </div>

        <div className={`cut-14 flex items-center gap-[18px] bg-bg p-5 ${complete ? "border border-complete shadow-[0_0_28px_rgba(22,163,74,.22)]" : "border border-neon shadow-[0_0_28px_rgba(0,238,234,.22)]"}`}>
          <svg width="96" height="96" viewBox="0 0 100 100" role="img" className="shrink-0"
            aria-label={complete ? "Repair complete, all 7 stages done" : `Repair ${current} of ${STAGE_COUNT} stages done, now on ${STAGES[current]}`}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={stroke} strokeWidth="8" strokeDasharray={`${ring} 264`} transform="rotate(-90 50 50)" />
            <text x="50" y="56" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="700" fontSize="22" fill="var(--text-strong)">
              {complete ? STAGE_COUNT : current + 1}/{STAGE_COUNT}
            </text>
          </svg>
          <div className="flex flex-col gap-1.5">
            <span className={`font-mono text-[11px] tracking-[.16em] ${complete ? "text-complete" : "text-progress"}`}>{nowLabel}</span>
            <span className="font-display text-[20px] font-semibold leading-[1.2]">{headline}</span>
            <span className="text-[13px] leading-[1.4] text-muted">{complete ? "Your vehicle is ready. Call us to arrange pick-up." : "Call the shop any time for an update."}</span>
          </div>
        </div>

        <ol className="m-0 flex list-none flex-col p-0">
          {TRACKER_STEPS.map((name, i) => {
            const done = complete || i < current, now = !complete && i === current;
            const reached = t.stage_times[i + 1];
            const when = done ? (reached ? weekday(reached) : "✓") : now ? "NOW" : i === STAGE_COUNT - 1 && t.eta ? weekday(`${t.eta}T12:00:00`) : "—";
            const colour = complete ? "var(--complete)" : "var(--progress)";
            return (
              <li key={name} className="grid min-h-10 grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3">
                <span className="h-3 w-3 justify-self-center rotate-45"
                  style={done ? { background: colour } : now ? { background: "#fff", border: `2px solid ${colour}`, boxShadow: "0 0 8px rgba(225,29,46,.5)" } : { background: "#fff", border: "2px solid var(--text-faint)" }} />
                <span className="font-display text-[15px] font-semibold tracking-[.04em]" style={{ color: now ? "var(--progress)" : done ? (complete ? "var(--complete)" : "var(--text-strong)") : "var(--text-muted)" }}>{name}</span>
                <span className="font-mono text-[11px] tracking-[.1em] text-muted">{when}</span>
              </li>
            );
          })}
        </ol>

        <div className="mt-auto grid grid-cols-2 gap-3">
          {t.shop_phone ? (
            <a href={`tel:${t.shop_phone.replace(/[^\d+]/g, "")}`} className="plain cut-8 flex min-h-[52px] items-center justify-center gap-2 border border-ink bg-bg font-display text-[14px] font-bold tracking-[.1em] text-ink no-underline">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
              CALL SHOP
            </a>
          ) : (
            <span className="cut-8 flex min-h-[52px] items-center justify-center border border-line bg-bg-subtle px-2 text-center font-display text-[12px] font-bold tracking-[.1em] text-muted">CALL THE SHOP</span>
          )}
          <PhotoGallery photos={t.photos.map((p) => ({ url: photoUrl(p.path), caption: p.caption ?? "" }))}
            trigger={{ label: "VIEW PHOTOS", className: "cut-8 flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 border-0 bg-neon font-display text-[14px] font-bold tracking-[.1em] text-on-neon disabled:cursor-default disabled:bg-bg-subtle disabled:text-muted" }} />
        </div>
      </div>
    </main>
  );
}
