import { type RsvpRecord, type EffectiveStatus, eventStatus } from "@/lib/domain/rsvp";
import { parseTsv } from "@/lib/domain/paste";

export interface RosterPerson {
  id: string;
  name: string;
  subGroup: string | null;
  minor: boolean | null;
}

export interface StatusCounts {
  yes: number;
  maybe: number;
  no: number;
  blank: number;
}

export function statusCounts(people: { id: string }[], byPerson: Map<string, RsvpRecord[]>): StatusCounts {
  const counts: StatusCounts = { yes: 0, maybe: 0, no: 0, blank: 0 };
  for (const p of people) counts[eventStatus(byPerson.get(p.id) ?? [])] += 1;
  return counts;
}

export interface ChaseGroup {
  subGroup: string;
  people: { id: string; name: string; minor: boolean | null; status: EffectiveStatus }[];
}

/** The people still to chase (blank, then maybe), grouped by sub-group, groups sorted alphabetically. */
export function chaseList(people: RosterPerson[], byPerson: Map<string, RsvpRecord[]>): ChaseGroup[] {
  const rank: Record<string, number> = { blank: 0, maybe: 1 };
  const bySub = new Map<string, ChaseGroup["people"]>();
  for (const p of people) {
    const status = eventStatus(byPerson.get(p.id) ?? []);
    if (status !== "blank" && status !== "maybe") continue;
    const key = p.subGroup?.trim() ? p.subGroup.trim() : "Ungrouped";
    if (!bySub.has(key)) bySub.set(key, []);
    bySub.get(key)!.push({ id: p.id, name: p.name, minor: p.minor, status });
  }
  return [...bySub.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([subGroup, ppl]) => ({
      subGroup,
      people: ppl.sort((x, y) => rank[x.status] - rank[y.status] || x.name.localeCompare(y.name)),
    }));
}

export interface ImportedPerson {
  name: string;
  subGroup: string | null;
  position: string | null;
  externalId: string | null;
}

/** Parse a pasted roster block (header row + tab-separated columns) into people. */
export function parsePersonRows(raw: string): ImportedPerson[] {
  const grid = parseTsv(raw).filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length < 2) return [];
  const header = grid[0].map((h) => h.trim().toLowerCase());
  const col = (...wants: string[]) => header.findIndex((h) => wants.some((w) => h.includes(w)));
  const iFirst = col("first"), iLast = col("last");
  const iSub = col("patrol", "team");
  const iPos = col("position");
  const iId = col("scout id", "id");
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  return grid
    .slice(1)
    .map((r) => ({
      name: [cell(r, iFirst), cell(r, iLast)].filter(Boolean).join(" "),
      subGroup: cell(r, iSub) || null,
      position: cell(r, iPos) || null,
      externalId: cell(r, iId) || null,
    }))
    .filter((p) => p.name !== "");
}
