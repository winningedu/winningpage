import { describe, expect, it } from "vitest";
import type { PlanItemRow, PlanReportRow } from "./types.js";
import {
  avoidRepeats,
  buildPlanBody,
  carriedItems,
  currentGradeOf,
  groupItems,
  handoffFor,
  nextDeadline,
  PERIOD_LABELS,
  progress,
  subthemeFor,
  toItemView,
} from "./view.js";

const TODAY = "2026-10-06";

function row(over: Partial<PlanItemRow> = {}): PlanItemRow {
  return {
    id: "i1",
    report_id: "r1",
    profile_id: "p1",
    program: "school",
    title: "활동",
    description: null,
    priority: "required",
    axis: null,
    category: null,
    period: "semester",
    period_label: null,
    deadline: null,
    status: "pending",
    done_source_program: null,
    done_ref_id: null,
    done_at: null,
    carried_from_report_id: null,
    sort_order: 0,
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function report(over: Partial<PlanReportRow> = {}): PlanReportRow {
  return {
    id: "r1",
    profile_id: "p1",
    status: "completed",
    track: "고2",
    narrative_theme: "생명을 잇는 공학",
    grade_subthemes: [
      { grade: "고1", stage: "seed", text: "관찰" },
      { grade: "고2", stage: "flower", text: "설계" },
    ],
    stage: "꽃",
    consistency: null,
    axis_scores: null,
    sections: null,
    issued_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

describe("PERIOD_LABELS", () => {
  it("시기 라벨", () => {
    expect(PERIOD_LABELS).toEqual({
      course_selection: "과목 선택 시기",
      semester: "남은 학기",
      vacation: "방학",
    });
  });
});

describe("currentGradeOf", () => {
  it("고1~고3 그대로, 졸업과 N수는 고3, null 은 null", () => {
    expect(currentGradeOf("고1")).toBe("고1");
    expect(currentGradeOf("고2")).toBe("고2");
    expect(currentGradeOf("고3")).toBe("고3");
    expect(currentGradeOf("졸업")).toBe("고3");
    expect(currentGradeOf("N수")).toBe("고3");
    expect(currentGradeOf(null)).toBeNull();
  });
});

describe("toItemView", () => {
  it("마감 임박과 이월 여부", () => {
    const v = toItemView(
      row({ deadline: "2026-10-10", carried_from_report_id: "r0" }),
      TODAY,
    );
    expect(v.dday).toBe(4);
    expect(v.urgent).toBe(true);
    expect(v.deadlineLabel).toBe("D-4");
    expect(v.carried).toBe(true);
    expect(v.carriedFromReportId).toBe("r0");
    expect(v.done).toBe(false);
    expect(v.periodLabel).toBeNull();
  });
  it("지난 마감은 D+ 와 긴급", () => {
    const v = toItemView(row({ deadline: "2026-10-01" }), TODAY);
    expect(v.dday).toBe(-5);
    expect(v.urgent).toBe(true);
    expect(v.deadlineLabel).toBe("D+5");
  });
  it("마감 없으면 null 과 비긴급, 완료 항목 필드", () => {
    const v = toItemView(
      row({
        status: "done",
        done_source_program: "self",
        done_at: "2026-10-02T00:00:00Z",
        period_label: "11월",
      }),
      TODAY,
    );
    expect(v.dday).toBeNull();
    expect(v.urgent).toBe(false);
    expect(v.deadlineLabel).toBeNull();
    expect(v.done).toBe(true);
    expect(v.doneSource).toBe("self");
    expect(v.doneAt).toBe("2026-10-02T00:00:00Z");
    expect(v.periodLabel).toBe("11월");
  });
});

describe("groupItems", () => {
  it("시기 순서, 빈 시기 제외, sort_order 오름차순", () => {
    const groups = groupItems(
      [
        row({ id: "a", period: "vacation", sort_order: 1 }),
        row({ id: "b", period: "course_selection", sort_order: 5 }),
        row({ id: "c", period: "vacation", sort_order: 0 }),
      ],
      TODAY,
    );
    expect(groups.map((g) => g.period)).toEqual([
      "course_selection",
      "vacation",
    ]);
    expect(groups[0]?.label).toBe("과목 선택 시기");
    expect(groups[1]?.items.map((i) => i.id)).toEqual(["c", "a"]);
  });
  it("고3 월 단위 라벨은 묶음을 쪼개지 않고 항목에 남는다", () => {
    const groups = groupItems(
      [
        row({ id: "a", period_label: "11월", sort_order: 0 }),
        row({ id: "b", period_label: "12월", sort_order: 1 }),
      ],
      TODAY,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.periodLabel)).toEqual([
      "11월",
      "12월",
    ]);
  });
  it("빈 입력은 빈 배열", () => {
    expect(groupItems([], TODAY)).toEqual([]);
  });
});

describe("progress", () => {
  it("0건이면 percent 0", () => {
    expect(progress([])).toEqual({
      total: 0,
      done: 0,
      remaining: 0,
      percent: 0,
    });
  });
  it("정수 반올림", () => {
    const p = progress([
      row({ status: "done" }),
      row({ id: "2" }),
      row({ id: "3" }),
    ]);
    expect(p).toEqual({ total: 3, done: 1, remaining: 2, percent: 33 });
  });
  it("전부 완료면 100", () => {
    expect(progress([row({ status: "done" })]).percent).toBe(100);
  });
});

describe("nextDeadline", () => {
  it("pending 중 가장 이른 마감", () => {
    const n = nextDeadline(
      [
        row({ id: "a", deadline: "2026-11-01" }),
        row({ id: "b", deadline: "2026-10-08" }),
        row({ id: "c", deadline: "2026-10-07", status: "done" }),
        row({ id: "d", deadline: null }),
      ],
      TODAY,
    );
    expect(n).toEqual({
      itemId: "b",
      deadline: "2026-10-08",
      dday: 2,
      urgent: true,
    });
  });
  it("지난 마감도 후보", () => {
    const n = nextDeadline(
      [
        row({ id: "a", deadline: "2026-10-01" }),
        row({ id: "b", deadline: "2026-10-09" }),
      ],
      TODAY,
    );
    expect(n?.itemId).toBe("a");
    expect(n?.dday).toBe(-5);
  });
  it("후보 없으면 null", () => {
    expect(
      nextDeadline([row({ status: "done", deadline: "2026-10-08" })], TODAY),
    ).toBeNull();
    expect(nextDeadline([], TODAY)).toBeNull();
  });
});

describe("carriedItems", () => {
  it("이월 항목만", () => {
    const c = carriedItems(
      [row({ id: "a" }), row({ id: "b", carried_from_report_id: "r0" })],
      TODAY,
    );
    expect(c.map((i) => i.id)).toEqual(["b"]);
    expect(c[0]?.carried).toBe(true);
  });
});

describe("avoidRepeats", () => {
  const sec = (items: unknown) => [{ id: "3-13", body: { items } }];
  it("객체와 문자열 항목을 읽는다", () => {
    expect(
      avoidRepeats(
        sec([{ text: "독서 나열", evidence_ids: ["e1"] }, "같은 실험"]),
      ),
    ).toEqual([
      { text: "독서 나열", evidenceIds: ["e1"] },
      { text: "같은 실험", evidenceIds: [] },
    ]);
  });
  it("모양이 다르면 빈 배열", () => {
    expect(avoidRepeats(null)).toEqual([]);
    expect(avoidRepeats({})).toEqual([]);
    expect(avoidRepeats([{ id: "3-12", body: { items: ["x"] } }])).toEqual([]);
    expect(avoidRepeats([{ id: "3-13", body: "x" }])).toEqual([]);
    expect(avoidRepeats([{ id: "3-13", body: { items: "x" } }])).toEqual([]);
  });
  it("잘못된 원소는 건너뛰고 evidence_ids 비배열은 빈 배열", () => {
    expect(
      avoidRepeats(sec([{ text: 1 }, { text: "ok", evidence_ids: "x" }, null])),
    ).toEqual([{ text: "ok", evidenceIds: [] }]);
  });
});

describe("subthemeFor", () => {
  it("학년이 같은 항목의 text", () => {
    expect(subthemeFor(report(), "고2")).toBe("설계");
  });
  it("학년 null, 없는 학년, 비배열은 null", () => {
    expect(subthemeFor(report(), null)).toBeNull();
    expect(subthemeFor(report(), "고3")).toBeNull();
    expect(subthemeFor(report({ grade_subthemes: null }), "고2")).toBeNull();
  });
});

describe("handoffFor", () => {
  it("대주제, 현재 학년, 단계, 활동 조건", () => {
    const h = handoffFor(
      report(),
      row({
        id: "i9",
        program: "self",
        title: "자기평가서 작성",
        description: "설명",
        axis: "D",
        category: "독서",
      }),
    );
    expect(h).toEqual({
      reportId: "r1",
      itemId: "i9",
      program: "self",
      theme: "생명을 잇는 공학",
      currentGrade: "고2",
      stage: "꽃",
      subtheme: "설계",
      condition: {
        title: "자기평가서 작성",
        description: "설명",
        axis: "D",
        category: "독서",
      },
    });
  });
  it("트랙이 없으면 학년과 소주제 null", () => {
    const h = handoffFor(report({ track: null, stage: null }), row());
    expect(h.currentGrade).toBeNull();
    expect(h.subtheme).toBeNull();
    expect(h.stage).toBeNull();
  });
});

describe("buildPlanBody", () => {
  it("본문 조립과 handoffs 는 self, deep 만", () => {
    const metrics = { any: 1 };
    const body = buildPlanBody(
      report({
        sections: [{ id: "3-13", body: { items: ["반복"] } }],
      }),
      [
        row({ id: "s", program: "school", deadline: "2026-10-09" }),
        row({ id: "f", program: "self", sort_order: 1 }),
        row({
          id: "d",
          program: "deep",
          sort_order: 2,
          carried_from_report_id: "r0",
        }),
      ],
      TODAY,
      metrics,
    );
    expect(body.reportId).toBe("r1");
    expect(body.issuedAt).toBe("2026-10-01T00:00:00Z");
    expect(body.track).toBe("고2");
    expect(body.theme).toBe("생명을 잇는 공학");
    expect(body.stage).toBe("꽃");
    expect(body.currentGrade).toBe("고2");
    expect(body.subtheme).toBe("설계");
    expect(body.groups).toHaveLength(1);
    expect(body.progress.total).toBe(3);
    expect(body.nextDeadline?.itemId).toBe("s");
    expect(body.carried.map((i) => i.id)).toEqual(["d"]);
    expect(body.avoidRepeats).toEqual([{ text: "반복", evidenceIds: [] }]);
    expect(body.metrics).toBe(metrics);
    expect(Object.keys(body.handoffs).sort()).toEqual(["d", "f"]);
    expect(body.handoffs.s).toBeUndefined();
  });
});
