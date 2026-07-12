import { notFound } from "next/navigation";
import { getEventBoardByParam } from "@/lib/repository/events";
import { Board } from "@/components/Board";
import { filterTasks, facetOptions, coverageFor } from "@/lib/domain/board";

// The board reflects live signups; always render fresh.
export const dynamic = "force-dynamic";

export default async function EventBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string | string[]; group?: string | string[]; category?: string | string[]; location?: string | string[] }>;
}) {
  const { slug } = await params;
  const board = await getEventBoardByParam(slug);
  if (!board) notFound();

  const sp = await searchParams;
  const pick = (k: string) => {
    const v = (sp as Record<string, string | string[] | undefined>)[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const facets = { date: pick("date"), group: pick("group"), category: pick("category"), location: pick("location") };
  const tasks = filterTasks(board.tasks, facets);
  const options = facetOptions(board.tasks);
  const activeLabels = [
    facets.date ? (options.date.find((d) => d.value === facets.date)?.label ?? facets.date) : "",
    facets.group, facets.category, facets.location,
  ].filter((s) => s !== "");
  const { covered, total } = coverageFor(tasks);
  return <Board eventName={board.name} tasks={tasks} standing={board.standing} filter={{ options, activeLabels, covered, total }} />;
}
