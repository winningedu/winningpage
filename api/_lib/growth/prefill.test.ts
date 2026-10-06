// 성장설계 prefill 회귀 테스트(No.19, 20, 33, 34, 143). 순수 함수라 DB/네트워크 없이 검증한다.
import { describe, expect, test } from "vitest";
import {
  autoFilledFromActivities,
  initialStudentProfileFromGoal,
  prefillSurveyFromDiagnosis,
  semesterSubjectsFromNaesin,
} from "./prefill.js";

describe("prefillSurveyFromDiagnosis, q5 진로 확정 정도(No.34)", () => {
  test("BOTH 는 '정해짐' 으로 채운다", () => {
    const r = prefillSurveyFromDiagnosis({ goal: { level: "BOTH" } });
    expect(r.q5).toBe("정해짐");
    expect(r.filledFrom).toBe("diagnosis");
  });

  test.each([
    ["UNIV_ONLY", "고민 중"],
    ["MAJOR_ONLY", "고민 중"],
    ["TIER_ONLY", "고민 중"],
    ["UNDECIDED_MULTI", "탐색 중"],
    ["NONE", "탐색 중"],
  ])("%s 는 '%s' 로 채운다", (level, expected) => {
    expect(prefillSurveyFromDiagnosis({ goal: { level } }).q5).toBe(expected);
  });

  test("대응 없는 코드나 level 부재는 q5 를 비운다", () => {
    expect(prefillSurveyFromDiagnosis({ goal: { level: "???" } })).toEqual({
      filledFrom: "diagnosis",
    });
    expect(prefillSurveyFromDiagnosis({ goal: { level: null } })).toEqual({
      filledFrom: "diagnosis",
    });
  });
});

describe("prefillSurveyFromDiagnosis, q10, q11, q24, 비객체(No.34)", () => {
  test("targetMajor 가 있으면 q10 을 {name, source} 로 채운다", () => {
    const r = prefillSurveyFromDiagnosis({
      goal: { targetMajor: " 경영학과 " },
    });
    expect(r.q10).toEqual({ name: "경영학과", source: "diagnosis" });
  });

  test("targetMajor 가 비어 있으면 q10 을 비운다", () => {
    expect(
      prefillSurveyFromDiagnosis({ goal: { targetMajor: "  " } }).q10,
    ).toBeUndefined();
    expect(
      prefillSurveyFromDiagnosis({ goal: { targetMajor: null } }).q10,
    ).toBeUndefined();
  });

  test("targetUniversity 가 있으면 q11 을 1곳짜리 배열로 채운다", () => {
    const r = prefillSurveyFromDiagnosis({
      goal: { targetUniversity: "연세대" },
    });
    expect(r.q11).toEqual([{ name: "연세대", source: "diagnosis" }]);
  });

  test("targetUniversity 가 없으면 q11 을 비운다", () => {
    expect(prefillSurveyFromDiagnosis({ goal: {} }).q11).toBeUndefined();
  });

  test("schedule 코드는 주당 시간과 대응하지 않아 q24 를 지어내지 않는다", () => {
    for (const schedule of [
      "PA_7D",
      "EXAM_2W",
      "MONTH_1",
      "SUSI",
      "NONE",
      "UNKNOWN",
    ]) {
      expect(prefillSurveyFromDiagnosis({ schedule }).q24).toBeUndefined();
    }
  });

  test("snapshot 이 객체가 아니면 빈 결과다", () => {
    for (const bad of [null, undefined, "x", 3, []]) {
      expect(prefillSurveyFromDiagnosis(bad)).toEqual({
        filledFrom: "diagnosis",
      });
    }
  });
});

describe("initialStudentProfileFromGoal(No.19, 20)", () => {
  test("입력이 null 이면 source 만 담는다", () => {
    expect(initialStudentProfileFromGoal(null)).toEqual({ source: "goal" });
  });

  test("department 는 ideal_department 를 우선하고 없으면 min_department 를 쓴다", () => {
    expect(
      initialStudentProfileFromGoal({
        ideal_department: "의예",
        min_department: "생명",
      }).department,
    ).toBe("의예");
    expect(
      initialStudentProfileFromGoal({
        ideal_department: " ",
        min_department: "생명",
      }).department,
    ).toBe("생명");
  });

  test("universities 는 비지 않은 것만, 중복 제거, 최대 2곳이다", () => {
    expect(
      initialStudentProfileFromGoal({
        ideal_university: "서울대",
        min_university: "고려대",
      }).universities,
    ).toEqual(["서울대", "고려대"]);
    expect(
      initialStudentProfileFromGoal({
        ideal_university: "서울대",
        min_university: "서울대",
      }).universities,
    ).toEqual(["서울대"]);
    expect(
      initialStudentProfileFromGoal({
        ideal_university: "",
        min_university: null,
      }).universities,
    ).toBeUndefined();
  });

  test("grade 는 고1, 고2, 고3 일 때만 채운다", () => {
    expect(initialStudentProfileFromGoal({ grade: "고2" }).grade).toBe("고2");
    expect(
      initialStudentProfileFromGoal({ grade: "중3" }).grade,
    ).toBeUndefined();
  });

  test("schoolType 은 school_type 그대로 옮기고 career 는 절대 채우지 않는다", () => {
    const r = initialStudentProfileFromGoal({
      school_type: "일반고",
      career: "의사",
    });
    expect(r.schoolType).toBe("일반고");
    expect("career" in r).toBe(false);
  });
});

