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
import { SiteNav } from "@/components/SiteNav";

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

// The page always wraps its output in a fragment (to make room for the
// flagged SiteNav bar above it), so pull the TaskBoard element out of the
// fragment's children rather than asserting on the page's root element.
function taskBoardElement(el: Awaited<ReturnType<typeof render>>) {
  const children = el.props.children;
  const kids = Array.isArray(children) ? children : [children];
  return kids.find((c) => c && c.type === TaskBoard);
}

// When the flag is dark the fragment's first child is `false`, so a find by
// type returns undefined. That is exactly the "no bar" assertion we want.
function siteNavElement(el: Awaited<ReturnType<typeof render>>) {
  const children = el.props.children;
  const kids = Array.isArray(children) ? children : [children];
  return kids.find((c) => c && c.type === SiteNav);
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
  const tb = taskBoardElement(el);
  expect(tb.type).toBe(TaskBoard);
  expect(tb.props.event.name).toBe("Bon Odori");
  expect(tb.props.isOrganizer).toBe(false);
});

test("marks an authenticated organizer", async () => {
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(true);
  cookieJar = { get: (n) => (n === "frog_organizer" ? { value: "tok" } : undefined) };
  const el = await render();
  expect(taskBoardElement(el).props.isOrganizer).toBe(true);
});

test("opens the flag from the preview cookie even in production", async () => {
  vi.stubEnv("FLAG_TASK_BOARD", "");
  cookieJar = { get: (n) => (n === "ff_task_board" ? { value: "1" } : undefined) };
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(false);
  const el = await render();
  expect(taskBoardElement(el).type).toBe(TaskBoard);
});

test("parses filters from the query into initialFilters and passes a clock", async () => {
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(false);
  const el = await render("bon-odori", { group: "Scouts" });
  const tb = taskBoardElement(el);
  expect(tb.props.initialFilters.group).toEqual(["Scouts"]);
  expect(typeof tb.props.nowMs).toBe("number");
});

test("hides the nav bar when FLAG_NAV is dark", async () => {
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(false);
  const el = await render();
  expect(siteNavElement(el)).toBeFalsy();
});

test("shows the nav bar when the nav preview cookie is set", async () => {
  cookieJar = { get: (n) => (n === "ff_nav" ? { value: "1" } : undefined) };
  getEventBoardByParam.mockResolvedValue(sampleBoard);
  isValidSession.mockReturnValue(false);
  const el = await render();
  expect(siteNavElement(el).type).toBe(SiteNav);
});

test("marks the standing board as all-groups in the nav chip", async () => {
  cookieJar = { get: (n) => (n === "ff_nav" ? { value: "1" } : undefined) };
  getEventBoardByParam.mockResolvedValue({ ...sampleBoard, standing: true });
  isValidSession.mockReturnValue(false);
  const el = await render();
  expect(siteNavElement(el).props.ctx.allGroups).toBe(true);
});
