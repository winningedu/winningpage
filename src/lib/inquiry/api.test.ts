import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { apiFetchMock, getAuthHeaderMock, fetchWithTimeoutMock } = vi.hoisted(
  () => ({
    apiFetchMock: vi.fn(),
    getAuthHeaderMock: vi.fn(),
    fetchWithTimeoutMock: vi.fn(),
  }),
);

vi.mock("../apiFetch", async () => {
  const actual =
    await vi.importActual<typeof import("../apiFetch")>("../apiFetch");
  return {
    ...actual,
    apiFetch: apiFetchMock,
    getAuthHeader: getAuthHeaderMock,
  };
});

vi.mock("../performance/apiClient", async () => {
  const actual = await vi.importActual<
    typeof import("../performance/apiClient")
  >("../performance/apiClient");
  return { ...actual, fetchWithTimeout: fetchWithTimeoutMock };
});

import { ApiFetchTimeoutError } from "../apiFetch";
import { AI_CALL_TIMEOUT_MS } from "../performance/apiClient";
import {
  createPlanReport,
  evaluateReport,
  fetchReports,
  fetchSessionDetail,
  finalizeSession,
  postAssets,
  postSession,
  postSubmission,
  recommendTopics,
} from "./api";
import type { SubmissionSections } from "./types";

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

const SID = "11111111-1111-4111-8111-111111111111";
const SECTIONS: SubmissionSections = {
  I: "a",
  II: "b",
  III: "c",
  IV: "d",
  V: "e",
  VI: "f",
  VII: "g",
  VIII: "h",
};

beforeEach(() => {
  getAuthHeaderMock.mockResolvedValue({ Authorization: "Bearer tok" });
});

afterEach(() => {
  apiFetchMock.mockReset();
  getAuthHeaderMock.mockReset();
  fetchWithTimeoutMock.mockReset();
});

function lastCall(mock: typeof apiFetchMock) {
  return mock.mock.calls[0] as [string, RequestInit];
}

describe("postSession", () => {
  test("resume 은 POST 본문 그대로 보내고 성공 본문을 ok 로 돌려준다", async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, session: null }),
    );
    const result = await postSession({ action: "resume" });
    expect(result).toEqual({
      kind: "ok",
      data: { ok: true, session: null },
    });
    const [url, init] = lastCall(apiFetchMock);
    expect(url).toBe("/api/inquiry/session");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ action: "resume" }));
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok",
      "Content-Type": "application/json",
    });
  });

  test("세션이 없으면 요청 없이 401 UNAUTHENTICATED 오류다", async () => {
    getAuthHeaderMock.mockResolvedValue(null);
    expect(await postSession({ action: "resume" })).toMatchObject({
      kind: "error",
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  test("coded 오류 본문은 code, message, extra 로 풀린다", async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(429, {
        ok: false,
        error: { code: "QUOTA_EXHAUSTED", message: "회차가 없어요." },
        quota: { quotaRemaining: 0 },
      }),
    );
    expect(
      await postSession({
        action: "create",
        info: {
          gradeLabel: "고2",
          semester: 1,
          career: "의사",
          subject: "생명",
        },
      }),
    ).toEqual({
      kind: "error",
      status: 429,
      code: "QUOTA_EXHAUSTED",
      message: "회차가 없어요.",
      extra: { quota: { quotaRemaining: 0 } },
    });
  });

  test("네트워크 실패는 status 0 NETWORK 오류다(예외를 던지지 않는다)", async () => {
    apiFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await postSession({ action: "resume" })).toMatchObject({
      kind: "error",
      status: 0,
      code: "NETWORK",
    });
  });

  test("타임아웃은 kind timeout 이다", async () => {
    apiFetchMock.mockRejectedValue(new ApiFetchTimeoutError());
    expect(await postSession({ action: "resume" })).toEqual({
      kind: "timeout",
    });
  });
});

