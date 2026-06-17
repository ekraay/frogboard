import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { HistoryTime, formatHistoryTime } from "@/components/organize/HistoryTime";

test("formatHistoryTime renders the moment in the given timezone", () => {
  // 23:30 UTC is the next morning in Tokyo, the prior evening in New York.
  const iso = "2026-06-17T23:30:00Z";
  expect(formatHistoryTime(iso, "Asia/Tokyo")).toBe("Jun 18, 8:30 AM");
  expect(formatHistoryTime(iso, "America/New_York")).toBe("Jun 17, 7:30 PM");
});

test("emits a machine-readable <time> carrying the exact ISO timestamp", () => {
  const iso = "2026-06-17T15:00:00.000Z";
  render(<HistoryTime iso={iso} />);
  expect(screen.getByText(/Jun/).closest("time")).toHaveAttribute("dateTime", iso);
});

test("after mount, shows the moment in the viewer's local timezone", () => {
  const iso = "2026-06-17T23:30:00Z";
  render(<HistoryTime iso={iso} />);
  // Testing Library flushes effects, so the local (default-zone) format is shown.
  expect(screen.getByText(/Jun/)).toHaveTextContent(formatHistoryTime(iso));
});
