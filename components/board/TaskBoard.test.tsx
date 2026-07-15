import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";
import type { BoardTask } from "@/lib/domain/types";
import { emptyFilters } from "@/lib/domain/boardFilters";

vi.mock("@/app/actions/signups", () => ({ claimSlot: vi.fn(), releaseSignup: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TaskBoard } from "@/components/board/TaskBoard";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "errand", title: "Set up", category: null,
    requestedGroup: null, neededCount: 1, date: null,
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, status: "todo", waiting: false,
    position: 0, signups: [], ...overrides,
  };
}

const open = task({ id: "open1", title: "Needs help", neededCount: 2, signups: [] });
const full = task({ id: "full1", title: "All done", neededCount: 1, signups: [{ id: "s1", name: "Ann", group: null }] });

const NOW_MS = Date.parse("2026-07-22T12:00:00Z");

beforeEach(() => {
  window.location.hash = "";
  window.localStorage.clear();
});

function renderBoard(props: Partial<Parameters<typeof TaskBoard>[0]> = {}) {
  return render(
    <TaskBoard event={{ name: "Bon Odori" }} tasks={[open, full]} isOrganizer={false}
      initialFilters={emptyFilters()} nowMs={NOW_MS} {...props} />,
  );
}

test("splits tasks into Available and Claimed columns with counts", () => {
  renderBoard();
  const available = screen.getByRole("region", { name: /available/i });
  const claimed = screen.getByRole("region", { name: /claimed/i });
  expect(within(available).getByText("Needs help")).toBeInTheDocument();
  expect(within(claimed).getByText("All done")).toBeInTheDocument();
  expect(within(available).getByText("1")).toBeInTheDocument();
  expect(within(claimed).getByText("1")).toBeInTheDocument();
});

test("shows the copy-public-link control for an organizer only", () => {
  const { rerender } = renderBoard({ isOrganizer: true });
  expect(screen.getByRole("button", { name: /copy public link/i })).toBeInTheDocument();

  rerender(<TaskBoard event={{ name: "Bon Odori" }} tasks={[open, full]} isOrganizer={false}
    initialFilters={emptyFilters()} nowMs={NOW_MS} />);
  expect(screen.queryByRole("button", { name: /copy public link/i })).not.toBeInTheDocument();
});

test("offers an organizer sign-in link to a visitor, and hides it once signed in", () => {
  const { rerender } = renderBoard({ isOrganizer: false });
  const link = screen.getByRole("link", { name: /organizer sign.?in/i });
  expect(link).toHaveAttribute("href", "/organize");

  rerender(<TaskBoard event={{ name: "Bon Odori" }} tasks={[open, full]} isOrganizer={true}
    initialFilters={emptyFilters()} nowMs={NOW_MS} />);
  expect(screen.queryByRole("link", { name: /organizer sign.?in/i })).not.toBeInTheDocument();
});

test("clicking a card opens its panel and sets the URL hash", async () => {
  const user = userEvent.setup();
  renderBoard();
  await user.click(screen.getByText("Needs help"));
  expect(screen.getByRole("dialog")).toHaveAccessibleName(/needs help/i);
  expect(window.location.hash).toBe("#task-open1");
});

