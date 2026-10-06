// 성장설계 등급 체계 판정·평균 계산 테스트(No.73·74·75·120·153·154).
// 순수 함수만 다루므로 DB/네트워크 없이 검증한다.
import { describe, expect, test } from "vitest";
import {
  deriveGradeSystem,
  FIVE_SCALE_BANDS,
  averageGrade,
  gradeFromPercentile,
  isExcludedFromAverage,
  semesterAverages,
} from "./gradeSystem.js";

describe("deriveGradeSystem", () => {
  test("2025년 입학은 5등급제", () => {
    expect(deriveGradeSystem(2025)).toBe("five");
  });

  test("2024년 이하 입학은 9등급제", () => {
    expect(deriveGradeSystem(2024)).toBe("nine");
    expect(deriveGradeSystem(2020)).toBe("nine");
  });

  test("2026년 이후 입학도 5등급제", () => {
    expect(deriveGradeSystem(2026)).toBe("five");
  });

  test("값이 없거나 정수가 아니면 null (폴백 없음)", () => {
    expect(deriveGradeSystem(null)).toBeNull();
    expect(deriveGradeSystem(undefined)).toBeNull();
    expect(deriveGradeSystem(2025.5)).toBeNull();
    expect(deriveGradeSystem(Number.NaN)).toBeNull();
  });
});

describe("gradeFromPercentile (5등급제, No.74)", () => {
  test("구간 상수는 누적 10/34/66/90/100", () => {
    expect(FIVE_SCALE_BANDS).toEqual([
      { grade: 1, cumulativePercent: 10 },
      { grade: 2, cumulativePercent: 34 },
      { grade: 3, cumulativePercent: 66 },
      { grade: 4, cumulativePercent: 90 },
      { grade: 5, cumulativePercent: 100 },
    ]);
  });

  test.each([
    [0, 1],
    [10, 1],
    [10.1, 2],
    [34, 2],
    [34.1, 3],
    [66, 3],
    [66.1, 4],
    [90, 4],
    [90.1, 5],
    [100, 5],
  ])("상위 %s%% 는 %s등급", (percentile, grade) => {
    expect(gradeFromPercentile(percentile, "five")).toBe(grade);
  });

  test("범위 밖이거나 숫자가 아니면 null", () => {
    expect(gradeFromPercentile(-1, "five")).toBeNull();
    expect(gradeFromPercentile(100.1, "five")).toBeNull();
    expect(gradeFromPercentile(Number.NaN, "five")).toBeNull();
  });
});

describe("gradeFromPercentile (9등급제)", () => {
  test.each([
    [4, 1],
    [4.1, 2],
    [11, 2],
    [23, 3],
    [40, 4],
    [60, 5],
    [77, 6],
    [89, 7],
    [96, 8],
    [96.1, 9],
    [100, 9],
  ])("상위 %s%% 는 %s등급", (percentile, grade) => {
    expect(gradeFromPercentile(percentile, "nine")).toBe(grade);
  });
});

describe("isExcludedFromAverage (No.75, No.154)", () => {
  test.each([
    "여행지리",
    "역사로 탐구하는 현대 세계",
    "사회문제 탐구",
    "금융과 경제생활",
    "윤리문제 탐구",
    "기후변화와 지속가능한 세계",
    "과학의 역사와 문화",
    "기후변화와 환경생태",
    "융합과학 탐구",
  ])("사회·과학 융합선택 %s 는 평균에서 제외", (name) => {
    expect(isExcludedFromAverage(name)).toBe(true);
  });

  test.each([
    "체육",
    "운동과 건강",
    "음악",
    "미술",
    "연극",
    "철학",
    "논리학",
    "심리학",
    "교육학",
    "종교학",
    "진로와 직업",
    "생태와 환경",
    "인간과 경제활동",
    "논술",
  ])("체육·예술·교양 %s 는 평균에서 제외", (name) => {
    expect(isExcludedFromAverage(name)).toBe(true);
  });

  test("과학탐구실험 1·2 는 제외, 표기 차이(로마숫자·공백)를 정규화해 비교", () => {
    expect(isExcludedFromAverage("과학탐구실험1")).toBe(true);
    expect(isExcludedFromAverage("과학탐구실험Ⅱ")).toBe(true);
    expect(isExcludedFromAverage("과학탐구실험 2")).toBe(true);
    expect(isExcludedFromAverage(" 여행 지리 ")).toBe(true);
  });

  test.each(["대수", "확률과 통계", "영어Ⅰ", "영어 1", "국어", "물리학Ⅰ"])(
    "일반 과목 %s 는 포함",
    (name) => {
      expect(isExcludedFromAverage(name)).toBe(false);
    },
  );

  test("사전에 없는 이름은 false", () => {
    expect(isExcludedFromAverage("")).toBe(false);
    expect(isExcludedFromAverage("없는과목")).toBe(false);
  });
});

describe("averageGrade (No.75, No.154)", () => {
  test("제외 과목을 빼고 산술평균을 낸다", () => {
    const result = averageGrade([
      { name: "국어", grade: 2 },
      { name: "대수", grade: 3 },
      { name: "체육", grade: 1 },
      { name: "여행지리", grade: 1 },
    ]);
    expect(result).toEqual({
      average: 2.5,
      included: ["국어", "대수"],
      excluded: ["체육", "여행지리"],
    });
  });

  test("grade 가 null 인 과목은 평균에서 빠지고 included 에도 넣지 않는다", () => {
    const result = averageGrade([
      { name: "국어", grade: 2 },
      { name: "영어Ⅰ", grade: null },
    ]);
    expect(result.average).toBe(2);
    expect(result.included).toEqual(["국어"]);
    expect(result.excluded).toEqual([]);
  });

  test("남는 과목이 없으면 average 는 null", () => {
    expect(averageGrade([{ name: "체육", grade: 1 }]).average).toBeNull();
    expect(averageGrade([]).average).toBeNull();
  });

  test("소수 둘째 자리에서 반올림", () => {
    const result = averageGrade([
      { name: "국어", grade: 1 },
      { name: "수학", grade: 2 },
      { name: "영어", grade: 2 },
    ]);
    expect(result.average).toBe(1.67);
  });
});

describe("semesterAverages", () => {
  test("학기별 평균을 입력 순서대로 계산하고 학기 키를 그대로 보존한다", () => {
    const result = semesterAverages([
      {
        key: "고1-1",
        subjects: [
          { name: "국어", grade: 1 },
          { name: "수학", grade: 2 },
        ],
      },
      { key: "고1-2", subjects: [{ name: "체육", grade: 1 }] },
    ]);
    expect(result).toEqual([
      { key: "고1-1", average: 1.5, included: ["국어", "수학"], excluded: [] },
      { key: "고1-2", average: null, included: [], excluded: ["체육"] },
    ]);
  });
});

describe("isExcludedFromAverage 교육과정 명칭 보강", () => {
  test.each(["스포츠 문화", "인간과 철학", "음악 감상과 비평"])(
    "2022 개정 명칭 %s 는 평균에서 제외한다",
    (name) => {
      expect(isExcludedFromAverage(name)).toBe(true);
    },
  );

  test.each(["실용 경제", "체육 탐구", "보건"])(
    "2015 개정 명칭 %s 는 평균에서 제외한다",
    (name) => {
      expect(isExcludedFromAverage(name)).toBe(true);
    },
  );
});
