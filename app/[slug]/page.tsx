import { notFound } from "next/navigation";
import { getEventBoardByParam } from "@/lib/repository/events";
import { Board } from "@/components/Board";
import { filterTasksByGroup, coverageFor } from "@/lib/domain/board";

// The board reflects live signups; always render fresh.
export const dynamic = "force-dynamic";

export default async function EventBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const { slug } = await params;
  const board = await getEventBoardByParam(slug);
  if (!board) notFound();

  // ?group=Hawks → a shareable, group-filtered view with a coverage header.
  const raw = (await searchParams).group;
  const group = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (group) {
    const tasks = filterTasksByGroup(board.tasks, group);
    const displayGroup = tasks[0]?.requestedGroup ?? group; // canonical casing when known
    return (
      <Board eventName={board.name} tasks={tasks}
        filter={{ group: displayGroup, ...coverageFor(tasks) }} />
    );
  }

  return <Board eventName={board.name} tasks={board.tasks} />;
}
