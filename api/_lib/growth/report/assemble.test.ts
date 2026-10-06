// 8단계 조립 순수 함수 테스트.
import { describe, expect, test } from "vitest";
import type { SectionItem } from "../sections.js";
import {
  assembleFinal,
  type CarriedItem,
  completionPayload,
  mergeSections,
  parentView,
  planRows,
  profileSurveyCopy,
} from "./assemble.js";
import type { PlanItemDraft, ReportContext } from "./types.js";

function item(id: string, over: Partial<SectionItem> = {}): SectionItem {
  return {
    id,
    title: `t-${id}`,
    format: "prose",
    badge: "fact",
    status: "ok",
    evidence_ids: ["a1"],
    body: "본문",
    ...over,
  };
}

describe("mergeSections", () => {
  test("같은 id 가 둘 다 있으면 앱 항목이 이긴다", () => {
    const merged = mergeSections(
      [item("1-2", { body: "모델" })],
      [item("1-2", { body: "앱" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.body).toBe("앱");
  });

  test("레지스트리 순서로 정렬하고 미등록 id 는 버린다", () => {
    const merged = mergeSections(
      [item("3-11", { format: "list" }), item("zz-9")],
      [item("1-2"), item("2-1", { format: "table" })],
    );
    expect(merged.map((m) => m.id)).toEqual(["1-2", "2-1", "3-11"]);
  });

  test("한쪽에만 있는 항목은 그대로 남는다", () => {
    const merged = mergeSections([item("1-2")], [item("1-11")]);
    expect(merged.map((m) => m.id)).toEqual(["1-2", "1-11"]);
  });
});

function ctx(over: Partial<ReportContext> = {}): ReportContext {
  return {
    reportId: "r1",
    profileId: "p1",
    track: "고2",
    currentGrade: "고2",
    range: { semesters: [], description: "" },
    omitted: { ids: [], reasons: [] },
    expectedSectionIds: ["1-2", "1-11"],
    noFirstYearData: false,
    activities: [],
    evidenceIds: ["a1"],
    survey: {},
    profile: {
      schoolType: null,
      grade: null,
      semester: null,
      career: null,
      admissionYear: null,
    },
    grades: { system: null, semesters: [], note: null },
    universities: [],
    previousNarrative: null,
    nowIso: "2026-10-06T00:00:00.000Z",
    ...over,
  };
}

describe("assembleFinal", () => {
  test("기대 id 와 근거가 맞으면 ok 와 정렬된 sections 를 돌려준다", () => {
    const r = assembleFinal(
      ctx(),
      [item("1-11", { evidence_ids: ["a1"] })],
      [item("1-2")],
    );
    expect(r.ok).toBe(true);
    expect(r.sections.map((s) => s.id)).toEqual(["1-2", "1-11"]);
  });

  test("누락 id 는 실패하고 sections 는 그대로 돌려준다", () => {
    const r = assembleFinal(ctx(), [], [item("1-2")]);
    expect(r.ok).toBe(false);
    expect(r.sections.map((s) => s.id)).toEqual(["1-2"]);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });

  test("기대 목록에 없는 초과 id 는 실패한다", () => {
    const r = assembleFinal(
      ctx(),
      [item("1-11"), item("1-8", { format: "list" })],
      [item("1-2")],
    );
    expect(r.ok).toBe(false);
  });

  test("모르는 근거 id 는 실패한다", () => {
    const r = assembleFinal(
      ctx(),
      [item("1-11", { evidence_ids: ["ghost"] })],
      [item("1-2")],
    );
    expect(r.ok).toBe(false);
  });
});

function draft(
  title: string,
  over: Partial<PlanItemDraft> = {},
): PlanItemDraft {
  return {
    program: "self",
    title,
    description: null,
    priority: "recommended",
    axis: null,
    category: null,
    period: "semester",
    periodLabel: null,
    deadline: null,
    ...over,
  };
}

function carried(title: string, over: Partial<CarriedItem> = {}): CarriedItem {
  return {
    id: `old-${title}`,
    report_id: "r0",
    program: "self",
    title,
    description: null,
    priority: "recommended",
    axis: null,
    category: null,
    period: "semester",
    period_label: null,
    deadline: null,
    ...over,
  };
}

describe("planRows", () => {
  test("이월 항목이 먼저, 새 초안이 뒤에 오고 sort_order 는 0부터 연번이다", () => {
    const rows = planRows(ctx(), [draft("새 활동")], [carried("이월 활동")]);
    expect(rows.map((r) => r.title)).toEqual(["이월 활동", "새 활동"]);
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1]);
  });

  test("이월 행은 carried_from_report_id 를 갖고 새 행은 null 이다", () => {
    const rows = planRows(ctx(), [draft("새 활동")], [carried("이월 활동")]);
    expect(rows[0]?.carried_from_report_id).toBe("r0");
    expect(rows[1]?.carried_from_report_id).toBeNull();
  });

  test("공통 필드는 report_id, profile_id, status pending 으로 채우고 done_ 필드는 없다", () => {
    const [row] = planRows(ctx(), [draft("새 활동", { axis: "B" })], []);
    expect(row).toMatchObject({
      report_id: "r1",
      profile_id: "p1",
      status: "pending",
      axis: "B",
      period_label: null,
    });
    expect(Object.keys(row ?? {}).some((k) => k.startsWith("done_"))).toBe(
      false,
    );
  });

  test("공백 제거 후 제목이 같으면 새 초안 쪽을 버린다", () => {
    const rows = planRows(
      ctx(),
      [draft("독서 토론"), draft("다른 활동")],
      [carried("독서  토론")],
    );
    expect(rows.map((r) => r.title)).toEqual(["독서  토론", "다른 활동"]);
  });

  test("시기 순서는 과목 선택, 학기, 방학이다", () => {
    const rows = planRows(
      ctx(),
      [
        draft("방학", { period: "vacation" }),
        draft("선택", { period: "course_selection" }),
        draft("학기"),
      ],
      [],
    );
    expect(rows.map((r) => r.title)).toEqual(["선택", "학기", "방학"]);
  });

  test("required 는 3건 상한이고 초과분은 recommended 로 강등된다", () => {
    const rows = planRows(
      ctx(),
      ["a", "b", "c", "d"].map((t) => draft(t, { priority: "required" })),
      [],
    );
    expect(rows.map((r) => r.priority)).toEqual([
      "required",
      "required",
      "required",
      "recommended",
    ]);
  });

  test("recommended 가 3건을 넘으면 넘친 항목은 버리고 sort_order 는 연속이다", () => {
    const rows = planRows(
      ctx(),
      ["a", "b", "c", "d", "e"].map((t) => draft(t)),
      [],
    );
    expect(rows.map((r) => r.title)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2]);
  });

  test("periodLabel 은 지어내지 않고 모델 값을 그대로 둔다", () => {
    const rows = planRows(
      ctx({ track: "고3" }),
      [draft("월 계획", { periodLabel: "11월" }), draft("무라벨")],
      [],
    );
    expect(rows.map((r) => r.period_label)).toEqual(["11월", null]);
  });
});

