"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { completeWork, pauseWork, startWork } from "./actions";
import type { BoardData, BoardJob, BoardLine, KioskResult } from "@/lib/kiosk";

// Wall board for a landscape tablet. Everything is a big tap target (>= 64px); the only text input is the PIN pad.

const PROC: Record<BoardLine["procedure"], string> = { strip: "Strip", repair: "Repair", prep: "Prep", paint: "Paint", refit: "Refit" };
const HELPER_REASONS = ["Two-person job", "Behind schedule", "Owner absent", "Training"];
const REFRESH_MS = 15_000;
const IDLE_CLOSE_MS = 60_000;

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

  const techName = useMemo(() => new Map(data.technicians.map((t) => [t.id, t.name])), [data.technicians]);
  const lineById = useMemo(() => {
    const m = new Map<string, { line: BoardLine; job: BoardJob }>();
    data.jobs.forEach((job) => job.lines.forEach((line) => m.set(line.id, { line, job })));
    return m;
  }, [data.jobs]);

  // Keep the board fresh; close abandoned dialogs so the next person starts clean.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);
  useEffect(() => {
    if (!flow) return;
    const t = setTimeout(() => setFlow(null), IDLE_CLOSE_MS);
    return () => clearTimeout(t);
  }, [flow]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.tone === "ok" ? 4000 : 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const name = (id: string | null | undefined) => (id ? techName.get(id) ?? "Unknown" : "Unassigned");
  const backTo = (jobId?: string): Flow | null => (jobId ? { kind: "job", jobId } : null);

  async function run(action: () => Promise<KioskResult>, onOk: (r: KioskResult) => string, onErr?: (r: KioskResult) => Flow | null | undefined) {
    setBusy(true);
    let r: KioskResult;
    try {
      r = await action();
    } catch {
      r = { ok: false, error: "server" };
    }
    setBusy(false);
    if (r.ok) {
      setFlow(null);
      setToast({ text: onOk(r), tone: "ok" });
      router.refresh();
      return;
    }
    let text = ERRORS[r.error ?? ""] ?? `Something went wrong (${r.error}).`;
    if (r.error === "helpers_running") text = `${r.detail} still clocked on as helper. They need to pause first.`;
    setToast({ text, tone: "err" });
    const next = onErr?.(r);
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
      (r) =>
        `${name(f.techId)} clocked on${r.role === "helper" ? " as helper" : ""}: ${line.description}` +
        (r.switched_from ? ` (paused ${r.switched_from})` : ""),
      // Wrong own PIN: stay on the PIN pad. Wrong owner PIN: retry approval. Anything else: back to the job.
      (r) => (r.error === "wrong_pin" ? { ...f, step: "pin" } : r.error?.startsWith("owner_") ? { ...f, pin, step: "approver" } : backTo(f.jobId)),
    );
  }

  function submitPause(f: Extract<Flow, { kind: "pause" }>, pin: string) {
    const reason = data.delay_reasons.find((r) => r.id === f.reasonId)?.label ?? "";
    run(
      () => pauseWork({ techId: f.techId, pin, reasonId: f.reasonId! }),
      () => `${name(f.techId)} paused: ${reason}`,
      (r) => (r.error === "wrong_pin" ? f : backTo(f.jobId)),
    );
  }

  function submitComplete(f: Extract<Flow, { kind: "complete" }>, pin: string) {
    const { line, job } = lineById.get(f.lineId)!;
    run(
      () => completeWork({ techId: f.techId, pin, lineId: f.lineId }),
      (r) => (r.job_done ? `${job.rego} is finished. All items complete!` : `${line.description} complete. Next step unlocked.`),
      (r) => (r.error === "wrong_pin" ? f : backTo(f.jobId)),
    );
  }

  // ------------------------------------------------------------ render
  const open = flow?.kind === "job" ? data.jobs.find((j) => j.id === flow.jobId) : undefined;

  return (
    <div className="flex min-h-screen select-none flex-col bg-stone-950 text-stone-100">
      {/* While a dialog is open the board behind it can't be tapped or focused. */}
      <header inert={!!flow} className="flex items-center gap-4 border-b border-stone-800 px-5 py-3">
        <h1 className="text-2xl font-bold tracking-tight">Job board</h1>
        <span className="text-lg text-stone-400" suppressHydrationWarning>{clock(now, data.settings.time_zone)}</span>
        <button onClick={() => setFlow({ kind: "mine" })} className="ml-auto min-h-16 rounded-xl bg-orange-600 px-8 text-xl font-semibold active:bg-orange-700">
          My work
        </button>
      </header>

      <main inert={!!flow} className="grid flex-1 auto-rows-min grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.jobs.length === 0 && <p className="col-span-full mt-16 text-center text-2xl text-stone-500">No open jobs. Add them in the office.</p>}
        {data.jobs.map((job) => (
          <JobTile key={job.id} job={job} data={data} now={now} name={name} onOpen={() => setFlow({ kind: "job", jobId: job.id })} />
        ))}
      </main>

      {open && (
        <Sheet title={`${open.rego} · ${vehicle(open)}`} onClose={() => setFlow(null)}>
          <JobSheet
            job={open}
            data={data}
            now={now}
            name={name}
            onStart={(lineId) => setFlow({ kind: "start", jobId: open.id, lineId, step: "who" })}
            onPause={(techId) => setFlow({ kind: "pause", jobId: open.id, techId, step: "reason" })}
            onComplete={(lineId, techId) => setFlow({ kind: "complete", jobId: open.id, lineId, techId, step: "pin" })}
          />
        </Sheet>
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
          <PinPad
            who={name(line.owner_id)}
            action={`Approve ${name(flow.techId)} helping on ${line.description}`}
            busy={busy}
            onCancel={back}
            onSubmit={(approverPin) => submitStart(flow, flow.pin!, approverPin)}
          />
        );
      })()}

      {flow?.kind === "pause" &&
        (flow.step === "reason" ? (
          <Sheet title={`${name(flow.techId)}: why are you pausing?`} onClose={() => setFlow(backTo(flow.jobId))}>
            <BigChoices options={data.delay_reasons} onPick={(reasonId) => setFlow({ ...flow, reasonId, step: "pin" })} />
          </Sheet>
        ) : (
          <PinPad
            who={name(flow.techId)}
            action={`Pause: ${data.delay_reasons.find((r) => r.id === flow.reasonId)?.label}`}
            busy={busy}
            onCancel={() => setFlow(backTo(flow.jobId))}
            onSubmit={(pin) => submitPause(flow, pin)}
          />
        ))}

      {flow?.kind === "complete" && (
        <PinPad
          who={name(flow.techId)}
          action={`Complete: ${lineById.get(flow.lineId)?.line.description}`}
          busy={busy}
          onCancel={() => setFlow(backTo(flow.jobId))}
          onSubmit={(pin) => submitComplete(flow, pin)}
        />
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
        <div
          role="status"
          onClick={() => setToast(null)}
          className={`fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90vw] rounded-2xl px-8 py-5 text-xl font-semibold shadow-2xl ${
            toast.tone === "ok" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

const TILE_RING = { green: "border-stone-700", amber: "border-amber-500", red: "border-red-500" } as const;
const TILE_TAG = { green: "", amber: "bg-amber-500 text-stone-950", red: "bg-red-600 text-white" } as const;

function JobTile({ job, data, now, name, onOpen }: { job: BoardJob; data: BoardData; now: number; name: (id: string | null) => string; onOpen: () => void }) {
  const lineIds = new Set(job.lines.map((l) => l.id));
  // Owners first, helpers marked "+1".
  const running = data.running.filter((r) => lineIds.has(r.line_id)).sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));
  return (
    <button onClick={onOpen} className={`flex flex-col overflow-hidden rounded-2xl border-4 bg-stone-900 text-left active:bg-stone-800 ${TILE_RING[job.board_colour]}`}>
      <div className="flex items-stretch">
        <Swatch job={job} />
        <div className="min-w-0 flex-1 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-3xl font-bold tracking-wider">{job.rego}</span>
            {job.board_colour !== "green" && (
              <span className={`rounded-md px-2 py-1 text-sm font-bold uppercase ${TILE_TAG[job.board_colour]}`}>
                {job.board_colour === "red" ? "Over" : "Nearly"}
              </span>
            )}
          </div>
          <div className="truncate text-lg text-stone-300">{vehicle(job)}</div>
          <div className="text-base text-stone-400">
            {hrs(job.actual_hours)} / {hrs(job.quoted_hours)} h
          </div>
        </div>
      </div>
      <ProcedureStrip lines={job.lines} />
      <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-3">
        {running.length === 0 ? (
          <span className="text-base text-stone-500">Nobody on it</span>
        ) : (
          running.map((r) => (
            <span key={r.id} className={`rounded-full px-3 py-1 text-base font-semibold ${r.role === "owner" ? "bg-green-700" : "bg-sky-800"}`}>
              {r.role === "helper" && "+1 "}
              {firstName(name(r.technician_id))} · {elapsed(r.started_at, now)}
            </span>
          ))
        )}
      </div>
    </button>
  );
}

const STATE_STYLE = { done: "bg-green-700 text-white", running: "bg-orange-500 text-stone-950", ready: "bg-stone-200 text-stone-900", locked: "bg-stone-800 text-stone-500" } as const;

function ProcedureStrip({ lines }: { lines: BoardLine[] }) {
  const byProc = (Object.keys(PROC) as BoardLine["procedure"][])
    .map((p) => {
      const ls = lines.filter((l) => l.procedure === p);
      if (!ls.length) return null;
      const state = ls.every((l) => l.state === "done") ? "done" : ls.some((l) => l.state === "running") ? "running" : ls.some((l) => l.state === "ready") ? "ready" : "locked";
      return { p, state } as const;
    })
    .filter(Boolean) as { p: BoardLine["procedure"]; state: keyof typeof STATE_STYLE }[];
  return (
    <div className="flex gap-1 px-4">
      {byProc.map(({ p, state }) => (
        <span key={p} className={`flex-1 rounded-md py-1 text-center text-sm font-semibold ${STATE_STYLE[state]}`}>{PROC[p]}</span>
      ))}
    </div>
  );
}

function JobSheet({
  job, data, now, name, onStart, onPause, onComplete,
}: {
  job: BoardJob; data: BoardData; now: number; name: (id: string | null) => string;
  onStart: (lineId: string) => void; onPause: (techId: string) => void; onComplete: (lineId: string, techId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {job.lines.map((line) => {
        const running = data.running.filter((r) => r.line_id === line.id);
        const live = line.actual_hours; // server figure already includes running time up to the last refresh
        const over = line.quoted_hours > 0 && live > line.quoted_hours;
        const open = line.state === "ready" || line.state === "running";
        return (
          <div key={line.id} className={`rounded-2xl border-2 p-4 ${line.state === "locked" ? "border-stone-800 opacity-60" : "border-stone-700"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-md px-3 py-1 text-base font-bold ${STATE_STYLE[line.state]}`}>{PROC[line.procedure]}</span>
              <span className="text-2xl font-semibold">{line.description}</span>
              <span className={`ml-auto text-xl tabular-nums ${over ? "font-bold text-red-400" : "text-stone-300"}`}>
                {hrs(live)} / {hrs(line.quoted_hours)} h
              </span>
            </div>
            <div className="mt-1 text-lg text-stone-400">
              Owner: <b className="text-stone-200">{name(line.owner_id)}</b>
              {line.state === "locked" && " · waiting for the step before"}
              {line.state === "done" && " · complete"}
            </div>

            {running.map((r) => (
              <div key={r.id} className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-stone-800 p-3">
                <span className="text-xl font-semibold">
                  {r.role === "helper" && <span className="mr-2 rounded bg-sky-800 px-2 text-base">+1</span>}
                  {name(r.technician_id)}
                </span>
                <span className="font-mono text-2xl tabular-nums text-orange-400">{elapsed(r.started_at, now)}</span>
                <div className="ml-auto flex gap-3">
                  <BigButton tone="amber" onClick={() => onPause(r.technician_id)}>Pause</BigButton>
                  {r.role === "owner" && <BigButton tone="green" onClick={() => onComplete(line.id, r.technician_id)}>Complete</BigButton>}
                </div>
              </div>
            ))}

            {open && (
              <div className="mt-3 flex flex-wrap gap-3">
                <BigButton tone="orange" onClick={() => onStart(line.id)}>{running.length ? "Start / help" : "Start"}</BigButton>
                {line.owner_id && !running.some((r) => r.technician_id === line.owner_id) && (
                  <BigButton tone="green" onClick={() => onComplete(line.id, line.owner_id!)}>Complete</BigButton>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
        <div className="rounded-2xl border-2 border-orange-500 bg-stone-800 p-4">
          <div className="text-lg text-stone-400">Clocked on now{mine.role === "helper" ? " (helping)" : ""}</div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold">{current.job.rego} · {current.line.description}</span>
            <span className="font-mono text-3xl tabular-nums text-orange-400">{elapsed(mine.started_at, now)}</span>
            <div className="ml-auto flex gap-3">
              <BigButton tone="amber" onClick={onPause}>Pause</BigButton>
              {mine.role === "owner" && <BigButton tone="green" onClick={() => onComplete(current.line.id)}>Complete</BigButton>}
            </div>
          </div>
        </div>
      )}
      <h3 className="text-xl text-stone-400">Your items</h3>
      {items.length === 0 && <p className="text-xl text-stone-500">Nothing assigned to you. Pick a job on the board to help.</p>}
      {items.map(({ job, line }) => {
        const isCurrent = mine?.line_id === line.id;
        const locked = line.state === "locked";
        return (
          <button
            key={line.id}
            disabled={locked || isCurrent}
            onClick={() => onStart(job.id, line.id)}
            className="flex min-h-20 items-center gap-4 rounded-2xl bg-stone-800 px-5 text-left active:bg-stone-700 disabled:opacity-40"
          >
            <span className={`rounded-md px-3 py-1 text-base font-bold ${STATE_STYLE[line.state]}`}>{PROC[line.procedure]}</span>
            <span className="font-mono text-2xl font-bold">{job.rego}</span>
            <span className="text-xl">{line.description}</span>
            <span className="ml-auto text-lg text-stone-400">
              {locked ? "Locked" : isCurrent ? "Running" : `${hrs(line.actual_hours)} / ${hrs(line.quoted_hours)} h  ▶`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WhoPicker({ data, ownerId, procedure, onPick }: { data: BoardData; ownerId?: string | null; procedure?: string; onPick: (techId: string) => void }) {
  // Owner first, then people who do this procedure, then everyone else.
  const rank = (t: BoardData["technicians"][number]) => (t.id === ownerId ? 0 : procedure && t.procedures.includes(procedure) ? 1 : 2);
  const techs = [...data.technicians].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {techs.map((t) => (
        <button key={t.id} onClick={() => onPick(t.id)} className="min-h-24 rounded-2xl bg-stone-800 px-4 text-2xl font-semibold active:bg-stone-700">
          {t.name}
          {t.id === ownerId && <span className="block text-base font-normal text-green-400">Owner</span>}
        </button>
      ))}
    </div>
  );
}

function BigChoices({ options, onPick }: { options: { id: string; label: string }[]; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {options.map((o) => (
        <button key={o.id} onClick={() => onPick(o.id)} className="min-h-24 rounded-2xl bg-stone-800 px-4 text-2xl font-semibold active:bg-stone-700">
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-3xl bg-stone-900 p-6">
        <div className="text-center text-2xl font-bold">{who}</div>
        <div className="mb-4 text-center text-lg text-stone-400">{action}</div>
        <div className="mb-6 flex justify-center gap-4" aria-label={`${pin.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`size-6 rounded-full border-2 border-stone-400 ${i < pin.length ? "bg-orange-500" : ""}`} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <PadKey key={d} onClick={() => press(d)}>{d}</PadKey>
          ))}
          <PadKey onClick={onCancel} small>Cancel</PadKey>
          <PadKey onClick={() => press("0")}>0</PadKey>
          <PadKey onClick={() => setPin((p) => p.slice(0, -1))} small>⌫</PadKey>
        </div>
        {busy && <div className="mt-4 text-center text-lg text-stone-400">Checking…</div>}
      </div>
    </div>
  );
}

