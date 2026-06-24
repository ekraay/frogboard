import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const push = vi.fn();
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/ginza-2026",
  useSearchParams: () => params,
}));

import { FilterBar } from "@/components/FilterBar";

const options = {
  date: [{ value: "2026-07-25", label: "Saturday, Jul 25" }],
  group: ["Scouts", "YAO"], category: ["Games"], location: ["Gym"],
};

beforeEach(() => { push.mockReset(); params = new URLSearchParams(); });

test("choosing a group pushes the filtered URL", async () => {
  const user = userEvent.setup();
  render(<FilterBar options={options} />);
  await user.selectOptions(screen.getByLabelText(/group/i), "Scouts");
  expect(push).toHaveBeenCalledWith("/ginza-2026?group=Scouts");
});

test("Clear appears when a facet is set and resets the path", async () => {
  params = new URLSearchParams("group=Scouts");
  const user = userEvent.setup();
  render(<FilterBar options={options} />);
  await user.click(screen.getByRole("button", { name: /clear/i }));
  expect(push).toHaveBeenCalledWith("/ginza-2026");
});
