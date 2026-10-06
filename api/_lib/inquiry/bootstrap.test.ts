// 심화탐구 세션 응답 조립의 판단 부분 테스트(부록 A 1번).
import { describe, expect, it } from "vitest";
import {
  asGradeLabel,
  buildHandoffForSession,
  decideCreate,
  validateSessionBody,
} from "./bootstrap.js";
import type { GrowthReportRow, PlanItemRow } from "./growthHandoff.js";

const info = {
  gradeLabel: "고2",
  semester: 1,
  career: "의사",
  subject: "생명과학",
};

describe("validateSessionBody", () => {
  it("resume 은 info 없이 통과한다", () => {
    expect(validateSessionBody({ action: "resume" })).toEqual({
      ok: true,
      body: { action: "resume" },
    });
  });

  it("create 는 info 를 trim 해 돌려준다", () => {
    const result = validateSessionBody({
      action: "create",
      info: { ...info, career: "  의사 ", subject: " 생명과학  " },
    });
    expect(result).toEqual({ ok: true, body: { action: "create", info } });
  });

  it("본문이 객체가 아니거나 action 이 다르면 거절한다", () => {
    for (const body of [null, "x", [], {}, { action: "delete" }]) {
      expect(validateSessionBody(body).ok).toBe(false);
    }
  });

  it("create 에 info 가 없거나 객체가 아니면 거절한다", () => {
    expect(validateSessionBody({ action: "create" }).ok).toBe(false);
    expect(validateSessionBody({ action: "create", info: "x" }).ok).toBe(false);
  });

  it("gradeLabel 은 고1, 고2, 고3 만 허용한다", () => {
    for (const gradeLabel of ["졸업", "중3", "", 2, null]) {
      expect(
        validateSessionBody({ action: "create", info: { ...info, gradeLabel } })
          .ok,
      ).toBe(false);
    }
  });

  it("semester 는 1 또는 2 만 허용한다", () => {
    for (const semester of [0, 3, "1", null, 1.5]) {
      expect(
        validateSessionBody({ action: "create", info: { ...info, semester } })
          .ok,
      ).toBe(false);
    }
    expect(
      validateSessionBody({ action: "create", info: { ...info, semester: 2 } })
        .ok,
    ).toBe(true);
  });

  it("career 와 subject 는 trim 뒤 1자 이상 80자 이하다", () => {
    for (const key of ["career", "subject"] as const) {
      for (const value of ["", "   ", "가".repeat(81), 3, null]) {
        expect(
          validateSessionBody({
            action: "create",
            info: { ...info, [key]: value },
          }).ok,
        ).toBe(false);
      }
      expect(
        validateSessionBody({
          action: "create",
          info: { ...info, [key]: "가".repeat(80) },
        }).ok,
      ).toBe(true);
    }
  });

  it("거절 사유는 문장으로 준다", () => {
    const result = validateSessionBody({
      action: "create",
      info: { ...info, semester: 9 },
    });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.reason.length > 0).toBe(true);
  });
});

