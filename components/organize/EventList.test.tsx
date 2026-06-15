import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const setEventStatusAction = vi.fn();
const deleteEventAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({
  setEventStatusAction: (id: string, s: string) => setEventStatusAction(id, s),
  deleteEventAction: (id: string) => deleteEventAction(id),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { EventList } from "@/components/organize/EventList";
import type { EventListItem } from "@/lib/repository/organize";

function ev(o: Partial<EventListItem>): EventListItem {
  return { id: "e1", name: "Ginza", startDate: new Date(), endDate: new Date(), status: "published", taskCount: 3, ...o };
}

beforeEach(() => {
  setEventStatusAction.mockReset(); deleteEventAction.mockReset();
  setEventStatusAction.mockResolvedValue({ ok: true });
  deleteEventAction.mockResolvedValue({ ok: true });
});

test("archives an active event", async () => {
  const user = userEvent.setup();
  render(<EventList events={[ev({})]} />);
  await user.click(screen.getByRole("button", { name: /archive ginza/i }));
  expect(setEventStatusAction).toHaveBeenCalledWith("e1", "archived");
});

test("archived events live in an Archived section and can be restored", async () => {
  const user = userEvent.setup();
  render(<EventList events={[ev({ id: "a", name: "Old Feast", status: "archived" })]} />);
  expect(screen.getByText(/archived \(1\)/i)).toBeInTheDocument();
  // an archived event is NOT an editable link in the main list
  expect(screen.queryByRole("link", { name: /old feast/i })).toBeNull();
  await user.click(screen.getByRole("button", { name: /restore old feast/i }));
  expect(setEventStatusAction).toHaveBeenCalledWith("a", "draft");
});

test("permanently deleting asks for confirmation", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  const user = userEvent.setup();
  render(<EventList events={[ev({ id: "a", name: "Old Feast", status: "archived" })]} />);
  await user.click(screen.getByRole("button", { name: /delete old feast/i }));
  expect(confirmSpy).toHaveBeenCalled();
  expect(deleteEventAction).toHaveBeenCalledWith("a");
  confirmSpy.mockRestore();
});

test("declining the delete confirm does nothing", async () => {
  const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  const user = userEvent.setup();
  render(<EventList events={[ev({ id: "a", name: "Old Feast", status: "archived" })]} />);
  await user.click(screen.getByRole("button", { name: /delete old feast/i }));
  expect(deleteEventAction).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});