test("closing the panel clears the hash", async () => {
  const user = userEvent.setup();
  renderBoard();
  await user.click(screen.getByText("Needs help"));
  await user.click(screen.getByRole("button", { name: /close details/i }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(window.location.hash).toBe("");
});

test("an initial #task hash opens that panel on mount", async () => {
  window.location.hash = "#task-open1";
  renderBoard();
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(/needs help/i);
});

test("a hash naming no task on the board opens nothing", () => {
  window.location.hash = "#task-ghost";
  renderBoard();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("a hashchange to a known task opens the panel", async () => {
  renderBoard();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  window.location.hash = "#task-full1";
  fireEvent(window, new HashChangeEvent("hashchange"));
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(/all done/i);
});

test("copy public link copies origin + pathname and flips to Copied", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  renderBoard({ isOrganizer: true });

  fireEvent.click(screen.getByRole("button", { name: /copy public link/i }));
  expect(writeText).toHaveBeenCalledWith(window.location.origin + window.location.pathname);
  expect(await screen.findByText(/copied/i)).toBeInTheDocument();
});

test("applying a group filter narrows the visible tasks", () => {
  const tasks = [
    task({ id: "a", title: "Cups", requestedGroup: "Scouts" }),
    task({ id: "b", title: "Grill", requestedGroup: "Parents" }),
  ];
  render(<TaskBoard event={{ name: "Ginza" }} tasks={tasks} isOrganizer={false}
    initialFilters={{ ...emptyFilters(), group: ["Scouts"] }} nowMs={NOW_MS} />);
  expect(screen.getByText("Cups")).toBeInTheDocument();
  expect(screen.queryByText("Grill")).not.toBeInTheDocument();
});

test("the Filter button shows the active-value count", () => {
  render(<TaskBoard event={{ name: "Ginza" }} tasks={[task({ id: "a" })]} isOrganizer={false}
    initialFilters={{ ...emptyFilters(), group: ["Scouts", "Parents"], bigGap: true }} nowMs={NOW_MS} />);
  expect(screen.getByRole("button", { name: /filter/i })).toHaveTextContent("3");
});

test("a filter change writes the query to the URL", async () => {
  const spy = vi.spyOn(window.history, "replaceState");
  const user = userEvent.setup();
  render(<TaskBoard event={{ name: "Ginza" }}
    tasks={[task({ id: "a", requestedGroup: "Scouts" })]} isOrganizer={false}
    initialFilters={emptyFilters()} nowMs={NOW_MS} />);
  await user.click(screen.getByRole("button", { name: /filter/i }));
  await user.click(screen.getByLabelText("Scouts"));
  expect(spy).toHaveBeenCalledWith(null, "", expect.stringContaining("group=Scouts"));
  spy.mockRestore();
});

test("copy-link includes the active filter query (organizer)", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  render(<TaskBoard event={{ name: "Ginza" }} tasks={[task({ id: "a" })]} isOrganizer
    initialFilters={{ ...emptyFilters(), group: ["Scouts"] }} nowMs={NOW_MS} />);
  // userEvent.setup() installs its own navigator.clipboard stub, so the mock
  // must be defined after setup() runs or it gets overwritten.
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
  await user.click(screen.getByRole("button", { name: /copy public link/i }));
  expect(write).toHaveBeenCalledWith(expect.stringContaining("group=Scouts"));
});

test("empty result shows the clear-all empty state", () => {
  render(<TaskBoard event={{ name: "Ginza" }} tasks={[task({ id: "a", requestedGroup: "Parents" })]} isOrganizer={false}
    initialFilters={{ ...emptyFilters(), group: ["Nobody"] }} nowMs={NOW_MS} />);
  expect(screen.getByText(/no tasks match/i)).toBeInTheDocument();
});

test("with Biggest gap on, the Available column sorts the largest gap first", () => {
  const tasks = [
    task({ id: "small", title: "Small", neededCount: 2, signups: [], position: 0 }), // gap 2
    task({ id: "big", title: "Big", neededCount: 5, signups: [], position: 1 }),      // gap 5
  ];
  render(<TaskBoard event={{ name: "Ginza" }} tasks={tasks} isOrganizer={false}
    initialFilters={{ ...emptyFilters(), bigGap: true }} nowMs={NOW_MS} />);
  const available = screen.getByRole("region", { name: "Available" });
  const titles = [...available.querySelectorAll("p.font-display")].map((p) => p.textContent);
  expect(titles).toEqual(["Big", "Small"]);
});

test("an organizer can open the organizer view from the board", () => {
  renderBoard({ isOrganizer: true });
  expect(screen.getByRole("link", { name: "Organize" })).toHaveAttribute("href", "/organize");
});
