// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { apiFetchMock, getAuthHeaderMock, fetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  getAuthHeaderMock: vi.fn(),
  fetchMock: vi.fn(),
}));

// ky 클라이언트(@/lib/http/client)는 세션의 토큰을 supabase 에서 읽는다.
vi.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "u1" }, access_token: "tok" } },
      }),
    },
  },
}));

vi.mock("../apiFetch", async () => {
  const actual =
    await vi.importActual<typeof import("../apiFetch")>("../apiFetch");
  return {
    ...actual,
    apiFetch: apiFetchMock,
    getAuthHeader: getAuthHeaderMock,
  };
});

import { TimeoutError } from "ky";
import { ApiFetchTimeoutError } from "../apiFetch";
import {
  analyzeResolveConflict,
  analyzeRun,
  analyzeSave,
  buildReport,
  createSession,
  discardSession,
  fetchEntry,
  fetchReport,
  fetchSessionDetail,
  finalizeSession,
  manualLogsDelete,
  manualLogsList,
  manualLogsSetIncluded,
  manualLogsUpdate,
  manualLogsUpload,
  pickList,
  pickManual,
  pickSelect,
  updateSession,
  verifySession,
  writeConfirmFeeling,
  writeEdit,
  writeGenerate,
  writeRepickEvidence,
} from "./api";

const json = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as Response;

// Node 의 Request 는 상대 URL 을 해석하지 못해서 브라우저처럼 문서 주소 기준으로 풀어 준다.
function stubBrowserRequest() {
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
}

beforeEach(() => {
  getAuthHeaderMock.mockResolvedValue({ Authorization: "Bearer tok" });
  stubBrowserRequest();
  // 요청 본문은 ky 가 읽고 나면 다시 읽을 수 없어서 호출 시점에 복사해 둔다.
  vi.stubGlobal("fetch", async (request: Request) => {
    bodies.set(request, await request.clone().text());
    return fetchMock(request);
  });
});
afterEach(() => {
  apiFetchMock.mockReset();
  getAuthHeaderMock.mockReset();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function lastCall() {
  const [path, init] = apiFetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    path,
    init,
    body: init.body ? JSON.parse(init.body as string) : null,
  };
}

// 옮긴 엔드포인트(reports, session)는 ky 클라이언트로 부른다. 진짜 ky 와 계약 스키마를 쓰고 fetch 만 가짜로 바꾼다.
function lastRequest() {
  const [request] = fetchMock.mock.calls.at(-1) as [Request];
  return request;
}
const bodies = new WeakMap<Request, string>();
function lastBody() {
  return JSON.parse(bodies.get(lastRequest()) ?? "null");
}
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const problemResponse = (status: number, body: Record<string, unknown>) =>
  new Response(
    JSON.stringify({
      type: "about:blank",
      title: "Conflict",
      status,
      ...body,
    }),
    { status, headers: { "content-type": "application/problem+json" } },
  );

const ENTRY = {
  entry: {
    quota: null,
    allowed: true,
    activityCount: 0,
    openSession: null,
    growth: null,
    profile: null,
    replyResent: 0,
    academicYearDefault: 2026,
    timeZone: "Asia/Seoul",
  },
  sessions: [],
};

const SESSION = {
  id: "s1",
  status: "draft",
  currentStep: 1,
  progress: {},
  academicYear: 2026,
  gradeLabel: "고2",
  semester: 1,
  area: "subject",
  subject: "생명과학",
  activityName: null,
  schoolPrompt: null,
  teacherNote: null,
  targetChars: 500,
  targetCharsMode: "with_space",
  career: { career: null, department: null, universities: [] },
  growthApplied: false,
  growthSnapshot: null,
  planItemId: null,
  replyPending: null,
  regenerateCount: 0,
  terminal: null,
  lastActivityAt: "2026-10-01T00:00:00Z",
  completedAt: null,
};

describe("fetchEntry", () => {
  test("인증과 시간대 헤더를 실어 GET 하고 성공 본문을 ok 로 돌려준다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(ENTRY));
    const result = await fetchEntry();
    const request = lastRequest();
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/api/selfeval/reports");
    expect(request.headers.get("authorization")).toBe("Bearer tok");
    expect(request.headers.get("x-time-zone")).toBeTruthy();
    expect(result).toEqual({ kind: "ok", data: ENTRY });
  });

  test("로그인 헤더가 없으면 요청 없이 401 UNAUTHENTICATED 를 돌려준다", async () => {
    getAuthHeaderMock.mockResolvedValue(null);
    const result = await fetchEntry();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      kind: "error",
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  test("타임아웃은 timeout, 네트워크 실패는 status 0 NETWORK 로 돌려준다", async () => {
    fetchMock.mockImplementationOnce(async (request: Request) => {
      throw new TimeoutError(request);
    });
    expect(await fetchEntry()).toEqual({ kind: "timeout" });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await fetchEntry()).toMatchObject({
      kind: "error",
      status: 0,
      code: "NETWORK",
    });
  });

  test("problem 본문은 code, message(detail), extra(확장 멤버)로 풀어 준다", async () => {
    fetchMock.mockResolvedValue(
      problemResponse(409, {
        detail: "작성 중",
        code: "SESSION_OPEN",
        openSessionId: "s9",
      }),
    );
    expect(await fetchEntry()).toEqual({
      kind: "error",
      status: 409,
      code: "SESSION_OPEN",
      message: "작성 중",
      extra: { openSessionId: "s9" },
    });
  });

  test("확장 멤버가 없으면 extra 를 싣지 않는다", async () => {
    fetchMock.mockResolvedValue(
      problemResponse(404, { detail: "없어요", code: "SESSION_NOT_FOUND" }),
    );
    const result = await fetchEntry();
    expect(result).toEqual({
      kind: "error",
      status: 404,
      code: "SESSION_NOT_FOUND",
      message: "없어요",
    });
  });

  test("계약과 맞지 않는 성공 본문은 INVALID_RESPONSE 다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ sessions: "x" }));
    expect(await fetchEntry()).toMatchObject({
      kind: "error",
      code: "INVALID_RESPONSE",
    });
  });
});

