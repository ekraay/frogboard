import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { BoardTask } from "@/lib/domain/types";
import { BoardCard } from "@/components/board/BoardCard";

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null,
    requestedGroup: null, neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: null, endAt: null, dueBy: null, pointOfContact: null,
    location: null, definitionOfDone: null, status: "todo", waiting: false,
    position: 0, signups: [], ...overrides,
  };
}

test("shows the coverage as 'N of M' when not full", () => {
  render(<BoardCard task={task({ neededCount: 3, signups: [{ id: "s1", name: "Ann", group: null }] })} onOpen={vi.fn()} />);
  expect(screen.getByText(/1 of 3/i)).toBeInTheDocument();
  expect(screen.queryByText(/covered/i)).not.toBeInTheDocument();
});

test("shows 'Covered' when full", () => {
  render(<BoardCard task={task({ neededCount: 1, signups: [{ id: "s1", name: "Ann", group: null }] })} onOpen={vi.fn()} />);
  expect(screen.getByText(/covered/i)).toBeInTheDocument();
});

test("a solo task reads 'Hop to it'", () => {
  render(<BoardCard task={task({ kind: "errand", neededCount: 1 })} onOpen={vi.fn()} />);
  expect(screen.getByText(/hop to it/i)).toBeInTheDocument();
});

test("a solo shift also reads 'Hop to it'", () => {
  render(<BoardCard task={task({ kind: "shift", neededCount: 1 })} onOpen={vi.fn()} />);
  expect(screen.getByText(/hop to it/i)).toBeInTheDocument();
});

test("a task needing two or more reads 'Hop to it together'", () => {
  render(<BoardCard task={task({ kind: "errand", neededCount: 2 })} onOpen={vi.fn()} />);
  expect(screen.getByText(/hop to it together/i)).toBeInTheDocument();
});

test("a full task shows no claim CTA", () => {
  render(<BoardCard task={task({ kind: "errand", neededCount: 1, signups: [{ id: "s1", name: "Ann", group: null }] })} onOpen={vi.fn()} />);
  expect(screen.queryByText(/hop to it/i)).not.toBeInTheDocument();
});

test("says 'No one yet' when there are no signups, and lists claimants when there are", () => {
  const { rerender } = render(<BoardCard task={task({ signups: [] })} onOpen={vi.fn()} />);
  expect(screen.getByText(/no one yet/i)).toBeInTheDocument();

  rerender(<BoardCard task={task({ signups: [{ id: "s1", name: "Ann", group: null }] })} onOpen={vi.fn()} />);
  expect(screen.getByText("Ann")).toBeInTheDocument();
  expect(screen.queryByText(/no one yet/i)).not.toBeInTheDocument();
});

test("shows the requested group when present", () => {
  render(<BoardCard task={task({ requestedGroup: "Scouts" })} onOpen={vi.fn()} />);
  expect(screen.getByText(/scouts/i)).toBeInTheDocument();
});

test("clicking the card opens the panel with the task id", async () => {
  const onOpen = vi.fn();
  const user = userEvent.setup();
  render(<BoardCard task={task({ id: "abc" })} onOpen={onOpen} />);
  await user.click(screen.getByRole("button", { name: /games/i }));
  expect(onOpen).toHaveBeenCalledWith("abc");
});

test("clicking the CTA opens the panel", async () => {
  const onOpen = vi.fn();
  const user = userEvent.setup();
  render(<BoardCard task={task({ id: "abc", kind: "errand", neededCount: 1 })} onOpen={onOpen} />);
  await user.click(screen.getByText(/hop to it/i));
  expect(onOpen).toHaveBeenCalledWith("abc");
});
