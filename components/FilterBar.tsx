"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";
import type { FacetOptions } from "@/lib/domain/board";

const FACETS = [
  { key: "date", label: "Day" },
  { key: "group", label: "Group" },
  { key: "category", label: "Category" },
  { key: "location", label: "Location" },
] as const;

export function FilterBar({ options }: { options: FacetOptions }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  function choose(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const anyActive = FACETS.some((f) => params.get(f.key));

  return (
    <div className="mx-auto mb-6 flex max-w-xl flex-wrap items-end justify-center gap-2">
      {FACETS.map((f) => {
        const current = params.get(f.key) ?? "";
        const opts = f.key === "date"
          ? options.date
          : (options[f.key] as string[]).map((v) => ({ value: v, label: v }));
        return (
          <label key={f.key} className="text-xs font-bold text-ink-soft">
            <span className="ml-1 block">{f.label}</span>
            <select aria-label={f.label} value={current}
              onChange={(e) => choose(f.key, e.target.value)}
              className={`mt-1 rounded-xl border bg-white px-3 py-2 text-sm font-bold text-ink outline-none transition focus:border-reed focus:ring-2 focus:ring-reed/30 ${current ? "border-lantern bg-lantern/5 text-lantern-deep" : "border-lily-line"}`}>
              <option value="">Any {f.label.toLowerCase()}</option>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        );
      })}
      {anyActive && (
        <button type="button" onClick={() => router.push(pathname)}
          className="mb-1 rounded-xl px-3 py-2 text-sm font-bold text-lantern-deep underline underline-offset-4">
          Clear filters
        </button>
      )}
    </div>
  );
}