describe("postAssets, postSubmission", () => {
  test("postAssets 는 /assets 로 본문을 그대로 보낸다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true, assets: [] }));
    const body = { sessionId: SID, items: [], planItemId: null };
    await postAssets(body);
    const [url, init] = lastCall(apiFetchMock);
    expect(url).toBe("/api/inquiry/assets");
    expect(init.body).toBe(JSON.stringify(body));
  });

  test("postSubmission 은 /submission 으로 절 본문을 보낸다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await postSubmission({ sessionId: SID, sections: SECTIONS });
    const [url, init] = lastCall(apiFetchMock);
    expect(url).toBe("/api/inquiry/submission");
    expect(JSON.parse(init.body as string)).toEqual({
      sessionId: SID,
      sections: SECTIONS,
    });
  });
});

describe("조회", () => {
  test("fetchReports 는 쿼리 없이 GET 한다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true, items: [] }));
    await fetchReports();
    const [url, init] = lastCall(apiFetchMock);
    expect(url).toBe("/api/inquiry/reports");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  test("fetchSessionDetail 은 sessionId 쿼리로 GET 한다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await fetchSessionDetail(SID);
    expect(lastCall(apiFetchMock)[0]).toBe(
      `/api/inquiry/reports?sessionId=${SID}`,
    );
  });
});

describe("생성 4개(P4 계약)", () => {
  test("recommendTopics 는 ai 가 true 면 70초 타임아웃 경로를 탄다", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse(200, { ok: true, topics: [] }),
    );
    await recommendTopics({ sessionId: SID, seedTopic: null }, true);
    const [url, init, ms] = fetchWithTimeoutMock.mock.calls[0] as [
      string,
      RequestInit,
      number,
    ];
    expect(url).toBe("/api/inquiry/recommend-topics");
    expect(ms).toBe(AI_CALL_TIMEOUT_MS);
    expect(init.body).toBe(JSON.stringify({ sessionId: SID, seedTopic: null }));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  test("createPlanReport 와 evaluateReport 는 각자 경로를 쓴다", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await createPlanReport({ sessionId: SID, topicId: "t1" }, true);
    await evaluateReport({ sessionId: SID }, true);
    expect(fetchWithTimeoutMock.mock.calls[0]?.[0]).toBe(
      "/api/inquiry/plan-report",
    );
    expect(fetchWithTimeoutMock.mock.calls[1]?.[0]).toBe(
      "/api/inquiry/evaluate-report",
    );
  });

  test("ai 를 false 로 주면 기본 타임아웃 경로를 탄다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await recommendTopics({ sessionId: SID }, false);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });

  test("생성 타임아웃(code TIMEOUT Error)은 kind timeout 이다", async () => {
    fetchWithTimeoutMock.mockRejectedValue(
      Object.assign(new Error("t"), { code: "TIMEOUT" }),
    );
    expect(await evaluateReport({ sessionId: SID }, true)).toEqual({
      kind: "timeout",
    });
  });

  test("생성 실패 extra(attempts, issues, terminal)가 보존된다", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse(502, {
        ok: false,
        error: { code: "GENERATION_FAILED", message: "다시 시도해 주세요." },
        attempts: 3,
        issues: [{ code: "X", message: "m" }],
        terminal: false,
      }),
    );
    expect(
      await createPlanReport({ sessionId: SID, topicId: "t1" }, true),
    ).toMatchObject({
      kind: "error",
      code: "GENERATION_FAILED",
      extra: { attempts: 3, terminal: false },
    });
  });

  test("finalizeSession 은 AI 가 아니라 기본 경로로 /finalize 를 부른다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await finalizeSession({
      sessionId: SID,
      fields: {
        topic: "t",
        concept: "c",
        method: "m",
        result: "r",
        limitation: "l",
        numbers: [],
        sources: [],
      },
    });
    expect(lastCall(apiFetchMock)[0]).toBe("/api/inquiry/finalize");
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
  });
});
