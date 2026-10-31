"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeWork, loadJob, pauseWork, startWork } from "./actions";
import { DamageScan } from "@/components/DamageScan";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Logo } from "@/components/ui";
import type { BoardData, BoardJob, BoardLine, KioskJob, KioskResult } from "@/lib/kiosk";
import { photoUrl } from "@/lib/photos";
import { COMPLETE, STAGE_COUNT, STAGES, isComplete, progressPct, stageChip } from "@/lib/stages";
import { activityTime, etaLabel } from "@/lib/time";
import { durationSince } from "@/lib/types";

// Wall board for a landscape tablet, in the Workshop OS style. Every control is a big tap target (>= 64px);
// the only text input is the PIN pad. Tapping a job opens the full job view.

const PROC: Record<BoardLine["procedure"], string> = { strip: "Strip", repair: "Repair", prep: "Prep", paint: "Paint", refit: "Refit" };
const HELPER_REASONS = ["Two-person job", "Behind schedule", "Owner absent", "Training"];
const REFRESH_MS = 15_000;
const JOB_REFRESH_MS = 10_000;
const IDLE_MS = { job: 180_000, other: 60_000 };

const ERRORS: Record<string, string> = {
  wrong_pin: "Wrong PIN. Try again.",
  locked: "Too many wrong PINs. Locked for a few minutes. Ask the office if you're stuck.",
  inactive: "This person isn't set up as an active technician.",
  not_paired: "This tablet isn't paired any more. Ask the office to set it up again.",
  line_locked: "This step is locked until the step before it is complete.",
  line_done: "This item is already complete.",
  already_running: "You're already clocked on to this.",
  helpers_not_allowed: "Helpers aren't allowed on someone else's item. Ask the office.",
  helper_reason_required: "Pick why you're helping.",
  owner_wrong_pin: "The owner's PIN was wrong.",
  owner_locked: "The owner's PIN is locked after too many tries.",
  owner_inactive: "The owner of this item isn't active. Ask the office to reassign it.",
  not_owner: "Only the item's owner can complete it.",
  reason_required: "Pick a delay reason.",
  not_running: "You're not clocked on to anything.",
  not_found: "That item no longer exists. The board will refresh.",
  server: "Couldn't reach the server. Check the internet and try again.",
};

type Flow =
  | { kind: "job"; jobId: string }
  | { kind: "start"; jobId: string; lineId: string; techId?: string; helperReason?: string; pin?: string; step: "who" | "reason" | "pin" | "approver" }
  | { kind: "pause"; jobId?: string; techId: string; reasonId?: string; step: "reason" | "pin" }
  | { kind: "complete"; jobId?: string; lineId: string; techId: string; step: "pin" }
  | { kind: "mine"; techId?: string };