describe("세션 상세", () => {
  test("sessionId 를 쿼리로 보낸다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await fetchSessionDetail("s 1");
    const url = new URL(lastRequest().url);
    expect(url.pathname + url.search).toBe(
      "/api/selfeval/reports?sessionId=s+1",
    );
  });

  test("계약대로의 상세 본문을 ok 로 돌려준다", async () => {
    const detail = {
      session: SESSION,
      activities: [],
      memos: [],
      reports: {
        generation: null,
        edited: null,
        verification: null,
        final: null,
      },
      regenerationsLeft: 3,
      current: null,
    };
    fetchMock.mockResolvedValue(jsonResponse(detail));
    expect(await fetchSessionDetail("s1")).toEqual({
      kind: "ok",
      data: detail,
    });
  });
});

describe("세션 생성, 수정, 파기", () => {
  test("create 는 action 과 입력 필드를 한 바디로 보낸다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ session: SESSION }));
    const result = await createSession({ schoolPrompt: "문항" } as never);
    const request = lastRequest();
    expect(new URL(request.url).pathname).toBe("/api/selfeval/session");
    expect(request.method).toBe("POST");
    expect(await lastBody()).toEqual({
      action: "create",
      schoolPrompt: "문항",
    });
    expect(result).toEqual({ kind: "ok", data: { session: SESSION } });
  });

  test("update 는 sessionId 와 patch 를 보낸다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ session: SESSION }));
    await updateSession("s1", { growthApplied: false });
    expect(await lastBody()).toEqual({
      action: "update",
      sessionId: "s1",
      growthApplied: false,
    });
  });

  test("discard 는 sessionId 만 보내고 빈 객체를 ok 로 받는다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const result = await discardSession("s1");
    expect(await lastBody()).toEqual({ action: "discard", sessionId: "s1" });
    expect(result).toEqual({ kind: "ok", data: {} });
  });

  test("검증 실패(400 VALIDATION_FAILED)의 errors 는 extra 로 온다", async () => {
    fetchMock.mockResolvedValue(
      problemResponse(400, {
        detail: "요청 값이 올바르지 않아요.",
        code: "VALIDATION_FAILED",
        errors: [{ path: "gradeLabel", message: "Invalid" }],
      }),
    );
    expect(await createSession({} as never)).toMatchObject({
      kind: "error",
      status: 400,
      code: "VALIDATION_FAILED",
      extra: { errors: [{ path: "gradeLabel", message: "Invalid" }] },
    });
  });
});

