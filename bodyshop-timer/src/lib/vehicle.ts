// Damage scan: top-down vehicle templates per body type, a standard panel-ID list, and the geometry to draw them.
// Drawing space is 560 x 300, front of the vehicle on the LEFT. Seen from above facing left, the vehicle's
// LEFT side is the bottom edge of the drawing and its RIGHT side the top edge.

export const BODY_TYPES = ["sedan", "hatch", "wagon", "suv", "dual_cab_ute", "single_cab_ute", "van", "coupe"] as const;
export type BodyType = (typeof BODY_TYPES)[number];
export const BODY_TYPE_LABEL: Record<BodyType, string> = {
  sedan: "Sedan", hatch: "Hatch", wagon: "Wagon", suv: "SUV", dual_cab_ute: "Dual-cab ute",
  single_cab_ute: "Single-cab ute", van: "Van", coupe: "Coupe",
};

export const DAMAGE_TYPES = ["dent", "scratch", "crack", "chip", "scuff", "hail", "rust", "broken", "misaligned"] as const;
export const SEVERITIES = ["minor", "moderate", "severe"] as const;
export type Damage = { id?: string; panel: string; type: string; severity: string; note?: string | null };

type Zone = "top" | "left" | "right" | "front" | "rear";
type PanelDef = { id: string; label: string; short: string; zone: Zone; from: number; to: number };

// Section breakpoints as fractions of body length (0 = nose, 1 = tail).
type Profile = { bonnet: [number, number]; screen: [number, number]; roof: [number, number]; rearGlass?: [number, number]; rear: [number, number]; rearKind: "boot_lid" | "tailgate" | "tray"; doors: 1 | 2; van?: boolean };
const PROFILES: Record<BodyType, Profile> = {
  sedan:          { bonnet: [.04, .28], screen: [.28, .38], roof: [.38, .62], rearGlass: [.62, .72], rear: [.72, .96], rearKind: "boot_lid", doors: 2 },
  coupe:          { bonnet: [.04, .32], screen: [.32, .44], roof: [.44, .62], rearGlass: [.62, .74], rear: [.74, .96], rearKind: "boot_lid", doors: 1 },
  hatch:          { bonnet: [.04, .27], screen: [.27, .37], roof: [.37, .80], rearGlass: [.80, .88], rear: [.88, .96], rearKind: "tailgate", doors: 2 },
  wagon:          { bonnet: [.04, .25], screen: [.25, .34], roof: [.34, .86], rearGlass: [.86, .91], rear: [.91, .96], rearKind: "tailgate", doors: 2 },
  suv:            { bonnet: [.04, .26], screen: [.26, .35], roof: [.35, .86], rearGlass: [.86, .91], rear: [.91, .96], rearKind: "tailgate", doors: 2 },
  dual_cab_ute:   { bonnet: [.04, .22], screen: [.22, .30], roof: [.30, .48], rearGlass: [.48, .50], rear: [.50, .96], rearKind: "tray", doors: 2 },
  single_cab_ute: { bonnet: [.04, .22], screen: [.22, .30], roof: [.30, .37], rearGlass: [.37, .39], rear: [.39, .96], rearKind: "tray", doors: 1 },
  van:            { bonnet: [.04, .14], screen: [.14, .23], roof: [.23, .93], rear: [.93, .96], rearKind: "tailgate", doors: 2, van: true },
};

const X0 = 70, X1 = 512, L = X1 - X0;
const xAt = (f: number) => X0 + f * L;

