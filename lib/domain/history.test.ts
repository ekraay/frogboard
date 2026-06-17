import { describe, expect, test } from "vitest";
import { summarizeAuditEntry, isRevertible } from "@/lib/domain/history";

describe("summarizeAuditEntry", () => {
  test("names the task for create, edit, and delete", () => {
    expect(summarizeAuditEntry({ action: "create", details: { after: { title: "Games" } } }))
      .toBe("Added: Games");
    expect(summarizeAuditEntry({ action: "edit", details: { after: { title: "Games 2" } } }))
      .toBe("Edited: Games 2");
    expect(summarizeAuditEntry({ action: "delete", details: { task: { title: "Old" } } }))
      .toBe("Deleted: Old");
  });
  test("describes a reorder without a title", () => {
    expect(summarizeAuditEntry({ action: "move", details: { from: 1024, to: 2048 } }))
      .toBe("Reordered a task");
  });
  test("uses the stored summary for claim and release", () => {
    expect(summarizeAuditEntry({ action: "claim", details: { summary: "Kenji claimed a slot" } }))
      .toBe("Kenji claimed a slot");
    expect(summarizeAuditEntry({ action: "release", details: { summary: "Kenji was removed" } }))
      .toBe("Kenji was removed");
  });
  test("falls back gracefully when details lack a title", () => {
    expect(summarizeAuditEntry({ action: "create", details: {} })).toBe("Added a task");
    expect(summarizeAuditEntry({ action: "claim", details: {} })).toBe("Signed up");
  });
});

describe("isRevertible", () => {
  test("delete and edit can be reverted", () => {
    expect(isRevertible("delete")).toBe(true);
    expect(isRevertible("edit")).toBe(true);
  });
  test("other actions cannot (yet)", () => {
    for (const a of ["create", "move", "claim", "release", "flag"] as const) {
      expect(isRevertible(a)).toBe(false);
    }
  });
});
