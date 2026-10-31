"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { recordPhoto } from "@/app/admin/jobs/actions";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { PHOTO_BUCKET } from "@/lib/photos";
import { buttonCls } from "./ui";

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

export function PhotoUpload({ jobId, damage }: { jobId: string; damage: { id: string; label: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [damageId, setDamageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (!files.length) return setMsg({ ok: false, text: "Choose a photo first." });
    setBusy(true);
    setMsg(null);
    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    let done = 0;
    for (const file of files) {
      const blob = await shrink(file);
      const path = `${jobId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg" });
      if (error) { setMsg({ ok: false, text: `Upload failed: ${error.message}` }); break; }
      const r = await recordPhoto({ jobId, path, caption: files.length > 1 ? `${caption}${caption ? " " : ""}${done + 1}`.trim() : caption, damageId: damageId || null });
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? "Couldn't save the photo." }); break; }
      done++;
    }
    setBusy(false);
    if (done) {
      setMsg({ ok: true, text: `${done} photo${done === 1 ? "" : "s"} added.` });
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    }
  }

  return (
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">Photo(s)</span>
        <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="min-h-11 border border-line bg-bg-subtle px-2 py-2 text-[13px]" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">Caption</span>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Rear left quarter · dent" className="min-h-11 border border-line bg-bg-subtle px-3.5 text-[14px]" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[.14em] text-muted">Damage (optional)</span>
        <select value={damageId} onChange={(e) => setDamageId(e.target.value)} className="min-h-11 border border-line bg-bg-subtle px-3 text-[14px]">
          <option value="">—</option>
          {damage.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </label>
      <button type="button" onClick={upload} disabled={busy} className={buttonCls("primary")}>{busy ? "Uploading…" : "Upload"}</button>
      {msg && <p role="status" className={`sm:col-span-4 text-[13px] ${msg.ok ? "text-complete" : "text-progress"}`}>{msg.text}</p>}
    </div>
  );
}
