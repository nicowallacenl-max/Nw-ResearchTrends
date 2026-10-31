import { damageShapes, outlineFor, type BodyType, type Damage } from "@/lib/vehicle";

const FILL: Record<string, string> = { minor: "rgba(251,142,40,.22)", moderate: "rgba(251,142,40,.35)", severe: "rgba(251,142,40,.55)" };

// Top-down vehicle outline in cyan; damaged panels as amber fills with dark outlines and mono labels.
export function DamageScan({ body, damage, title }: { body: BodyType; damage: Damage[]; title: string }) {
  const o = outlineFor(body);
  const shapes = damageShapes(body, damage);
  return (
    <svg viewBox="0 0 560 300" className="h-auto w-full" role="img" aria-label={title}>
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g fill="none" stroke="var(--neon)" strokeWidth="2" filter="url(#glow)">
        <path d={o.body} />
        <path d={o.cabin} opacity=".75" />
        {o.extra.map((d, i) => <path key={i} d={d} opacity=".55" />)}
        <path d={o.wheels} opacity=".85" />
      </g>
      <g stroke="var(--text-strong)" strokeWidth="2">
        {shapes.map((s, i) => <path key={i} d={s.d} fill={FILL[s.severity] ?? FILL.moderate} />)}
      </g>
      <g fontFamily="var(--font-mono)" fontSize="11" fill="var(--text-strong)" letterSpacing="1.5" style={{ paintOrder: "stroke" }} stroke="#fff" strokeWidth="3">
        {shapes.map((s, i) => <text key={i} x={s.lx} y={s.ly} textAnchor={s.anchor}>{s.label}</text>)}
      </g>
      <g fontFamily="var(--font-mono)" fontSize="10" fill="var(--text-muted)" letterSpacing="1.5">
        <text x="40" y="154">FRONT</text>
      </g>
    </svg>
  );
}
