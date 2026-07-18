import { describe, expect, test } from "vitest";
import { validateClaim, validateRelease, LIMITS } from "@/lib/domain/claim";
import type { SlotInfo } from "@/lib/domain/types";

const open: SlotInfo = { filled: 0, needed: 2, isFull: false };
const full: SlotInfo = { filled: 1, needed: 1, isFull: true };

describe("validateClaim", () => {
  test("accepts a trimmed name and normalizes optional fields", () => {
    const result = validateClaim({ name: "  Kenji  ", group: "Scouts", phone: "555-0100" }, open);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        name: "Kenji", email: null, phone: "555-0100", group: "Scouts", minor: null,
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
    const result = validateClaim({ name: "🐸 Kenji 山田", email: "k@x.com" }, open);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe("🐸 Kenji 山田");
  });
  test("rejects a malformed email", () => {
    expect(validateClaim({ name: "Kenji", email: "not-an-email" }, open)).toEqual({
      ok: false, error: "That email doesn't look right.",
    });
  });
  test("coerces empty optional strings to null", () => {
    const result = validateClaim({ name: "Kenji", email: "", phone: "", minor: true }, open);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBeNull();
      expect(result.value.phone).toBeNull();
      expect(result.value.minor).toBe(true);
    }
  });
  test("rejects an adult with neither email nor phone", () => {
    expect(validateClaim({ name: "Kenji" }, open)).toEqual({
      ok: false, error: "Add an email or phone so we can reach you.",
    });
  });
  test("whitespace-only contact counts as none", () => {
    expect(validateClaim({ name: "Kenji", email: "  ", phone: " " }, open)).toEqual({
      ok: false, error: "Add an email or phone so we can reach you.",
    });
  });
  test("accepts an adult with only a phone", () => {
    const result = validateClaim({ name: "Kenji", phone: "555-0100" }, open);
    expect(result.ok).toBe(true);
  });
  test("accepts a minor with no contact info", () => {
    const result = validateClaim({ name: "Alex", minor: true }, open);
    expect(result).toEqual({
      ok: true,
      value: { name: "Alex", email: null, phone: null, group: null, minor: true },
    });
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
