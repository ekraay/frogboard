"use client";

import { useState } from "react";

// Copies the public board URL so the organizer can paste it into an email.
// The clipboard rejects on non-HTTPS or a denied permission; show a fallback
// instead of letting the rejection surface as an unhandled error.
export function ShareButton({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
      className="whitespace-nowrap rounded-lg bg-reed px-3 py-2 text-sm font-bold text-white"
    >
      {state === "copied" ? "✓ Copied" : state === "failed" ? "Copy failed" : "🔗 Share"}
    </button>
  );
}
