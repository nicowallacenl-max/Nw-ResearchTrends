"use client";

import { useRef, useState, useTransition } from "react";
import { lookupRego } from "./lookup";
import { AU_STATES, type PlateVehicle } from "@/lib/plate";
import { BODY_TYPE_LABEL } from "@/lib/vehicle";
import { Button, Input, Select } from "@/components/ui";

type Msg = { tone: "ok" | "warn"; text: string } | null;

// Rego is the primary key for a new job: look it up and fill make / model / body type.
// PlateAPI does not return colour or VIN, so those are cleared for manual entry.
export function RegoLookup({ defaultValue }: { defaultValue?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("QLD");
  const [msg, setMsg] = useState<Msg>(null);
  const [options, setOptions] = useState<PlateVehicle[]>([]);
  const [pending, start] = useTransition();

  function setField(name: string, value: string) {
    const form = wrap.current?.closest("form");
    const el = form?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = value;
  }

  function apply(v: PlateVehicle | null) {
    setField("make", v?.make ?? "");
    setField("model", v?.model ?? "");
    setField("colour", "");
    setField("vin", "");
    if (v?.body_type) setField("body_type", v.body_type);
  }

  function run() {
    const rego = (wrap.current?.querySelector<HTMLInputElement>("input[name=rego]")?.value ?? "").trim();
    if (!rego) { setMsg({ tone: "warn", text: "Enter a rego first." }); return; }
    start(async () => {
      const r = await lookupRego(rego, state);
      const left = r.remaining !== null ? ` · ${r.remaining} lookups left this month` : "";
      if (!r.ok) {
        if (r.reason === "not_found") apply(null);
        setOptions([]);
        setMsg({ tone: "warn", text: r.message + left });
        return;
      }
      apply(r.vehicle);
      const all = [r.vehicle, ...r.alternatives];
      setOptions(all.length > 1 ? all : []);
      const body = r.vehicle.body_type ? BODY_TYPE_LABEL[r.vehicle.body_type] : "body type not recognised — pick it";
      setMsg({
        tone: "ok",
        text: `${r.sandbox ? "[SANDBOX] " : ""}${r.vehicle.make} ${r.vehicle.model} · ${body}${all.length > 1 ? " · several matches, pick below" : ""}. Colour and VIN aren't supplied — enter them manually${left}.`,
      });
    });
  }

  return (
    <div ref={wrap} className="flex flex-col gap-1.5 sm:col-span-2">
      <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">Rego * / state</span>
      <div className="flex gap-2">
        <Input
          name="rego"
          required
          aria-label="Rego"
          defaultValue={defaultValue}
          className="min-w-0 flex-1 uppercase"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run(); } }}
        />
        <Select aria-label="State" value={state} onChange={(e) => setState(e.target.value)} className="w-[5.5rem]">
          {AU_STATES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Button type="button" onClick={run} disabled={pending} className="shrink-0">
          {pending ? "Looking…" : "Look up"}
        </Button>
      </div>
      {options.length > 1 && (
        <Select aria-label="Matching vehicles" onChange={(e) => apply(options[Number(e.target.value)])}>
          {options.map((o, i) => <option key={i} value={i}>{o.description || `${o.make} ${o.model}`}</option>)}
        </Select>
      )}
      {msg && (
        <p role="status" className={`m-0 text-[13px] ${msg.tone === "ok" ? "text-complete" : "text-hazard-text"}`}>{msg.text}</p>
      )}
    </div>
  );
}
