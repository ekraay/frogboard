import { expect, test } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

function call(url: string, slug: string) {
  return GET(new NextRequest(url), { params: Promise.resolve({ slug }) });
}

test("?on=1 sets the preview cookie and redirects to the board", async () => {
  const res = await call("http://localhost/b/ginza/preview?on=1", "ginza");
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toMatch(/\/b\/ginza$/);
  expect(res.cookies.get("ff_task_board")?.value).toBe("1");
});

test("defaults to on when no query is given", async () => {
  const res = await call("http://localhost/b/ginza/preview", "ginza");
  expect(res.cookies.get("ff_task_board")?.value).toBe("1");
});

test("?on=0 clears the preview cookie and redirects to the board", async () => {
  const res = await call("http://localhost/b/ginza/preview?on=0", "ginza");
  expect(res.headers.get("location")).toMatch(/\/b\/ginza$/);
  const setCookie = res.headers.get("set-cookie") ?? "";
  expect(setCookie).toMatch(/ff_task_board=/);
  expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
});
