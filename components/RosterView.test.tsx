import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RosterView } from "@/components/RosterView";
import type { RosterGroup, PatrolSummary } from "@/lib/domain/roster";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/rsvp", () => ({ setRsvpAction: vi.fn().mockResolvedValue({ ok: true }) }));

const counts = { yes: 1, maybe: 1, no: 1, blank: 1 };
const byPatrol: PatrolSummary[] = [
  { subGroup: "Hawk", counts: { yes: 1, maybe: 0, no: 1, blank: 0 }, leader: "Alex T." },
  { subGroup: "Fox", counts: { yes: 0, maybe: 1, no: 0, blank: 1 }, leader: null },
];
const roster: RosterGroup[] = [
  { subGroup: "Hawk", people: [
    { id: "a", name: "Alex T.", position: "PL", status: "yes" as const, reason: null },
    { id: "b", name: "Bo S.", position: null, status: "no" as const, reason: "Away that weekend" },
  ] },
  { subGroup: "Fox", people: [
    { id: "c", name: "Cara I.", position: null, status: "maybe" as const, reason: "Might have a game" },
    { id: "d", name: "Dee K.", position: null, status: "blank" as const, reason: null },
  ] },
];

function view() {
  return <RosterView token="t" group="Scouts" eventName="Obon" counts={counts} byPatrol={byPatrol} roster={roster} />;
}

test("leads with the overall heard count", () => {
  render(view());
  expect(screen.getByText(/3 of 4/i)).toBeInTheDocument(); // heard 3 of 4
});

test("summarizes each patrol and names the leader accountable", () => {
  render(view());
  const summary = within(screen.getByRole("table"));
  expect(summary.getByText("Hawk")).toBeInTheDocument();
  expect(summary.getByText("Fox")).toBeInTheDocument();
  expect(summary.getByText(/PL Alex T\./)).toBeInTheDocument(); // leader shown in the summary
});

test("keeps answered people with their status and reason", () => {
  render(view());
  expect(screen.getByText("Bo S.")).toBeInTheDocument();
  expect(screen.getByText(/away that weekend/i)).toBeInTheDocument();
  expect(screen.getByText(/no answer/i)).toBeInTheDocument(); // the blank person still shows
});

test("bolds the patrol leader in the roster", () => {
  render(view());
  const hawk = screen.getByRole("heading", { name: "Hawk" }).closest("section")!;
  const leaderName = within(hawk).getByText("Alex T.");
  expect(leaderName.className).toMatch(/font-bold/);
});

test("offers record buttons on every person", () => {
  render(view());
  expect(screen.getAllByRole("button", { name: /yes/i }).length).toBe(roster.flatMap((g) => g.people).length);
});
