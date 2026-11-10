// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockApiFetch = vi.fn();
const mockGetAuthHeader = vi.fn();

vi.mock("./apiFetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getAuthHeader: (...args: unknown[]) => mockGetAuthHeader(...args),
}));

import {
  ensureDiagnosisReportSaved,
  markDiagnosisReportSaved,
  saveDiagnosisReport,
} from "./diagnosisReportApi";

const INPUT = {
  attemptId: "98af95da-47bf-4cee-8a2e-7d70d07fb1c9",
  snapshot: { meta: { schemaVersion: "2026-08-fd2" } },
  payload: { student: { name: "홍길동" } },
  schemaVersion: "2026-08-fd2",
  diagnosedAt: "2026-09-02T00:00:00.000Z",
};

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
  window.sessionStorage.clear();
});

describe("saveDiagnosisReport", () => {
  test("세션이 없으면 네트워크를 타지 않고 no-session을 돌려준다", async () => {
    mockGetAuthHeader.mockResolvedValue(null);
    const result = await saveDiagnosisReport(INPUT);
    expect(result).toEqual({ ok: false, reason: "no-session" });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  test("서버가 4xx/5xx를 응답하면 rejected를 돌려준다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockResolvedValue(
      jsonResponse(403, { error: { code: "FORBIDDEN" } }),
    );
    const result = await saveDiagnosisReport(INPUT);
    expect(result).toEqual({ ok: false, reason: "rejected" });
  });

  test("200이어도 ok:true가 아니면 rejected로 취급한다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockResolvedValue(jsonResponse(200, { ok: false }));
    const result = await saveDiagnosisReport(INPUT);
    expect(result).toEqual({ ok: false, reason: "rejected" });
  });

  test("fetch 자체가 던지면 network를 돌려준다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockRejectedValue(new Error("network down"));
    const result = await saveDiagnosisReport(INPUT);
    expect(result).toEqual({ ok: false, reason: "network" });
  });

  test("성공하면 ok:true를 돌려주고 저장 완료 플래그를 남긴다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    const result = await saveDiagnosisReport(INPUT);
    expect(result).toEqual({ ok: true });
    expect(
      window.sessionStorage.getItem(
        `winning.freeDiagnosis.reportSaved:${INPUT.attemptId}`,
      ),
    ).toBe("1");
  });
});

describe("ensureDiagnosisReportSaved", () => {
  test("플래그가 이미 있으면 네트워크를 타지 않고 ok:true를 돌려준다", async () => {
    markDiagnosisReportSaved(INPUT.attemptId);
    const result = await ensureDiagnosisReportSaved(INPUT);
    expect(result).toEqual({ ok: true });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockGetAuthHeader).not.toHaveBeenCalled();
  });

  test("플래그가 없으면 saveDiagnosisReport를 태운다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    const result = await ensureDiagnosisReportSaved(INPUT);
    expect(result).toEqual({ ok: true });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
