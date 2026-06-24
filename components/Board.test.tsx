import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Board } from "@/components/Board";
import type { BoardTask } from "@/lib/domain/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/ginza-2026",
  useSearchParams: () => new URLSearchParams(),
}));
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

test("explains what a frog is", () => {
  render(<Board eventName="Ginza Bazaar" tasks={[task({})]} />);
  expect(screen.getByText(/what's a frog/i)).toBeInTheDocument();
  expect(screen.getByText(/one-off thing that needs doing/i)).toBeInTheDocument();
});

test("active facet labels show a coverage header", () => {
  render(
    <Board eventName="Ginza Bazaar" tasks={[task({ requestedGroup: "Scouts" })]}
      filter={{ options: { date: [], group: [], category: [], location: [] }, activeLabels: ["Scouts"], covered: 7, total: 9 }} />,
  );
  expect(screen.getByText(/Showing Scouts/)).toBeInTheDocument();
  expect(screen.getByText(/7 of 9 covered/i)).toBeInTheDocument();
});

test("without a filter there is no coverage header", () => {
  render(<Board eventName="Ginza Bazaar" tasks={[task({})]} />);
  expect(screen.queryByText(/covered/i)).toBeNull();
});

test("active facet with no matching tasks shows a friendly empty state", () => {
  render(
    <Board eventName="Ginza Bazaar" tasks={[]}
      filter={{ options: { date: [], group: [], category: [], location: [] }, activeLabels: ["Scouts"], covered: 0, total: 0 }} />,
  );
  expect(screen.getByText(/no matching shifts/i)).toBeInTheDocument();
});
