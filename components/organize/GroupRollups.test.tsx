import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { GroupRollups } from "@/components/organize/GroupRollups";

test("shows per-group counts, no individual names", () => {
  render(<GroupRollups groups={[{ group: "Scouts", counts: { yes: 22, maybe: 3, no: 5, blank: 10 } }]} />);
  expect(screen.getByText("Scouts")).toBeInTheDocument();
  expect(screen.getByText(/22/)).toBeInTheDocument();
  expect(screen.getByText(/10 to go/i)).toBeInTheDocument();
});

test("prompts to import when empty", () => {
  render(<GroupRollups groups={[]} />);
  expect(screen.getByText(/no one imported yet/i)).toBeInTheDocument();
});
