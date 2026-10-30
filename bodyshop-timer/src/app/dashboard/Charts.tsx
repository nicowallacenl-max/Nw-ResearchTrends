"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Chart colours (validated with the dataviz palette checker: blue/orange pass CVD and contrast on the light surface).
const QUOTED = "#2a78d6";
const ACTUAL = "#eb6834";
const SINGLE = "#2a78d6";
const GRID = "#e7e5e4";
const INK = "#57534e";

type Row = { name: string; [k: string]: string | number };

const fmt = (unit: string) => (v: number) => (unit === "$" ? `$${Math.round(v).toLocaleString("en-AU")}` : `${Number(v).toFixed(1)} ${unit}`);
const height = (rows: number, perRow: number) => Math.max(160, rows * perRow + 60);

// Quoted vs actual for each category, as horizontal paired bars (one axis, same unit).
export function QuotedVsActual({ rows, unit = "h", quotedLabel = "Quoted", actualLabel = "Actual" }: { rows: Row[]; unit?: string; quotedLabel?: string; actualLabel?: string }) {
  if (!rows.length) return <Empty />;
  const f = fmt(unit);
  return (
    <ResponsiveContainer width="100%" height={height(rows.length, 44)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barGap={2} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={f} tick={{ fill: INK, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => f(v)} cursor={{ fill: "#f5f5f4" }} />
        <Legend verticalAlign="top" align="left" height={28} iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span style={{ color: INK }}>{v}</span>} />
        <Bar dataKey="quoted" name={quotedLabel} fill={QUOTED} radius={[0, 4, 4, 0]} maxBarSize={14} />
        <Bar dataKey="actual" name={actualLabel} fill={ACTUAL} radius={[0, 4, 4, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// One measure per category (e.g. hours lost by delay reason). One series = one colour.
export function SingleBars({ rows, unit = "h", label }: { rows: Row[]; unit?: string; label: string }) {
  if (!rows.length) return <Empty />;
  const f = fmt(unit);
  return (
    <ResponsiveContainer width="100%" height={height(rows.length, 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap="30%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={f} tick={{ fill: INK, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis type="category" dataKey="name" width={160} tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v: number) => [f(v), label]} cursor={{ fill: "#f5f5f4" }} />
        <Bar dataKey="value" name={label} fill={SINGLE} radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty() {
  return <p className="py-8 text-center text-sm text-stone-500">No data yet. It fills in as the wall board is used.</p>;
}
