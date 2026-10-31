"use client";

import { useState } from "react";
import { buttonCls } from "./ui";

// Copies an absolute link (path on this site) to the clipboard.
export function CopyLink({ path, label = "Copy link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonCls("secondary")}
      onClick={async () => {
        await navigator.clipboard.writeText(new URL(path, window.location.origin).toString()).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
