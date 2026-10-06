// 성장설계 수신 테스트(명세 No.107~109, 111, 178, 181, 개발계획 §1 과제 매칭, §2 23, §6 12, 13).
// axis_scores 는 성장설계 AxisEvaluation[](axis, verdict, optional 포함)로 저장된다(growth/report/runStep.ts).
import { describe, expect, it } from "vitest";
import type { GrowthReportRow, PlanItemRow } from "./growthHandoff.js";
import {
  buildHandoff,
  handoffPayload,
  isStale,
  matchPlanItems,
  parseStage,
  parseSubthemes,
  pickLatestCompleted,
  weakAxesFrom,
} from "./growthHandoff.js";

const report = (over: Partial<GrowthReportRow> = {}): GrowthReportRow => ({
  id: "r1",
  status: "completed",
  issued_at: "2026-09-01T00:00:00Z",
  narrative_theme: "데이터로 읽는 환경",
  grade_subthemes: [],
  stage: "flower",
  axis_scores: [],
  signals: { matched: [] },
  ...over,
});

const item = (over: Partial<PlanItemRow> = {}): PlanItemRow => ({
  id: "p1",
  program: "deep",
  status: "pending",
  title: "수학 통계 탐구",
  description: null,
  category: null,
  axis: "C",
  ...over,
});

describe("pickLatestCompleted (No.108)", () => {
  it("completed 이고 발행일이 있는 것 중 가장 최근을 고른다", () => {
    const rows = [
      report({ id: "a", issued_at: "2026-05-01T00:00:00Z" }),
      report({ id: "b", issued_at: "2026-09-01T00:00:00Z" }),
      report({
        id: "c",
        status: "in_progress",
        issued_at: "2026-10-01T00:00:00Z",
      }),
      report({ id: "d", issued_at: null }),
    ];
    expect(pickLatestCompleted(rows)?.id).toBe("b");
  });
  it("후보가 없으면 null 이다", () => {
    expect(pickLatestCompleted([])).toBeNull();
    expect(pickLatestCompleted([report({ status: "draft" })])).toBeNull();
  });
});

describe("isStale (No.107, 181)", () => {
  it("발행 후 6개월을 넘으면 오래된 것이다", () => {
    expect(isStale("2026-04-06T00:00:00Z", "2026-10-06T00:00:00Z")).toBe(false);
    expect(isStale("2026-04-06T00:00:00Z", "2026-10-06T00:00:01Z")).toBe(true);
    expect(isStale("2026-09-01T00:00:00Z", "2026-10-06T00:00:00Z")).toBe(false);
  });
  it("말일 발행은 6개월 뒤 말일로 계산한다", () => {
    expect(isStale("2026-08-31T00:00:00Z", "2027-02-28T00:00:00Z")).toBe(false);
    expect(isStale("2026-08-31T00:00:00Z", "2027-03-01T00:00:00Z")).toBe(true);
  });
});

describe("parseStage", () => {
  it("seed, flower, bloom 만 받는다", () => {
    expect(parseStage("seed")).toBe("seed");
    expect(parseStage("flower")).toBe("flower");
    expect(parseStage("bloom")).toBe("bloom");
    expect(parseStage("fruit")).toBeNull();
    expect(parseStage(null)).toBeNull();
  });
});

describe("parseSubthemes (growth sections.ts Narrative)", () => {
  it("학년, 단계, 문장 3개를 읽는다", () => {
    const raw = [
      { grade: "고1", stage: "seed", text: "a" },
      { grade: "고2", stage: "flower", text: "b" },
      { grade: "고3", stage: "bloom", text: "c" },
    ];
    expect(parseSubthemes(raw)).toEqual(raw);
  });
  it("모양이 다르면 빈 배열이다", () => {
    expect(parseSubthemes(null)).toEqual([]);
    expect(parseSubthemes({})).toEqual([]);
    expect(
      parseSubthemes([{ grade: "고4", stage: "seed", text: "a" }]),
    ).toEqual([]);
    expect(parseSubthemes([{ grade: "고1", stage: "seed", text: 1 }])).toEqual(
      [],
    );
    expect(parseSubthemes([{ grade: "고1", stage: "x", text: "a" }])).toEqual(
      [],
    );
  });
});

describe("weakAxesFrom (§6 12)", () => {
  it("verdict 가 none 또는 caution 인 축 코드를 뽑는다", () => {
    const scores = [
      { axis: "A", verdict: "confirmed" },
      { axis: "B", verdict: "caution" },
      { axis: "C", verdict: "none" },
      { axis: "D", verdict: "none" },
      { axis: "E", verdict: "confirmed" },
    ];
    expect(weakAxesFrom(scores)).toEqual(["B", "C", "D"]);
  });
  it("선택 축(optional)은 미달로 보지 않는다", () => {
    expect(
      weakAxesFrom([
        { axis: "B", verdict: "none", optional: true },
        { axis: "C", verdict: "none" },
      ]),
    ).toEqual(["C"]);
  });
  it("모양이 다르거나 모르는 축은 무시한다", () => {
    expect(weakAxesFrom(null)).toEqual([]);
    expect(weakAxesFrom({})).toEqual([]);
    expect(
      weakAxesFrom([{ axis: "Z", verdict: "none" }, "x", null, { axis: "A" }]),
    ).toEqual([]);
  });
  it("같은 축이 두 번 나와도 한 번만 담는다", () => {
    expect(
      weakAxesFrom([
        { axis: "A", verdict: "none" },
        { axis: "A", verdict: "caution" },
      ]),
    ).toEqual(["A"]);
  });
});

