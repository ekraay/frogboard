import { afterEach, expect, test, vi } from "vitest";
import { flagEnabled } from "@/lib/flags";

// A cookie jar stub shaped like Next's ReadonlyRequestCookies: get(name) -> { value } | undefined.
function jar(cookies: Record<string, string>) {
  return { get: (n: string) => (n in cookies ? { value: cookies[n] } : undefined) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test("env FLAG_TASK_BOARD=1 turns the flag on", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("FLAG_TASK_BOARD", "1");
  expect(flagEnabled("task_board", { cookies: jar({}) })).toBe(true);
});

test("env FLAG_TASK_BOARD=true turns the flag on", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("FLAG_TASK_BOARD", "true");
  expect(flagEnabled("task_board", { cookies: jar({}) })).toBe(true);
});

test("the preview cookie ff_task_board=1 turns the flag on", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("FLAG_TASK_BOARD", "");
  expect(flagEnabled("task_board", { cookies: jar({ ff_task_board: "1" }) })).toBe(true);
});

test("neither env nor cookie, in production, stays off", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("FLAG_TASK_BOARD", "");
  expect(flagEnabled("task_board", { cookies: jar({}) })).toBe(false);
});

test("a non-truthy cookie value does not turn it on", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("FLAG_TASK_BOARD", "");
  expect(flagEnabled("task_board", { cookies: jar({ ff_task_board: "0" }) })).toBe(false);
});

test("outside production the flag defaults on", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("FLAG_TASK_BOARD", "");
  expect(flagEnabled("task_board", { cookies: jar({}) })).toBe(true);
});
