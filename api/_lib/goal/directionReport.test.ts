import { describe, expect, it } from "vitest";
import { GRADE_PERCENTILE } from "../../../src/lib/goal/calc/jeongsi.js";
import type { SubjectGradeItem } from "./directionReport.js";
import {
  buildGoalDirectionReport,
  decideStudentType,
  getBand,
  resolveJungsiSubjectAverage,
  resolveNaesinSubjectAverage,
} from "./directionReport.js";

const subj = (key: string, grade: number | null): SubjectGradeItem => ({
  key,
  label: key,
  grade,
});

describe("getBand", () => {
  it("5등급제 경계값", () => {
    expect(getBand(1.7, 5)).toBe("top");
    expect(getBand(1.71, 5)).toBe("mid");
    expect(getBand(3.2, 5)).toBe("mid");
    expect(getBand(3.21, 5)).toBe("low");
    expect(getBand(null, 5)).toBe("none");
  });

  it("9등급제 경계값", () => {
    expect(getBand(2, 9)).toBe("top");
    expect(getBand(2.01, 9)).toBe("mid");
    expect(getBand(5, 9)).toBe("mid");
    expect(getBand(5.01, 9)).toBe("low");
  });
});

describe("decideStudentType — 판정 트리 11분기", () => {
  it("#0 진단 대기형 — 유효 과목 없음", () => {
    expect(decideStudentType([subj("korean", null)], null, 5).title).toBe(
      "진단 대기형",
    );
  });

  it("#1 압도적 선도형 — 5등급제", () => {
    const subjects = [
      subj("korean", 1.2),
      subj("math", 1.5),
      subj("english", 1.3),
      subj("science", 1.4),
    ];
    expect(decideStudentType(subjects, 1.35, 5).title).toBe("압도적 선도형");
  });

  it("#2 압도적 선도형 — 9등급제", () => {
    const subjects = [
      subj("korean", 1.5),
      subj("math", 2),
      subj("english", 1.8),
      subj("science", 2),
    ];
    expect(decideStudentType(subjects, 1.8, 9).title).toBe("압도적 선도형");
  });

  it("#3 수학 병목형", () => {
    const subjects = [
      subj("korean", 2),
      subj("math", 4),
      subj("english", 2),
      subj("science", 2),
    ];
    // overall 2.5, math-overall=1.5>=0.7, gap=2 (would hit gap>=1.2 later but math check precedes)
    expect(decideStudentType(subjects, 2.5, 5).title).toBe("수학 병목형");
  });

  it("#4 영어 브레이크형", () => {
    const subjects = [
      subj("korean", 2),
      subj("math", 2),
      subj("english", 4),
      subj("science", 2),
    ];
    expect(decideStudentType(subjects, 2.5, 5).title).toBe("영어 브레이크형");
  });

  it("#5 국어 독해 병목형", () => {
    const subjects = [
      subj("korean", 4),
      subj("math", 2),
      subj("english", 2),
      subj("science", 2),
    ];
    expect(decideStudentType(subjects, 2.5, 5).title).toBe("국어 독해 병목형");
  });

  it("#6 과목군 편차형", () => {
    // 국/수/영 모두 gap<0.7 미달이지만 science가 커서 전체 gap>=1.2
    const subjects = [
      subj("korean", 2),
      subj("math", 2.2),
      subj("english", 2.1),
      subj("science", 3.5),
    ];
    expect(decideStudentType(subjects, 2.45, 5).title).toBe("과목군 편차형");
  });

  it("#7 핵심과목 견인형", () => {
    // core(국수영) 평균이 overall보다 0.4 이상 좋고, gap(1.1)<1.2라 #6보다 먼저 걸리지 않는다
    // (5과목 분산으로 core-memo 격차를 벌리되 단일 과목 최대-최소 폭은 1.2 밑으로 유지).
    const subjects = [
      subj("korean", 1.0),
      subj("math", 1.0),
      subj("english", 1.0),
      subj("science", 2.1),
      { key: "social_history", label: "사회·역사군", grade: 2.1 },
    ];
    const overall = (1.0 + 1.0 + 1.0 + 2.1 + 2.1) / 5; // 1.44
    expect(decideStudentType(subjects, overall, 5).title).toBe(
      "핵심과목 견인형",
    );
  });

  it("#8 탐구·암기 견인형", () => {
    // memo(과학·사회역사) 평균이 core(국수영)보다 0.4 이상 낮되, gap(1.0)<1.2 유지.
    const subjects = [
      subj("korean", 2.0),
      subj("math", 2.3),
      subj("english", 2.1),
      subj("science", 1.3),
      { key: "social_history", label: "사회·역사군", grade: 1.5 },
    ];
    const overall = (2.0 + 2.3 + 2.1 + 1.3 + 1.5) / 5; // 1.84
    const result = decideStudentType(subjects, overall, 5);
    expect(result.title).toBe("탐구·암기 견인형");
  });

  it("#9 기초 재정렬형 — 5등급제", () => {
    const subjects = [
      subj("korean", 4.2),
      subj("math", 4.1),
      subj("english", 4.3),
      subj("science", 4.0),
    ];
    expect(decideStudentType(subjects, 4.15, 5).title).toBe("기초 재정렬형");
  });

  it("#9 기초 재정렬형 — 9등급제", () => {
    const subjects = [
      subj("korean", 5.2),
      subj("math", 5.1),
      subj("english", 5.3),
      subj("science", 5.0),
    ];
    expect(decideStudentType(subjects, 5.15, 9).title).toBe("기초 재정렬형");
  });

  it("#10 안정 상위형 — 폴백", () => {
    const subjects = [
      subj("korean", 2.8),
      subj("math", 2.9),
      subj("english", 2.85),
      subj("science", 2.75),
    ];
    expect(decideStudentType(subjects, 2.825, 5).title).toBe("안정 상위형");
  });
});

