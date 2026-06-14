import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Board } from "@/components/Board";
import type { BoardTask } from "@/lib/domain/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/signups", () => ({ claimSlot: vi.fn(), releaseSignup: vi.fn() }));

function task(overrides: Partial<BoardTask>): BoardTask {
  return {
    id: "t1", kind: "shift", title: "Games", category: null, requestedGroup: null,
    neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
    startAt: null, endAt: null, dueBy: null, pointOfContact: null, location: null,
    definitionOfDone: null, position: 0, status: "todo", waiting: false, signups: [], ...overrides,
  };
}

test("renders the event name and a dated day-group heading", () => {
  render(<Board eventName="Ginza Bazaar" tasks={[task({})]} />);
  expect(screen.getByRole("heading", { level: 1, name: /Ginza Bazaar/ })).toBeInTheDocument();
  // groupTasksByDay labels 2026-07-25 (UTC) as a readable day.
  expect(screen.getByRole("heading", { level: 2, name: /Jul 25/ })).toBeInTheDocument();
});
