"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A small "?" trigger that toggles an inline explanation. Click (not hover) so
 * it works on touch; closes on a second click, Escape, or an outside click.
 */
export function HelpPopover({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-ink-soft/50 text-[10px] font-bold leading-none text-ink-soft transition hover:border-reed hover:text-reed-deep"
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-xl border border-lily-line bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink-soft shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}
