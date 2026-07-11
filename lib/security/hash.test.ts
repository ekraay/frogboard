import { afterEach, describe, expect, test, vi } from "vitest";
import { hashExternalId } from "@/lib/security/hash";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hashExternalId", () => {
  test("is deterministic and trims", () => {
    expect(hashExternalId("135291163")).toBe(hashExternalId(" 135291163 "));
  });
  test("differs by input and never returns the raw id", () => {
    const h = hashExternalId("135291163");
    expect(h).not.toBe(hashExternalId("14878458"));
    expect(h).not.toContain("135291163");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  test("throws in production when ROSTER_ID_SALT is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ROSTER_ID_SALT", "");
    expect(() => hashExternalId("135291163")).toThrow(/ROSTER_ID_SALT/);
  });
});
