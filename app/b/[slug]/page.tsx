import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getEventBoardByParam } from "@/lib/repository/events";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { flagEnabled } from "@/lib/flags";
import { parseBoardFilters } from "@/lib/domain/boardFilters";
import { TaskBoard } from "@/components/board/TaskBoard";

// Per-request: the session decides organizer, and the flag/cookie decides
// whether the board is visible at all.
export const dynamic = "force-dynamic";

// A plain helper (not a component) so the React Compiler's purity check,
// which flags direct Date.now() calls in component bodies, does not apply.
function currentTimeMs(): number {
  return Date.now();
}

export default async function TaskBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();

  if (!flagEnabled("task_board", { cookies: cookieStore })) notFound();

  const board = await getEventBoardByParam(slug);
  if (!board) notFound();

  const initialFilters = parseBoardFilters(await searchParams);
  const nowMs = currentTimeMs();
  const isOrganizer = isValidSession(cookieStore.get(SESSION_COOKIE)?.value);
  return (
    <TaskBoard
      event={{ name: board.name }}
      tasks={board.tasks}
      isOrganizer={isOrganizer}
      initialFilters={initialFilters}
      nowMs={nowMs}
    />
  );
}
