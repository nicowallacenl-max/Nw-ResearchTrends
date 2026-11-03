"use server";

import { requireAdmin } from "@/lib/auth";
import { AU_STATES, normalisePlate, toVehicle, type PlateResult, type PlateVehicle, type RegoSuggestion } from "@/lib/plate";
import type { BodyType } from "@/lib/vehicle";

// Type-ahead: vehicles we already know (past jobs, cached lookups). Free, no PlateAPI call.
export async function searchRego(prefix: string): Promise<RegoSuggestion[]> {
  const { supabase } = await requireAdmin();
  if (normalisePlate(prefix).length < 2) return [];
  const { data } = await supabase.rpc("rego_suggestions", { p_prefix: prefix, p_limit: 6 });
  return (data ?? []) as RegoSuggestion[];
}

// Registry lookup via PlateAPI, cached per plate+state (hits and misses) so a plate is only paid for once.
// The key is server-only and never reaches the browser.
export async function lookupRego(plateIn: string, stateIn: string): Promise<PlateResult> {
  const { supabase } = await requireAdmin();
  const plate = normalisePlate(plateIn);
  const state = stateIn.toUpperCase();
  if (!plate || plate.length > 9) return { ok: false, reason: "invalid", message: "Enter a rego first.", remaining: null };
  if (!(AU_STATES as readonly string[]).includes(state)) return { ok: false, reason: "invalid", message: "Pick a state.", remaining: null };

  const { data: hit } = await supabase.from("plate_lookups").select("*").eq("plate", plate).eq("state", state).maybeSingle();
  if (hit) {
    if (!hit.found) return { ok: false, reason: "not_found", message: `No vehicle found for ${plate} (${state}). Enter details manually.`, remaining: null, cached: true };
    const vehicle: PlateVehicle = { make: hit.make ?? "", model: hit.model ?? "", body_type: hit.body_type as BodyType | null, description: hit.description ?? "" };
    return { ok: true, vehicle, alternatives: (hit.alternatives ?? []) as PlateVehicle[], match: "exact", sandbox: false, remaining: null, cached: true };
  }

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
  const sandbox = !!body.sandbox;
  if (!body.success || !body.vehicle) {
    if (body?.code === "not_found" && !sandbox) await supabase.from("plate_lookups").upsert({ plate, state, found: false });
    return { ok: false, reason: "not_found", message: `No vehicle found for ${plate} (${state}). Enter details manually.`, remaining };
  }
  const vehicle = toVehicle(body.vehicle);
  const alternatives = Array.isArray(body.alternatives)
    ? body.alternatives.filter((a: unknown) => a && typeof a === "object").map(toVehicle)
    : [];
  // The sandbox plate (TEST123) isn't cached, so it can be used for testing at any time.
  if (!sandbox) {
    await supabase.from("plate_lookups").upsert({
      plate, state, found: true, make: vehicle.make, model: vehicle.model, body_type: vehicle.body_type,
      description: vehicle.description, alternatives,
    });
  }
  return { ok: true, vehicle, alternatives, match: String(body.match ?? "exact"), sandbox, remaining };
}