export function Board({ data }: { data: BoardData }) {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
  // Plain state (not a transition) so the PIN pad is usable again the moment the result shows.
  const [busy, setBusy] = useState(false);
  const now = useNow(data.now);
  const tz = data.settings.time_zone;

  const techName = useMemo(() => new Map(data.technicians.map((t) => [t.id, t.name])), [data.technicians]);
  const lineById = useMemo(() => {
    const m = new Map<string, { line: BoardLine; job: BoardJob }>();
    data.jobs.forEach((job) => job.lines.forEach((line) => m.set(line.id, { line, job })));
    return m;
  }, [data.jobs]);

  // Kiosk: keep the screen awake while the board is showing, and register the service worker so the
  // browser offers "Install app". Both are best-effort; unsupported browsers just skip them.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    const acquire = () => {
      if (wakeLock && document.visibilityState === "visible") wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  // Keep the board fresh.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  // Close abandoned screens so the next person starts clean (job view after 3 min untouched, dialogs after 1 min).
  const lastTouch = useRef(Date.now());
  useEffect(() => {
    const touch = () => (lastTouch.current = Date.now());
    window.addEventListener("pointerdown", touch);
    return () => window.removeEventListener("pointerdown", touch);
  }, []);
  useEffect(() => {
    if (!flow) return;
    lastTouch.current = Date.now();
    const limit = flow.kind === "job" ? IDLE_MS.job : IDLE_MS.other;
    const t = setInterval(() => { if (Date.now() - lastTouch.current > limit) setFlow(null); }, 5000);
    return () => clearInterval(t);
  }, [flow]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "ok" ? 4000 : 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const name = (id: string | null | undefined) => (id ? techName.get(id) ?? "Unknown" : "Unassigned");
  const backTo = (jobId?: string): Flow | null => (jobId ? { kind: "job", jobId } : null);

  // After an action we go back to the job it came from, so the change shows straight away.
  async function run(action: () => Promise<KioskResult>, onOk: (r: KioskResult) => string, onErr: (r: KioskResult) => Flow | null | undefined, jobId?: string) {
    setBusy(true);
    let r: KioskResult;
    try {
      r = await action();
    } catch {
      r = { ok: false, error: "server" };
    }
    setBusy(false);
    if (r.ok) {
      setFlow(backTo(jobId));
      setToast({ text: onOk(r), tone: "ok" });
      router.refresh();
      return;
    }
    let text = ERRORS[r.error ?? ""] ?? `Something went wrong (${r.error}).`;
    if (r.error === "helpers_running") text = `${r.detail} still clocked on as helper. They need to pause first.`;
    setToast({ text, tone: "err" });
    const next = onErr(r);
    if (next !== undefined) setFlow(next);
  }

  // ------------------------------------------------------------ actions
  function submitStart(f: Extract<Flow, { kind: "start" }>, pin: string, approverPin?: string) {
    const { line } = lineById.get(f.lineId)!;
    const isHelper = line.owner_id !== null && line.owner_id !== f.techId;
    if (isHelper && data.settings.helper_policy === "owner_approval" && approverPin === undefined) {
      setFlow({ ...f, pin, step: "approver" });
      return;
    }
    run(
      () => startWork({ techId: f.techId!, pin, lineId: f.lineId, helperReason: f.helperReason, approverPin }),
      (r) => `${name(f.techId)} clocked on${r.role === "helper" ? " as helper" : ""}: ${line.description}` + (r.switched_from ? ` (paused ${r.switched_from})` : ""),
      // Wrong own PIN: stay on the PIN pad. Wrong owner PIN: retry approval. Anything else: back to the job.
      (r) => (r.error === "wrong_pin" ? { ...f, step: "pin" } : r.error?.startsWith("owner_") ? { ...f, pin, step: "approver" } : backTo(f.jobId)),
      f.jobId,
    );
  }

  function submitPause(f: Extract<Flow, { kind: "pause" }>, pin: string) {
    const reason = data.delay_reasons.find((r) => r.id === f.reasonId)?.label ?? "";
    run(
      () => pauseWork({ techId: f.techId, pin, reasonId: f.reasonId! }),
      () => `${name(f.techId)} paused: ${reason}`,
      (r) => (r.error === "wrong_pin" ? f : backTo(f.jobId)),
      f.jobId,
    );
  }

  function submitComplete(f: Extract<Flow, { kind: "complete" }>, pin: string) {
    const { line, job } = lineById.get(f.lineId)!;
    run(
      () => completeWork({ techId: f.techId, pin, lineId: f.lineId }),
      (r) => (r.job_done ? `${job.rego} is finished. All items complete!` : `${line.description} complete. Next step unlocked.`),
      (r) => (r.error === "wrong_pin" ? f : backTo(f.jobId)),
      // a finished job leaves the board, so go back to the board instead
      undefined,
    );
  }

  // ------------------------------------------------------------ render
  const open = flow?.kind === "job" ? data.jobs.find((j) => j.id === flow.jobId) : undefined;
  const dialogOpen = !!flow;

  return (
    <div className="ab-shell grid-bg flex min-h-screen select-none flex-col text-ink">
      {/* While a dialog is open the board behind it can't be tapped or focused. */}
      <header inert={dialogOpen} className="flex flex-wrap items-center gap-6 border-b border-line bg-white/95 px-8 py-[18px] max-sm:px-4">
        <div className="flex grow items-baseline gap-3">
          <Logo />
          <span className="font-mono text-[12px] uppercase tracking-[.12em] text-muted">// Job board</span>
        </div>
        <span className="font-mono text-[15px] text-muted" suppressHydrationWarning>{clock(now, tz)}</span>
        <button onClick={() => setFlow({ kind: "mine" })} className="cut-sm min-h-16 cursor-pointer bg-neon px-8 font-display text-[18px] font-bold uppercase tracking-[.1em] text-on-neon active:brightness-90">
          My work
        </button>
      </header>

      <main inert={dialogOpen} className="grid flex-1 auto-rows-min grid-cols-1 gap-4 px-8 py-7 max-sm:px-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.jobs.length === 0 && <p className="col-span-full mt-16 text-center font-display text-[22px] uppercase tracking-[.08em] text-muted">No open jobs. Add them in the office.</p>}
        {data.jobs.map((job) => (
          <JobTile key={job.id} job={job} data={data} now={now} name={name} onOpen={() => setFlow({ kind: "job", jobId: job.id })} />
        ))}
      </main>

      {open && (
        <JobView
          job={open}
          data={data}
          now={now}
          name={name}
          onClose={() => setFlow(null)}
          onStart={(lineId) => setFlow({ kind: "start", jobId: open.id, lineId, step: "who" })}
          onPause={(techId) => setFlow({ kind: "pause", jobId: open.id, techId, step: "reason" })}
          onComplete={(lineId, techId) => setFlow({ kind: "complete", jobId: open.id, lineId, techId, step: "pin" })}
        />
      )}

      {flow?.kind === "start" && (() => {
        const { line } = lineById.get(flow.lineId) ?? {};
        if (!line) return null;
        const back = () => setFlow(backTo(flow.jobId));
        if (flow.step === "who") {
          return (
            <Sheet title={`Who's starting “${line.description}”?`} onClose={back}>
              <WhoPicker
                data={data}
                ownerId={line.owner_id}
                procedure={line.procedure}
                onPick={(techId) => {
                  const helper = line.owner_id !== null && line.owner_id !== techId;
                  if (helper && data.settings.helper_policy === "not_allowed") {
                    setToast({ text: `Only ${name(line.owner_id)} can work on this (helpers are switched off).`, tone: "err" });
                    return;
                  }
                  setFlow({ ...flow, techId, step: helper ? "reason" : "pin" });
                }}
              />
            </Sheet>
          );
        }
        if (flow.step === "reason") {
          return (
            <Sheet title={`Helping ${name(line.owner_id)}. Why?`} onClose={back}>
              <BigChoices options={HELPER_REASONS.map((r) => ({ id: r, label: r }))} onPick={(r) => setFlow({ ...flow, helperReason: r, step: "pin" })} />
            </Sheet>
          );
        }
        if (flow.step === "pin") {
          return <PinPad who={name(flow.techId)} action={`Start: ${line.description}`} busy={busy} onCancel={back} onSubmit={(pin) => submitStart(flow, pin)} />;
        }
        return (
          <PinPad who={name(line.owner_id)} action={`Approve ${name(flow.techId)} helping on ${line.description}`} busy={busy} onCancel={back}
            onSubmit={(approverPin) => submitStart(flow, flow.pin!, approverPin)} />
        );
      })()}

      {flow?.kind === "pause" &&
        (flow.step === "reason" ? (
          <Sheet title={`${name(flow.techId)}: why are you pausing?`} onClose={() => setFlow(backTo(flow.jobId))}>
            <BigChoices options={data.delay_reasons} onPick={(reasonId) => setFlow({ ...flow, reasonId, step: "pin" })} />
          </Sheet>
        ) : (
          <PinPad who={name(flow.techId)} action={`Pause: ${data.delay_reasons.find((r) => r.id === flow.reasonId)?.label}`} busy={busy}
            onCancel={() => setFlow(backTo(flow.jobId))} onSubmit={(pin) => submitPause(flow, pin)} />
        ))}

      {flow?.kind === "complete" && (
        <PinPad who={name(flow.techId)} action={`Complete: ${lineById.get(flow.lineId)?.line.description}`} busy={busy}
          onCancel={() => setFlow(backTo(flow.jobId))} onSubmit={(pin) => submitComplete(flow, pin)} />
      )}

      {flow?.kind === "mine" && (
        <Sheet title={flow.techId ? `${name(flow.techId)}'s work` : "Who are you?"} onClose={() => setFlow(null)}>
          {!flow.techId ? (
            <WhoPicker data={data} onPick={(techId) => setFlow({ kind: "mine", techId })} />
          ) : (
            <MyWork
              techId={flow.techId}
              data={data}
              now={now}
              onStart={(jobId, lineId) => setFlow({ kind: "start", jobId, lineId, techId: flow.techId, step: "pin" })}
              onPause={() => setFlow({ kind: "pause", techId: flow.techId!, step: "reason" })}
              onComplete={(lineId) => setFlow({ kind: "complete", lineId, techId: flow.techId!, step: "pin" })}
            />
          )}
        </Sheet>
      )}

      {toast && (
        <div role="status" onClick={() => setToast(null)}
          className={`cut-sm fixed inset-x-0 bottom-6 z-[60] mx-auto w-fit max-w-[90vw] px-8 py-5 font-display text-[20px] font-semibold tracking-[.04em] text-white shadow-2xl ${toast.tone === "ok" ? "bg-complete" : "bg-progress"}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ board tile (bay-card style)

function JobTile({ job, data, now, name, onOpen }: { job: BoardJob; data: BoardData; now: number; name: (id: string | null) => string; onOpen: () => void }) {
  const lineIds = new Set(job.lines.map((l) => l.id));
  // Owners first, helpers marked "+1".
  const running = data.running.filter((r) => lineIds.has(r.line_id)).sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));
  const paused = running.length === 0 && job.substatus === "paused";
  const chip = stageChip(job.stage, paused ? job.substatus_reason : null);
  const done = isComplete(job.stage);
  const border = done ? "border-complete" : chip.label === "PARTS" ? "border-hazard" : job.board_colour === "red" ? "border-progress" : "border-line";
  return (
    <button onClick={onOpen} className={`cut flex cursor-pointer flex-col gap-3 border bg-bg px-5 py-[18px] text-left active:bg-bg-subtle ${border}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] uppercase tracking-[.14em] text-muted">{job.bay ? `BAY ${job.bay}` : "NO BAY"} · {job.job_number}</span>
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-display text-[24px] font-semibold leading-tight text-ink">{[job.make, job.model].filter(Boolean).join(" ") || "Vehicle"}</span>
        <span className="font-mono text-[15px] text-muted">{job.rego}{job.colour ? ` · ${job.colour}` : ""}</span>
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-2">
        {paused ? (
          // Paused: say why and for how long, so anyone walking past can see the job is waiting.
          <span className="cut-sm flex w-full items-center gap-2 bg-hazard px-3 py-2 font-display text-[15px] font-bold uppercase tracking-[.06em] text-on-neon">
            <PauseIcon />
            <span className="truncate">Paused · {job.substatus_reason}</span>
            {job.substatus_since && <span className="ml-auto shrink-0 font-mono tabular-nums">{durationSince(job.substatus_since, now)}</span>}
          </span>
        ) : running.length === 0 && job.substatus === "stopped" ? (
          <span className="font-display text-[15px] font-semibold uppercase tracking-[.06em] text-progress">Stopped at knock-off · not restarted</span>
        ) : running.length === 0 ? (
          <span className="text-[15px] text-muted">Nobody on it</span>
        ) : (
          running.map((r) => (
            <span key={r.id} className={`cut-sm px-3 py-1.5 font-mono text-[14px] font-medium ${r.role === "owner" ? "bg-complete text-white" : "bg-neon text-on-neon"}`}>
              {r.role === "helper" && "+1 "}{firstName(name(r.technician_id))} · {elapsed(r.started_at, now)}
            </span>
          ))
        )}
      </div>
      <div className="h-1.5 bg-line"><div className={`h-1.5 ${done ? "bg-complete" : "bg-progress"}`} style={{ width: `${progressPct(job.stage)}%` }} /></div>
      <div className="flex items-center justify-between font-mono text-[13px] text-muted">
        <span>{hrs(job.actual_hours)} / {hrs(job.quoted_hours)} H</span>
        {job.board_colour === "red" ? <span className="font-medium text-progress">OVER QUOTE</span> : job.board_colour === "amber" ? <span className="font-medium text-hazard-text">NEARLY AT QUOTE</span> : null}
      </div>
    </button>
  );
}

// ------------------------------------------------------------------ job view (JobDetail mockup, for the floor)

const LINE_CHIP: Record<BoardLine["state"], "green" | "neon" | "stone" | "amber"> = { done: "green", running: "neon", ready: "stone", locked: "stone" };

function JobView({
  job, data, now, name, onClose, onStart, onPause, onComplete,
}: {
  job: BoardJob; data: BoardData; now: number; name: (id: string | null) => string; onClose: () => void;
  onStart: (lineId: string) => void; onPause: (techId: string) => void; onComplete: (lineId: string, techId: string) => void;
}) {
  const tz = data.settings.time_zone;
  const [detail, setDetail] = useState<KioskJob | null>(null);
  const refresh = useCallback(() => { loadJob(job.id).then((d) => d && setDetail(d)).catch(() => {}); }, [job.id]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, JOB_REFRESH_MS); // photos, damage and activity update while the job is open
    return () => clearInterval(t);
  }, [refresh]);
  // re-fetch whenever the board data changes (e.g. someone clocks on elsewhere)
  const runningKey = data.running.map((r) => r.id).join();
  useEffect(() => { refresh(); }, [runningKey, job.stage, refresh]);

  const lineIds = new Set(job.lines.map((l) => l.id));
  const running = data.running.filter((r) => lineIds.has(r.line_id));
  const complete = isComplete(job.stage);
  const current = Math.min(job.stage, COMPLETE);
  const nextOwner = job.lines.find((l) => l.state !== "done" && l.owner_id)?.owner_id ?? null;
  const tech = running.length ? running.map((r) => firstName(name(r.technician_id))).join(", ") : nextOwner ? firstName(name(nextOwner)) : "—";
  const eta = complete ? "Ready now" : etaLabel(job.eta, tz) ?? "Not set";
  const insurer = detail?.job.insurer;
  const eyebrow = [`JOB ${job.job_number ?? ""}`, job.bay && `BAY ${job.bay}`, detail ? (insurer ? `INSURANCE: ${insurer}` : "PRIVATE") : null].filter(Boolean).join(" · ").toUpperCase();
  const RED = "var(--progress)", GREEN = "var(--complete)", TRACK = "var(--border)";
  const damage = detail?.damage ?? [];

  return (
    <div className="ab-shell grid-bg fixed inset-0 z-30 flex flex-col overflow-y-auto" role="dialog" aria-modal="true" aria-label={`Job ${job.job_number}`}>
      <div className="mx-auto flex w-full max-w-[1376px] flex-col gap-5 px-8 pb-12 pt-5 max-sm:px-4">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-5">
          <button onClick={onClose} className="cut-sm flex min-h-16 cursor-pointer items-center gap-2 border border-ink bg-bg px-6 font-display text-[18px] font-bold uppercase tracking-[.1em] text-ink active:bg-bg-subtle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Board
          </button>
          <span className="grow font-mono text-[13px] uppercase tracking-[.12em] text-muted">// JOBS / {job.job_number}</span>
          <span className="font-mono text-[15px] text-muted" suppressHydrationWarning>{clock(now, tz)}</span>
        </div>

        {/* title + key facts */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[12px] tracking-[.18em] text-accent">{eyebrow}</span>
            <h1 className="m-0 font-display text-[44px] font-bold uppercase leading-tight tracking-[.03em] max-sm:text-[30px]">{[job.make, job.model].filter(Boolean).join(" ") || job.rego}</h1>
            <span className="font-mono text-[14px] text-muted">{[job.rego, job.colour, detail?.job.vin].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="cut flex gap-7 border border-line bg-bg px-[22px] py-4">
            <Fact label="TECH">{tech}</Fact>
            <Fact label="ETA" tone={complete ? "complete" : "accent"}>{eta}</Fact>
            <Fact label="HOURS" tone={job.board_colour === "red" ? "progress" : undefined}>{hrs(job.actual_hours)} / {hrs(job.quoted_hours)}</Fact>
          </div>
        </div>

        {/* stage progress */}
        <section aria-label="Repair stages" className={`cut bg-bg px-6 py-[22px] ${complete ? "border border-complete shadow-[0_0_24px_rgba(22,163,74,.18)]" : "border border-line"}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] tracking-[.16em] text-muted">REPAIR PROGRESS</span>
            <span className={`font-mono text-[12px] font-medium tracking-[.14em] ${complete ? "text-complete" : "text-progress"}`}>
              {complete ? "COMPLETE · READY TO COLLECT" : `IN PROGRESS · ${current} OF ${STAGE_COUNT} DONE`}
            </span>
          </div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2 p-0">
            {STAGES.map((nm, i) => {
              const done = i < current, now_ = i === current && !complete;
              const bg = complete || done ? (complete ? GREEN : RED) : now_ ? `linear-gradient(90deg,${RED} 50%,${TRACK} 50%)` : TRACK;
              return (
                <li key={nm} className="flex flex-col gap-2.5">
                  <div className="h-2" style={{ background: bg, boxShadow: complete ? "0 0 10px rgba(22,163,74,.45)" : done || now_ ? "0 0 10px rgba(225,29,46,.35)" : "none" }} />
                  <span className="font-mono text-[11px] tracking-[.14em] text-muted">{String(i + 1).padStart(2, "0")}{complete || done ? " · DONE" : now_ ? " · NOW" : ""}</span>
                  <span className={`font-display text-[15px] font-semibold uppercase tracking-[.06em] ${complete ? "text-complete" : now_ ? "text-progress" : done ? "text-ink" : "text-muted"}`}>{nm}</span>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="flex flex-wrap gap-6">
          {/* damage scan + photos (live) */}
          <section aria-labelledby="kdmg" className="cut scan flex min-w-0 flex-[1_1_480px] flex-col gap-4 border border-line bg-bg px-6 py-[22px]">
            <div className="flex items-center justify-between">
              <h2 id="kdmg" className="m-0 font-display text-[18px] uppercase tracking-[.14em]">Damage scan</h2>
              <span className={`font-mono text-[11px] tracking-[.14em] ${damage.length ? "text-hazard-text" : "text-muted"}`}>
                {!detail ? "LOADING…" : damage.length ? `${new Set(damage.map((d) => d.panel)).size} PANELS FLAGGED` : "NO DAMAGE RECORDED"}
              </span>
            </div>
            <DamageScan body={job.body_type} damage={damage} title={`Top-down vehicle outline${damage.length ? ` with ${damage.length} damaged panel(s)` : ""}`} />
            <PhotoGallery photos={(detail?.photos ?? []).map((p) => ({ url: photoUrl(p.path), caption: p.caption ?? "" }))} />
          </section>

          <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-6">
            {/* job lines: start / help / pause / complete */}
            <section aria-labelledby="klines" className="cut flex flex-col gap-3 border border-line bg-bg px-6 py-[22px]">
              <h2 id="klines" className="m-0 mb-1 font-display text-[18px] uppercase tracking-[.14em]">Job lines</h2>
              {job.lines.map((line) => {
                const onLine = data.running.filter((r) => r.line_id === line.id);
                const over = line.quoted_hours > 0 && line.actual_hours > line.quoted_hours;
                const canWork = line.state === "ready" || line.state === "running";
                return (
                  <div key={line.id} className={`border-b border-divider pb-3 ${line.state === "locked" ? "opacity-55" : ""}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <Chip tone={LINE_CHIP[line.state]}>{PROC[line.procedure]}</Chip>
                      <span className="font-display text-[19px] font-semibold">{line.description}</span>
                      <span className={`ml-auto font-mono text-[15px] tabular-nums ${over ? "font-medium text-progress" : "text-muted"}`}>{hrs(line.actual_hours)} / {hrs(line.quoted_hours)} H</span>
                    </div>
                    <div className="mt-1 text-[14px] text-muted">
                      Owner <b className="font-semibold text-ink">{name(line.owner_id)}</b>
                      {line.state === "locked" && " · waiting for the step before"}
                      {line.state === "done" && " · complete"}
                    </div>
                    {onLine.map((r) => (
                      <div key={r.id} className="cut-sm mt-3 flex flex-wrap items-center gap-3 border border-line bg-bg-subtle px-4 py-2.5">
                        <span className="font-display text-[18px] font-semibold">
                          {r.role === "helper" && <span className="cut-sm mr-2 bg-neon px-2 font-mono text-[13px] text-on-neon">+1</span>}
                          {name(r.technician_id)}
                        </span>
                        <span className="font-mono text-[22px] tabular-nums text-accent">{elapsed(r.started_at, now)}</span>
                        <div className="ml-auto flex gap-3">
                          <BigButton tone="hazard" onClick={() => onPause(r.technician_id)}>Pause</BigButton>
                          {r.role === "owner" && <BigButton tone="complete" onClick={() => onComplete(line.id, r.technician_id)}>Complete</BigButton>}
                        </div>
                      </div>
                    ))}
                    {canWork && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        <BigButton tone="neon" onClick={() => onStart(line.id)}>{onLine.length ? "Start / help" : "Start"}</BigButton>
                        {line.owner_id && !onLine.some((r) => r.technician_id === line.owner_id) && (
                          <BigButton tone="complete" onClick={() => onComplete(line.id, line.owner_id!)}>Complete</BigButton>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!job.lines.length && <p className="text-muted">No job lines yet. The office adds them.</p>}
            </section>

            {/* activity log: who did what */}
            <section aria-labelledby="klog" className="cut flex flex-col gap-3.5 border border-line bg-bg px-6 py-[22px]">
              <h2 id="klog" className="m-0 font-display text-[18px] uppercase tracking-[.14em]">Activity log</h2>
              {(detail?.activity ?? []).map((g, i) => (
                <div key={i} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
                  <span className="font-mono text-[12px] text-accent">{activityTime(g.at, tz, now)}</span>
                  <span className="leading-normal text-body">{g.message}</span>
                </div>
              ))}
              {detail && !detail.activity.length && <p className="text-muted">Nothing yet.</p>}
              {!detail && <p className="text-muted">Loading…</p>}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "accent" | "complete" | "progress" }) {
  const c = tone === "accent" ? "text-accent" : tone === "complete" ? "text-complete" : tone === "progress" ? "text-progress" : "text-ink";
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11px] tracking-[.14em] text-muted">{label}</span>
      <span className={`font-display text-[18px] font-semibold ${c}`}>{children}</span>
    </div>
  );
}

// ------------------------------------------------------------------ my work

function MyWork({
  techId, data, now, onStart, onPause, onComplete,
}: {
  techId: string; data: BoardData; now: number;
  onStart: (jobId: string, lineId: string) => void; onPause: () => void; onComplete: (lineId: string) => void;
}) {
  const mine = data.running.find((r) => r.technician_id === techId);
  const items = data.jobs.flatMap((job) => job.lines.filter((l) => l.owner_id === techId && l.state !== "done").map((line) => ({ job, line })));
  // Own unlocked items first (spec: clocking on is two taps after picking yourself).
  items.sort((a, b) => Number(a.line.state === "locked") - Number(b.line.state === "locked"));
  const current = mine ? data.jobs.flatMap((j) => j.lines.map((l) => ({ job: j, line: l }))).find((x) => x.line.id === mine.line_id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      {current && mine && (
        <div className="cut border border-neon bg-bg p-5 shadow-[0_0_24px_rgba(0,238,234,.2)]">
          <div className="font-mono text-[12px] uppercase tracking-[.14em] text-muted">Clocked on now{mine.role === "helper" ? " · helping" : ""}</div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="font-display text-[22px] font-semibold">{current.job.rego} · {current.line.description}</span>
            <span className="font-mono text-[26px] tabular-nums text-accent">{elapsed(mine.started_at, now)}</span>
            <div className="ml-auto flex gap-3">
              <BigButton tone="hazard" onClick={onPause}>Pause</BigButton>
              {mine.role === "owner" && <BigButton tone="complete" onClick={() => onComplete(current.line.id)}>Complete</BigButton>}
            </div>
          </div>
        </div>
      )}
      <h3 className="m-0 font-mono text-[12px] uppercase tracking-[.14em] text-muted">Your items</h3>
      {items.length === 0 && <p className="text-[18px] text-muted">Nothing assigned to you. Pick a job on the board to help.</p>}
      {items.map(({ job, line }) => {
        const isCurrent = mine?.line_id === line.id;
        const locked = line.state === "locked";
        return (
          <button key={line.id} disabled={locked || isCurrent} onClick={() => onStart(job.id, line.id)}
            className="cut-sm flex min-h-20 cursor-pointer items-center gap-4 border border-line bg-bg px-5 text-left active:bg-bg-subtle disabled:cursor-default disabled:opacity-45">
            <Chip tone={LINE_CHIP[line.state]}>{PROC[line.procedure]}</Chip>
            <span className="font-mono text-[20px] font-medium">{job.rego}</span>
            <span className="font-display text-[19px] font-semibold">{line.description}</span>
            <span className="ml-auto font-mono text-[14px] text-muted">{locked ? "LOCKED" : isCurrent ? "RUNNING" : `${hrs(line.actual_hours)} / ${hrs(line.quoted_hours)} H  ▶`}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ pickers, PIN pad, primitives

function WhoPicker({ data, ownerId, procedure, onPick }: { data: BoardData; ownerId?: string | null; procedure?: string; onPick: (techId: string) => void }) {
  // Owner first, then people who do this procedure, then everyone else.
  const rank = (t: BoardData["technicians"][number]) => (t.id === ownerId ? 0 : procedure && t.procedures.includes(procedure) ? 1 : 2);
  const techs = [...data.technicians].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {techs.map((t) => (
        <button key={t.id} onClick={() => onPick(t.id)}
          className={`cut-sm min-h-24 cursor-pointer border bg-bg px-4 font-display text-[22px] font-semibold active:bg-bg-subtle ${t.id === ownerId ? "border-complete" : "border-line"}`}>
          {t.name}
          {t.id === ownerId && <span className="block font-mono text-[12px] font-medium uppercase tracking-[.14em] text-complete">Owner</span>}
        </button>
      ))}
    </div>
  );
}

function BigChoices({ options, onPick }: { options: { id: string; label: string }[]; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {options.map((o) => (
        <button key={o.id} onClick={() => onPick(o.id)} className="cut-sm min-h-24 cursor-pointer border border-line bg-bg px-4 font-display text-[22px] font-semibold active:bg-bg-subtle">
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PinPad({ who, action, busy, onSubmit, onCancel }: { who: string; action: string; busy: boolean; onSubmit: (pin: string) => void; onCancel: () => void }) {
  const [pin, setPin] = useState("");
  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      onSubmit(next);
      setPin("");
    }
  };
  return (
    <div className="ab-shell fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,12,13,.84)] p-4" role="dialog" aria-modal="true" aria-label={`PIN for ${who}`}>
      <div className="cut w-full max-w-md border border-neon bg-bg p-6 shadow-[0_0_40px_rgba(0,238,234,.35)]">
        <div className="text-center font-display text-[24px] font-bold uppercase tracking-[.06em]">{who}</div>
        <div className="mb-5 text-center text-[16px] text-muted">{action}</div>
        <div className="mb-6 flex justify-center gap-4" aria-label={`${pin.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-5 w-5 rotate-45 border-2 ${i < pin.length ? "border-neon bg-neon" : "border-faint bg-bg"}`} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <PadKey key={d} onClick={() => press(d)}>{d}</PadKey>)}
          <PadKey onClick={onCancel} small>Cancel</PadKey>
          <PadKey onClick={() => press("0")}>0</PadKey>
          <PadKey onClick={() => setPin((p) => p.slice(0, -1))} small label="Delete digit">⌫</PadKey>
        </div>
        {busy && <div className="mt-4 text-center font-mono text-[13px] uppercase tracking-[.14em] text-muted">Checking…</div>}
      </div>
    </div>
  );
}

function PadKey({ children, onClick, small, label }: { children: React.ReactNode; onClick: () => void; small?: boolean; label?: string }) {
  return (
    <button onClick={onClick} aria-label={label} className={`cut-sm min-h-20 cursor-pointer border border-line bg-bg-subtle font-display font-semibold active:bg-neon active:text-on-neon ${small ? "text-[16px] uppercase tracking-[.1em]" : "text-[36px]"}`}>
      {children}
    </button>
  );
}

function BigButton({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone: "neon" | "hazard" | "complete" }) {
  const c = { neon: "bg-neon text-on-neon", hazard: "bg-hazard text-on-neon", complete: "bg-complete text-white" }[tone];
  return (
    <button onClick={onClick} className={`cut-sm min-h-16 min-w-36 cursor-pointer px-6 font-display text-[18px] font-bold uppercase tracking-[.1em] active:brightness-90 ${c}`}>
      {children}
    </button>
  );
}

function Chip({ tone, children }: { tone: "green" | "neon" | "stone" | "amber"; children: React.ReactNode }) {
  const c = { green: "bg-complete text-white", neon: "bg-neon text-on-neon", stone: "bg-line text-body", amber: "bg-hazard text-on-neon" }[tone];
  return <span className={`cut-sm inline-block shrink-0 px-2.5 py-1 font-mono text-[12px] uppercase tracking-[.12em] ${c}`}>{children}</span>;
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="ab-shell grid-bg fixed inset-0 z-40 flex flex-col" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center gap-4 border-b border-line bg-white/95 px-8 py-4 max-sm:px-4">
        <h2 className="m-0 font-display text-[24px] font-bold uppercase tracking-[.06em]">{title}</h2>
        <button onClick={onClose} className="cut-sm ml-auto min-h-16 cursor-pointer border border-ink bg-bg px-8 font-display text-[18px] font-bold uppercase tracking-[.1em] active:bg-bg-subtle">
          Back
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6 max-sm:px-4">{children}</div>
    </div>
  );
}

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
);

// ------------------------------------------------------------------ helpers

// Ticks every second, corrected for any difference between the tablet clock and the server clock.
// Starts from the server's time so the first render matches the server-rendered HTML.
function useNow(serverNow: string) {
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const tick = () => setNow(Date.now() + offset);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [serverNow]);
  return now;
}

function elapsed(startedAt: string, now: number) {
  const s = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

const hrs = (n: number) => Number(n ?? 0).toFixed(1);
const firstName = (n: string) => n.split(/[\s(]/)[0];
const clock = (now: number, tz: string) =>
  new Date(now).toLocaleString("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .replace(/,/g, "").toUpperCase();
