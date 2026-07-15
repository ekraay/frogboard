import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ShareButton } from "@/components/ShareButton";

test("copies the url and confirms", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  Object.assign(navigator.clipboard, { writeText });
  render(<ShareButton url="https://frogboard.vercel.app/bon-odori" />);
  await user.click(screen.getByRole("button", { name: /share/i }));
  expect(writeText).toHaveBeenCalledWith("https://frogboard.vercel.app/bon-odori");
  expect(await screen.findByText(/copied/i)).toBeInTheDocument();
});
