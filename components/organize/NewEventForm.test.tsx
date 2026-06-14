import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const createEventAction = vi.fn();
vi.mock("@/app/actions/organize", () => ({ createEventAction: (fd: FormData) => createEventAction(fd) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { NewEventForm } from "@/components/organize/NewEventForm";

beforeEach(() => { createEventAction.mockReset(); push.mockReset(); });

test("creates an event and navigates to its grid", async () => {
  createEventAction.mockResolvedValue({ ok: true, eventId: "e1" });
  const user = userEvent.setup();
  render(<NewEventForm />);
  await user.type(screen.getByLabelText(/event name/i), "Crab Feed 2027");
  await user.type(screen.getByLabelText(/first day/i), "2027-02-01");
  await user.type(screen.getByLabelText(/last day/i), "2027-02-01");
  await user.click(screen.getByRole("button", { name: /create event/i }));
  expect(createEventAction).toHaveBeenCalledOnce();
  expect(push).toHaveBeenCalledWith("/organize/e1");
});
