"use client";

import { useState } from "react";

// Copies the public board URL so the organizer can paste it into an email.
export function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }}
      className="whitespace-nowrap rounded-lg bg-reed px-3 py-2 text-sm font-bold text-white"
    >
      {copied ? "✓ Copied" : "🔗 Share"}
    </button>
  );
}
