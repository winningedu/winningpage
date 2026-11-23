// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockApiFetch = vi.fn();
const mockGetAuthHeader = vi.fn();

vi.mock("./apiFetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getAuthHeader: (...args: unknown[]) => mockGetAuthHeader(...args),
}));

import { submitDiagnosisV3 } from "./diagnosisSubmitApi";

const ATTEMPT_ID = "98af95da-47bf-4cee-8a2e-7d70d07fb1c9";
const ANSWERS = { q1: 3 };

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockGetAuthHeader.mockReset();
});

describe("submitDiagnosisV3", () => {
  test("attemptId와 answers를 /api/diagnosis/submit 에 POST 하고 결과를 돌려준다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        schemaVersion: "2026-11-v3",
        payload: { pages: [] },
      }),
    );
    const result = await submitDiagnosisV3({
      attemptId: ATTEMPT_ID,
      answers: ANSWERS,
    });
    expect(result).toEqual({
      ok: true,
      schemaVersion: "2026-11-v3",
      payload: { pages: [] },
    });
    const [url, init] = mockApiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/diagnosis/submit");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer t" });
    expect(JSON.parse(String(init.body))).toEqual({
      attemptId: ATTEMPT_ID,
      answers: ANSWERS,
    });
  });

  test("세션이 없으면 보내지 않는다", async () => {
    mockGetAuthHeader.mockResolvedValue(null);
    const result = await submitDiagnosisV3({
      attemptId: ATTEMPT_ID,
      answers: ANSWERS,
    });
    expect(result).toEqual({ ok: false, reason: "no-session" });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test("서버 거절은 코드와 함께 rejected 다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockResolvedValue(
      jsonResponse(400, { ok: false, error: { code: "INVALID_ANSWERS" } }),
    );
    const result = await submitDiagnosisV3({
      attemptId: ATTEMPT_ID,
      answers: ANSWERS,
    });
    expect(result).toEqual({
      ok: false,
      reason: "rejected",
      code: "INVALID_ANSWERS",
    });
  });

  test("fetch 자체가 실패하면 network 다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockRejectedValue(new Error("offline"));
    const result = await submitDiagnosisV3({
      attemptId: ATTEMPT_ID,
      answers: ANSWERS,
    });
    expect(result).toEqual({ ok: false, reason: "network" });
  });
});
