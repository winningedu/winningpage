// POST /api/goal/intake-update 핸들러 회귀 테스트 — 성적관리(grades.ts)가 naesin_scores/
// mock_exam_scores 안 최상위 `records` 배열에 쌓은 회차를, 내 정보 수정이 컬럼을 새 객체로
// 다시 쓰면서 지우지 않는지 고정한다. DB I/O(repo.js)와 확률 계산(intake.js)은 mock하고,
// upsertStudentRow에 실제로 넘어간 행만 본다.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertStudentRowMock = vi.fn();
const fetchStudentRowMock = vi.fn();

vi.mock("../../_lib/goal/repo.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../_lib/goal/repo.js")>();
  return {
    ...actual,
    openGoalSession: vi.fn().mockResolvedValue({
      allowed: true,
      supabaseAdmin: {},
      profileId: "profile-1",
    }),
    narrowGoalSession: (session: unknown) => session,
    fetchStudentRow: (...args: unknown[]) => fetchStudentRowMock(...args),
    upsertStudentRow: (...args: unknown[]) => upsertStudentRowMock(...args),
    appendProbabilityLog: vi.fn().mockResolvedValue(undefined),
    fetchStudentStateRow: vi.fn().mockResolvedValue(null),
    fetchProfileName: vi.fn().mockResolvedValue(null),
    buildStudentPayload: vi.fn().mockReturnValue({}),
  };
});

vi.mock("./intake.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./intake.js")>();
  return {
    ...actual,
    computeEngineDerivedFields: vi.fn().mockResolvedValue({
      cuts: {},
      missing: [],
      hasSusiCuts: true,
      hasJungsiCuts: true,
      state: { rates: {} },
      baseProbsForStorage: {},
    }),
    regenerateDirectionReports: vi.fn().mockResolvedValue(undefined),
  };
});

const rounds = [
  { id: "r1", date: "2026-03-01", subjects: { 국어: 2 } },
  { id: "r2", date: "2026-06-01", subjects: { 국어: 1 } },
];

function studentRow(overrides: Record<string, unknown> = {}) {
  return {
    onboarded_at: "2026-09-01T00:00:00Z",
    grade: "고3",
    naesin_scores: { lastExam: "g3_s1mid", overall: 3, records: rounds },
    mock_exam_scores: { lastRound: "", track: "", rounds: {}, records: rounds },
    ...overrides,
  };
}

const naesinBody = {
  section: "naesin",
  naesin: {
    lastExam: "g3_s1mid",
    overall: "2",
    priorNaesinGrade: "",
    exams: {},
  },
};
async function callRoute(body: unknown) {
  const { default: handler } = await import("./intake-update.js");
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  await handler(
    { method: "POST", body } as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return res;
}

function savedUpdate(): Record<string, unknown> {
  expect(upsertStudentRowMock).toHaveBeenCalledTimes(1);
  return upsertStudentRowMock.mock.calls[0][1];
}

describe("intake-update records 보존", () => {
  beforeEach(() => {
    upsertStudentRowMock.mockReset().mockResolvedValue({});
    fetchStudentRowMock.mockReset().mockResolvedValue(studentRow());
  });

  it("내신을 고쳐도 기존 naesin_scores.records를 같은 내용·순서로 유지한다", async () => {
    const res = await callRoute(naesinBody);

    expect(res.status).toHaveBeenCalledWith(200);
    const update = savedUpdate();
    expect(update.naesin_scores).toMatchObject({ overall: 2, records: rounds });
    expect((update.naesin_scores as { records: unknown }).records).toEqual(
      rounds,
    );
  });
});