describe("decideCreate", () => {
  const typed = { ...info, gradeLabel: "고2" as const, semester: 1 as const };
  const open = (over = {}) => ({
    id: "s1",
    designReportId: null,
    subject: "생명과학",
    assetCount: 0,
    ...over,
  });

  it("열린 세션이 없고 잔여가 있으면 새로 만든다", () => {
    expect(
      decideCreate({ openSession: null, quotaRemaining: 2, info: typed }),
    ).toEqual({ kind: "create" });
  });

  it("무제한(null)도 새로 만든다", () => {
    expect(
      decideCreate({ openSession: null, quotaRemaining: null, info: typed }),
    ).toEqual({ kind: "create" });
  });

  it("열린 세션이 없고 잔여가 0 이면 막는다", () => {
    expect(
      decideCreate({ openSession: null, quotaRemaining: 0, info: typed }),
    ).toEqual({ kind: "quota_exhausted" });
  });

  it("열린 세션이 있으면 잔여가 0 이어도 그 세션의 info 를 갱신한다", () => {
    expect(
      decideCreate({ openSession: open(), quotaRemaining: 0, info: typed }),
    ).toEqual({ kind: "reuse", sessionId: "s1", clearAssets: false });
  });

  it("설계 리포트가 있는 세션은 잠겨 있다", () => {
    expect(
      decideCreate({
        openSession: open({ designReportId: "d1" }),
        quotaRemaining: 3,
        info: typed,
      }),
    ).toEqual({ kind: "locked" });
  });

  it("자산이 있고 과목이 바뀌면 자산을 비운다", () => {
    expect(
      decideCreate({
        openSession: open({ assetCount: 2 }),
        quotaRemaining: 1,
        info: { ...typed, subject: "화학" },
      }),
    ).toEqual({ kind: "reuse", sessionId: "s1", clearAssets: true });
  });

  it("과목이 같거나 자산이 없으면 자산을 남긴다", () => {
    expect(
      decideCreate({
        openSession: open({ assetCount: 2 }),
        quotaRemaining: 1,
        info: typed,
      }).kind,
    ).toBe("reuse");
    const same = decideCreate({
      openSession: open({ assetCount: 2 }),
      quotaRemaining: 1,
      info: typed,
    });
    expect(same).toMatchObject({ clearAssets: false });
    const none = decideCreate({
      openSession: open({ assetCount: 0 }),
      quotaRemaining: 1,
      info: { ...typed, subject: "화학" },
    });
    expect(none).toMatchObject({ clearAssets: false });
  });
});

describe("buildHandoffForSession", () => {
  const report = (over: Partial<GrowthReportRow> = {}): GrowthReportRow => ({
    id: "g1",
    status: "completed",
    issued_at: "2026-09-20T00:00:00.000Z",
    narrative_theme: "생명",
    grade_subthemes: [],
    stage: "flower",
    axis_scores: [],
    signals: null,
    ...over,
  });
  const item = (over: Partial<PlanItemRow> = {}): PlanItemRow => ({
    id: "p1",
    program: "deep",
    status: "pending",
    title: "생명과학 탐구",
    description: null,
    category: null,
    axis: null,
    ...over,
  });
  const base = {
    reports: [report()],
    planItems: [item()],
    sessionGrade: "고2" as const,
    subject: "생명과학",
    nowIso: "2026-10-06T00:00:00.000Z",
  };

  it("가장 최근 완료 회차로 수신 8종과 자동 선택 과제를 만든다", () => {
    const handoff = buildHandoffForSession(base);
    expect(handoff?.reportId).toBe("g1");
    expect(handoff?.autoSelectedPlanItemId).toBe("p1");
    expect(handoff?.stageMismatch).toBe(false);
  });

  it("완료 회차가 없으면 null 이다", () => {
    expect(
      buildHandoffForSession({
        ...base,
        reports: [report({ status: "draft" })],
      }),
    ).toBeNull();
    expect(buildHandoffForSession({ ...base, reports: [] })).toBeNull();
  });

  it("학년을 알 수 없으면 null 이다", () => {
    expect(buildHandoffForSession({ ...base, sessionGrade: null })).toBeNull();
  });

  it("세션 학년 단계와 리포트 단계가 다르면 stageMismatch 다", () => {
    expect(
      buildHandoffForSession({ ...base, sessionGrade: "고3" })?.stageMismatch,
    ).toBe(true);
  });
});

describe("asGradeLabel", () => {
  it("고1, 고2, 고3 만 학년으로 읽고 나머지는 null 이다", () => {
    expect(asGradeLabel("고3")).toBe("고3");
    for (const v of ["졸업", "N수", "", null, undefined]) {
      expect(asGradeLabel(v)).toBeNull();
    }
  });
});
