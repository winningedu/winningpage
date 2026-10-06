import { describe, expect, test } from "vitest";
import type { OpenReport } from "@/lib/growth/api";
import { GROWTH_PATHS } from "../growthPaths";
import {
  deriveStartMode,
  formatSavedAt,
  formatStartedDate,
  needsProfileForm,
  pickProfileValues,
  progressPercent,
  resumeTarget,
  studentSummaryLine,
  validateProfileForm,
} from "./startLogic";

function open(phase: OpenReport["resume"]["phase"]): OpenReport {
  return {
    id: "r1",
    status: "draft",
    currentStep: 0,
    track: null,
    answered: 3,
    total: 24,
    answers: {},
    lastActivityAt: "2026-10-06T00:00:00Z",
    startedAt: "2026-10-06T00:00:00Z",
    resume: { resumeStep: 0, phase },
    card: { startedAt: "", lastSavedAt: "", stepLabel: "" },
  };
}

describe("resumeTarget", () => {
  test("설문 단계 회차는 학생 조사 화면으로 이어진다", () => {
    expect(resumeTarget(open("survey"))).toBe(GROWTH_PATHS.survey);
  });

  test("자료 수집 단계는 활동 선택 화면, 생성 단계는 리포트 생성 화면으로 이어진다", () => {
    expect(resumeTarget(open("collect"))).toBe(GROWTH_PATHS.collect);
    expect(resumeTarget(open("generating"))).toBe(GROWTH_PATHS.generate);
  });

  test("리포트와 실행계획 단계는 해당 화면으로 이어진다", () => {
    expect(resumeTarget(open("report"))).toBe(GROWTH_PATHS.reports);
    expect(resumeTarget(open("plan"))).toBe(GROWTH_PATHS.plan);
  });
});

const ENT = {
  hasAccess: true,
  quotaTotal: 3,
  quotaRemaining: 3,
  planEndsAt: null,
  planLabel: null,
};

describe("deriveStartMode", () => {
  test("이용권이 있고 미완 회차가 없으면 새로 시작한다", () => {
    expect(deriveStartMode({ entitlement: ENT, openReport: null })).toBe(
      "start",
    );
  });

  test("미완 회차가 있으면 이용권과 상관없이 이어서 한다", () => {
    expect(
      deriveStartMode({
        entitlement: { ...ENT, quotaRemaining: 0 },
        openReport: open("survey"),
      }),
    ).toBe("resume");
  });

  test("잔여 0회 또는 접근 권한 없음이면 구매 안내로 막는다", () => {
    expect(
      deriveStartMode({
        entitlement: { ...ENT, quotaRemaining: 0 },
        openReport: null,
      }),
    ).toBe("blocked");
    expect(
      deriveStartMode({
        entitlement: { ...ENT, hasAccess: false },
        openReport: null,
      }),
    ).toBe("blocked");
  });

  test("잔여 회차를 모르면(null) 접근 권한만 본다", () => {
    expect(
      deriveStartMode({
        entitlement: { ...ENT, quotaRemaining: null },
        openReport: null,
      }),
    ).toBe("start");
  });
});

describe("pickProfileValues", () => {
  test("student_profiles 값이 있으면 그 값을 쓰고 안내 플래그는 끈다", () => {
    const r = pickProfileValues(
      {
        school_type: "일반고",
        admission_year: 2025,
        grade: "고2",
        semester: 2,
        career: "도시 데이터 분석",
        department: "도시공학과",
        universities: ["서울시립대학교", "건국대학교"],
      },
      { department: "다른학과", source: "goal" },
    );
    expect(r.values).toEqual({
      schoolType: "일반고",
      admissionYear: 2025,
      grade: "고2",
      semester: 2,
      career: "도시 데이터 분석",
      department: "도시공학과",
      universities: ["서울시립대학교", "건국대학교"],
    });
    expect(r.usedInitial).toBe(false);
  });

  test("비어 있는 값은 목표관리 초기값으로 채우고 안내 플래그를 켠다", () => {
    const r = pickProfileValues(null, {
      department: "도시공학과",
      universities: ["서울시립대학교"],
      grade: "고2",
      schoolType: "일반고",
      source: "goal",
    });
    expect(r.values.department).toBe("도시공학과");
    expect(r.values.universities).toEqual(["서울시립대학교"]);
    expect(r.values.grade).toBe("고2");
    expect(r.values.schoolType).toBe("일반고");
    expect(r.values.semester).toBeNull();
    expect(r.usedInitial).toBe(true);
  });

  test("허용되지 않은 학년과 학교 유형은 버린다", () => {
    const r = pickProfileValues({ grade: "중3", school_type: "중학교" }, null);
    expect(r.values.grade).toBeNull();
    expect(r.values.schoolType).toBeNull();
  });
});