describe("활동 선택", () => {
  test("list, select, manual 은 같은 엔드포인트에 action 으로 갈린다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await pickList("s1");
    expect(lastCall().path).toBe("/api/selfeval/pick-records");
    expect(lastCall().body).toEqual({ sessionId: "s1", action: "list" });
    await pickSelect("s1", "a1", ["a2"]);
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "select",
      coreId: "a1",
      supportIds: ["a2"],
    });
    await pickManual("s1", { activityName: "x" } as never);
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "manual",
      input: { activityName: "x" },
    });
  });
});

describe("분석, 생성, 검증, 최종 저장", () => {
  test("분석은 action 으로 run, save, resolve-conflict 가 갈린다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await analyzeRun("s1");
    expect(lastCall().path).toBe("/api/selfeval/analyze");
    expect(lastCall().body).toEqual({ sessionId: "s1", action: "run" });
    await analyzeSave("s1", { result: "고친 값" });
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "save",
      edits: { result: "고친 값" },
    });
    await analyzeResolveConflict("s1", 1, "b");
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "resolve-conflict",
      index: 1,
      choice: "b",
    });
  });

  test("생성은 generate, edit, confirm-feeling 이 /write 하나로 간다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await writeGenerate("s1");
    expect(lastCall().path).toBe("/api/selfeval/write");
    expect(lastCall().body).toEqual({ sessionId: "s1", action: "generate" });
    await writeEdit("s1", ["a", "b"]);
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "edit",
      paragraphs: ["a", "b"],
    });
    await writeConfirmFeeling("s1", "p1s2");
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "confirm-feeling",
      sentenceId: "p1s2",
    });
  });

  test("근거 다시 고르기는 repick-evidence 로 문장 id 와 picks 를 보낸다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await writeRepickEvidence("s1", "p1s2", [{ refId: "a1", item: "method" }]);
    expect(lastCall().path).toBe("/api/selfeval/write");
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      action: "repick-evidence",
      sentenceId: "p1s2",
      picks: [{ refId: "a1", item: "method" }],
    });
  });

  test("검증은 sessionId 만, 최종 저장은 승격 7항목과 과제 완료 여부를 보낸다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await verifySession("s1");
    expect(lastCall().path).toBe("/api/selfeval/verify");
    expect(lastCall().body).toEqual({ sessionId: "s1" });
    const promoted = {
      topic: "t",
      concept: "c",
      method: "m",
      result: "r",
      limitation: "l",
      numbers: [],
      sources: [],
    };
    await finalizeSession("s1", promoted, true);
    expect(lastCall().path).toBe("/api/selfeval/finalize");
    expect(lastCall().body).toEqual({
      sessionId: "s1",
      promoted,
      fulfillsPlanItem: true,
    });
  });
});

