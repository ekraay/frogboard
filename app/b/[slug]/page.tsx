import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getEventBoardByParam } from "@/lib/repository/events";
import { isValidSession, SESSION_COOKIE } from "@/lib/security/session";
import { flagEnabled } from "@/lib/flags";
import { TaskBoard } from "@/components/board/TaskBoard";

// Per-request: the session decides organizer, and the flag/cookie decides
// whether the board is visible at all.
export const dynamic = "force-dynamic";

export default async function TaskBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieStore = await cookies();

  if (!flagEnabled("task_board", { cookies: cookieStore })) notFound();

  const board = await getEventBoardByParam(slug);
  if (!board) notFound();

  const isOrganizer = isValidSession(cookieStore.get(SESSION_COOKIE)?.value);
  return <TaskBoard event={{ name: board.name }} tasks={board.tasks} isOrganizer={isOrganizer} />;
}
