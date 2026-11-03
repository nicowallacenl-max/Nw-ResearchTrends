"use client";

import type { BoardJob } from "@/lib/kiosk";
import { addDays, calRange, daysBetween, dayLabel, dayName, dueOutTone, weekStart, type CalMode, type DueTone } from "@/lib/calendar";
import { linesProgress } from "@/lib/stages";

// Due in / due out calendar (Workshop OS style). Used on the wall board (big touch targets) and in the office.
// Week = one column per day (Mon–Sun, today highlighted); day = DUE IN and DUE OUT side by side.
// Overdue jobs (due out passed, not finished) are pinned above so they can't hide.

const TONE: Record<DueTone, { chip: string; label: string; border: string }> = {
  "due-in": { chip: "bg-neon text-on-neon", label: "DUE IN", border: "border-line" },
  "due-out": { chip: "bg-complete text-white", label: "DUE OUT", border: "border-line" },
  ready: { chip: "bg-complete text-white", label: "READY", border: "border-complete" },
  "at-risk": { chip: "bg-hazard text-on-neon", label: "AT RISK", border: "border-hazard" },
  overdue: { chip: "bg-progress text-white", label: "OVERDUE", border: "border-progress" },
};

type Props = {
  jobs: BoardJob[];
  today: string;
  mode: CalMode;
  anchor: string;
  onNavigate: (mode: CalMode, anchor: string) => void;
  onOpen: (job: BoardJob) => void;
  big?: boolean; // wall board: larger touch targets
  loading?: boolean;
};

