import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { FilterFlyout } from "@/components/board/FilterFlyout";
import { emptyFilters } from "@/lib/domain/boardFilters";
import type { FacetOptions } from "@/lib/domain/board";

const facets: FacetOptions = {
  date: [{ value: "2026-07-25", label: "Saturday, Jul 25" }],
  group: ["Scouts", "Parents"], category: ["Food"], location: [],
};

test("checking a group value calls onChange with it added", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByLabelText("Scouts"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ group: ["Scouts"] }));
});
test("unchecking a selected value removes it", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={{ ...emptyFilters(), group: ["Scouts"] }} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByLabelText("Scouts"));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ group: [] }));
});
test("the keyword input reports changes", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={onChange} onClose={vi.fn()} />);
  await user.type(screen.getByLabelText(/keyword/i), "c");
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ keyword: "c" }));
});
test("the Due soon and Biggest gap toggles report changes", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByLabelText(/due soon/i));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dueSoon: true }));
  await user.click(screen.getByLabelText(/biggest gap/i));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ bigGap: true }));
});
test("a section with no values does not render (Location empty)", () => {
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByText(/location/i)).not.toBeInTheDocument();
});
test("Due soon hides when showDueSoon is false; Biggest gap hides when showBigGap is false", () => {
  render(<FilterFlyout facets={facets} showDueSoon={false} showBigGap={false} value={emptyFilters()} onChange={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByLabelText(/due soon/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/biggest gap/i)).not.toBeInTheDocument();
});
test("Escape closes the flyout", async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={emptyFilters()} onChange={vi.fn()} onClose={onClose} />);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
test("Show all tasks clears every section", async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<FilterFlyout facets={facets} showDueSoon showBigGap value={{ ...emptyFilters(), group: ["Scouts"] }} onChange={onChange} onClose={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /show all tasks/i }));
  expect(onChange).toHaveBeenCalledWith(emptyFilters());
});
