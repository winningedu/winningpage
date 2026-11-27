// GET /api/goal/advice 핸들러 테스트, QA 3차 행70("오늘의 조언을 항시 표시").
// 조언 기능 이전에 온보딩한 학생은 캐시 행이 없어 빈 상태만 보였다. GET이 두 소스 모두
// 비어 있을 때 intake 조언을 즉석 생성해 캐시하는지 고정한다. Gemini(callText)는 실패시켜
// 규칙 기반 폴백 경로로 돌린다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callGoal } from "../../_lib/goal/route.testkit.js";

vi.mock("../../_lib/httpAuth.js", () => ({
  resolveUser: async () => ({ userId: "u1", user: { id: "u1" }, token: "t" }),
}));
vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({}),
}));

const fetchLatestAdviceCacheMock = vi.fn();
const upsertAdviceCacheMock = vi.fn().mockResolvedValue(undefined);
const callTextMock = vi.fn();
const getStudentTimeZoneMock = vi.fn();

vi.mock("../../_lib/goal/repo.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../_lib/goal/repo.js")>();
  return {
    ...actual,
    openGoalSession: async () => ({
      allowed: true,
      supabaseAdmin: {},
      profileId: "profile-1",
    }),
    narrowGoalSession: (session: unknown) => session,
    getStudentTimeZone: (...args: unknown[]) => getStudentTimeZoneMock(...args),
    fetchStudentRow: async () => ({
      onboarded_at: "2026-08-01T00:00:00Z",
      status: "active",
    }),
    fetchLatestAdviceCache: (...args: unknown[]) =>
      fetchLatestAdviceCacheMock(...args),
    fetchAdviceCache: async () => null,
    upsertAdviceCache: (...args: unknown[]) => upsertAdviceCacheMock(...args),
    fetchStudentStateRow: async () => null,
    fetchSubjectTargets: async () => [],
    fetchRecordsInRange: async () => [],
    fetchTodayRecord: async () => null,
  };
});

vi.mock("../../_lib/ai/gemini.js", () => ({
  callText: (...args: unknown[]) => callTextMock(...args),
}));

vi.mock("../../_lib/ai/telemetry/trace.js", () => ({
  createAiTrace: () => ({
    flush: async () => undefined,
    annotateLastCall: () => undefined,
  }),
}));

async function callGet() {
  const { body } = await callGoal("advice");
  return body as Record<string, unknown>;
}

describe("GET /api/goal/advice", () => {
  beforeEach(() => {
    fetchLatestAdviceCacheMock.mockReset();
    upsertAdviceCacheMock.mockClear();
    callTextMock.mockReset().mockRejectedValue(new Error("gemini down"));
    getStudentTimeZoneMock.mockReset().mockResolvedValue("Asia/Seoul");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it.each([
    ["Asia/Seoul", "2026-11-23"],
    ["America/Los_Angeles", "2026-11-22"],
  ])(
    "캐시가 intake와 daily 모두 없으면 Gemini 실패 시 규칙 폴백으로 intake를 즉석 생성해 저장한다(%s)",
    async (timeZone, localDay) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-22T15:30:00Z"));
      getStudentTimeZoneMock.mockResolvedValue(timeZone);
      fetchLatestAdviceCacheMock.mockResolvedValue(null);

      const body = await callGet();
      vi.useRealTimers();

      expect(upsertAdviceCacheMock).toHaveBeenCalledTimes(1);
      expect(upsertAdviceCacheMock.mock.calls[0]?.[1]).toMatchObject({
        profile_id: "profile-1",
        source: "intake",
        generated_for: localDay,
        origin: "rule",
      });
      expect(body).not.toHaveProperty("ok");
      expect(body.intake).not.toBeNull();
      expect(body.daily).toBeNull();
      expect(body.intakeFor).toBe(localDay);
      expect(body.dailyFor).toBeNull();
    },
  );

  it("intake 행만 있어도 생성과 저장 없이 그 행의 payload를 그대로 돌려준다", async () => {
    const payload = { todayAdvice: "저장된 조언" };
    fetchLatestAdviceCacheMock.mockImplementation(
      async (_db: unknown, _id: string, source: string) =>
        source === "intake" ? { payload, generated_for: "2026-10-28" } : null,
    );

    const body = await callGet();

    expect(upsertAdviceCacheMock).not.toHaveBeenCalled();
    expect(callTextMock).not.toHaveBeenCalled();
    // 응답은 JSON 으로 오가므로 같은 객체가 아니라 같은 내용이다.
    expect(body.intake).toEqual(payload);
    expect(body.intakeFor).toBe("2026-10-28");
    expect(body.daily).toBeNull();
  });
});
