import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ChaseView } from "@/components/ChaseView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/rsvp", () => ({ setRsvpAction: vi.fn().mockResolvedValue({ ok: true }) }));

const counts = { yes: 1, maybe: 0, no: 0, blank: 2 };
const chase = [{ subGroup: "Hawk", people: [{ id: "p1", name: "Alex T.", minor: true, status: "blank" as const }] }];

test("leads with the progress and lists who is left", () => {
  render(<ChaseView token="t" group="Scouts" eventName="Obon" counts={counts} chase={chase} />);
  expect(screen.getByText(/1 of 3/i)).toBeInTheDocument(); // heard from 1 of 3
  expect(screen.getByText("Hawk")).toBeInTheDocument();
  expect(screen.getByText("Alex T.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /yes/i })).toBeInTheDocument();
});

test("celebrates when nobody is left to chase", () => {
  render(<ChaseView token="t" group="Scouts" eventName="Obon" counts={{ yes: 3, maybe: 0, no: 0, blank: 0 }} chase={[]} />);
  expect(screen.getByText(/all .*accounted for/i)).toBeInTheDocument();
});
