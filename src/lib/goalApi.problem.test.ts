// @vitest-environment jsdom
// goalApi 가 Hono 로 옮긴 /api/goal/* 의 응답을 예전과 같은 kind 로 읽는지 고정한다.
// 성공 본문에는 ok 가 없고, 실패는 problem 이며 예전 본문의 reason 과 확장 키가 같은 이름으로 실린다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchGoalReport,
  fetchGoalSchedules,
  submitDailyRecord,
} from "./goalApi";

// ky 클라이언트(./http/client)는 세션의 토큰을 supabase 에서 읽는다. 진짜 ky 를 쓰고 fetch 만 가짜로 바꾼다.
vi.mock("./supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "u1" }, access_token: "tok" } },
      }),
    },
  },
}));
vi.mock("./apiFetch", async () => ({
  ...(await vi.importActual<typeof import("./apiFetch")>("./apiFetch")),
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
}));

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  fetchMock.mockReset();
  // Node 의 Request 는 상대 URL 을 해석하지 못해서 브라우저처럼 문서 주소 기준으로 풀어 준다.
  const NodeRequest = Request;
  vi.stubGlobal(
    "Request",
    class extends NodeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(
          typeof input === "string" ? new URL(input, location.href) : input,
          init,
        );
      }
    },
  );
  vi.stubGlobal("fetch", (request: Request) => fetchMock(request));
});
afterEach(() => vi.unstubAllGlobals());

/** 성공은 JSON, 실패는 서버처럼 problem 본문으로 답한다. 부를 때마다 새 Response 를 만든다. */
function respond(status: number, body: Record<string, unknown>) {
  fetchMock.mockImplementation(async () =>
    status < 400
      ? new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        })
      : new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Error",
            status,
            detail: "x",
            ...body,
          }),
          { status, headers: { "content-type": "application/problem+json" } },
        ),
  );
}

describe("goalApi 와 problem 응답", () => {
  it("ok 없는 성공 본문을 success 로 읽는다", async () => {
    const schedule = {
      id: 1,
      title: "수행평가",
      category: "exam",
      dueDate: "2026-12-01",
      memo: "",
    };
    respond(200, { schedules: [schedule] });
    expect(await fetchGoalSchedules()).toEqual({
      kind: "success",
      schedules: [schedule],
    });
  });

  it("학부모가 연결되지 않은 자녀를 열면 code NOT_LINKED 로 not-linked 다", async () => {
    respond(403, { code: "NOT_LINKED" });
    expect(
      await fetchGoalReport("weekly", undefined, undefined, "child"),
    ).toEqual({ kind: "not-linked" });
  });

  it("쿨다운 409 는 reason 과 확장 키(submittedAt, unlocksAt)로 읽는다", async () => {
    respond(409, {
      code: "COOLDOWN",
      reason: "cooldown",
      submittedAt: "2026-11-27T01:00:00Z",
      unlocksAt: "2026-11-27T13:00:00Z",
    });
    expect(
      await submitDailyRecord({
        bodyCondition: "normal",
        tasks: [],
        studyHours: 3,
      } as never),
    ).toMatchObject({
      kind: "cooldown",
      submittedAt: "2026-11-27T01:00:00Z",
      unlocksAt: "2026-11-27T13:00:00Z",
    });
  });
});
