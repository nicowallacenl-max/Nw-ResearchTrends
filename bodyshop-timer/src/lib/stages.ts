// Repair progress = the job lines. The floor (wall board), the office and the customer tracker all read the same thing.
import { PROCEDURE_LABEL, type Procedure } from "@/lib/types";

export type LineState = "done" | "running" | "paused" | "ready" | "locked";

// Progress bar: one segment per line. Done = full, running/paused = half.
export function linesProgress(states: string[]) {
  const total = states.length;
  const done = states.filter((s) => s === "done").length;
  const half = states.filter((s) => s === "running" || s === "paused").length;
  return { total, done, allDone: total > 0 && done === total, pct: total ? Math.round(((done + half * 0.5) / total) * 100) : 0 };
}

// The procedure the job is on now: the first line (in workshop order) that isn't done.
export function currentProcedure(lines: { procedure: string; state: string }[]): Procedure | null {
  return (lines.find((l) => l.state !== "done")?.procedure as Procedure | undefined) ?? null;
}

export type ChipTone = "stone" | "green" | "amber" | "neon";
// Chip for bays, the pipeline and board tiles: READY (all lines done) / PARTS (paused waiting on parts) /
// NOT STARTED (nothing done or running yet) / the current procedure (e.g. PAINT).
export function jobChip(lines: { procedure: string; state: string }[], pausedFor?: string | null): { label: string; tone: ChipTone } {
  const p = linesProgress(lines.map((l) => l.state));
  if (p.allDone) return { label: "READY", tone: "green" };
  if (pausedFor && /part/i.test(pausedFor)) return { label: "PARTS", tone: "amber" };
  if (!p.total) return { label: "NO LINES", tone: "stone" };
  const started = lines.some((l) => l.state === "done" || l.state === "running" || l.state === "paused");
  if (!started) return { label: "NOT STARTED", tone: "stone" };
  const cur = currentProcedure(lines);
  return { label: (cur ? PROCEDURE_LABEL[cur] : "In progress").toUpperCase(), tone: "neon" };
}
