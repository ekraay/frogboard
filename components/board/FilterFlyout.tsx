"use client";

import { useEffect } from "react";
import type { FacetOptions } from "@/lib/domain/board";
import { emptyFilters, type BoardFilters } from "@/lib/domain/boardFilters";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function CheckList({
  legend, options, selected, onToggle,
}: {
  legend: string; options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-ink-soft">{legend}</legend>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={() => onToggle(o)}
              className="h-4 w-4 rounded border-lily-line text-reed focus:ring-pond"
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// A controlled filter panel: it renders `value` and reports every change through
// `onChange`, holding no state of its own. Sections with no values do not render.
export function FilterFlyout({
  facets, showDueSoon, showBigGap, value, onChange, onClose,
}: {
  facets: FacetOptions;
  showDueSoon: boolean;
  showBigGap: boolean;
  value: BoardFilters;
  onChange: (next: BoardFilters) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center sm:items-center">
      <button type="button" aria-label="Close filters" onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-label="Filter tasks"
        className="relative z-10 m-4 w-full max-w-md rounded-3xl border border-lily-line bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">Filter tasks</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-full px-2 text-lg text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-ink-soft">Keyword</span>
            <input
              type="text"
              value={value.keyword}
              onChange={(e) => onChange({ ...value, keyword: e.target.value })}
              placeholder="Search titles"
              aria-label="Keyword"
              className="rounded-xl border border-lily-line bg-white px-3 py-2 text-ink focus:border-reed focus:outline-none focus:ring-2 focus:ring-pond/30"
            />
          </label>

          <CheckList legend="Requested group" options={facets.group} selected={value.group}
            onToggle={(v) => onChange({ ...value, group: toggle(value.group, v) })} />
          <CheckList legend="Category" options={facets.category} selected={value.category}
            onToggle={(v) => onChange({ ...value, category: toggle(value.category, v) })} />
          <CheckList legend="Location" options={facets.location} selected={value.location}
            onToggle={(v) => onChange({ ...value, location: toggle(value.location, v) })} />
          <CheckList legend="Day" options={facets.date.map((d) => d.value)} selected={value.date}
            onToggle={(v) => onChange({ ...value, date: toggle(value.date, v) })} />

          {(showDueSoon || showBigGap) && (
            <fieldset className="border-0 p-0">
              <legend className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-ink-soft">Needs attention</legend>
              <div className="flex flex-col gap-2">
                {showDueSoon && (
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={value.dueSoon} aria-label="Due soon"
                      onChange={(e) => onChange({ ...value, dueSoon: e.target.checked })}
                      className="h-4 w-4 rounded border-lily-line text-reed focus:ring-pond" />
                    ⏰ Due soon
                  </label>
                )}
                {showBigGap && (
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={value.bigGap} aria-label="Biggest gap"
                      onChange={(e) => onChange({ ...value, bigGap: e.target.checked })}
                      className="h-4 w-4 rounded border-lily-line text-reed focus:ring-pond" />
                    🙌 Biggest gap
                  </label>
                )}
              </div>
            </fieldset>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => onChange(emptyFilters())}
            className="rounded-full bg-lily px-4 py-2 text-sm font-semibold text-pond-deep hover:bg-lily-line">
            Show all tasks
          </button>
        </div>
      </div>
    </div>
  );
}