export function JobCalendar({ jobs, today, mode, anchor, onNavigate, onOpen, big, loading }: Props) {
  const { days } = calRange(mode, anchor);
  const inOn = (d: string) => jobs.filter((j) => j.due_in === d);
  const outOn = (d: string) => jobs.filter((j) => j.due_out === d);
  const overdue = jobs.filter((j) => dueOutTone(j, today) === "overdue").sort((a, b) => (a.due_out ?? "").localeCompare(b.due_out ?? ""));
  const quick: { label: string; mode: CalMode; anchor: string }[] = [
    { label: "Today", mode: "day", anchor: today },
    { label: "Tomorrow", mode: "day", anchor: addDays(today, 1) },
    { label: "This week", mode: "week", anchor: today },
    { label: "Next week", mode: "week", anchor: addDays(weekStart(today), 7) },
  ];
  const isActive = (q: (typeof quick)[number]) => q.mode === mode && (mode === "day" ? q.anchor === anchor : weekStart(q.anchor) === weekStart(anchor));
  const h = big ? "min-h-16 text-[17px] px-6" : "min-h-11 text-[13px] px-[18px]";
  const title = mode === "day" ? dayLabel(anchor) : `WEEK OF ${dayLabel(days[0]).slice(4)}`;

  return (
    <div className="flex flex-col gap-5">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Calendar range">
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={() => onNavigate(q.mode, q.anchor)} aria-pressed={isActive(q)}
              className={`cut-sm cursor-pointer font-display font-bold uppercase tracking-[.1em] ${h} ${isActive(q) ? "bg-neon text-on-neon" : "border border-line bg-bg text-ink active:bg-bg-subtle"}`}>
              {q.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NavArrow big={big} dir="left" label={mode === "day" ? "Back one day" : "Back one week"} onClick={() => onNavigate(mode, addDays(anchor, mode === "day" ? -1 : -7))} />
          <span className={`min-w-44 text-center font-display font-bold uppercase tracking-[.08em] ${big ? "text-[20px]" : "text-[16px]"}`}>{title}</span>
          <NavArrow big={big} dir="right" label={mode === "day" ? "Forward one day" : "Forward one week"} onClick={() => onNavigate(mode, addDays(anchor, mode === "day" ? 1 : 7))} />
        </div>
      </div>

      {overdue.length > 0 && (
        <section aria-label="Overdue" className="cut border border-progress bg-red-50/60 px-5 py-4">
          <h3 className="m-0 mb-3 font-mono text-[12px] font-medium uppercase tracking-[.16em] text-progress">Overdue · {overdue.length} past due out, not finished</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
            {overdue.map((j) => <JobCard key={`od-${j.id}`} job={j} kind="out" tone="overdue" today={today} onOpen={onOpen} big={big} />)}
          </div>
        </section>
      )}

      {mode === "day" ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {(["in", "out"] as const).map((kind) => {
            const list = kind === "in" ? inOn(anchor) : outOn(anchor).filter((j) => dueOutTone(j, today) !== "overdue");
            return (
              <section key={kind} aria-label={kind === "in" ? "Due in" : "Due out"} className="cut flex flex-col gap-3 border border-line bg-bg px-5 py-[18px]">
                <div className="flex items-center justify-between">
                  <h3 className="m-0 font-display text-[18px] uppercase tracking-[.14em]">{kind === "in" ? "Due in" : "Due out"}</h3>
                  <span className="font-mono text-[12px] tracking-[.14em] text-muted">{list.length} JOB{list.length === 1 ? "" : "S"}</span>
                </div>
                {list.map((j) => <JobCard key={j.id} job={j} kind={kind} tone={kind === "in" ? "due-in" : dueOutTone(j, today)} today={today} onOpen={onOpen} big={big} />)}
                {!list.length && <p className="m-0 py-4 text-muted">{loading ? "Loading…" : `Nothing due ${kind} ${anchor === today ? "today" : "this day"}.`}</p>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="cut overflow-x-auto border border-line bg-bg">
          <div className="grid min-w-[980px] grid-cols-7">
            {days.map((d) => {
              const ins = inOn(d), outs = outOn(d).filter((j) => dueOutTone(j, today) !== "overdue");
              const isToday = d === today, past = d < today;
              return (
                <div key={d} className={`flex min-h-[420px] flex-col gap-2 border-r border-divider p-2.5 last:border-r-0 ${isToday ? "bg-neon/[.07]" : past ? "bg-bg-subtle/60" : ""}`}>
                  <button type="button" onClick={() => onNavigate("day", d)} aria-label={`Open ${dayLabel(d)}`}
                    className={`cut-sm flex cursor-pointer flex-col items-start border px-2.5 py-2 text-left ${isToday ? "border-neon bg-neon/20" : "border-transparent hover:bg-bg-subtle"}`}>
                    <span className={`font-display text-[15px] font-bold uppercase tracking-[.08em] ${isToday ? "text-ink" : past ? "text-muted" : "text-ink"}`}>
                      {dayName(d)} {+d.slice(8)}{isToday && <span className="ml-1.5 font-mono text-[11px] font-medium text-accent">TODAY</span>}
                    </span>
                    <span className="font-mono text-[11px] tracking-[.12em] text-muted">{ins.length} IN · {outs.length} OUT</span>
                  </button>
                  {outs.map((j) => <JobCard key={`o-${j.id}`} job={j} kind="out" tone={dueOutTone(j, today)} today={today} onOpen={onOpen} big={big} compact />)}
                  {ins.map((j) => <JobCard key={`i-${j.id}`} job={j} kind="in" tone="due-in" today={today} onOpen={onOpen} big={big} compact />)}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className="m-0 font-mono text-[11px] uppercase tracking-[.12em] text-muted">
        <Legend tone="due-in" /> arriving · <Legend tone="due-out" /> leaving · <Legend tone="at-risk" /> due out today/tomorrow, work not finished · <Legend tone="ready" /> all lines done · <Legend tone="overdue" /> past due out
      </p>
    </div>
  );
}

function JobCard({ job, kind, tone, today, onOpen, big, compact }: { job: BoardJob; kind: "in" | "out"; tone: DueTone; today: string; onOpen: (j: BoardJob) => void; big?: boolean; compact?: boolean }) {
  const t = TONE[tone];
  const lp = linesProgress(job.lines.map((l) => l.state));
  const late = tone === "overdue" && job.due_out ? daysBetween(job.due_out, today) : 0;
  return (
    <button type="button" onClick={() => onOpen(job)} aria-label={`${t.label}: ${job.rego} ${[job.make, job.model].filter(Boolean).join(" ")}`}
      className={`cut-sm flex w-full cursor-pointer flex-col gap-1.5 border bg-bg text-left active:bg-bg-subtle ${t.border} ${compact ? "px-2.5 py-2" : "px-4 py-3"} ${big ? "min-h-16" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`cut-sm shrink-0 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[.12em] ${t.chip}`}>{t.label}{late ? ` · ${late}D` : ""}</span>
        {job.bay && <span className="truncate font-mono text-[11px] tracking-[.12em] text-muted">BAY {job.bay}</span>}
      </div>
      <span className={`font-mono font-medium ${compact ? "text-[14px]" : "text-[16px]"}`}>{job.rego}</span>
      <span className={`truncate font-display font-semibold leading-tight ${compact ? "text-[14px]" : "text-[18px]"}`}>{[job.make, job.model].filter(Boolean).join(" ") || "Vehicle"}</span>
      {kind === "out" && lp.total > 0 && (
        <>
          <div className="h-1 bg-line"><div className={`h-1 ${lp.allDone ? "bg-complete" : "bg-progress"}`} style={{ width: `${lp.allDone ? 100 : lp.pct}%` }} /></div>
          <span className="font-mono text-[11px] tracking-[.1em] text-muted">{lp.done}/{lp.total} LINES DONE</span>
        </>
      )}
      {kind === "in" && !compact && <span className="font-mono text-[11px] tracking-[.1em] text-muted">{job.job_number}{job.due_out ? ` · OUT ${dayLabel(job.due_out)}` : ""}</span>}
    </button>
  );
}

function NavArrow({ dir, label, onClick, big }: { dir: "left" | "right"; label: string; onClick: () => void; big?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`cut-sm flex cursor-pointer items-center justify-center border border-neon bg-neon text-on-neon ${big ? "h-16 w-16" : "h-11 w-11"}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} /></svg>
    </button>
  );
}

const Legend = ({ tone }: { tone: DueTone }) => <span className={`cut-sm inline-block px-1.5 py-0.5 ${TONE[tone].chip}`}>{TONE[tone].label}</span>;
