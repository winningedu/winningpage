// normalizeBasicInfo의 이전 주제 검증과 저장 형식, 세션 라우트의 요청 형식 검증.

import { describe, expect, test, vi } from "vitest";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import { authOnlyDb, paidDb, validationFailedFor } from "./route.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import { app } from "../app.js";
import { normalizeBasicInfo } from "./session.js";

const route = { app, path: "/api/performance/session" };
const BASIC = {
  gradeLabel: "고1",
  semester: "1학기",
  subjectGroup: "과학",
  subject: "물리",
  careerGoal: "연구원",
};

describe("session GET 요청 형식", () => {
  test.each([
    ["sessionId 없음", undefined],
    ["sessionId 가 uuid 아님", "x"],
  ])("%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다", async (_name, id) => {
    state.db = authOnlyDb();
    const res = await callRoute(route, {
      query: id === undefined ? {} : { sessionId: id },
    });
    expect(validationFailedFor(res, "sessionId")).toBe(true);
  });
});

describe("session POST 요청 형식", () => {
  test.each([
    ["action 없음", {}, "action"],
    ["action 을 모름", { action: "zzz" }, "action"],
    [
      "basicInfo 가 객체 아님",
      { action: "create", basicInfo: "x" },
      "basicInfo",
    ],
    [
      "basicInfo 필수 필드가 비어 있음",
      { action: "create", basicInfo: { ...BASIC, subject: "  " } },
      "subject",
    ],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { method: "POST", body });
      expect(validationFailedFor(res, field)).toBe(true);
    },
  );

  test("이전 주제가 6줄이면 400 INVALID_BASIC_INFO 를 그대로 낸다", async () => {
    state.db = paidDb();
    const res = await callRoute(route, {
      method: "POST",
      body: {
        action: "create",
        basicInfo: { ...BASIC, previousTopic: "1\n2\n3\n4\n5\n6" },
      },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: "INVALID_BASIC_INFO",
      detail: "basicInfo 형식이 올바르지 않습니다.",
    });
  });

  test("이용권이 없으면 403 NO_ENTITLEMENT 이다", async () => {
    state.db = {
      ...authOnlyDb(),
      rpc: async () => ({ data: [], error: null }),
      from: () => {
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = () => q;
        q.in = () => q;
        q.order = () => q;
        q.limit = () => q;
        q.maybeSingle = async () => ({ data: null, error: null });
        // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더 thenable 모킹
        q.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(ok);
        return q;
      },
    };
    const res = await callRoute(route, {
      method: "POST",
      body: { action: "create" },
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "NO_ENTITLEMENT" });
  });
});

function basicInfo(previousTopic: string) {
  return {
    gradeLabel: "고1",
    semester: "1학기",
    subjectGroup: "과학",
    subject: "물리",
    careerGoal: "연구원",
    previousTopic,
  };
}

describe("normalizeBasicInfo 이전 주제", () => {
  test("6줄이면 INVALID_BASIC_INFO로 거절한다", () => {
    expect(normalizeBasicInfo(basicInfo("1\n2\n3\n4\n5\n6"))).toEqual({
      ok: false,
      code: "INVALID_BASIC_INFO",
    });
  });

  test("한 줄이 81자이면 INVALID_BASIC_INFO로 거절한다", () => {
    expect(normalizeBasicInfo(basicInfo("가".repeat(81)))).toEqual({
      ok: false,
      code: "INVALID_BASIC_INFO",
    });
  });

  test("3줄은 통과하고 빈 줄을 뺀 채 줄바꿈으로 이어 저장한다", () => {
    const result = normalizeBasicInfo(basicInfo(" a \n\nb\n  \nc "));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.columns.previous_topic).toBe("a\nb\nc");
  });

  test("비어 있으면 null로 저장한다", () => {
    const result = normalizeBasicInfo(basicInfo(" \n "));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.columns.previous_topic).toBeNull();
  });
});
