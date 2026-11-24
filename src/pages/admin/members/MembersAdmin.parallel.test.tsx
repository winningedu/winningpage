// 회원 상세(W3): 탭 데이터 요청이 회원 응답을 기다리지 않고 주소의 id로 함께 나간다.

import "@testing-library/jest-dom/vitest";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { renderMembers } from "./testHelpers";

const KIM = {
  id: "p-student",
  name: "김학생",
  member_type: "student",
  created_at: "2026-01-01T00:00:00Z",
};

const MEMBER = "admin/members/p-student";

function deferred() {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// 경로마다 응답을 미뤄 두고, 언제 요청이 나갔는지 경로로 기록한다.
function serveDeferred(paths: string[]) {
  const pending = new Map(paths.map((path) => [path, deferred()]));
  const fixed: Record<string, unknown> = {
    "admin/tenant-options": { items: [] },
  };
  http.get.mockImplementation((path: string) => ({
    json: async (schema?: { parse: (value: unknown) => unknown }) => {
      const wait = pending.get(path);
      const value = wait ? await wait.promise : fixed[path];
      if (value === undefined) throw new Error(`응답이 없는 경로: ${path}`);
      return schema ? schema.parse(value) : value;
    },
  }));
  return pending;
}

const requested = () => http.get.mock.calls.map((call) => call[0] as string);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  http.get.mockReset();
});

test("기본 탭의 연결 정보 요청은 회원 응답 전에 함께 나간다", async () => {
  const pending = serveDeferred([MEMBER, `${MEMBER}/links`]);
  renderMembers("/admin/members/p-student");

  await waitFor(() => expect(requested()).toContain(MEMBER));
  await waitFor(() => expect(requested()).toContain(`${MEMBER}/links`));

  pending.get(MEMBER)?.resolve(KIM);
  pending.get(`${MEMBER}/links`)?.resolve({ items: [] });
  expect(await screen.findByText("기본 정보")).toBeInTheDocument();
  expect(requested().filter((p) => p === `${MEMBER}/links`)).toHaveLength(1);
});

test("주소의 탭이 결제내역이면 주문 요청이 회원 응답 전에 함께 나간다", async () => {
  const pending = serveDeferred([MEMBER, `${MEMBER}/orders`]);
  renderMembers("/admin/members/p-student/pay");

  await waitFor(() => expect(requested()).toContain(MEMBER));
  await waitFor(() => expect(requested()).toContain(`${MEMBER}/orders`));
  expect(requested()).not.toContain(`${MEMBER}/links`);

  pending.get(MEMBER)?.resolve(KIM);
  pending.get(`${MEMBER}/orders`)?.resolve({ items: [] });
  expect(await screen.findByText("결제 내역이 없습니다.")).toBeInTheDocument();
  expect(requested().filter((p) => p === `${MEMBER}/orders`)).toHaveLength(1);
});
