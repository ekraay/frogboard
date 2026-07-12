import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi, beforeEach } from "vitest";

const releaseSignup = vi.fn();
const organizerReleaseSignup = vi.fn();
vi.mock("@/app/actions/signups", () => ({
  releaseSignup: (id: string, token: string | null) => releaseSignup(id, token),
  organizerReleaseSignup: (id: string) => organizerReleaseSignup(id),
  claimSlot: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { Claimant } from "@/components/Claimant";

beforeEach(() => {
  releaseSignup.mockReset();
  organizerReleaseSignup.mockReset();
  window.localStorage.clear();
});

test("hides remove when this device does not own the signup", () => {
  render(<Claimant signupId="s1" name="Kenji" group="Scouts" />);
  expect(screen.queryByRole("button", { name: /remove kenji/i })).toBeNull();
});

test("shows remove and passes the stored token when this device owns the signup", async () => {
  window.localStorage.setItem("frogboard.claims", JSON.stringify({ s1: "tok-1" }));
  releaseSignup.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<Claimant signupId="s1" name="Kenji" group="Scouts" />);

  await user.click(screen.getByRole("button", { name: /remove kenji/i }));
  expect(releaseSignup).toHaveBeenCalledWith("s1", "tok-1");
});

test("an organizer sees a remove control on a claim they do not own", () => {
  render(<Claimant signupId="s1" name="Sam" group={null} isOrganizer />);
  expect(screen.getByRole("button", { name: /remove sam/i })).toBeInTheDocument();
});