describe("profileSurveyCopy", () => {
  test("트랙과 설문 답을 복사하고 저장 시각은 nowIso 이다", () => {
    const copy = profileSurveyCopy(ctx({ survey: { q1: "a" }, track: "고3" }));
    expect(copy).toEqual({
      profile_id: "p1",
      track: "고3",
      survey_answers: { q1: "a" },
      survey_saved_at: "2026-10-06T00:00:00.000Z",
    });
  });
});

describe("completionPayload", () => {
  test("섹션, 계획 행, 프로필 복사값을 묶는다", () => {
    const sections = [item("1-2")];
    const payload = completionPayload(ctx(), sections, [draft("활동")], []);
    expect(payload.sections).toBe(sections);
    expect(payload.planRows.map((r) => r.title)).toEqual(["활동"]);
    expect(payload.profile.profile_id).toBe("p1");
  });
});

describe("parentView", () => {
  test("성적 민감 항목 id 를 제외하고 excludedIds 로 알려준다", () => {
    const view = parentView([
      item("1-2"),
      item("1-12", { format: "line" }),
      item("1-13", { format: "table" }),
    ]);
    expect(view.items.map((i) => i.id)).toEqual(["1-2"]);
    expect(view.excludedIds).toEqual(["1-12", "1-13"]);
  });
});
