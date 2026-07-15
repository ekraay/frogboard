import Link from "next/link";

export interface ChooserEvent {
  id: string; name: string; slug: string | null; startDate: Date | null; endDate: Date | null;
  covered: number; total: number;
}

export interface ChooserBoard {
  id: string; name: string; slug: string | null; taskCount: number;
}

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function dateRange(start: Date | null, end: Date | null): string | null {
  if (!start || !end) return null;
  const a = day.format(start);
  const b = day.format(end);
  return a === b ? a : `${a} – ${b}`;
}

const card =
  "pad-rise flex items-baseline justify-between gap-4 rounded-2xl border border-lily-line bg-white px-5 py-4 shadow-sm transition hover:border-reed hover:shadow-md";
const sectionLabel = "mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-soft";
const pill = "shrink-0 rounded-full bg-lily px-3 py-1 text-sm font-bold text-pond-deep";

/** The public org landing: the org's gatherings and ongoing boards, side by
 *  side. Shown when more than one destination exists (a lone one redirects). */
export function GardenHome({ events, boards }: { events: ChooserEvent[]; boards: ChooserBoard[] }) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-7">
      <header className="mb-9 text-center">
        <div className="garland lantern-glow" aria-hidden>
          <span className="lantern" /><span className="lantern" /><span className="lantern" />
          <span className="lantern" /><span className="lantern" />
        </div>
        <h1 className="font-display text-3xl font-extrabold text-ink">🐸 BCSF</h1>
        <p className="mt-2 text-ink-soft">Tap where you&rsquo;re headed.</p>
      </header>

      {events.length > 0 && (
        <section className="mb-8">
          <h2 className={sectionLabel}>Gatherings</h2>
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/${e.slug ?? e.id}`} className={card}>
                  <span>
                    <span className="font-display text-xl font-bold text-ink">{e.name}</span>
                    {dateRange(e.startDate, e.endDate) && (
                      <span className="mt-0.5 block text-sm text-ink-soft">{dateRange(e.startDate, e.endDate)}</span>
                    )}
                  </span>
                  <span className={pill}>{e.covered} of {e.total} covered</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {boards.length > 0 && (
        <section>
          <h2 className={sectionLabel}>Ongoing boards</h2>
          <ul className="space-y-3">
            {boards.map((b) => (
              <li key={b.id}>
                <Link href={`/${b.slug ?? b.id}`} className={card}>
                  <span className="font-display text-xl font-bold text-ink">🪷 {b.name}</span>
                  <span className={pill}>{b.taskCount} {b.taskCount === 1 ? "task" : "tasks"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
