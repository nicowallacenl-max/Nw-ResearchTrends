import type { BodyType } from "@/lib/vehicle";

export const AU_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"] as const;
export type AuState = (typeof AU_STATES)[number];

export type PlateVehicle = { make: string; model: string; body_type: BodyType | null; description: string };
export type PlateResult =
  | { ok: true; vehicle: PlateVehicle; alternatives: PlateVehicle[]; match: string; sandbox: boolean; remaining: number | null; cached?: boolean }
  | { ok: false; reason: "not_found" | "invalid" | "quota" | "unavailable" | "not_configured"; message: string; remaining: number | null; cached?: boolean };

// A row from rego_suggestions(): a vehicle already known from a past job or a cached registry lookup.
export type RegoSuggestion = {
  rego: string; source: "job" | "lookup"; make: string | null; model: string | null; colour: string | null; vin: string | null;
  body_type: BodyType | null; customer_name: string | null; state: string | null; seen_at: string;
};

export const normalisePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

type Raw = { make?: string; model?: string; body?: string; description?: string; detailed_description?: string };

// PlateAPI "body" strings → our body_type enum. Utes are split on door count / cab wording.
export function mapBody(body?: string, detail?: string): BodyType | null {
  const b = (body ?? "").toUpperCase();
  const d = `${detail ?? ""} ${body ?? ""}`.toUpperCase();
  if (/UTE|PICK ?UP|CAB CHASSIS/.test(b)) {
    if (/SINGLE CAB|2 ?DOOR|2DR/.test(d)) return "single_cab_ute";
    return "dual_cab_ute";
  }
  if (/HATCH|LIFTBACK/.test(b)) return "hatch";
  if (/SEDAN/.test(b)) return "sedan";
  if (/WAGON|ESTATE/.test(b)) return "wagon";
  if (/SUV|4WD|CROSSOVER/.test(b)) return "suv";
  if (/VAN|BUS|PEOPLE MOVER/.test(b)) return "van";
  if (/COUPE|CONVERTIBLE|CABRIOLET|ROADSTER/.test(b)) return "coupe";
  return null;
}

const title = (s?: string) => (s ?? "").trim();

export function toVehicle(v: Raw): PlateVehicle {
  return {
    make: title(v.make),
    model: title(v.model),
    body_type: mapBody(v.body, v.detailed_description ?? v.description),
    description: title(v.detailed_description ?? v.description),
  };
}
