// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const mockApiFetch = vi.fn();
const mockGetAuthHeader = vi.fn();

vi.mock("./apiFetch", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getAuthHeader: (...args: unknown[]) => mockGetAuthHeader(...args),
}));

const mockUniversities = vi.fn();
const mockDepartments = vi.fn();
vi.mock("./diagnosisAdmissionMasterQueries", () => ({
  fetchAdmissionUniversities: () => mockUniversities(),
  fetchAdmissionDepartments: (key: string) => mockDepartments(key),
}));

import { NO_SUBJECT_REFLECTION_LABEL } from "./diagnosisAdmissionCascade";
import {
  resolveAdmissionTarget,
  submitDiagnosisV3,
} from "./diagnosisSubmitApi";

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
    expect(result).toMatchObject({
      ok: false,
      reason: "rejected",
      code: "INVALID_ANSWERS",
    });
  });

  test("401 은 세션 만료라 no-session 이다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    mockApiFetch.mockResolvedValue(
      jsonResponse(401, {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." },
      }),
    );
    const result = await submitDiagnosisV3({
      attemptId: ATTEMPT_ID,
      answers: ANSWERS,
    });
    expect(result).toEqual({ ok: false, reason: "no-session" });
  });

  test("거절 결과는 상태 코드, 서버 메시지, 문항 오류 목록을 함께 준다", async () => {
    mockGetAuthHeader.mockResolvedValue({ Authorization: "Bearer t" });
    const errors = [{ question: "q13", reason: "invalid" }];
    mockApiFetch.mockResolvedValue(
      jsonResponse(400, {
        ok: false,
        error: {
          code: "INVALID_ANSWERS",
          message: "답안이 올바르지 않습니다.",
        },
        errors,
      }),
    );
    const result = await submitDiagnosisV3({
      attemptId: ATTEMPT_ID,
      answers: ANSWERS,
    });
    expect(result).toEqual({
      ok: false,
      reason: "rejected",
      status: 400,
      code: "INVALID_ANSWERS",
      message: "답안이 올바르지 않습니다.",
      errors,
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

describe("resolveAdmissionTarget", () => {
  const CASCADE = {
    university: "연세대",
    department: "경영학과",
    admissionType: "교과",
    detailType: "추천형",
  };

  beforeEach(() => {
    mockUniversities.mockResolvedValue({
      data: [{ university_key: "yonsei", university_name: "연세대" }],
      error: null,
    });
    mockDepartments.mockResolvedValue({
      data: [{ department_key: "biz", department_name: "경영학과" }],
      error: null,
    });
  });

  test("16번 선택 이름을 입결 자연키로 바꾼다", async () => {
    expect(await resolveAdmissionTarget(CASCADE)).toEqual({
      ok: true,
      target: {
        universityKey: "yonsei",
        departmentKey: "biz",
        mainTrack: "교과",
        admissionTrack: "추천형",
        subjectReflection: null,
      },
    });
    expect(mockDepartments).toHaveBeenCalledWith("yonsei");
  });

  test("반영교과 전체는 null, 고른 값은 그대로다", async () => {
    expect(
      await resolveAdmissionTarget({
        ...CASCADE,
        subjectReflection: NO_SUBJECT_REFLECTION_LABEL,
      }),
    ).toMatchObject({ ok: true, target: { subjectReflection: null } });
    expect(
      await resolveAdmissionTarget({
        ...CASCADE,
        subjectReflection: "국수영",
      }),
    ).toMatchObject({ ok: true, target: { subjectReflection: "국수영" } });
  });

  test("고른 이름이 목록에 없으면 실패다", async () => {
    mockDepartments.mockResolvedValue({ data: [], error: null });
    expect(await resolveAdmissionTarget(CASCADE)).toEqual({ ok: false });
  });

  test("대학 목록 조회가 실패하면 실패다", async () => {
    mockUniversities.mockResolvedValue({ data: [], error: new Error("x") });
    expect(await resolveAdmissionTarget(CASCADE)).toEqual({ ok: false });
  });

  test("학과 목록 조회가 실패하면 고른 이름이 있어도 실패다", async () => {
    mockDepartments.mockResolvedValue({
      data: [{ department_key: "biz", department_name: "경영학과" }],
      error: new Error("x"),
    });
    expect(await resolveAdmissionTarget(CASCADE)).toEqual({ ok: false });
  });
});
