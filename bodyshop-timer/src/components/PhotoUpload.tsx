"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { logPhotosAdded, recordPhoto } from "@/app/admin/jobs/actions";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { PHOTO_BUCKET } from "@/lib/photos";

// Shrink big phone photos before upload (max 2000px, JPEG ~0.85) so uploads are quick on workshop wi-fi.
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}

// One step: choose (or drop) photos and they upload straight away. Caption and damage link are optional.
export function PhotoUpload({ jobId, damage }: { jobId: string; damage: { id: string; label: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [damageId, setDamageId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(list: FileList | File[] | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    if (!files.length) return setMsg({ ok: false, text: "Those files aren't photos. Choose JPG, PNG or HEIC images." });
    setMsg(null);
    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    let done = 0;
    try {
      for (const [i, file] of files.entries()) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const blob = await shrink(file);
        const path = `${jobId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" });
        if (error) throw new Error(/row-level|unauthor|jwt/i.test(error.message) ? "You're not signed in as an admin any more. Sign in again and retry." : error.message);
        const label = files.length > 1 && caption ? `${caption} ${i + 1}` : caption;
        const r = await recordPhoto({ jobId, path, caption: label, damageId: damageId || null });
        if (!r.ok) throw new Error(r.error ?? "Couldn't save the photo.");
        done++;
      }
    } catch (e) {
      setMsg({ ok: false, text: `Upload failed${done ? ` after ${done} photo${done === 1 ? "" : "s"}` : ""}: ${e instanceof Error ? e.message : "unknown error"}` });
    }
    if (done) {
      await logPhotosAdded({ jobId, count: done }).catch(() => {});
      setMsg((m) => m ?? { ok: true, text: `${done} photo${done === 1 ? "" : "s"} added.` });
      setCaption("");
      router.refresh();
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">Caption (optional)</span>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Rear left quarter · dent" className="min-h-11 border border-line bg-bg-subtle px-3.5 text-[14px]" />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">Damage (optional)</span>
          <select value={damageId} onChange={(e) => setDamageId(e.target.value)} className="min-h-11 border border-line bg-bg-subtle px-3 text-[14px]">
            <option value="">—</option>
            {damage.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) upload(e.dataTransfer.files); }}
        className={`cut-sm flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed px-4 py-4 text-center ${
          busy ? "cursor-wait border-line bg-bg-subtle" : drag ? "border-accent bg-neon/20" : "border-accent bg-neon/[.08] hover:bg-neon/[.15]"
        }`}
      >
        <input ref={fileRef} type="file" accept="image/*" multiple disabled={!!busy} className="sr-only" onChange={(e) => upload(e.target.files)} />
        <span className="flex items-center gap-2 font-display text-[16px] font-bold uppercase tracking-[.1em] text-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          {busy ?? "Choose photos"}
        </span>
        {!busy && <span className="text-[12px] text-muted">or drag them here · they upload straight away · camera works on phones and tablets</span>}
      </label>

      {msg && (
        <p role="status" className={`cut-sm m-0 border px-3 py-2 text-[14px] ${msg.ok ? "border-complete bg-green-50 text-complete" : "border-progress bg-red-50 text-progress"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
