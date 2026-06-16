import { expect, test } from "vitest";
import { boardDisplayName } from "@/lib/domain/displayName";

test("non-minor names are shown in full", () => {
  expect(boardDisplayName("Alex Tanaka", false)).toBe("Alex Tanaka");
  expect(boardDisplayName("Alex Tanaka", null)).toBe("Alex Tanaka");
  expect(boardDisplayName("Alex Tanaka", undefined)).toBe("Alex Tanaka");
});

test("a minor's last word becomes an initial", () => {
  expect(boardDisplayName("Alex Tanaka", true)).toBe("Alex T.");
});

test("a minor with middle words keeps all but the last in full", () => {
  expect(boardDisplayName("mary jane tanaka", true)).toBe("mary jane T.");
});

test("a single-word minor name has no last name to hide", () => {
  expect(boardDisplayName("Kenji", true)).toBe("Kenji");
});

test("surrounding and repeated whitespace is normalized first", () => {
  expect(boardDisplayName("  Alex   Tanaka  ", true)).toBe("Alex T.");
});

test("an empty or blank name stays empty", () => {
  expect(boardDisplayName("", true)).toBe("");
  expect(boardDisplayName("   ", true)).toBe("");
});
