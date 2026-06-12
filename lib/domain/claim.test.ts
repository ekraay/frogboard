import { describe, expect, test } from "vitest";
import { validateClaim, validateRelease, LIMITS } from "@/lib/domain/claim";
import type { SlotInfo } from "@/lib/domain/types";

const open: SlotInfo = { filled: 0, needed: 2, isFull: false };
const full: SlotInfo = { filled: 1, needed: 1, isFull: true };

describe("validateClaim", () => {
  test("accepts a trimmed name and normalizes optional fields", () => {
    const result = validateClaim({ name: "  Kenji  ", group: "Scouts" }, open);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        name: "Kenji", email: null, phone: null, group: "Scouts", minor: null,
      });
    }
  });
  test("rejects an empty name", () => {
    expect(validateClaim({ name: "   " }, open)).toEqual({
      ok: false, error: "Please enter a name.",
    });
  });
  test("rejects when the task is already full", () => {
    expect(validateClaim({ name: "Kenji" }, full)).toEqual({
      ok: false, error: "This task is already full.",
    });
  });
  test("rejects when the honeypot is filled (bot)", () => {
    expect(validateClaim({ name: "Kenji", honeypot: "anything" }, open)).toEqual({
      ok: false, error: "Could not submit. Please try again.",
    });
  });
  test("rejects a name over the max length", () => {
    const longName = "x".repeat(LIMITS.name + 1);
    expect(validateClaim({ name: longName }, open)).toEqual({
      ok: false, error: "Name is too long.",
    });
  });
  test("preserves a Unicode name (emoji + CJK) intact", () => {
    // Exploratory charter: youth/family names may include emoji and kanji.
    const result = validateClaim({ name: "🐸 Kenji 山田" }, open);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("🐸 Kenji 山田");
  });
  test("rejects a malformed email", () => {
    expect(validateClaim({ name: "Kenji", email: "not-an-email" }, open)).toEqual({
      ok: false, error: "That email doesn't look right.",
    });
  });
  test("coerces empty optional strings to null", () => {
    const result = validateClaim({ name: "Kenji", email: "", phone: "" }, open);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBeNull();
      expect(result.value.phone).toBeNull();
    }
  });
});

describe("validateRelease", () => {
  test("accepts when the token matches", () => {
    expect(validateRelease({ claimToken: "abc" }, "abc")).toEqual({ ok: true });
  });
  test("rejects when the token is missing", () => {
    expect(validateRelease({ claimToken: "abc" }, null)).toEqual({
      ok: false, error: "You can only remove your own signup.",
    });
  });
  test("rejects when the token does not match", () => {
    expect(validateRelease({ claimToken: "abc" }, "xyz")).toEqual({
      ok: false, error: "You can only remove your own signup.",
    });
  });
});
