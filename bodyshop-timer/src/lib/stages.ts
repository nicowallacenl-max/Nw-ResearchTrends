// Job progress: 7 stages (index 0-6). Stage 7 = complete / ready to collect.
// Moves forward automatically as technicians start and complete work (database), and the office advances it.
export const STAGES = ["Assess", "Approve", "Strip", "Panel", "Paint", "Reassemble", "QC & Ready"] as const;
export const STAGE_COUNT = STAGES.length;
export const COMPLETE = STAGE_COUNT; // 7

// Customer-facing names for the same 7 steps (MobileTracker mockup).
export const TRACKER_STEPS = ["Checked in", "Assessed", "Insurer approved", "Panel work", "Paint", "Reassembly", "Ready to collect"] as const;

export const isComplete = (stage: number) => stage >= COMPLETE;
export const stageLabel = (stage: number) => (isComplete(stage) ? "Complete" : STAGES[stage] ?? "Assess");

// Progress bar fill: done stages full, current stage half; 100% when complete.
export const progressPct = (stage: number) => (isComplete(stage) ? 100 : Math.round(((stage + 0.5) / STAGE_COUNT) * 100));

export type ChipTone = "stone" | "green" | "amber" | "neon";
// Stage chip used on bays and the pipeline: READY (green) / PARTS (amber, paused waiting on parts) / ASSESS (grey) / stage (cyan).
export function stageChip(stage: number, pausedFor?: string | null): { label: string; tone: ChipTone } {
  if (isComplete(stage)) return { label: "READY", tone: "green" };
  if (pausedFor && /part/i.test(pausedFor)) return { label: "PARTS", tone: "amber" };
  if (stage === 0) return { label: "ASSESS", tone: "stone" };
  return { label: STAGES[stage].toUpperCase(), tone: "neon" };
}
