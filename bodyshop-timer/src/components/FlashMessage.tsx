"use client";

import { useEffect, useState } from "react";

// Success messages fade out after a few seconds; errors stay until closed so they aren't missed.
// Either way the ?ok= / ?error= is dropped from the address bar, so a refresh doesn't show it again.
export function FlashMessage({ error, ok }: { error?: string; ok?: string }) {
  const [shown, setShown] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("ok") || url.searchParams.has("error")) {
        url.searchParams.delete("ok");
        url.searchParams.delete("error");
        window.history.replaceState(window.history.state, "", url.pathname + (url.search || "") + url.hash);
      }
    } catch { /* ignore */ }
    if (error) return;
    const fade = setTimeout(() => setFading(true), 5000);
    const hide = setTimeout(() => setShown(false), 5600);
    return () => { clearTimeout(fade); clearTimeout(hide); };
  }, [error, ok]);

  if (!shown) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`cut-sm mb-6 flex items-start gap-3 border px-4 py-3 text-[14px] transition-opacity duration-500 ${fading ? "opacity-0" : "opacity-100"} ${
        error ? "border-progress bg-red-50 text-progress" : "border-complete bg-green-50 text-complete"
      }`}
    >
      <span className="grow">{error ?? ok}</span>
      <button type="button" aria-label="Dismiss message" onClick={() => setShown(false)}
        className="-my-1 shrink-0 cursor-pointer border-0 bg-transparent px-1 text-[18px] leading-none text-current opacity-70 hover:opacity-100">×</button>
    </div>
  );
}