describe("resolveNaesinSubjectAverage — 입력 shape 우선순위", () => {
  it("새 shape(groupAverages) 우선 사용", () => {
    const naesinScores = {
      overall: 2.35,
      scale: 5,
      groupAverages: {
        korean: 2.1,
        math: 2.5,
        english: 2.0,
        social_history: 2.8,
        science: 2.4,
        second_language: 0,
      },
    };
    const resolved = resolveNaesinSubjectAverage(naesinScores, null, "고2");
    expect(resolved.scaleMax).toBe(5);
    expect(resolved.overallAverageOverride).toBe(2.35);
    // second_language는 0이라 값 없음 취급 — 기본 5개 그룹만 포함
    expect(resolved.subjectAverage.map((s) => s.key)).toEqual([
      "korean",
      "math",
      "english",
      "social_history",
      "science",
    ]);
  });

  it("고3 새 shape은 scale=9를 명시해야 9등급제", () => {
    const resolved = resolveNaesinSubjectAverage(
      { scale: 9, groupAverages: { korean: 3, math: 3, english: 3 } },
      null,
      "고3",
    );
    expect(resolved.scaleMax).toBe(9);
  });

  it("레거시 shape(subjects flat) 폴백 — 고3이면 9등급제", () => {
    const resolved = resolveNaesinSubjectAverage(
      null,
      { subjects: { korean: 2, math: 3, english: 2.5, science: 3.5 } },
      "고3",
    );
    expect(resolved.scaleMax).toBe(9);
    expect(resolved.subjectAverage).toHaveLength(4);
    expect(resolved.subjectAverage.find((s) => s.key === "math")?.grade).toBe(
      3,
    );
  });

  it("레거시 shape(value 단일값) 폴백 — 4과목 모두 같은 값", () => {
    const resolved = resolveNaesinSubjectAverage(null, { value: 2.7 }, "고1");
    expect(resolved.scaleMax).toBe(5);
    expect(resolved.subjectAverage.every((s) => s.grade === 2.7)).toBe(true);
  });
});

