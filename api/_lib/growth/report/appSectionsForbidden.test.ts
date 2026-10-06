// 앱이 직접 만드는 8단계 섹션(고정 고지문 포함)이 금지 표현 사전과 충돌하지 않는지 확인한다.
import { describe, expect, test } from "vitest";
import { evaluateAxes } from "../axes.js";
import { computeConsistency } from "../consistency.js";
import type { SectionItem } from "../sections.js";
import type { SemesterKey } from "../types.js";
import { findForbiddenPhrases, validateStep } from "../validation.js";
import { assembleFinal } from "./assemble.js";
import { appSections, classify } from "./compute.js";
import type { ReportContext } from "./types.js";

const baseCtx = (over: Partial<ReportContext> = {}): ReportContext => ({
  reportId: "r1",
  profileId: "p1",
  track: "고2",
  currentGrade: "고2",
  range: {
    semesters: ["고1-1", "고1-2", "고2-1"],
    description: "고1부터 고2 1학기",
  },
  omitted: { ids: [], reasons: [] },
  expectedSectionIds: [],
  noFirstYearData: false,
  activities: [],
  evidenceIds: [],
  survey: {},
  profile: {
    schoolType: "일반고",
    grade: "고2",
    semester: 1,
    career: "의사",
    admissionYear: 2025,
  },
  grades: { system: null, semesters: [], note: null },
  universities: [],
  previousNarrative: null,
  nowIso: "2026-10-06T00:00:00.000Z",
  ...over,
});

const sem = (key: SemesterKey, average: number | null) => ({
  key,
  average,
  source: average === null ? null : ("direct" as const),
});

const cases: Record<string, Partial<ReportContext>> = {
  "상승 성적과 입결": {
    grades: {
      system: "nine",
      semesters: [sem("고1-1", 3), sem("고1-2", 2.8), sem("고2-1", 2.2)],
      note: null,
    },
    universities: [
      {
        universityName: "가대",
        departmentName: "의예과",
        cuts: [
          { year: 2025, grade: 1.5 },
          { year: 2024, grade: 1.7 },
        ],
      },
      {
        universityName: "나대",
        departmentName: null,
        cuts: [{ year: 2025, grade: 3 }],
      },
    ],
  },
  "하락 성적과 입결": {
    grades: {
      system: "nine",
      semesters: [sem("고1-1", 1.5), sem("고1-2", 2.4), sem("고2-1", 3.1)],
      note: null,
    },
    universities: [
      {
        universityName: "가대",
        departmentName: null,
        cuts: [{ year: 2025, grade: 2 }],
      },
    ],
  },
  "입결 값 없음": {
    grades: {
      system: "nine",
      semesters: [sem("고1-1", 3), sem("고1-2", 2.8)],
      note: null,
    },
    universities: [
      {
        universityName: "가대",
        departmentName: null,
        cuts: [{ year: 2025, grade: null }],
      },
    ],
  },
  "성적 없음": {
    universities: [
      {
        universityName: "가대",
        departmentName: null,
        cuts: [{ year: 2025, grade: 2 }],
      },
    ],
  },
  "대학 없음": {
    grades: { system: "nine", semesters: [sem("고1-1", 3)], note: null },
  },
  "학기 1개뿐": {
    grades: { system: "nine", semesters: [sem("고1-1", 2.5)], note: null },
    universities: [
      {
        universityName: "가대",
        departmentName: null,
        cuts: [{ year: 2025, grade: 1.2 }],
      },
    ],
  },
};

const collectStrings = (v: unknown): string[] => {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(collectStrings);
  if (v !== null && typeof v === "object")
    return Object.values(v).flatMap(collectStrings);
  return [];
};

const build = (context: ReportContext): SectionItem[] =>
  appSections(context, {
    classification: classify(context),
    narrative: null,
    consistency: computeConsistency([]),
    axes: evaluateAxes(context.currentGrade, []),
    signals: [],
  });

describe("앱 섹션 고정 문구와 금지 표현 사전", () => {
  for (const [name, over] of Object.entries(cases)) {
    test(`${name}: appSections 결과에 금지 표현이 없다`, () => {
      const items = build(baseCtx(over));
      expect(items.length).toBeGreaterThan(0);
      expect(findForbiddenPhrases(collectStrings(items).join("\n"))).toEqual(
        [],
      );
    });
  }

  test("입결 컨텍스트 조립 결과가 8단계 금지 표현 검사를 통과한다", () => {
    const context = baseCtx(cases["상승 성적과 입결"]);
    const items = build(context);
    const r = assembleFinal(
      {
        ...context,
        expectedSectionIds: items.map((i) => i.id),
        evidenceIds: [],
      },
      [],
      items,
    );
    const issues = r.ok ? [] : r.issues;
    expect(issues.filter((i) => i.code === "forbidden_phrase")).toEqual([]);
    expect(
      validateStep(
        8,
        { sections: items },
        { expectedSectionIds: [], knownEvidenceIds: [] },
      ).issues.filter((i) => i.code === "forbidden_phrase"),
    ).toEqual([]);
  });
});
