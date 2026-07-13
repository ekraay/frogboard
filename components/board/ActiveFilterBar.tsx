"use client";

import type { FacetOptions } from "@/lib/domain/board";
import { hasAnyFilter, type BoardFilters } from "@/lib/domain/boardFilters";

type Chip = { section: keyof BoardFilters; item?: string; label: string };

function chips(value: BoardFilters, facets: FacetOptions): Chip[] {
  const dayLabel = new Map(facets.date.map((d) => [d.value, d.label]));
  const out: Chip[] = [];
  if (value.keyword.trim()) out.push({ section: "keyword", label: `"${value.keyword.trim()}"` });
  for (const g of value.group) out.push({ section: "group", item: g, label: `👥 ${g}` });
  for (const c of value.category) out.push({ section: "category", item: c, label: `🏷️ ${c}` });
  for (const l of value.location) out.push({ section: "location", item: l, label: `📍 ${l}` });
  for (const d of value.date) out.push({ section: "date", item: d, label: `📅 ${dayLabel.get(d) ?? d}` });
  if (value.dueSoon) out.push({ section: "dueSoon", label: "⏰ Due soon" });
  if (value.bigGap) out.push({ section: "bigGap", label: "🙌 Biggest gap" });
  return out;
}

// The visible signal for hidden filters: one removable chip per active value plus
// a clear-all. Also the context banner for a shared group link.
export function ActiveFilterBar({
  value, facets, onRemove, onClear,
}: {
  value: BoardFilters;
  facets: FacetOptions;
  onRemove: (section: keyof BoardFilters, item?: string) => void;
  onClear: () => void;
}) {
  if (!hasAnyFilter(value)) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {chips(value, facets).map((c) => (
        <button
          key={`${c.section}:${c.item ?? ""}`}
          type="button"
          onClick={() => (c.item === undefined ? onRemove(c.section) : onRemove(c.section, c.item))}
          aria-label={`Remove ${c.label}`}
          className="flex items-center gap-1 rounded-full bg-lily px-3 py-1 text-xs font-semibold text-ink hover:bg-lily-line"
        >
          {c.label} <span aria-hidden>✕</span>
        </button>
      ))}
      <button type="button" onClick={onClear}
        className="rounded-full px-3 py-1 text-xs font-semibold text-pond underline-offset-2 hover:underline">
        Show all tasks
      </button>
    </div>
  );
}
