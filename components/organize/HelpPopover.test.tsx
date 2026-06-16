import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { HelpPopover } from "@/components/organize/HelpPopover";

test("is collapsed by default and opens on click", async () => {
  const user = userEvent.setup();
  render(<HelpPopover label="How it works">Each line becomes a task.</HelpPopover>);
  const trigger = screen.getByRole("button", { name: /how it works/i });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(/each line becomes a task/i)).toBeNull();
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/each line becomes a task/i)).toBeInTheDocument();
});

test("clicking the trigger again closes it", async () => {
  const user = userEvent.setup();
  render(<HelpPopover label="Help">Body text here</HelpPopover>);
  const trigger = screen.getByRole("button", { name: /help/i });
  await user.click(trigger);
  expect(screen.getByText(/body text here/i)).toBeInTheDocument();
  await user.click(trigger);
  expect(screen.queryByText(/body text here/i)).toBeNull();
});

test("Escape closes it", async () => {
  const user = userEvent.setup();
  render(<HelpPopover label="Help">Body text here</HelpPopover>);
  await user.click(screen.getByRole("button", { name: /help/i }));
  expect(screen.getByText(/body text here/i)).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByText(/body text here/i)).toBeNull();
});

test("clicking outside closes it", async () => {
  const user = userEvent.setup();
  render(<div><HelpPopover label="Help">Body text here</HelpPopover><button>outside</button></div>);
  await user.click(screen.getByRole("button", { name: /help/i }));
  expect(screen.getByText(/body text here/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /outside/i }));
  expect(screen.queryByText(/body text here/i)).toBeNull();
});
