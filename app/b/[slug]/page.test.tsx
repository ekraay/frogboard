import { expect, test, vi, beforeEach, afterEach } from "vitest";
import type { BoardTask } from "@/lib/domain/types";

const getEventBoardByParam = vi.fn();
const isValidSession = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
}));
vi.mock("@/lib/repository/events", () => ({
  getEventBoardByParam: (p: string) => getEventBoardByParam(p),
}));
vi.mock("@/lib/security/session", () => ({
  isValidSession: (t: string | undefined) => isValidSession(t),
  SESSION_COOKIE: "frog_organizer",
}));

let cookieJar: { get: (n: string) => { value: string } | undefined };

import Page from "./page";
import { TaskBoard } from "@/components/board/TaskBoard";

const sampleBoard = {
  id: "e1",
  name: "Bon Odori",
  standing: false,
  tasks: [] as BoardTask[],
};

beforeEach(() => {
  getEventBoardByParam.mockReset();
  isValidSession.mockReset();
  cookieJar = { get: () => undefined };
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("FLAG_TASK_BOARD", "1"); // flag on unless a test overrides
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function render(slug = "bon-odori", searchParams: Record<string, string | string[] | undefined> = {}) {
  return Page({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(searchParams) });
}

test("notFound when the flag is off", async () => {
  vi.stubEnv("FLAG_TASK_BOARD", "");
  await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
});

test("notFound when the event is missing", async () => {
  getEventBoardByParam.mockResolvedValue(null);
  await expect(render()).rejects.toThrow("NEXT_NOT_FOUND");
});

test("renders the board for a volunteer", async () => {
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(false);
  const el = await render();
  expect(el.type).toBe(TaskBoard);
  expect(el.props.event.name).toBe("Bon Odori");
  expect(el.props.isOrganizer).toBe(false);
});

test("marks an authenticated organizer", async () => {
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(true);
  cookieJar = { get: (n) => (n === "frog_organizer" ? { value: "tok" } : undefined) };
  const el = await render();
  expect(el.props.isOrganizer).toBe(true);
});

test("opens the flag from the preview cookie even in production", async () => {
  vi.stubEnv("FLAG_TASK_BOARD", "");
  cookieJar = { get: (n) => (n === "ff_task_board" ? { value: "1" } : undefined) };
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(false);
  const el = await render();
  expect(el.type).toBe(TaskBoard);
});

test("parses filters from the query into initialFilters and passes a clock", async () => {
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(false);
  const el = await render("bon-odori", { group: "Scouts" });
  expect(el.props.initialFilters.group).toEqual(["Scouts"]);
  expect(typeof el.props.nowMs).toBe("number");
});