describe("resolveJungsiSubjectAverage — 입력 shape 우선순위", () => {
  it("새 shape(rounds) 우선 사용 — 5과목 grade+percentile+track", () => {
    // 실제 저장 shape(api/goal/intake.ts) — rounds는 배열이 아니라 회차 키(MOCK_FLOW
    // 순서) → 회차 객체 Record이고, track은 회차별이 아니라 mock_exam_scores 최상위
    // 필드 하나다(온보딩 섹션 전체에서 탐구 선택 과목을 한 번만 고른다).
    const mockExamScores = {
      track: "과탐",
      rounds: {
        g3_mar: {
          kor: { grade: 2, pct: 88 },
          math: { grade: 3, pct: 80 },
          eng: { grade: 2, pct: 90 },
          tam1: { grade: 1, pct: 97 },
          tam2: { grade: 2, pct: 91 },
        },
      },
    };
    const resolved = resolveJungsiSubjectAverage(
      mockExamScores,
      null,
      GRADE_PERCENTILE,
    );
    expect(resolved.scaleMax).toBe(9);
    expect(resolved.subjectAverage).toHaveLength(5);
    const inq1 = resolved.subjectAverage.find((s) => s.key === "inq1");
    expect(inq1?.grade).toBe(1);
    expect(inq1?.percentile).toBe(97);
    expect(inq1?.track).toBe("과탐");
  });

  it("레거시 shape(4과목 백분위) 폴백 — percentileToGrade 환산", () => {
    const resolved = resolveJungsiSubjectAverage(
      null,
      { subjects: { korean: 88, math: 80, english: 90, science: 97 } },
      GRADE_PERCENTILE,
    );
    expect(resolved.scaleMax).toBe(9);
    const korean = resolved.subjectAverage.find((s) => s.key === "korean");
    expect(korean?.percentile).toBe(88);
    expect(korean?.grade).toBe(3); // GRADE_PERCENTILE 3: 77~88
  });
});

describe("buildGoalDirectionReport — 통합", () => {
  it("naesin: 새 shape으로 studentType·subjectReports·pyramidLevel까지 채운다", () => {
    const { payload, snapshot } = buildGoalDirectionReport({
      kind: "naesin",
      sourceType: "intake",
      sourceLabel: "내 현재 위치",
      grade: "고2",
      naesinScores: {
        overall: 1.4,
        scale: 5,
        groupAverages: {
          korean: 1.3,
          math: 1.5,
          english: 1.4,
          social_history: 1.3,
          science: 1.5,
        },
      },
    });
    expect(payload.scaleMax).toBe(5);
    expect(payload.overallAverage).toBe(1.4);
    expect(payload.studentType.title).toBe("압도적 선도형");
    expect(payload.subjectReports).toHaveLength(5);
    const korean = payload.subjectReports.find((s) => s.key === "korean");
    expect(korean?.pyramidLevel).toBe(1);
    expect(korean?.direction).toContain("지문 분석");
    expect(korean?.books.length).toBeGreaterThan(0);
    expect(snapshot).toMatchObject({ source: "groupAverages" });
  });

  it("jungsi: 레거시 shape으로도 payload를 만든다", () => {
    const { payload } = buildGoalDirectionReport({
      kind: "jungsi",
      sourceType: "mogo",
      sourceLabel: "고3 6월 모의고사",
      grade: "고3",
      legacyEntry: {
        subjects: { korean: 60, math: 55, english: 65, science: 50 },
      },
      gradePercentile: GRADE_PERCENTILE,
    });
    expect(payload.scaleMax).toBe(9);
    expect(payload.subjectReports).toHaveLength(4);
    expect(payload.subjectReports.every((s) => s.percentile != null)).toBe(
      true,
    );
  });

  it("과목별 성적 없음 — 진단 대기형 + 밴드 none", () => {
    const { payload } = buildGoalDirectionReport({
      kind: "naesin",
      sourceType: "intake",
      sourceLabel: "내 현재 위치",
      grade: "고1",
    });
    expect(payload.studentType.title).toBe("진단 대기형");
    expect(payload.subjectReports.every((s) => s.status === "입력 대기")).toBe(
      true,
    );
  });
});