describe("needsProfileForm", () => {
  test("필수 4칸(학교 유형, 입학 연도, 학년, 학기)이 모두 있어야 요약을 보여준다", () => {
    const full = pickProfileValues(
      {
        school_type: "일반고",
        admission_year: 2025,
        grade: "고2",
        semester: 2,
      },
      null,
    ).values;
    expect(needsProfileForm(full)).toBe(false);
    expect(needsProfileForm({ ...full, admissionYear: null })).toBe(true);
    expect(needsProfileForm({ ...full, semester: null })).toBe(true);
  });
});

const FORM = {
  schoolType: "일반고",
  admissionYear: "2025",
  grade: "고2",
  semester: "2",
  career: " 도시 데이터 분석 ",
  department: "도시공학과",
  universities: ["서울시립대학교", ""],
};

describe("validateProfileForm", () => {
  test("올바른 입력은 저장용 값으로 정리해 돌려준다", () => {
    expect(validateProfileForm(FORM, 2026)).toEqual({
      ok: true,
      value: {
        school_type: "일반고",
        admission_year: 2025,
        grade: "고2",
        semester: 2,
        career: "도시 데이터 분석",
        department: "도시공학과",
        universities: ["서울시립대학교"],
      },
    });
  });

  test("필수 칸이 비면 이유를 돌려준다", () => {
    for (const key of ["schoolType", "admissionYear", "grade", "semester"]) {
      const r = validateProfileForm({ ...FORM, [key]: "" }, 2026);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).not.toBe("");
    }
  });

  test("입학 연도는 2015부터 올해 다음 해까지 4자리 숫자만 허용한다", () => {
    expect(
      validateProfileForm({ ...FORM, admissionYear: "2014" }, 2026).ok,
    ).toBe(false);
    expect(
      validateProfileForm({ ...FORM, admissionYear: "2027" }, 2026).ok,
    ).toBe(true);
    expect(
      validateProfileForm({ ...FORM, admissionYear: "2028" }, 2026).ok,
    ).toBe(false);
    expect(
      validateProfileForm({ ...FORM, admissionYear: "20x5" }, 2026).ok,
    ).toBe(false);
  });

  test("선택 칸이 비면 null 로 저장한다", () => {
    const r = validateProfileForm(
      { ...FORM, career: " ", department: "", universities: ["", ""] },
      2026,
    );
    expect(r.ok && r.value.career).toBeNull();
    expect(r.ok && r.value.department).toBeNull();
    expect(r.ok && r.value.universities).toEqual([]);
  });

  test("허용되지 않은 학년, 학기, 학교 유형은 거절한다", () => {
    expect(validateProfileForm({ ...FORM, grade: "중3" }, 2026).ok).toBe(false);
    expect(validateProfileForm({ ...FORM, semester: "3" }, 2026).ok).toBe(
      false,
    );
    expect(
      validateProfileForm({ ...FORM, schoolType: "중학교" }, 2026).ok,
    ).toBe(false);
  });

  test("같은 희망 대학을 두 번 적으면 거절한다", () => {
    const r = validateProfileForm(
      { ...FORM, universities: ["서울대학교", " 서울대학교 "] },
      2026,
    );
    expect(r.ok).toBe(false);
  });
});

describe("studentSummaryLine", () => {
  const base = pickProfileValues(
    {
      school_type: "일반고",
      admission_year: 2025,
      grade: "고2",
      semester: 2,
      department: "도시공학과",
    },
    null,
  ).values;

  test("학년 학기와 희망 학과를 한 줄로 잇는다", () => {
    expect(studentSummaryLine(base)).toBe("고2 2학기, 도시공학과 희망");
  });

  test("학과가 없으면 진로를 쓰고 둘 다 없으면 그 조각을 뺀다", () => {
    expect(
      studentSummaryLine({ ...base, department: null, career: "데이터" }),
    ).toBe("고2 2학기, 데이터 희망");
    expect(studentSummaryLine({ ...base, department: null })).toBe("고2 2학기");
  });

  test("학년이 졸업이면 학기를 붙이지 않는다", () => {
    expect(
      studentSummaryLine({ ...base, grade: "졸업", department: null }),
    ).toBe("졸업");
  });

  test("값이 하나도 없으면 null", () => {
    expect(
      studentSummaryLine({
        ...base,
        grade: null,
        semester: null,
        department: null,
      }),
    ).toBeNull();
  });
});

describe("날짜 표기와 진행률", () => {
  test("시작일은 한국어 날짜, 마지막 저장은 점 구분 날짜와 시각", () => {
    const iso = new Date(2026, 10, 2, 21, 40).toISOString();
    expect(formatStartedDate(iso)).toBe("2026년 11월 2일");
    expect(formatSavedAt(iso)).toBe("2026.11.02 21:40");
  });

  test("해석할 수 없는 날짜는 null", () => {
    expect(formatStartedDate("")).toBeNull();
    expect(formatSavedAt("x")).toBeNull();
  });

  test("진행률은 0에서 100 사이 정수이고 total 0 이면 0", () => {
    expect(progressPercent(13, 24)).toBe(54);
    expect(progressPercent(5, 0)).toBe(0);
    expect(progressPercent(30, 24)).toBe(100);
  });
});
