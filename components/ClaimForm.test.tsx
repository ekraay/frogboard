import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";

const claimSlot = vi.fn();
vi.mock("@/app/actions/signups", () => ({
  claimSlot: (fd: FormData) => claimSlot(fd),
  releaseSignup: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ClaimForm } from "@/components/ClaimForm";

beforeEach(() => {
  claimSlot.mockReset();
  window.localStorage.clear();
});

test("submits a name, calls the action, and stores the returned token", async () => {
  claimSlot.mockResolvedValue({ ok: true, signupId: "s1", claimToken: "tok-1" });
  const user = userEvent.setup();
  render(<ClaimForm taskId="t1" />);

  await user.click(screen.getByRole("button", { name: /grab a frog/i }));
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));

  expect(claimSlot).toHaveBeenCalledOnce();
  const fd = claimSlot.mock.calls[0][0] as FormData;
  expect(fd.get("name")).toBe("Kenji");
  expect(fd.get("taskId")).toBe("t1");
  expect(JSON.parse(window.localStorage.getItem("frogboard.claims")!)).toEqual({ s1: "tok-1" });
});

test("shows the error message when the action fails", async () => {
  claimSlot.mockResolvedValue({ ok: false, error: "This task is already full." });
  const user = userEvent.setup();
  render(<ClaimForm taskId="t1" />);

  await user.click(screen.getByRole("button", { name: /grab a frog/i }));
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));

  expect(await screen.findByText("This task is already full.")).toBeInTheDocument();
});

test("does not double-submit when Add me is tapped twice quickly", async () => {
  // Exploratory charter: a frantic double-tap must not create two signups.
  // The pending transition disables the button after the first submit.
  let resolve: (v: { ok: true; signupId: string; claimToken: string }) => void = () => {};
  claimSlot.mockReturnValue(new Promise((r) => { resolve = r; }));
  const user = userEvent.setup();
  render(<ClaimForm taskId="t1" />);

  await user.click(screen.getByRole("button", { name: /grab a frog/i }));
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  const addMe = screen.getByRole("button", { name: /^add me$/i });
  await user.click(addMe);
  await user.click(addMe).catch(() => {});

  expect(claimSlot).toHaveBeenCalledOnce();
  expect(addMe).toBeDisabled();
  resolve({ ok: true, signupId: "s1", claimToken: "tok-1" });
});
