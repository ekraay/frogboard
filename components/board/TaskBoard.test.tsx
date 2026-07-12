import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";
import type { BoardTask } from "@/lib/domain/types";

vi.mock("@/app/actions/signups", () => ({ claimSlot: vi.fn(), releaseSignup: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TaskBoard } from "@/components/board/TaskBoard";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "frog", title: "Set up", category: null,
    requestedGroup: null, neededCount: 1, date: null,
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, status: "todo", waiting: false,
    position: 0, signups: [], ...overrides,
  };
}

const open = task({ id: "open1", title: "Needs help", neededCount: 2, signups: [] });
const full = task({ id: "full1", title: "All done", neededCount: 1, signups: [{ id: "s1", name: "Ann", group: null }] });

beforeEach(() => {
  window.location.hash = "";
  window.localStorage.clear();
});

function renderBoard(props: Partial<Parameters<typeof TaskBoard>[0]> = {}) {
  return render(
    <TaskBoard event={{ name: "Bon Odori" }} tasks={[open, full]} isOrganizer={false} {...props} />,
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

  rerender(<TaskBoard event={{ name: "Bon Odori" }} tasks={[open, full]} isOrganizer={false} />);
  expect(screen.queryByRole("button", { name: /copy public link/i })).not.toBeInTheDocument();
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
