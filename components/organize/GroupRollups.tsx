import type { StatusCounts } from "@/lib/domain/roster";

/** Org coordinator view: attendance counts per group. No individual names (privacy). */
export function GroupRollups({ groups }: { groups: { group: string; counts: StatusCounts }[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-ink-soft">No one imported yet. Add a group roster to start chasing RSVPs.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map(({ group, counts }) => (
        <div key={group} className="rounded-2xl border border-lily-line bg-white px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="font-display font-bold text-ink">{group}</span>
            <span className="text-sm font-bold text-lantern-deep">{counts.blank} to go</span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            <span className="font-bold text-reed">{counts.yes}</span> yes · {counts.maybe} maybe · {counts.no} no
          </p>
        </div>
      ))}
    </div>
  );
}
