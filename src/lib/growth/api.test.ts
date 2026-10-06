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
import {
  collectCommit,
  collectExtract,
  collectSummary,
  collectUploadUrl,
  fetchPlan,
  fetchReportDetail,
  fetchReports,
  fetchSurveyBootstrap,
  patchPlanItem,
  runReportStep,
  saveSurvey,
} from "./api";

function jsonResponse(status: number, body: unknown) {
  return { status, json: async () => body } as Response;
}

const RID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  getAuthHeaderMock.mockResolvedValue({ Authorization: "Bearer tok" });
});

afterEach(() => {
  apiFetchMock.mockReset();
  getAuthHeaderMock.mockReset();
  fetchWithTimeoutMock.mockReset();
});

describe("fetchSurveyBootstrap", () => {
  test("인증 헤더를 실어 GET 하고 성공 본문을 ok 로 돌려준다", async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, questions: [] }),
    );
    const result = await fetchSurveyBootstrap();
    expect(result).toEqual({ kind: "ok", data: { ok: true, questions: [] } });
    const [url, init] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/growth/survey");
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  test("세션이 없으면 요청 없이 401 UNAUTHENTICATED 오류다", async () => {
    getAuthHeaderMock.mockResolvedValue(null);
    const result = await fetchSurveyBootstrap();
    expect(result).toMatchObject({
      kind: "error",
      status: 401,
      code: "UNAUTHENTICATED",
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  test("서버 실패 본문은 code 와 message 가 담긴 error 다", async () => {
    apiFetchMock.mockResolvedValue(
      jsonResponse(500, { ok: false, code: "INTERNAL", message: "내부 오류" }),
    );
    expect(await fetchSurveyBootstrap()).toEqual({
      kind: "error",
      status: 500,
      code: "INTERNAL",
      message: "내부 오류",
    });
  });

  test("네트워크 실패는 status 0 NETWORK 오류로 정리된다(예외를 던지지 않는다)", async () => {
    apiFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchSurveyBootstrap()).toMatchObject({
      kind: "error",
      status: 0,
      code: "NETWORK",
    });
  });

  test("타임아웃은 kind timeout 이다", async () => {
    apiFetchMock.mockRejectedValue(new ApiFetchTimeoutError());
    expect(await fetchSurveyBootstrap()).toEqual({ kind: "timeout" });
  });

  test("JSON 이 아닌 본문은 INVALID_RESPONSE 오류다", async () => {
    apiFetchMock.mockResolvedValue({
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    } as unknown as Response);
    expect(await fetchSurveyBootstrap()).toMatchObject({
      kind: "error",
      status: 502,
      code: "INVALID_RESPONSE",
    });
  });
});

describe("saveSurvey", () => {
  test("reportId 와 answers 를 JSON 으로 POST 한다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await saveSurvey({ reportId: RID, answers: { q1: "답", q2: null } });
    const [url, init] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/growth/survey");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer tok",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      reportId: RID,
      answers: { q1: "답", q2: null },
    });
  });

  test("reportId 가 없으면 바디에서도 뺀다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await saveSurvey({ answers: { q1: "답" } });
    const init = apiFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ answers: { q1: "답" } });
  });
});

describe("collect", () => {
  beforeEach(() => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse(200, { ok: true }));
  });

  test("collectSummary 는 action summary 로 POST 한다", async () => {
    await collectSummary({ track: "고2" });
    const init = apiFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      action: "summary",
      track: "고2",
    });
  });

  test("collectCommit 은 action commit 으로 POST 한다", async () => {
    await collectCommit({ track: "고3", current: { grade: 3, semester: 1 } });
    const init = apiFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      action: "commit",
      track: "고3",
      current: { grade: 3, semester: 1 },
    });
  });

  test("collectUploadUrl 은 upload 메타를 action upload-url 로 보낸다", async () => {
    const upload = {
      fileName: "a.pdf",
      mimeType: "application/pdf",
      byteSize: 10,
      gradeLabel: "고1" as const,
      semester: 1 as const,
      consent: true as const,
    };
    await collectUploadUrl(upload);
    const init = apiFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      action: "upload-url",
      upload,
    });
  });

  test("collectExtract 는 AI 호출이라 70초 타임아웃 경로를 쓴다", async () => {
    await collectExtract(RID);
    expect(apiFetchMock).not.toHaveBeenCalled();
    const [url, init, timeoutMs] = fetchWithTimeoutMock.mock.calls[0] as [
      string,
      RequestInit,
      number,
    ];
    expect(url).toBe("/api/growth/collect");
    expect(timeoutMs).toBe(70000);
    expect(JSON.parse(String(init.body))).toEqual({
      action: "extract",
      uploadId: RID,
    });
  });

  test("AI 호출의 TIMEOUT 에러는 kind timeout 이다", async () => {
    const error = Object.assign(new Error("timeout"), { code: "TIMEOUT" });
    fetchWithTimeoutMock.mockRejectedValue(error);
    expect(await collectExtract(RID)).toEqual({ kind: "timeout" });
  });
});

describe("runReportStep", () => {
  test("reportId 와 step 을 70초 타임아웃 경로로 POST 한다", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await runReportStep({ reportId: RID, step: 3 });
    const [url, init, timeoutMs] = fetchWithTimeoutMock.mock.calls[0] as [
      string,
      RequestInit,
      number,
    ];
    expect(url).toBe("/api/growth/report");
    expect(timeoutMs).toBe(70000);
    expect(JSON.parse(String(init.body))).toEqual({ reportId: RID, step: 3 });
  });

  test("단계 실패 응답의 attempts 와 terminal 이 extra 로 남는다", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse(409, {
        ok: false,
        code: "ATTEMPTS_EXHAUSTED",
        message: "상한",
        attempts: 10,
        terminal: true,
      }),
    );
    expect(await runReportStep({ reportId: RID, step: 2 })).toMatchObject({
      kind: "error",
      code: "ATTEMPTS_EXHAUSTED",
      extra: { attempts: 10, terminal: true },
    });
  });
});

describe("조회 계열", () => {
  beforeEach(() => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
  });

  test("fetchReports 는 목록 URL 을 GET 한다", async () => {
    await fetchReports();
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe("/api/growth/reports");
  });

  test("fetchReportDetail 은 reportId 쿼리를 붙인다", async () => {
    await fetchReportDetail(RID);
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe(
      `/api/growth/reports?reportId=${RID}`,
    );
  });

  test("fetchReportDetail 은 view=parent 도 붙일 수 있다", async () => {
    await fetchReportDetail(RID, "parent");
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe(
      `/api/growth/reports?reportId=${RID}&view=parent`,
    );
  });

  test("fetchPlan 은 reportId 가 없으면 쿼리 없이 부른다", async () => {
    await fetchPlan();
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe("/api/growth/plan");
  });

  test("fetchPlan 은 reportId 가 있으면 쿼리로 보낸다", async () => {
    await fetchPlan(RID);
    expect(apiFetchMock.mock.calls[0]?.[0]).toBe(
      `/api/growth/plan?reportId=${RID}`,
    );
  });
});

describe("patchPlanItem", () => {
  test("액션을 그대로 PATCH 바디로 보낸다", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await patchPlanItem({ action: "check", itemId: RID, done: true });
    const [url, init] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/growth/plan/item");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      action: "check",
      itemId: RID,
      done: true,
    });
  });
});
