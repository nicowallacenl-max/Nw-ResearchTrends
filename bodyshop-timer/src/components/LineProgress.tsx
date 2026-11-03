import { linesProgress, type LineState } from "@/lib/stages";

const PROC: Record<string, string> = { strip: "Strip", repair: "Repair", prep: "Prep", paint: "Paint", refit: "Refit" };
const RED = "var(--progress)", GREEN = "var(--complete)", AMBER = "var(--hazard)", TRACK = "var(--border)";

// "Repair progress" panel (JobDetail mockup style), one segment per job line in the same order as the list:
// done = full red, running = half red (NOW), paused = half amber (PAUSED), not started / locked = grey.
// When every line is done the whole bar turns green with a green border.
export function LineProgress({ lines }: { lines: { id: string; description: string; procedure: string; state: string }[] }) {
  const p = linesProgress(lines.map((l) => l.state));
  const complete = p.allDone;
  return (
    <section aria-label="Repair progress by job line" className={`cut bg-bg px-6 py-[22px] ${complete ? "border border-complete shadow-[0_0_24px_rgba(22,163,74,.18)]" : "border border-line"}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-[.16em] text-muted">REPAIR PROGRESS</span>
        <span className={`font-mono text-[12px] font-medium tracking-[.14em] ${complete ? "text-complete" : p.total ? "text-progress" : "text-muted"}`}>
          {!p.total ? "NO JOB LINES YET" : complete ? "COMPLETE · ALL LINES DONE" : `IN PROGRESS · ${p.done} OF ${p.total} DONE`}
        </span>
      </div>
      {p.total > 0 && (
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2 p-0">
          {lines.map((l, i) => {
            const s = l.state as LineState;
            const done = s === "done", now = s === "running", paused = s === "paused";
            const bg = done ? (complete ? GREEN : RED) : now ? `linear-gradient(90deg,${RED} 50%,${TRACK} 50%)` : paused ? `linear-gradient(90deg,${AMBER} 50%,${TRACK} 50%)` : TRACK;
            const glow = complete ? "0 0 10px rgba(22,163,74,.45)" : done || now ? "0 0 10px rgba(225,29,46,.35)" : paused ? "0 0 10px rgba(251,142,40,.4)" : "none";
            const tag = done ? " · DONE" : now ? " · NOW" : paused ? " · PAUSED" : "";
            const colour = complete ? "text-complete" : now ? "text-progress" : paused ? "text-hazard-text" : done ? "text-ink" : "text-muted";
            return (
              <li key={l.id} className="flex min-w-0 flex-col gap-2.5">
                <div className="h-2 transition-[background] duration-300" style={{ background: bg, boxShadow: glow }} />
                <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">{String(i + 1).padStart(2, "0")} · {PROC[l.procedure] ?? l.procedure}{tag}</span>
                <span className={`font-display text-[15px] font-semibold uppercase leading-snug tracking-[.04em] ${colour}`}>{l.description}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
