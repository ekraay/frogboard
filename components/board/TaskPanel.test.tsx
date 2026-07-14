import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";
import type { BoardTask } from "@/lib/domain/types";

vi.mock("@/app/actions/signups", () => ({ claimSlot: vi.fn(), releaseSignup: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { TaskPanel } from "@/components/board/TaskPanel";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "quick", title: "Set up tables", category: null,
    requestedGroup: null, neededCount: 1, date: new Date("2026-07-25T00:00:00Z"),
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, status: "todo", waiting: false,
    position: 0, signups: [], ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

test("renders as a labelled modal dialog and takes focus", () => {
  render(<TaskPanel task={task({ title: "Set up tables" })} onClose={vi.fn()} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(dialog).toHaveAccessibleName(/set up tables/i);
  expect(dialog).toHaveFocus();
});

test("shows the claim fields and copy when the task is not full", () => {
  render(<TaskPanel task={task({ neededCount: 1, signups: [] })} onClose={vi.fn()} />);
  expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
  expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
  expect(screen.queryByText(/all set/i)).not.toBeInTheDocument();
});

test("replaces the claim block with 'All set' when full", () => {
  render(<TaskPanel task={task({ neededCount: 1, signups: [{ id: "s1", name: "Ann", group: null }] })} onClose={vi.fn()} />);
  expect(screen.getByText(/all set/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
});

test("shows the pair nudge only for a task needing two or more with open spots", () => {
  const { rerender } = render(<TaskPanel task={task({ neededCount: 2, signups: [] })} onClose={vi.fn()} />);
  expect(screen.getByText(/more fun in a pair/i)).toBeInTheDocument();

  rerender(<TaskPanel task={task({ neededCount: 1, signups: [] })} onClose={vi.fn()} />);
  expect(screen.queryByText(/more fun in a pair/i)).not.toBeInTheDocument();

  rerender(<TaskPanel task={task({ neededCount: 2, signups: [{ id: "s1", name: "A", group: null }, { id: "s2", name: "B", group: null }] })} onClose={vi.fn()} />);
  expect(screen.queryByText(/more fun in a pair/i)).not.toBeInTheDocument();
});

test("renders only the optional detail rows that are present", () => {
  render(<TaskPanel task={task({ location: "Main hall", definitionOfDone: null, pointOfContact: null, category: null, requestedGroup: null })} onClose={vi.fn()} />);
  expect(screen.getByText(/main hall/i)).toBeInTheDocument();
  expect(screen.queryByText(/point of contact/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/definition of done/i)).not.toBeInTheDocument();
});

test("Esc closes the panel", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<TaskPanel task={task({})} onClose={onClose} />);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});

test("clicking the backdrop closes, clicking the panel does not", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<TaskPanel task={task({})} onClose={onClose} />);

  await user.click(screen.getByRole("dialog"));
  expect(onClose).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: /close details/i }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("Share copies a link ending in the task fragment and flips to Copied", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<TaskPanel task={task({ id: "abc" })} onClose={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /share/i }));
  expect(writeText).toHaveBeenCalledOnce();
  expect(writeText.mock.calls[0][0]).toMatch(/#task-abc$/);
  expect(await screen.findByText(/copied/i)).toBeInTheDocument();
});