export function panelsFor(body: BodyType): PanelDef[] {
  const p = PROFILES[body];
  const side = (zone: "left" | "right"): PanelDef[] => {
    const s = zone === "left" ? "L" : "R", w = zone === "left" ? "Left" : "Right", id = zone;
    const cabinEnd = p.rearKind === "tray" ? p.rear[0] : (p.rearGlass ?? p.roof)[1];
    const out: PanelDef[] = [{ id: `${id}_front_guard`, label: `${w} front guard`, short: `${s} FRONT GUARD`, zone, from: .06, to: p.screen[1] }];
    if (p.doors === 2) {
      const mid = p.van ? p.screen[1] + .16 : (p.screen[1] + cabinEnd) / 2;
      out.push({ id: `${id}_front_door`, label: `${w} front door`, short: `${s} FRONT DOOR`, zone, from: p.screen[1], to: mid });
      out.push({ id: `${id}_rear_door`, label: p.van ? `${w} sliding door` : `${w} rear door`, short: p.van ? `${s} SLIDING DOOR` : `${s} REAR DOOR`, zone, from: mid, to: p.van ? mid + .3 : cabinEnd });
    } else {
      out.push({ id: `${id}_front_door`, label: `${w} door`, short: `${s} DOOR`, zone, from: p.screen[1], to: cabinEnd });
    }
    const quarterFrom = p.van ? p.screen[1] + .46 : cabinEnd;
    if (p.rearKind === "tray") out.push({ id: `${id}_tray_side`, label: `${w} tray side`, short: `${s} TRAY SIDE`, zone, from: p.rear[0] + .01, to: .95 });
    else out.push({ id: `${id}_rear_quarter`, label: `${w} rear quarter`, short: `${s} REAR QUARTER`, zone, from: quarterFrom, to: .94 });
    return out;
  };
  const top: PanelDef[] = [
    { id: "front_bumper", label: "Front bumper", short: "FRONT BAR", zone: "front", from: 0, to: .02 },
    { id: "bonnet", label: "Bonnet", short: "BONNET", zone: "top", from: p.bonnet[0], to: p.bonnet[1] },
    { id: "windscreen", label: "Windscreen", short: "WINDSCREEN", zone: "top", from: p.screen[0], to: p.screen[1] },
    { id: "roof", label: "Roof", short: "ROOF", zone: "top", from: p.roof[0], to: p.roof[1] },
  ];
  if (p.rearGlass) top.push({ id: "rear_window", label: "Rear window", short: "REAR GLASS", zone: "top", from: p.rearGlass[0], to: p.rearGlass[1] });
  if (p.rearKind === "tray") {
    top.push({ id: "tray", label: "Tray", short: "TRAY", zone: "top", from: p.rear[0] + .01, to: .93 });
    top.push({ id: "tailgate", label: "Tailgate", short: "TAILGATE", zone: "top", from: .93, to: .96 });
  } else {
    top.push({ id: p.rearKind, label: p.rearKind === "boot_lid" ? "Boot lid" : p.van ? "Rear doors" : "Tailgate", short: p.rearKind === "boot_lid" ? "BOOT" : p.van ? "REAR DOORS" : "TAILGATE", zone: "top", from: p.rear[0], to: p.rear[1] });
  }
  top.push({ id: "rear_bumper", label: "Rear bumper", short: "REAR BAR", zone: "rear", from: .98, to: 1 });
  return [...top, ...side("right"), ...side("left")];
}

export const panelLabel = (body: BodyType, id: string) => panelsFor(body).find((p) => p.id === id)?.label ?? id.replace(/_/g, " ");

