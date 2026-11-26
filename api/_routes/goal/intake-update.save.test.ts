// POST /api/goal/intake-update 저장 경로 회귀 테스트(prod 23502).
// Postgres 는 upsert 의 INSERT 후보 행에 NOT NULL 을 ON CONFLICT 보다 먼저 검사한다.
// 부분 행을 upsert 하면 school_type, grade 가 비어 매번 500 이 났다. 가짜 Supabase 가
// 그 검사를 흉내 내고, 저장은 profile_id 로 거는 update 여야 함을 고정한다.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Call = {
  op: "upsert" | "update";
  values: Row;
  filters: [string, unknown][];
};

const NOT_NULL_NO_DEFAULT = ["profile_id", "school_type", "grade"];

const existingRow: Row = {
  profile_id: "profile-1",
  school_type: "일반고",
  grade: "고3",
  onboarded_at: "2026-09-01T00:00:00Z",
  ideal_university: "연세대",
  ideal_department: "경영학과",
  min_university: "고려대",
  min_department: "경영학과",
  naesin_scores: null,
  mock_exam_scores: null,
};

const calls: Call[] = [];

function fakeStudentsTable() {
  let call: Call;
  const builder = {
    upsert(values: Row) {
      call = { op: "upsert", values, filters: [] };
      calls.push(call);
      return builder;
    },
    update(values: Row) {
      call = { op: "update", values, filters: [] };
      calls.push(call);
      return builder;
    },
    eq(column: string, value: unknown) {
      call.filters.push([column, value]);
      return builder;
    },
    select() {
      return builder;
    },
    async single() {
      if (call.op === "upsert") {
        const missing = NOT_NULL_NO_DEFAULT.find((c) => call.values[c] == null);
        if (missing) {
          return {
            data: null,
            error: {
              code: "23502",
              message: `null value in column "${missing}" of relation "goal_students" violates not-null constraint`,
            },
          };
        }
      }
      const matches = call.filters.every(([c, v]) => existingRow[c] === v);
      if (!matches) return { data: null, error: { code: "PGRST116" } };
      return { data: { ...existingRow, ...call.values }, error: null };
    },
  };
  return builder;
}

const fakeAdmin = {
  from(table: string) {
    if (table !== "goal_students") throw new Error(`unexpected table ${table}`);
    return fakeStudentsTable();
  },
};

const appendProbabilityLogMock = vi.fn();
const regenerateDirectionReportsMock = vi.fn();

vi.mock("../../_lib/goal/repo.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../_lib/goal/repo.js")>();
  return {
    ...actual,
    openGoalSession: vi.fn().mockResolvedValue({
      allowed: true,
      supabaseAdmin: fakeAdmin,
      profileId: "profile-1",
    }),
    narrowGoalSession: (session: unknown) => session,
    fetchStudentRow: vi.fn().mockResolvedValue(existingRow),
    appendProbabilityLog: (...args: unknown[]) =>
      appendProbabilityLogMock(...args),
    fetchStudentStateRow: vi.fn().mockResolvedValue(null),
    fetchProfileName: vi.fn().mockResolvedValue("학생"),
  };
});

vi.mock("./intake.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./intake.js")>();
  return {
    ...actual,
    computeEngineDerivedFields: vi.fn().mockResolvedValue({
      cuts: { idealNaesin: 2, idealJungsi: 90, minNaesin: 3, minJungsi: 80 },
      missing: [],
      hasSusiCuts: true,
      hasJungsiCuts: true,
      state: { rates: {}, schoolCutType: "general" },
      baseProbsForStorage: {
        idealSusi: 40,
        idealJungsi: 30,
        minSusi: 60,
        minJungsi: 50,
      },
    }),
    regenerateDirectionReports: (...args: unknown[]) =>
      regenerateDirectionReportsMock(...args),
  };
});

const targetBody = {
  section: "target",
  upperUniversity: { university: "서울대", department: "경영학과" },
  lowerUniversity: { university: "연세대", department: "경영학과" },
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

describe("intake-update 저장", () => {
  beforeEach(() => {
    calls.length = 0;
    appendProbabilityLogMock.mockReset().mockResolvedValue(true);
    regenerateDirectionReportsMock.mockReset().mockResolvedValue(undefined);
  });

  it("목표 대학을 고치면 200 과 바뀐 학생 정보를 돌려준다", async () => {
    const res = await callRoute(targetBody);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0]?.[0];
    expect(body.ok).toBe(true);
    expect(body.student.targets.ideal).toMatchObject({
      university: "서울대",
      department: "경영학과",
    });
  });

  it("insert 후보 행 없이 profile_id 로 거는 update 로 저장한다", async () => {
    await callRoute(targetBody);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.op).toBe("update");
    expect(calls[0]?.filters).toEqual([["profile_id", "profile-1"]]);
    expect(calls[0]?.values).not.toHaveProperty("profile_id");
    expect(calls[0]?.values).toMatchObject({
      ideal_university: "서울대",
      min_university: "연세대",
    });
  });

  it("저장 뒤 확률 스냅샷(score_update)과 학습방향 리포트를 저장된 행으로 남긴다", async () => {
    await callRoute(targetBody);

    expect(appendProbabilityLogMock).toHaveBeenCalledWith(
      fakeAdmin,
      "profile-1",
      { idealSusi: 40, idealJungsi: 30, minSusi: 60, minJungsi: 50 },
      "score_update",
    );
    expect(regenerateDirectionReportsMock).toHaveBeenCalledWith(
      fakeAdmin,
      "profile-1",
      expect.objectContaining({ grade: "고3", school_type: "일반고" }),
    );
  });
});
