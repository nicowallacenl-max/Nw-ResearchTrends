"use server";

import { requireAdmin } from "@/lib/auth";
import { AU_STATES, toVehicle, type PlateResult } from "@/lib/plate";

// Server-only: the PlateAPI key never reaches the browser.
export async function lookupRego(plateIn: string, stateIn: string): Promise<PlateResult> {
  await requireAdmin();
  const plate = plateIn.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const state = stateIn.toUpperCase();
  if (!plate || plate.length > 9) return { ok: false, reason: "invalid", message: "Enter a rego first.", remaining: null };
  if (!(AU_STATES as readonly string[]).includes(state)) return { ok: false, reason: "invalid", message: "Pick a state.", remaining: null };
  const key = process.env.PLATEAPI_KEY;
  if (!key) return { ok: false, reason: "not_configured", message: "Rego lookup isn't set up (PLATEAPI_KEY missing). Enter details manually.", remaining: null };

  let res: Response;
  try {
    const url = `https://api.plateapi.com.au/api/v1/lookup?plate=${encodeURIComponent(plate)}&state=${state}&detailed=true`;
    res = await fetch(url, { headers: { "X-API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  } catch {
    return { ok: false, reason: "unavailable", message: "Rego lookup service didn't respond. Enter details manually.", remaining: null };
  }
  const rem = res.headers.get("x-ratelimit-remaining");
  const remaining = rem === null || rem === "" ? null : Number(rem);
  if (res.status === 429) return { ok: false, reason: "quota", message: "Monthly rego lookup limit reached. Enter details manually.", remaining: 0 };
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "not_configured", message: "Rego lookup key was rejected. Enter details manually.", remaining };

  const body = await res.json().catch(() => null);
  if (!res.ok || !body) return { ok: false, reason: "unavailable", message: "Rego lookup failed. Enter details manually.", remaining };
  if (!body.success || !body.vehicle) {
    return { ok: false, reason: "not_found", message: `No vehicle found for ${plate} (${state}). Enter details manually.`, remaining };
  }
  const alternatives = Array.isArray(body.alternatives)
    ? body.alternatives.filter((a: unknown) => a && typeof a === "object").map(toVehicle)
    : [];
  return { ok: true, vehicle: toVehicle(body.vehicle), alternatives, match: String(body.match ?? "exact"), sandbox: !!body.sandbox, remaining };
}
