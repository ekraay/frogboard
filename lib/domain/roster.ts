import { type RsvpRecord, type EffectiveStatus, eventStatus } from "@/lib/domain/rsvp";

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