describe("manualLogs", () => {
  const SID = "s1";

  test("list 는 manual-logs 로 POST 한다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true, memos: [] }));
    const r = await manualLogsList(SID);
    expect(r).toEqual({ kind: "ok", data: { ok: true, memos: [] } });
    const c = lastCall();
    expect(c.path).toBe("/api/selfeval/manual-logs");
    expect(c.body).toEqual({ sessionId: SID, action: "list" });
  });

  test("upload 는 글이나 파일 하나를 싣는다", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true, memos: [] }));
    await manualLogsUpload(SID, { text: "글" });
    expect(lastCall().body).toEqual({
      sessionId: SID,
      action: "upload",
      text: "글",
    });
  });

  test("update, set-included, delete 본문", async () => {
    apiFetchMock.mockResolvedValue(json(200, { ok: true }));
    await manualLogsUpdate(SID, "m1", {
      writtenAt: "2026-04-03",
      confirmed: true,
    });
    expect(lastCall().body).toEqual({
      sessionId: SID,
      action: "update",
      memoId: "m1",
      writtenAt: "2026-04-03",
      confirmed: true,
    });
    await manualLogsSetIncluded(SID, "m1", false);
    expect(lastCall().body).toEqual({
      sessionId: SID,
      action: "set-included",
      memoId: "m1",
      included: false,
    });
    await manualLogsDelete(SID, "m1");
    expect(lastCall().body).toEqual({
      sessionId: SID,
      action: "delete",
      memoId: "m1",
    });
  });

  test("서버 오류 코드와 메시지를 그대로 돌려준다", async () => {
    apiFetchMock.mockResolvedValue(
      json(422, { ok: false, code: "RECORD_BOOK_DETECTED", message: "거절" }),
    );
    const r = await manualLogsUpload(SID, { text: "x" });
    expect(r).toMatchObject({
      kind: "error",
      status: 422,
      code: "RECORD_BOOK_DETECTED",
      message: "거절",
    });
  });
});

describe("리포트", () => {
  const REPORT = {
    sessionId: "s1",
    finalRevision: 1,
    status: "ready",
    attempts: 1,
    builtAt: "2026-11-23T00:00:00.000Z",
    payload: { version: 1, composeMissing: false },
  };

  test("조회는 sessionId 를 쿼리로 GET 하고 ok 없는 본문을 돌려준다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ report: REPORT }));
    const result = await fetchReport("s 1");
    const request = lastRequest();
    expect(request.method).toBe("GET");
    const url = new URL(request.url);
    expect(url.pathname).toBe("/api/selfeval/report");
    expect(url.searchParams.get("sessionId")).toBe("s 1");
    expect(result).toEqual({ kind: "ok", data: { report: REPORT } });
  });

  test("취소 신호를 ky 로 넘긴다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ report: REPORT }));
    const controller = new AbortController();
    controller.abort();
    expect(await fetchReport("s1", controller.signal)).toMatchObject({
      kind: "error",
    });
  });

  test("저장본이 없으면 404 REPORT_NOT_FOUND 를 code 로 돌려준다", async () => {
    fetchMock.mockResolvedValue(
      problemResponse(404, {
        detail: "아직 만들어진 리포트가 없어요.",
        code: "REPORT_NOT_FOUND",
      }),
    );
    expect(await fetchReport("s1")).toEqual({
      kind: "error",
      status: 404,
      code: "REPORT_NOT_FOUND",
      message: "아직 만들어진 리포트가 없어요.",
    });
  });

  test("만들기는 sessionId 만 POST 하고 reused 를 함께 받는다", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ reused: true, report: REPORT }));
    const result = await buildReport("s1");
    const request = lastRequest();
    expect(request.method).toBe("POST");
    expect(new URL(request.url).pathname).toBe("/api/selfeval/report");
    expect(lastBody()).toEqual({ sessionId: "s1" });
    expect(result).toEqual({
      kind: "ok",
      data: { reused: true, report: REPORT },
    });
  });

  test("만들기의 타임아웃과 REPORT_BUSY 409 를 그대로 돌려준다", async () => {
    fetchMock.mockImplementationOnce(async (request: Request) => {
      throw new TimeoutError(request);
    });
    expect(await buildReport("s1")).toEqual({ kind: "timeout" });
    fetchMock.mockResolvedValue(
      problemResponse(409, { detail: "만드는 중", code: "REPORT_BUSY" }),
    );
    expect(await buildReport("s1")).toMatchObject({
      kind: "error",
      status: 409,
      code: "REPORT_BUSY",
    });
  });

  test("계약과 맞지 않는 본문은 INVALID_RESPONSE 다", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ report: { ...REPORT, status: "x" } }),
    );
    expect(await fetchReport("s1")).toMatchObject({
      kind: "error",
      code: "INVALID_RESPONSE",
    });
  });
});
