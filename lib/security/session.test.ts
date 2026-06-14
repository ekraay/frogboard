import { afterEach, describe, expect, test, vi } from "vitest";
import { passwordMatches, sessionToken, isValidSession } from "@/lib/security/session";

afterEach(() => vi.unstubAllEnvs());

describe("passwordMatches", () => {
  test("accepts the configured password", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
    expect(passwordMatches("lily-pad-42")).toBe(true);
  });
  test("rejects a wrong password (any length)", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
    expect(passwordMatches("nope")).toBe(false);
    expect(passwordMatches("lily-pad-42-but-longer")).toBe(false);
  });
  test("throws when ORGANIZER_PASSWORD is unset", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "");
    expect(() => passwordMatches("x")).toThrow(/ORGANIZER_PASSWORD/);
  });
});

describe("session tokens", () => {
  test("round-trips and rejects tampering", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "lily-pad-42");
    const token = sessionToken();
    expect(isValidSession(token)).toBe(true);
    expect(isValidSession(token + "x")).toBe(false);
    expect(isValidSession(undefined)).toBe(false);
  });
  test("rotating the password invalidates old tokens", () => {
    vi.stubEnv("ORGANIZER_PASSWORD", "old");
    const token = sessionToken();
    vi.stubEnv("ORGANIZER_PASSWORD", "new");
    expect(isValidSession(token)).toBe(false);
  });
});