// ---------------------------------------------------------------- geometry
export function outlineFor(body: BodyType) {
  const p = PROFILES[body];
  const body_ = `M${X0} 90 Q${X0 - 10} 150 ${X0} 210 L${X0 + 50} 230 L${X1 - 42} 230 Q${X1 - 7} 228 ${X1} 200 L${X1} 100 Q${X1 - 7} 72 ${X1 - 42} 70 L${X0 + 50} 70 Z`;
  const a = xAt(p.screen[0]) + 4;                              // glasshouse front
  const b = xAt(p.rearKind === "tray" ? p.rearGlass![0] : (p.rearGlass ?? p.roof)[1]);
  const cabin = `M${a} 82 L${b - 12} 82 L${b} 150 L${b - 12} 218 L${a} 218 Q${a - 12} 150 ${a} 82 Z`;
  const extra: string[] = [];
  if (p.rearKind === "tray") {
    const t0 = xAt(p.rear[0]);
    extra.push(`M${t0} 150 L${t0} 76 M${t0} 150 L${t0} 224`);
    extra.push(`M${t0 + 18} 84 L${xAt(.95)} 84 L${xAt(.95)} 216 L${t0 + 18} 216 Z`);
  } else if (p.rearKind === "boot_lid") {
    extra.push(`M${xAt(p.rear[0])} 86 L${xAt(p.rear[0])} 214`);
  } else {
    extra.push(`M${xAt(p.rear[0])} 88 L${xAt(p.rear[0])} 212`);
  }
  const wf = xAt(.2), wr = xAt(.8);
  const wheels = [wf, wr].map((c) => `M${c - 20} 70 L${c - 20} 58 L${c + 20} 58 L${c + 20} 70 M${c - 20} 230 L${c - 20} 242 L${c + 20} 242 L${c + 20} 230`).join(" ");
  return { body: body_, cabin, extra, wheels };
}

export type DamageShape = { d: string; label: string; lx: number; ly: number; anchor: "start" | "middle" | "end"; severity: string };

// Damaged panels as amber shapes with mono labels (labels on the same edge are staggered so they don't collide).
export function damageShapes(body: BodyType, damage: Damage[]): DamageShape[] {
  const defs = new Map(panelsFor(body).map((p) => [p.id, p]));
  const rows: Record<string, { x0: number; x1: number; row: number }[]> = {};
  const place = (edge: string, x: number, w: number, anchor: DamageShape["anchor"]) => {
    const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2, x1 = x0 + w;
    const used = (rows[edge] ??= []);
    let row = 0;
    while (used.some((u) => u.row === row && !(x1 < u.x0 - 6 || x0 > u.x1 + 6))) row++;
    used.push({ x0, x1, row });
    return row;
  };
  const out: DamageShape[] = [];
  for (const dmg of damage) {
    const p = defs.get(dmg.panel);
    if (!p) continue;
    const label = `${p.short} · ${dmg.type.toUpperCase()}`;
    const w = label.length * 8.1;
    const a = xAt(p.from), b = xAt(p.to);
    if (p.zone === "left" || p.zone === "right") {
      const y = p.zone === "left" ? 216 : 70;
      const anchor = a + w > 556 ? "end" : "start";
      const lx = anchor === "end" ? Math.min(b, 556) : a;
      const row = place(p.zone, lx, w, anchor);
      out.push({ d: `M${a} ${y} L${b} ${y} L${b} ${y + 14} L${a} ${y + 14} Z`, label, lx, ly: p.zone === "left" ? 262 + row * 16 : 46 - row * 16, anchor, severity: dmg.severity });
    } else if (p.zone === "front") {
      const row = place("front", 8, w, "start");
      out.push({ d: `M${X0 - 8} 110 L${X0 + 2} 110 L${X0 + 2} 190 L${X0 - 8} 190 Z`, label, lx: 8, ly: 104 - row * 14, anchor: "start", severity: dmg.severity });
    } else if (p.zone === "rear") {
      const row = place("rear", 556, w, "end");
      out.push({ d: `M${X1 - 6} 110 L${X1 + 4} 110 L${X1 + 4} 190 L${X1 - 6} 190 Z`, label, lx: 556, ly: 102 - row * 14, anchor: "end", severity: dmg.severity });
    } else {
      const row = place("top", (a + b) / 2, w, "middle");
      out.push({ d: `M${a + 2} 90 L${b - 2} 90 L${b - 2} 210 L${a + 2} 210 Z`, label, lx: (a + b) / 2, ly: 154 + row * 16, anchor: "middle", severity: dmg.severity });
    }
  }
  return out;
}
