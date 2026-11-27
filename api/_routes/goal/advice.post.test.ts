// POST /api/goal/advice: 요청 형식은 zod 계약(shared/goal/advice.ts)이 막고, 캐시와 생성 경로는 repo 를 가짜로 바꿔 본다. Gemini 는 실패시켜 규칙 폴백으로 돌린다.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { advicePostResponse } from "../../../shared/goal/advice.js";
import { callGoal } from "../../_lib/goal/route.testkit.js";

vi.mock("../../_lib/httpAuth.js", () => ({
  resolveUser: async () => ({ userId: "u1", user: { id: "u1" }, token: "t" }),
}));
vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({}),
}));

const fetchAdviceCacheMock = vi.fn();
const upsertAdviceCacheMock = vi.fn().mockResolvedValue(undefined);
const callTextMock = vi.fn();

vi.mock("../../_lib/goal/repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/goal/repo.js")>()),
  openGoalSession: async () => ({
    allowed: true,
    supabaseAdmin: {},
    profileId: "profile-1",
  }),
  narrowGoalSession: (session: unknown) => session,
  getStudentTimeZone: async () => "Asia/Seoul",
  fetchStudentRow: async () => ({
    onboarded_at: "2026-08-01T00:00:00Z",
    status: "active",
  }),
  fetchAdviceCache: (...args: unknown[]) => fetchAdviceCacheMock(...args),
  upsertAdviceCache: (...args: unknown[]) => upsertAdviceCacheMock(...args),
  fetchStudentStateRow: async () => null,
  fetchSubjectTargets: async () => [],
  fetchRecordsInRange: async () => [],
  fetchTodayRecord: async () => null,
}));
vi.mock("../../_lib/ai/gemini.js", () => ({
  callText: (...args: unknown[]) => callTextMock(...args),
}));
vi.mock("../../_lib/ai/telemetry/trace.js", () => ({
  createAiTrace: () => ({
    flush: async () => undefined,
    annotateLastCall: () => undefined,
  }),
}));

const post = (body: unknown) => callGoal("advice", { method: "POST", body });
const payload = {
  source: "daily",
  origin: "rule",
  probabilitySummary: "요약",
  sections: [{ label: "오늘의 조언", body: "내용" }],
  majorTips: [],
};

describe("POST /api/goal/advice", () => {
  beforeEach(() => {
    fetchAdviceCacheMock.mockReset().mockResolvedValue(null);
    upsertAdviceCacheMock.mockClear();
    callTextMock.mockReset().mockRejectedValue(new Error("gemini down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it.each([
    ["본문이 비었다", {}],
    ["source 가 목록에 없다", { source: "weekly" }],
    ["source 가 문자열이 아니다", { source: 1 }],
  ])("%s 면 400 VALIDATION_FAILED 와 errors 다", async (_n, body) => {
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect((r.body as { errors: unknown[] }).errors.length).toBeGreaterThan(0);
    expect(fetchAdviceCacheMock).not.toHaveBeenCalled();
  });

  it("오늘 캐시가 있으면 생성 없이 그 payload 를 계약으로 돌려준다", async () => {
    fetchAdviceCacheMock.mockResolvedValue({ payload });
    const r = await post({ source: "daily" });
    expect(r.status).toBe(200);
    expect(advicePostResponse.parse(r.body)).toEqual(payload);
    expect(callTextMock).not.toHaveBeenCalled();
    expect(upsertAdviceCacheMock).not.toHaveBeenCalled();
  });

  it("캐시가 없으면 규칙 폴백으로 생성해 저장하고 계약으로 돌려준다", async () => {
    const r = await post({ source: "intake" });
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty("ok");
    expect(advicePostResponse.parse(r.body)).toMatchObject({
      source: "intake",
      origin: "rule",
    });
    expect(upsertAdviceCacheMock).toHaveBeenCalledTimes(1);
  });
});
