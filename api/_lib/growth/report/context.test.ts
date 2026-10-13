// 리포트 컨텍스트 조립 테스트. 순수 함수만 다룬다.
import { describe, expect, test } from "vitest";
import {
  ACTIVITY_TEXT_MAX,
  type ActivityRecordRow,
  type AdmissionRow,
  activityText,
  buildReportContext,
  careerChangedSincePrevious,
  cutsFromAdmissionRows,
  universitiesWithCuts,
  type ReportRow,
  toContextActivity,
  universityTargets,
} from "./context.js";

function activity(over: Partial<ActivityRecordRow> = {}): ActivityRecordRow {
  return {
    id: "a1",
    source_program: "deep",
    status: "confirmed",
    grade_label: "고1",
    semester: 1,
    subject_group: "과학",
    subject: "물리",
    topic: null,
    concept: null,
    method: null,
    result: null,
    limitation: null,
    ...over,
  };
}

describe("activityText", () => {
  test("값이 있는 필드만 라벨: 값 줄로 잇고 빈 필드는 줄을 만들지 않는다", () => {
    const text = activityText(
      activity({
        topic: "진자 주기",
        concept: "단진동",
        result: "  ",
        limitation: "",
      }),
    );
    expect(text).toBe("주제: 진자 주기\n개념: 단진동");
  });

  test("본문이 상한을 넘으면 ACTIVITY_TEXT_MAX 글자에서 자른다", () => {
    const text = activityText(
      activity({ result: "가".repeat(ACTIVITY_TEXT_MAX * 2) }),
    );
    expect(text).toHaveLength(ACTIVITY_TEXT_MAX);
  });
});

describe("toContextActivity", () => {
  test("행을 평탄화하고 교과군으로 group 을 정한다", () => {
    expect(toContextActivity(activity({ topic: "진자" }))).toEqual({
      id: "a1",
      sourceProgram: "deep",
      gradeLabel: "고1",
      semester: 1,
      subjectGroup: "과학",
      subject: "물리",
      topic: "진자",
      text: "주제: 진자",
      group: "curricular",
    });
  });

  test("창체 접두 교과군은 extracurricular, 비면 unclassified", () => {
    expect(toContextActivity(activity({ subject_group: "동아리" })).group).toBe(
      "extracurricular",
    );
    expect(toContextActivity(activity({ subject_group: null })).group).toBe(
      "unclassified",
    );
  });
});

describe("universityTargets", () => {
  test("프로필 희망 대학과 설문 q11 을 합집합으로 모으고 중복은 정규화 기준으로 버린다", () => {
    const targets = universityTargets(
      { q11: [{ name: "나대" }, { name: "가대학교" }] },
      { department: "경영학과", universities: ["가대"] },
    );
    expect(targets).toEqual([
      { universityName: "가대", departmentName: "경영학과" },
      { universityName: "나대", departmentName: "경영학과" },
    ]);
  });

  test("합집합은 최대 2개까지만 남긴다", () => {
    const targets = universityTargets(
      { q11: [{ name: "다대" }, "라대"] },
      { department: null, universities: ["가대", "나대"] },
    );
    expect(targets.map((t) => t.universityName)).toEqual(["가대", "나대"]);
  });

  test("프로필에 대학이 없으면 설문 문항만 쓴다", () => {
    const targets = universityTargets(
      {
        q10: { name: "법학과" },
        q11: [{ name: "가대" }, { name: "가대" }, "나대", { name: "다대" }],
      },
      { department: null, universities: [] },
    );
    expect(targets).toEqual([
      { universityName: "가대", departmentName: "법학과" },
      { universityName: "나대", departmentName: "법학과" },
    ]);
  });

  test("설문 q10 의 검색 선택값이 프로필 학과보다 우선한다", () => {
    const targets = universityTargets(
      { q10: { name: "법학과", source: "search" }, q11: ["가대"] },
      { department: "경영학과", universities: [] },
    );
    expect(targets[0]?.departmentName).toBe("법학과");
  });

  test("q10 이 직접 입력이면 프로필 학과를 쓴다", () => {
    const targets = universityTargets(
      { q10: { name: "법학과", source: "manual" }, q11: ["가대"] },
      { department: "경영학과", universities: [] },
    );
    expect(targets[0]?.departmentName).toBe("경영학과");
  });

  test("대학도 학과도 없으면 빈 배열, 학과만 없으면 null", () => {
    expect(universityTargets({}, null)).toEqual([]);
    expect(
      universityTargets({}, { department: null, universities: ["가대"] }),
    ).toEqual([{ universityName: "가대", departmentName: null }]);
  });
});

