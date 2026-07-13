import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ActiveFilterBar } from "@/components/board/ActiveFilterBar";
import { emptyFilters } from "@/lib/domain/boardFilters";
import type { FacetOptions } from "@/lib/domain/board";

const facets: FacetOptions = {
  date: [{ value: "2026-07-25", label: "Saturday, Jul 25" }],
  group: ["Scouts"], category: ["Food"], location: [],
};

test("renders nothing when no filter is active", () => {
  const { container } = render(
    <ActiveFilterBar value={emptyFilters()} facets={facets} onRemove={vi.fn()} onClear={vi.fn()} />
  );
  expect(container).toBeEmptyDOMElement();
});
test("renders one chip per active value, with a friendly day label and the two toggles", () => {
  render(<ActiveFilterBar
    value={{ ...emptyFilters(), group: ["Scouts"], date: ["2026-07-25"], keyword: "cups", dueSoon: true, bigGap: true }}
    facets={facets} onRemove={vi.fn()} onClear={vi.fn()} />);
  expect(screen.getByText(/Scouts/)).toBeInTheDocument();
  expect(screen.getByText(/Sat/i)).toBeInTheDocument();
  expect(screen.getByText(/cups/)).toBeInTheDocument();
  expect(screen.getByText(/due soon/i)).toBeInTheDocument();
  expect(screen.getByText(/biggest gap/i)).toBeInTheDocument();
});
test("removing a chip calls onRemove for just that value", async () => {
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), group: ["Scouts"] }} facets={facets} onRemove={onRemove} onClear={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /remove .*scouts/i }));
  expect(onRemove).toHaveBeenCalledWith("group", "Scouts");
});
test("removing the Biggest gap chip targets the bigGap section", async () => {
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), bigGap: true }} facets={facets} onRemove={onRemove} onClear={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /remove .*biggest gap/i }));
  expect(onRemove).toHaveBeenCalledWith("bigGap");
});
test("a filtered day missing from facets falls back to the ISO value and still clears", async () => {
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), date: ["2026-09-09"] }} facets={facets} onRemove={onRemove} onClear={vi.fn()} />);
  expect(screen.getByText(/2026-09-09/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /remove/i }));
  expect(onRemove).toHaveBeenCalledWith("date", "2026-09-09");
});
test("Show all tasks calls onClear", async () => {
  const onClear = vi.fn();
  const user = userEvent.setup();
  render(<ActiveFilterBar value={{ ...emptyFilters(), keyword: "x" }} facets={facets} onRemove={vi.fn()} onClear={onClear} />);
  await user.click(screen.getByRole("button", { name: /show all tasks/i }));
  expect(onClear).toHaveBeenCalled();
});