function PadKey({ children, onClick, small }: { children: React.ReactNode; onClick: () => void; small?: boolean }) {
  return (
    <button onClick={onClick} className={`min-h-20 rounded-2xl bg-stone-800 font-semibold active:bg-stone-600 ${small ? "text-xl" : "text-4xl"}`}>
      {children}
    </button>
  );
}

function BigButton({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone: "orange" | "amber" | "green" }) {
  const c = { orange: "bg-orange-600 active:bg-orange-700", amber: "bg-amber-500 text-stone-950 active:bg-amber-600", green: "bg-green-600 active:bg-green-700" }[tone];
  return (
    <button onClick={onClick} className={`min-h-16 min-w-36 rounded-xl px-6 text-xl font-semibold ${c}`}>
      {children}
    </button>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-stone-950">
      <div className="flex items-center gap-4 border-b border-stone-800 px-5 py-3">
        <h2 className="text-2xl font-bold">{title}</h2>
        <button onClick={onClose} className="ml-auto min-h-16 rounded-xl bg-stone-800 px-8 text-xl font-semibold active:bg-stone-700">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  );
}

function Swatch({ job }: { job: BoardJob }) {
  if (job.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={job.photo_url} alt="" className="w-28 shrink-0 object-cover" />;
  }
  return <div className="w-6 shrink-0 border-r border-stone-800 bg-stone-600" style={{ backgroundColor: cssColour(job.colour) }} aria-hidden />;
}

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
const vehicle = (j: BoardJob) => [j.colour, j.make, j.model].filter(Boolean).join(" ") || "Vehicle";
const firstName = (n: string) => n.split(/[\s(]/)[0];
const clock = (now: number, tz: string) => new Date(now).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", timeZone: tz });

// Paint colour names ("Silver", "Dark Blue") work as CSS colours; anything else shows the grey fallback class.
const cssColour = (c: string | null) => (c ?? "").toLowerCase().replace(/\s+/g, "");