describe("matchPlanItems (§1 과제 매칭, No.111)", () => {
  const items = [
    item({ id: "1", title: "수학 통계 탐구" }),
    item({ id: "2", title: "과학 실험", category: "물리" }),
    item({ id: "3", title: "수학 완료", status: "done" }),
    item({ id: "4", title: "수학 자기평가", program: "self" }),
  ];
  it("deep 이고 pending 인 항목만 후보다", () => {
    expect(matchPlanItems(items, "").candidates.map((i) => i.id)).toEqual([
      "1",
      "2",
    ]);
  });
  it("과목명이 title 에 정확히 1건 포함되면 자동 선택한다", () => {
    expect(matchPlanItems(items, "수학").autoSelected?.id).toBe("1");
  });
  it("category 에 포함되어도 매칭하고 공백은 무시한다", () => {
    expect(matchPlanItems(items, " 물 리 ").autoSelected?.id).toBe("2");
  });
  it("0건 또는 2건 이상이면 자동 선택하지 않는다", () => {
    expect(matchPlanItems(items, "국어").autoSelected).toBeNull();
    const two = [
      item({ id: "a", title: "수학 탐구" }),
      item({ id: "b", title: "수학 심화" }),
    ];
    expect(matchPlanItems(two, "수학").autoSelected).toBeNull();
    expect(matchPlanItems(two, "수학").candidates).toHaveLength(2);
  });
  it("과목이 비어 있으면 자동 선택하지 않는다", () => {
    expect(matchPlanItems([item()], "   ").autoSelected).toBeNull();
  });
  it("항목이 없으면 후보도 없다", () => {
    expect(matchPlanItems([], "수학")).toEqual({
      candidates: [],
      autoSelected: null,
    });
  });
});

describe("buildHandoff (No.107, 109, 178)", () => {
  const input = {
    report: report({
      grade_subthemes: [{ grade: "고2", stage: "flower", text: "t" }],
      axis_scores: [{ axis: "D", verdict: "none" }],
    }),
    planItems: [
      item({ id: "1", title: "수학 통계" }),
      item({ id: "2", title: "done", status: "done" }),
    ],
    sessionGrade: "고2" as const,
    subject: "수학",
    nowIso: "2026-10-06T00:00:00Z",
  };
  it("8종 값을 모양에 맞게 채운다", () => {
    const h = buildHandoff(input);
    expect(h.reportId).toBe("r1");
    expect(h.issuedAt).toBe("2026-09-01T00:00:00Z");
    expect(h.theme).toBe("데이터로 읽는 환경");
    expect(h.stage).toBe("flower");
    expect(h.subthemes).toEqual([{ grade: "고2", stage: "flower", text: "t" }]);
    expect(h.weakAxes).toEqual(["D"]);
    expect(h.signals).toEqual({ matched: [] });
    expect(h.stale).toBe(false);
    expect(h.stageMismatch).toBe(false);
  });
  it("planItems 는 후보만 담고 자동 선택 id 를 함께 준다", () => {
    const h = buildHandoff(input);
    expect(h.planItems).toEqual([
      {
        id: "1",
        title: "수학 통계",
        description: null,
        category: null,
        axis: "C",
      },
    ]);
    expect(h.autoSelectedPlanItemId).toBe("1");
  });
  it("세션 학년 단계와 리포트 단계가 다르면 stageMismatch 다", () => {
    expect(buildHandoff({ ...input, sessionGrade: "고3" }).stageMismatch).toBe(
      true,
    );
    expect(buildHandoff({ ...input, sessionGrade: "고1" }).stageMismatch).toBe(
      true,
    );
  });
  it("리포트 단계를 읽을 수 없으면 불일치로 보지 않는다", () => {
    const h = buildHandoff({ ...input, report: report({ stage: null }) });
    expect(h.stage).toBeNull();
    expect(h.stageMismatch).toBe(false);
  });
  it("발행일이 6개월을 넘으면 stale 이다", () => {
    expect(
      buildHandoff({
        ...input,
        report: report({ issued_at: "2026-01-01T00:00:00Z" }),
      }).stale,
    ).toBe(true);
  });
  it("발행일이 없는 리포트는 만들 수 없어 예외를 던진다", () => {
    expect(() =>
      buildHandoff({ ...input, report: report({ issued_at: null }) }),
    ).toThrow();
  });
});

describe("handoffPayload (성장설계 ProgramHandoff)", () => {
  const payload = {
    reportId: "r1",
    itemId: "p9",
    program: "deep",
    theme: null,
    currentGrade: "고2",
    stage: "flower",
    subtheme: null,
    condition: { title: "t", description: null, axis: "C", category: "수학" },
  };
  it("itemId 를 planItemId 로 읽는다", () => {
    expect(handoffPayload(payload)).toEqual({
      planItemId: "p9",
      subject: null,
    });
  });
  it("JSON 문자열도 읽는다", () => {
    expect(handoffPayload(JSON.stringify(payload))).toEqual({
      planItemId: "p9",
      subject: null,
    });
  });
  it("subject 문자열이 있으면 함께 돌려준다", () => {
    expect(handoffPayload({ ...payload, subject: "수학" })?.subject).toBe(
      "수학",
    );
  });
  it("모양이 다르거나 다른 프로그램이면 null 이다", () => {
    expect(handoffPayload(null)).toBeNull();
    expect(handoffPayload("not json")).toBeNull();
    expect(handoffPayload({})).toBeNull();
    expect(handoffPayload({ itemId: "" })).toBeNull();
    expect(handoffPayload({ ...payload, program: "self" })).toBeNull();
  });
});
