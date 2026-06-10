import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TaskCard } from "@/components/TaskCard";
import type { BoardTask } from "@/lib/domain/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/signups", () => ({ claimSlot: vi.fn(), releaseSignup: vi.fn() }));

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: "Games",
    requestedGroup: "Scouts", neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: new Date("2026-07-25T17:00:00Z"), endAt: new Date("2026-07-25T20:00:00Z"),
    dueBy: null, pointOfContact: "Yumi 415-370-1477", location: "Inside Gym",
    definitionOfDone: "Booth tidy at handover.", status: "todo", waiting: false,
    signups: [], ...overrides,
  };
}

test("shows title, time window, slot count, location and contact", () => {
  render(<TaskCard task={task({})} />);
  expect(screen.getByText("Games")).toBeInTheDocument();
  expect(screen.getByText("10:00 AM–1:00 PM")).toBeInTheDocument();
  expect(screen.getByText("0 of 3 filled")).toBeInTheDocument();
  expect(screen.getByText(/Inside Gym/)).toBeInTheDocument();
  expect(screen.getByText(/Yumi/)).toBeInTheDocument();
});

test("lists claimant names", () => {
  render(<TaskCard task={task({ signups: [{ id: "s1", name: "Kenji", group: "Scouts", minor: null }] })} />);
  expect(screen.getByText("Kenji")).toBeInTheDocument();
});
