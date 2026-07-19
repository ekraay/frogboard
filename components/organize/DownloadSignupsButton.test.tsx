import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { DownloadSignupsButton } from "@/components/organize/DownloadSignupsButton";

test("links straight to the event's CSV route", () => {
  render(<DownloadSignupsButton eventId="e1" />);
  const link = screen.getByRole("link", { name: /download signups/i });
  expect(link).toHaveAttribute("href", "/organize/e1/signups.csv");
});