function adm(over: Partial<AdmissionRow> = {}): AdmissionRow {
  return {
    university_name: "가대",
    department_name: "경영학과",
    result_year: 2025,
    main_track: "종합",
    grade_50: 3.0,
    grade_70: null,
    screening_category: "일반",
    ...over,
  };
}

describe("cutsFromAdmissionRows", () => {
  test("대학, 학과별로 최근 2개년만 오래된 순으로 접는다", () => {
    const out = cutsFromAdmissionRows([
      adm({ result_year: 2022, grade_50: 2.0 }),
      adm({ result_year: 2024, grade_50: 3.1 }),
      adm({ result_year: 2023, grade_50: 3.2 }),
      adm({ university_name: "나대", result_year: 2024, grade_50: 4.0 }),
    ]);
    expect(out).toEqual([
      {
        universityName: "가대",
        departmentName: "경영학과",
        cuts: [
          { year: 2023, grade: 3.2 },
          { year: 2024, grade: 3.1 },
        ],
      },
      {
        universityName: "나대",
        departmentName: "경영학과",
        cuts: [{ year: 2024, grade: 4.0 }],
      },
    ]);
  });

  test("같은 연도는 종합 계열 전형을 우선하고 없으면 전체 중 최소 등급을 고른다", () => {
    const out = cutsFromAdmissionRows([
      adm({ result_year: 2024, main_track: "교과", grade_50: 2.0 }),
      adm({ result_year: 2024, main_track: "종합", grade_50: 3.5 }),
      adm({ result_year: 2024, main_track: "종합", grade_50: 3.1 }),
      adm({ result_year: 2023, main_track: "교과", grade_50: 2.8 }),
      adm({ result_year: 2023, main_track: "논술", grade_50: 2.5 }),
    ]);
    expect(out[0]?.cuts).toEqual([
      { year: 2023, grade: 2.5 },
      { year: 2024, grade: 3.1 },
    ]);
  });

  test("컷 값이 없는 행은 제외하고 지어내지 않는다", () => {
    const out = cutsFromAdmissionRows([
      adm({ result_year: 2024, grade_50: null, grade_70: null }),
      adm({ result_year: 2023, grade_50: 3.3 }),
    ]);
    expect(out[0]?.cuts).toEqual([{ year: 2023, grade: 3.3 }]);
  });

  test("grade_50 이 없으면 grade_70 을 쓴다", () => {
    const out = cutsFromAdmissionRows([
      adm({ result_year: 2024, grade_50: null, grade_70: 3.6 }),
    ]);
    expect(out[0]?.cuts).toEqual([{ year: 2024, grade: 3.6 }]);
  });

  test("일반, 추천형이 아닌 전형 행은 걸러낸다", () => {
    const out = cutsFromAdmissionRows([
      adm({ result_year: 2024, screening_category: "지역인재", grade_50: 1.0 }),
      adm({ result_year: 2024, screening_category: "추천형", grade_50: 2.9 }),
    ]);
    expect(out[0]?.cuts).toEqual([{ year: 2024, grade: 2.9 }]);
  });

  test("축약형과 정식 대학명 행을 같은 대학으로 묶는다", () => {
    const out = cutsFromAdmissionRows([
      adm({ university_name: "고려대", result_year: 2024 }),
      adm({ university_name: "고려대학교", result_year: 2023 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.cuts.map((c) => c.year)).toEqual([2023, 2024]);
  });

  test("입결 행이 없으면 빈 배열", () => {
    expect(cutsFromAdmissionRows([])).toEqual([]);
  });
});

function report(over: Partial<ReportRow> = {}): ReportRow {
  return {
    id: "r1",
    profile_id: "p1",
    track: "고2",
    survey_answers: {},
    activity_ids: [],
    grade_inputs: null,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

const NOW = "2026-10-06T00:00:00Z";

function build(
  over: {
    report?: Partial<ReportRow>;
    activities?: ActivityRecordRow[];
    profile?: Parameters<typeof buildReportContext>[0]["profile"];
    admissionRows?: AdmissionRow[];
    previousReport?: Parameters<typeof buildReportContext>[0]["previousReport"];
  } = {},
) {
  return buildReportContext({
    report: report(over.report),
    activities: over.activities ?? [],
    profile: over.profile ?? null,
    admissionRows: over.admissionRows ?? [],
    previousReport: over.previousReport ?? null,
    nowIso: NOW,
  });
}

describe("buildReportContext: 활동과 트랙", () => {
  test("트랙이 없으면 던진다", () => {
    expect(() => build({ report: { track: null } })).toThrow(
      "회차에 트랙이 없습니다",
    );
  });

  test("activity_ids 순서를 유지하고 planned 와 ids 에 없는 행은 뺀다", () => {
    const ctx = build({
      report: { activity_ids: ["b", "a", "c"] },
      activities: [
        activity({ id: "a" }),
        activity({ id: "b" }),
        activity({ id: "c", status: "planned" }),
        activity({ id: "z" }),
      ],
    });
    expect(ctx.activities.map((a) => a.id)).toEqual(["b", "a"]);
    expect(ctx.evidenceIds).toEqual(["b", "a"]);
  });

  test("고2 에 1학년 활동이 없으면 noFirstYearData 와 3-2 제외가 켜진다", () => {
    const ctx = build({
      report: { track: "고2", activity_ids: ["a"] },
      activities: [activity({ id: "a", grade_label: "고2" })],
    });
    expect(ctx.noFirstYearData).toBe(true);
    expect(ctx.omitted.ids).toContain("3-2");
    expect(ctx.expectedSectionIds).not.toContain("3-2");
  });

  test("고1 활동이 있으면 고2 는 noFirstYearData 가 꺼진다", () => {
    const ctx = build({
      report: { track: "고2", activity_ids: ["a"] },
      activities: [activity({ id: "a", grade_label: "고1" })],
    });
    expect(ctx.noFirstYearData).toBe(false);
    expect(ctx.expectedSectionIds).toContain("3-2");
  });

  test("고1 트랙은 noFirstYearData 가 아니고 현재 학년은 고1", () => {
    const ctx = build({ report: { track: "고1" } });
    expect(ctx.noFirstYearData).toBe(false);
    expect(ctx.currentGrade).toBe("고1");
  });

  test("졸업은 현재 학년 고3 이고 로드맵 섹션이 빠진다", () => {
    const ctx = build({ report: { track: "졸업" } });
    expect(ctx.currentGrade).toBe("고3");
    expect(ctx.omitted.ids).toEqual(["3-1", "3-2", "3-3", "3-4"]);
    expect(ctx.expectedSectionIds).not.toContain("3-1");
  });

  test("프로필 학년과 학기가 있으면 분석 범위가 그 학기까지로 줄어든다", () => {
    const ctx = build({
      report: { track: "고2" },
      profile: {
        school_type: "일반고",
        admission_year: 2025,
        grade: "고2",
        semester: 1,
        career: null,
        department: null,
        universities: [],
      },
    });
    expect(ctx.range.semesters).toEqual(["고1-1", "고1-2", "고2-1"]);
  });
});

describe("buildReportContext: 성적, 대학, 이전 서사", () => {
  test("grade_inputs 가 올바른 모양이면 그대로 쓴다", () => {
    const gradeInputs = {
      system: "five",
      semesters: [{ key: "고1-1", average: 2.5, source: "direct" }],
      note: null,
    };
    expect(build({ report: { grade_inputs: gradeInputs } }).grades).toEqual(
      gradeInputs,
    );
  });

  test("grade_inputs 가 깨졌거나 없으면 빈 구조를 쓴다", () => {
    const empty = { system: null, semesters: [], note: null };
    expect(build({ report: { grade_inputs: null } }).grades).toEqual(empty);
    expect(build({ report: { grade_inputs: "x" } }).grades).toEqual(empty);
    expect(
      build({ report: { grade_inputs: { system: "ten", semesters: [] } } })
        .grades,
    ).toEqual(empty);
    expect(
      build({ report: { grade_inputs: { system: "five", semesters: [1] } } })
        .grades,
    ).toEqual(empty);
  });

  test("희망 대학에 입결 컷을 붙이고 입결이 없으면 빈 배열", () => {
    const profile = {
      school_type: null,
      admission_year: null,
      grade: null,
      semester: null,
      career: null,
      department: "경영학과",
      universities: ["가대", "나대"],
    };
    const ctx = build({
      profile,
      admissionRows: [adm({ result_year: 2024, grade_50: 3.1 })],
    });
    expect(ctx.universities).toEqual([
      {
        universityName: "가대",
        departmentName: "경영학과",
        matchKind: "exact",
        matchedDepartmentName: "경영학과",
        cuts: [{ year: 2024, grade: 3.1 }],
      },
      {
        universityName: "나대",
        departmentName: "경영학과",
        matchKind: "none",
        matchedDepartmentName: null,
        cuts: [],
      },
    ]);
  });

  test("이전 회차가 없으면 previousNarrative 는 null", () => {
    expect(build().previousNarrative).toBeNull();
  });

  test("이전 회차에 서사가 있으면 주제, 발급 시각, 그때의 진로 답을 담는다", () => {
    const ctx = build({
      previousReport: {
        narrative_theme: "데이터로 보는 환경",
        issued_at: "2026-07-01T00:00:00Z",
        survey_answers: { q6: "환경공학자" },
      },
    });
    expect(ctx.previousNarrative).toEqual({
      theme: "데이터로 보는 환경",
      issuedAt: "2026-07-01T00:00:00Z",
      career: "환경공학자",
    });
  });

  test("이전 회차 서사 주제가 문자열이 아니면 null", () => {
    expect(
      build({
        previousReport: {
          narrative_theme: null,
          issued_at: "2026-07-01T00:00:00Z",
          survey_answers: {},
        },
      }).previousNarrative,
    ).toBeNull();
  });
});

describe("careerChangedSincePrevious", () => {
  const previousReport = {
    narrative_theme: "주제",
    issued_at: "2026-07-01T00:00:00Z",
    survey_answers: { q6: "환경공학자" },
  };

  test("현재 진로는 프로필이 우선이고 이전과 다르면 변경", () => {
    const profile = {
      school_type: null,
      admission_year: null,
      grade: null,
      semester: null,
      career: "의사",
      department: null,
      universities: [],
    };
    expect(
      careerChangedSincePrevious(
        build({
          profile,
          previousReport,
          report: { survey_answers: { q6: "환경공학자" } },
        }),
      ),
    ).toBe(true);
  });

  test("프로필 진로가 없으면 설문 답을 쓰고 같으면 변경 아님", () => {
    expect(
      careerChangedSincePrevious(
        build({
          previousReport,
          report: { survey_answers: { q6: " 환경공학자 " } },
        }),
      ),
    ).toBe(false);
  });

  test("이전 회차가 없으면 변경 아님", () => {
    expect(careerChangedSincePrevious(build())).toBe(false);
  });
});

describe("universitiesWithCuts: 학과 3단 매칭", () => {
  const rows = [
    adm({ university_name: "가대", department_name: "경영학과" }),
    adm({ university_name: "가대", department_name: "컴퓨터공학부" }),
    adm({ university_name: "가대", department_name: "컴퓨터과학부" }),
    adm({ university_name: "가대", department_name: "법학과" }),
    adm({ university_name: "나대", department_name: "경영학과" }),
  ];

  test("정규화 완전 일치는 exact", () => {
    const [u] = universitiesWithCuts(
      [{ universityName: "가대", departmentName: "경영 학과" }],
      rows,
    );
    expect(u?.matchKind).toBe("exact");
    expect(u?.matchedDepartmentName).toBe("경영학과");
    expect(u?.cuts).toEqual([{ year: 2025, grade: 3.0 }]);
  });

  test("정식 대학명 입력도 축약형 행과 연결된다", () => {
    const [u] = universitiesWithCuts(
      [{ universityName: "가대학교", departmentName: "경영학과" }],
      rows,
    );
    expect(u?.matchKind).toBe("exact");
    expect(u?.cuts).toHaveLength(1);
  });

  test("포함 후보가 대학 안에 하나뿐이면 approx", () => {
    const [u] = universitiesWithCuts(
      [{ universityName: "가대", departmentName: "법학" }],
      rows,
    );
    expect(u?.matchKind).toBe("approx");
    expect(u?.matchedDepartmentName).toBe("법학과");
    expect(u?.cuts).toHaveLength(1);
  });

  test("학과명이 후보를 포함하는 방향도 approx", () => {
    const [u] = universitiesWithCuts(
      [{ universityName: "가대", departmentName: "경영학과(야간)" }],
      rows,
    );
    expect(u?.matchKind).toBe("approx");
    expect(u?.matchedDepartmentName).toBe("경영학과");
  });

  test("후보가 둘 이상이면 none", () => {
    const [u] = universitiesWithCuts(
      [{ universityName: "가대", departmentName: "컴퓨터" }],
      rows,
    );
    expect(u?.matchKind).toBe("none");
    expect(u?.cuts).toEqual([]);
  });

  test("다른 대학의 학과는 후보가 아니다", () => {
    const [u] = universitiesWithCuts(
      [{ universityName: "나대", departmentName: "법학" }],
      rows,
    );
    expect(u?.matchKind).toBe("none");
  });

  test("학과가 없으면 none", () => {
    const [u] = universitiesWithCuts(
      [{ universityName: "가대", departmentName: null }],
      rows,
    );
    expect(u?.matchKind).toBe("none");
    expect(u?.cuts).toEqual([]);
  });
});
