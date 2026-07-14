import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";

const claimSlot = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/actions/signups", () => ({
  claimSlot: (fd: FormData) => claimSlot(fd),
  releaseSignup: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ClaimFields } from "@/components/ClaimFields";

beforeEach(() => {
  claimSlot.mockReset();
  refresh.mockReset();
  window.localStorage.clear();
});

test("renders the fields open, with no collapsed 'Hop to it' button", () => {
  render(<ClaimFields taskId="t1" />);
  expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /hop to it/i })).not.toBeInTheDocument();
});

test("a successful claim calls the action, stores the token, then refreshes the board", async () => {
  claimSlot.mockResolvedValue({ ok: true, signupId: "s1", claimToken: "tok-1" });
  const user = userEvent.setup();
  render(<ClaimFields taskId="t1" />);

  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));

  const fd = claimSlot.mock.calls[0][0] as FormData;
  expect(fd.get("name")).toBe("Kenji");
  expect(fd.get("taskId")).toBe("t1");
  expect(JSON.parse(window.localStorage.getItem("frogboard.claims")!)).toEqual({ s1: "tok-1" });
  expect(refresh).toHaveBeenCalledOnce();
});

test("prefills name and group from a remembered profile", () => {
  window.localStorage.setItem("frogboard.profile", JSON.stringify({ name: "Kenji", group: "Scouts" }));
  render(<ClaimFields taskId="t1" />);
  expect(screen.getByLabelText(/your name/i)).toHaveValue("Kenji");
  expect(screen.getByLabelText(/group/i)).toHaveValue("Scouts");
});

test("calls onClaimed after a successful claim", async () => {
  claimSlot.mockResolvedValue({ ok: true, signupId: "s1", claimToken: "tok-1" });
  const onClaimed = vi.fn();
  const user = userEvent.setup();
  render(<ClaimFields taskId="t1" onClaimed={onClaimed} />);
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));
  expect(onClaimed).toHaveBeenCalledOnce();
});

test("shows a Cancel button only when onCancel is given", async () => {
  const onCancel = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<ClaimFields taskId="t1" />);
  expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();

  rerender(<ClaimFields taskId="t1" onCancel={onCancel} />);
  await user.click(screen.getByRole("button", { name: /cancel/i }));
  expect(onCancel).toHaveBeenCalledOnce();
});

test("surfaces the action error and does not refresh", async () => {
  claimSlot.mockResolvedValue({ ok: false, error: "This task is already full." });
  const user = userEvent.setup();
  render(<ClaimFields taskId="t1" />);
  await user.type(screen.getByLabelText(/your name/i), "Kenji");
  await user.click(screen.getByRole("button", { name: /^add me$/i }));
  expect(await screen.findByText("This task is already full.")).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});
