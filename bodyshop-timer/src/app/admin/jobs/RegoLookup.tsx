"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { lookupRego, searchRego } from "./lookup";
import { AU_STATES, normalisePlate, type PlateVehicle, type RegoSuggestion } from "@/lib/plate";
import { BODY_TYPE_LABEL } from "@/lib/vehicle";
import { Input, Select } from "@/components/ui";

type Msg = { tone: "ok" | "warn"; text: string } | null;
type Option = { kind: "known"; s: RegoSuggestion } | { kind: "registry"; plate: string };

const vehicleLine = (v: { make: string | null; model: string | null; colour?: string | null; body_type: string | null }) =>
  [[v.make, v.model].filter(Boolean).join(" "), v.colour, v.body_type ? BODY_TYPE_LABEL[v.body_type as keyof typeof BODY_TYPE_LABEL] : null]
    .filter(Boolean)
    .join(" · ");

// Rego type-ahead for New job, like an address search: as you type it suggests vehicles we already know
// (past jobs, with colour + VIN; earlier registry lookups) for free. The last option looks the plate up in
// the state registry via PlateAPI — only when picked, since every PlateAPI call uses the monthly quota.
export function RegoLookup({ defaultValue }: { defaultValue?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const listId = useId();
  const [text, setText] = useState(defaultValue ?? "");
  const [state, setState] = useState("QLD");
  const [known, setKnown] = useState<RegoSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [msg, setMsg] = useState<Msg>(null);
  const [alts, setAlts] = useState<PlateVehicle[]>([]);
  const [pending, start] = useTransition();

  const plate = normalisePlate(text);
  const options: Option[] = plate.length >= 2 ? [...known.map((s) => ({ kind: "known" as const, s })), { kind: "registry", plate }] : [];

  // Debounced search of known vehicles. Ignores responses that arrive after a newer keystroke.
  useEffect(() => {
    if (plate.length < 2) { setKnown([]); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const rows = await searchRego(plate);
      if (id === seq.current) setKnown(rows);
    }, 200);
    return () => clearTimeout(t);
  }, [plate]);

  function setField(name: string, value: string) {
    const el = wrap.current?.closest("form")?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = value;
  }

  function fill(v: { make: string | null; model: string | null; colour?: string | null; vin?: string | null; body_type: string | null }) {
    setField("make", v.make ?? "");
    setField("model", v.model ?? "");
    setField("colour", v.colour ?? "");
    setField("vin", v.vin ?? "");
    if (v.body_type) setField("body_type", v.body_type);
  }

  function choose(o: Option) {
    setOpen(false);
    setActive(-1);
    setAlts([]);
    if (o.kind === "known") {
      const s = o.s;
      setText(s.rego);
      fill(s);
      const when = new Date(s.seen_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
      setMsg({
        tone: "ok",
        text: s.source === "job"
          ? `Filled from a previous job (${[s.customer_name, when].filter(Boolean).join(", ")}). Check the details are still right.`
          : `Filled from an earlier ${s.state ?? ""} registry lookup (${when}). Colour and VIN aren't supplied, so enter them manually.`,
      });
      return;
    }
    setText(o.plate);
    start(async () => {
      const r = await lookupRego(o.plate, state);
      const left = r.remaining !== null ? ` · ${r.remaining} lookups left this month` : r.cached ? " · from cache, no lookup used" : "";
      if (!r.ok) {
        if (r.reason === "not_found") fill({ make: null, model: null, body_type: null });
        setMsg({ tone: "warn", text: r.message + left });
        return;
      }
      fill({ ...r.vehicle, colour: null, vin: null });
      const all = [r.vehicle, ...r.alternatives];
      setAlts(all.length > 1 ? all : []);
      const body = r.vehicle.body_type ? BODY_TYPE_LABEL[r.vehicle.body_type] : "body type not recognised, pick it";
      setMsg({
        tone: "ok",
        text: `${r.sandbox ? "[SANDBOX] " : ""}${r.vehicle.make} ${r.vehicle.model} · ${body}${all.length > 1 ? " · several matches, pick below" : ""}. Colour and VIN aren't supplied, so enter them manually${left}.`,
      });
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === "Enter" && open && options.length) {
      // Enter picks the highlighted option (or the first one); it never submits the form from here.
      e.preventDefault();
      choose(options[active >= 0 ? active : 0]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const optId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div ref={wrap} className="flex flex-col gap-1.5 sm:col-span-2">
      <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">Rego * / state</span>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            ref={input}
            name="rego"
            required
            role="combobox"
            aria-label="Rego"
            aria-autocomplete="list"
            aria-expanded={open && options.length > 0}
            aria-controls={listId}
            aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Start typing a rego…"
            value={text}
            className="w-full uppercase"
            onChange={(e) => { setText(e.target.value.toUpperCase()); setOpen(true); setActive(-1); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          {open && options.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Matching vehicles"
              className="absolute left-0 right-0 top-full z-30 m-0 mt-1 max-h-80 list-none overflow-auto border border-line bg-bg p-0 shadow-lg">
              {options.map((o, i) => (
                <li
                  key={o.kind === "known" ? `${o.s.source}-${o.s.rego}` : "registry"}
                  id={optId(i)}
                  role="option"
                  aria-selected={i === active}
                  // mousedown (not click) so the input's blur doesn't close the list first
                  onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer border-b border-divider px-3.5 py-2.5 last:border-b-0 ${i === active ? "bg-bg-subtle" : ""}`}
                >
                  {o.kind === "known" ? (
                    <>
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-[14px] font-semibold text-ink">{o.s.rego}</span>
                        <span className="ml-auto truncate font-mono text-[10px] uppercase tracking-[.12em] text-muted">
                          {o.s.source === "job" ? `Past job${o.s.customer_name ? ` · ${o.s.customer_name}` : ""}` : `Looked up · ${o.s.state}`}
                        </span>
                      </div>
                      <div className="truncate text-[13px] text-body">{vehicleLine(o.s) || "No vehicle details"}</div>
                    </>
                  ) : (
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-[14px] font-semibold text-accent">⌕ Look up {o.plate}</span>
                      <span className="min-w-0 flex-1 text-[13px] text-body">in the {state} registry</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[.12em] text-muted">Uses 1 lookup</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Select aria-label="State" value={state} onChange={(e) => setState(e.target.value)} className="w-[5.5rem]">
          {AU_STATES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>
      {pending && <p role="status" className="m-0 text-[13px] text-muted">Looking up {plate} in the {state} registry…</p>}
      {alts.length > 1 && (
        <Select aria-label="Pick the matching vehicle" onChange={(e) => fill({ ...alts[Number(e.target.value)], colour: null, vin: null })}>
          {alts.map((o, i) => <option key={i} value={i}>{o.description || `${o.make} ${o.model}`}</option>)}
        </Select>
      )}
      {!pending && msg && (
        <p role="status" className={`m-0 text-[13px] ${msg.tone === "ok" ? "text-complete" : "text-hazard-text"}`}>{msg.text}</p>
      )}
    </div>
  );
}
