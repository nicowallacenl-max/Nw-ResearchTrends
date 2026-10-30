"use server";

import { revalidatePath } from "next/cache";
import { kioskDb, kioskKey, type KioskResult } from "@/lib/kiosk";

async function call(fn: string, args: Record<string, unknown>): Promise<KioskResult> {
  const { data, error } = await kioskDb().rpc(fn, { p_key: await kioskKey(), ...args });
  if (error) return { ok: false, error: "server", detail: error.message };
  revalidatePath("/board");
  return data as KioskResult;
}

export async function startWork(input: { techId: string; pin: string; lineId: string; helperReason?: string; approverPin?: string }) {
  return call("kiosk_start", {
    p_tech: input.techId,
    p_pin: input.pin,
    p_line: input.lineId,
    p_helper_reason: input.helperReason ?? null,
    p_approver_pin: input.approverPin ?? null,
  });
}

export async function pauseWork(input: { techId: string; pin: string; reasonId: string }) {
  return call("kiosk_pause", { p_tech: input.techId, p_pin: input.pin, p_reason: input.reasonId });
}

export async function completeWork(input: { techId: string; pin: string; lineId: string }) {
  return call("kiosk_complete", { p_tech: input.techId, p_pin: input.pin, p_line: input.lineId });
}
