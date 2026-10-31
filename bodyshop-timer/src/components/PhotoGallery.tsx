"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Photo = { url: string; caption: string };
const PER = 3;

const Chevron = ({ dir, size = 16 }: { dir: "left" | "right"; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
  </svg>
);
const arrowCls = (off: boolean) =>
  `cut-sm flex h-11 w-11 items-center justify-center border ${off ? "cursor-default border-line bg-bg-subtle text-faint" : "cursor-pointer border-neon bg-neon text-on-neon"}`;

// Thumbnail carousel (3 at a time when there are more than 3) + lightbox, from the JobDetail mockup.
// With `trigger`, renders just that button, which opens the lightbox (customer tracker "VIEW PHOTOS").
export function PhotoGallery({ photos, trigger }: { photos: Photo[]; trigger?: { label: string; className: string } }) {
  const n = photos.length;
  const [start, setStart] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const label = (i: number) => `PHOTO ${String(i + 1).padStart(2, "0")}`;

  const hasCarousel = n > PER;
  const maxStart = Math.max(0, n - PER);
  const ts = Math.min(start, maxStart);
  const atStart = ts <= 0, atEnd = ts >= maxStart;
  const pageCount = Math.ceil(n / PER);
  const curPage = Math.min(pageCount - 1, Math.round(ts / PER));

  const go = useCallback((i: number) => {
    const p = (i + n) % n;
    setSel(p);
    setStart(Math.min(maxStart, Math.floor(p / PER) * PER)); // keep the carousel page in sync
  }, [n, maxStart]);

  useEffect(() => {
    if (sel === null) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
      else if (e.key === "ArrowLeft") go(sel - 1);
      else if (e.key === "ArrowRight") go(sel + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, go]);

  return (
    <>
      {trigger ? (
        <button type="button" onClick={() => n && go(0)} disabled={!n} className={trigger.className}>{n ? trigger.label : "No photos yet"}</button>
      ) : (<>
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted">PHOTOS · {n}</span>
        {hasCarousel && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[.12em] text-muted">{ts + 1}–{Math.min(n, ts + PER)} OF {n}</span>
            <button type="button" onClick={() => setStart(Math.max(0, ts - PER))} disabled={atStart} aria-label="Show previous photos" className={arrowCls(atStart)}><Chevron dir="left" /></button>
            <button type="button" onClick={() => setStart(Math.min(maxStart, ts + PER))} disabled={atEnd} aria-label="Show more photos" className={arrowCls(atEnd)}><Chevron dir="right" /></button>
          </div>
        )}
      </div>

      {n === 0 ? (
        <div className="cut-sm flex aspect-[4/1] items-center justify-center border border-dashed border-faint bg-bg-subtle font-mono text-[11px] uppercase tracking-[.12em] text-muted">
          No photos yet
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {photos.slice(ts, ts + PER).map((p, k) => {
            const i = ts + k;
            return (
              <button key={p.url} type="button" onClick={() => go(i)} aria-label={`Expand ${label(i)}: ${p.caption || "photo"}`}
                className="cut-sm relative flex aspect-[4/3] cursor-zoom-in flex-col items-center justify-center gap-1.5 overflow-hidden border border-dashed border-faint bg-bg-subtle p-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                <span className="absolute inset-x-0 bottom-0 bg-white/90 px-2 py-1 pr-10 text-left text-[12px] text-body">
                  <span className="font-mono text-[11px] tracking-[.12em] text-muted">{label(i)}</span>
                  {p.caption && <span className="block truncate">{p.caption}</span>}
                </span>
                <span className="cut-sm absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center bg-neon text-on-neon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {hasCarousel && (
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: pageCount }, (_, i) => (
            <span key={i} className={`h-1 transition-[width] duration-200 ${i === curPage ? "w-[22px] bg-neon" : "w-2 bg-line"}`} />
          ))}
        </div>
      )}

      </>)}

      {sel !== null && (
        <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,12,13,.84)] p-8 max-sm:p-3">
          <button type="button" onClick={() => setSel(null)} aria-label="Close photo viewer" className="absolute inset-0 cursor-zoom-out border-0 bg-transparent" />
          <div className="cut relative flex w-full max-w-[1080px] flex-col gap-4 border border-neon bg-bg p-5 shadow-[0_0_40px_rgba(0,238,234,.35)]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[.16em] text-accent">{label(sel)} · {String(sel + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</span>
                <span className="font-display text-[20px] font-semibold uppercase tracking-[.06em]">{photos[sel].caption || label(sel)}</span>
              </div>
              <button ref={closeRef} type="button" onClick={() => setSel(null)} aria-label="Close photo viewer" className="cut-sm flex h-11 w-11 cursor-pointer items-center justify-center border border-line bg-bg-subtle text-ink">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="relative flex items-center">
              <div className="cut flex aspect-[16/10] grow items-center justify-center bg-dark-media outline outline-1 outline-[#2E3236]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photos[sel].url} alt={photos[sel].caption || label(sel)} className="max-h-full max-w-full object-contain" />
              </div>
              <button type="button" onClick={() => go(sel - 1)} aria-label="Previous photo" className="cut-sm absolute left-3 flex h-12 w-12 cursor-pointer items-center justify-center border-0 bg-neon text-on-neon"><Chevron dir="left" size={20} /></button>
              <button type="button" onClick={() => go(sel + 1)} aria-label="Next photo" className="cut-sm absolute right-3 flex h-12 w-12 cursor-pointer items-center justify-center border-0 bg-neon text-on-neon"><Chevron dir="right" size={20} /></button>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button key={p.url} type="button" onClick={() => go(i)} aria-label={`Show ${label(i)}: ${p.caption || "photo"}`}
                  className={`cut-sm min-h-11 flex-[1_0_96px] cursor-pointer font-mono text-[11px] tracking-[.12em] ${i === sel ? "border border-neon bg-neon text-on-neon" : "border border-line bg-bg-subtle text-body"}`}>
                  {label(i)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