const exam = (key: string, subjects: [string, unknown][], group = "all") => ({
  key,
  groups: {
    [group]: {
      avg: 3,
      subjects: subjects.map(([name, grade]) => ({ name, grade })),
    },
  },
});

describe("semesterSubjectsFromNaesin(No.19)", () => {
  test.each(["고1 1학기", "1-1", "1학년 1학기", "고1-1", "1학년 1학기 기말"])(
    "key '%s' 를 '고1-1' 로 정규화한다",
    (key) => {
      const r = semesterSubjectsFromNaesin({
        naesinExams: [exam(key, [["국어", 2]])],
      });
      expect(r.semesters.map((x) => x.key)).toEqual(["고1-1"]);
      expect(r.skipped).toEqual([]);
    },
  );

  test("naesinExams 가 배열 자체로 와도 읽는다", () => {
    const r = semesterSubjectsFromNaesin([exam("2-2", [["수학", 3]])]);
    expect(r.semesters[0]).toEqual({
      key: "고2-2",
      examLabel: "2-2",
      subjects: [{ name: "수학", grade: 3 }],
    });
  });

  test("같은 학기에 중간, 기말이 있으면 기말의 과목만 쓴다", () => {
    const r = semesterSubjectsFromNaesin([
      exam("1학년 1학기 기말", [["국어", 1]]),
      exam("1학년 1학기 중간", [["국어", 4]]),
    ]);
    expect(r.semesters).toHaveLength(1);
    expect(r.semesters[0]?.subjects).toEqual([{ name: "국어", grade: 1 }]);
  });

  test("기말이 없으면 배열 뒤쪽 시험을 쓴다", () => {
    const r = semesterSubjectsFromNaesin([
      exam("1-1", [["국어", 4]]),
      exam("1-1", [["국어", 2]]),
    ]);
    expect(r.semesters[0]?.subjects).toEqual([{ name: "국어", grade: 2 }]);
  });

  test("모든 groups 의 과목을 평탄화하고 숫자가 아닌 grade 는 제외한다", () => {
    const r = semesterSubjectsFromNaesin([
      {
        key: "1-1",
        groups: {
          a: {
            avg: 2,
            subjects: [
              { name: "국어", grade: 2 },
              { name: "음악", grade: "P" },
            ],
          },
          b: { avg: 3, subjects: [{ name: "수학", grade: 3 }] },
        },
      },
    ]);
    expect(r.semesters[0]?.subjects).toEqual([
      { name: "국어", grade: 2 },
      { name: "수학", grade: 3 },
    ]);
  });

  test("파싱 불가한 key 는 건너뛰고 skipped 에 담는다", () => {
    const r = semesterSubjectsFromNaesin([
      exam("모의고사", [["국어", 2]]),
      exam("1-2", [["국어", 2]]),
    ]);
    expect(r.semesters.map((x) => x.key)).toEqual(["고1-2"]);
    expect(r.skipped).toEqual(["모의고사"]);
  });

  test("중학교 학기 키는 고1-2 로 받아들이지 않고 skipped 에 담는다", () => {
    const r = semesterSubjectsFromNaesin([
      exam("중1 2학기", [["국어", 2]]),
      exam("중3-1", [["국어", 2]]),
    ]);
    expect(r.semesters).toEqual([]);
    expect(r.skipped).toEqual(["중1 2학기", "중3-1"]);
  });

  test("입력이 배열이 아니면 빈 결과다", () => {
    expect(semesterSubjectsFromNaesin(null)).toEqual({
      semesters: [],
      skipped: [],
    });
  });
});

describe("autoFilledFromActivities(No.33, 143)", () => {
  test("활동이 2건 이상인 과목만 빈도순으로 고른다", () => {
    const r = autoFilledFromActivities([
      { subject: "수학" },
      { subject: "국어" },
      { subject: "국어" },
      { subject: "국어" },
      { subject: "수학" },
      { subject: "영어" },
      { subject: null },
      {},
    ]);
    expect(r.favoriteSubjects).toEqual(["국어", "수학"]);
  });

  test("sources 에서 책으로 보이는 항목만 모으고 중복은 한 번만 담는다", () => {
    const r = autoFilledFromActivities([
      {
        sources: [
          "『사피엔스』",
          "https://example.com",
          "코스모스(저 칼 세이건)",
          { type: "book", title: "총 균 쇠" },
          { type: "article", title: "논문" },
          "『사피엔스』",
        ],
      },
      { sources: "문자열 단독" },
    ]);
    expect(r.books).toEqual([
      "『사피엔스』",
      "코스모스(저 칼 세이건)",
      "총 균 쇠",
    ]);
  });

  test("겹낫표와 홑낫표는 여는 쪽만 있어도 닫는 쪽만 있어도 책으로 본다", () => {
    const r = autoFilledFromActivities([
      {
        sources: [
          "『토지",
          "채식주의자』",
          "「소년이 온다",
          "작별하지 않는다」",
        ],
      },
    ]);
    expect(r.books).toEqual([
      "『토지",
      "채식주의자』",
      "「소년이 온다",
      "작별하지 않는다」",
    ]);
  });

  test("근거가 없으면 빈 배열이다", () => {
    expect(autoFilledFromActivities([])).toEqual({
      favoriteSubjects: [],
      books: [],
    });
  });
});
