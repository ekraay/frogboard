import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const signIn = vi.fn();
vi.mock("@/app/actions/organize", () => ({ signIn: (fd: FormData) => signIn(fd) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { SignInForm } from "@/components/organize/SignInForm";

beforeEach(() => { signIn.mockReset(); refresh.mockReset(); });

test("submits the password and refreshes on success", async () => {
  signIn.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<SignInForm />);
  await user.type(screen.getByLabelText(/password/i), "lily-pad-42");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  expect(signIn).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalled();
});

test("captures the organizer's name in the submission", async () => {
  signIn.mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<SignInForm />);
  await user.type(screen.getByLabelText(/your name/i), "Aya");
  await user.type(screen.getByLabelText(/password/i), "lily-pad-42");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  const submitted = signIn.mock.calls[0][0] as FormData;
  expect(submitted.get("name")).toBe("Aya");
});

test("shows the error on a wrong password", async () => {
  signIn.mockResolvedValue({ ok: false, error: "That password doesn't match." });
  const user = userEvent.setup();
  render(<SignInForm />);
  await user.type(screen.getByLabelText(/password/i), "nope");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  expect(await screen.findByText("That password doesn't match.")).toBeInTheDocument();
});
