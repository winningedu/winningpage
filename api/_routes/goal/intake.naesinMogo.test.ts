import { describe, expect, it } from "vitest";
import {
  deriveMogo,
  deriveNaesin,
  MOCK_FLOW,
  NAESIN_FLOW,
  validateIntakeBody,
} from "./intake.js";

// QA 행290・291 재설계(qa3-held-high-design.md §2・§3) — 온보딩 내신・모의고사 입력을
// "현재 학년 고정 4회차"에서 고1~고3 전 시퀀스로 확장한 뒤의 검증・파생 로직 회귀 테스트.
// intake.studyHours.test.ts와 같은 규약(핸들러 I/O는 로컬 스택 QA로, 순수 함수만 여기서).

// QA 행293(schedule 병렬 유닛)이 단일 세트 4필드(dailySchedule)를 요일별
// {wake, sleep, hasSchool, schoolStart, schoolEnd, academies[]}(weekSchedule)로
// 바꿨다 — intake.weekSchedule.test.ts VALID_DAY와 같은 모양.
const VALID_WEEKDAY = {
  wake: 6,
  sleep: 24,
  hasSchool: true,
  schoolStart: 8.5,
  schoolEnd: 16.5,
  academies: [],
};
const VALID_WEEKEND = {
  ...VALID_WEEKDAY,
  hasSchool: false,
};

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    schoolType: "general",
    grade: "g3",
    upperUniversity: { university: "서울대", department: "경영학과" },
    lowerUniversity: { university: "연세대", department: "경영학과" },
    naesin: { lastExam: "", overall: "", priorNaesinGrade: "3", exams: {} },
    mockExam: { lastRound: "", track: "", rounds: {} },
    studyHours: {
      mon: 2,
      tue: 2,
      wed: 2,
      thu: 2,
      fri: 2,
      sat: 4,
      sun: 4,
    },
    weekSchedule: {
      mon: VALID_WEEKDAY,
      tue: VALID_WEEKDAY,
      wed: VALID_WEEKDAY,
      thu: VALID_WEEKDAY,
      fri: VALID_WEEKDAY,
      sat: VALID_WEEKEND,
      sun: VALID_WEEKEND,
    },
    ...overrides,
  };
}

describe("NAESIN_FLOW / MOCK_FLOW", () => {
  it("내신은 고1~고3 × 4회차 = 12개다", () => {
    expect(NAESIN_FLOW).toHaveLength(12);
  });

  it("모의고사는 고1・고2 4회 + 고3 6회(5・7모 포함) = 14개다", () => {
    expect(MOCK_FLOW).toHaveLength(14);
    const g3Rounds = MOCK_FLOW.filter((round) => round.gradeLabel === "고3");
    expect(g3Rounds.map((round) => round.examLabel)).toEqual([
      "3모",
      "5모",
      "6모",
      "7모",
      "9모",
      "10모",
    ]);
  });
});

describe("validateIntakeBody — 내신", () => {
  it("lastExam이 학년보다 앞선 시험이면 400", () => {
    const result = validateIntakeBody(
      baseBody({
        grade: "g1",
        naesin: {
          lastExam: "g2_s1mid",
          overall: "2",
          priorNaesinGrade: "",
          exams: {},
        },
      }),
    );
    expect(result.error?.status).toBe(400);
  });

  it("고1・고2는 overall이 5등급제(1~5) 범위를 벗어나면 400", () => {
    const result = validateIntakeBody(
      baseBody({
        grade: "g1",
        naesin: {
          lastExam: "g1_s1mid",
          overall: "6",
          priorNaesinGrade: "",
          exams: {},
        },
      }),
    );
    expect(result.error?.status).toBe(400);
  });

  it("고3은 overall이 9등급제(1~9) 범위면 통과한다", () => {
    const result = validateIntakeBody(
      baseBody({
        naesin: {
          lastExam: "g3_s1mid",
          overall: "7",
          priorNaesinGrade: "",
          exams: {},
        },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.input?.naesinScale).toBe(9);
  });

  it('lastExam이 없음("")이면 고1은 중학교 평균 점수(0~100) 도메인을 요구한다', () => {
    const tooHigh = validateIntakeBody(
      baseBody({
        grade: "g1",
        naesin: {
          lastExam: "",
          overall: "",
          priorNaesinGrade: "101",
          exams: {},
        },
      }),
    );
    expect(tooHigh.error?.status).toBe(400);

    const ok = validateIntakeBody(
      baseBody({
        grade: "g1",
        naesin: {
          lastExam: "",
          overall: "",
          priorNaesinGrade: "87.5",
          exams: {},
        },
      }),
    );
    expect(ok.error).toBeUndefined();
  });

  it("빈 과목군은 저장에서 제외하고, 채워진 군만 남긴다", () => {
    const result = validateIntakeBody(
      baseBody({
        naesin: {
          lastExam: "g3_s1mid",
          overall: "3",
          priorNaesinGrade: "",
          exams: {
            g3_s1mid: {
              groups: {
                korean: { avg: "2", subjects: [] },
                math: { avg: "", subjects: [] },
              },
            },
          },
        },
      }),
    );
    expect(result.error).toBeUndefined();
    const exam = result.input?.naesinExams.find(
      (e: { key: string }) => e.key === "g3_s1mid",
    );
    expect(Object.keys(exam?.groups ?? {})).toEqual(["korean"]);
    expect(exam?.groups.korean?.avg).toBe(2);
  });

  it("표시 창(선택 시험 포함 역순 최대 3개) 밖의 시험 데이터는 저장하지 않는다", () => {
    // g3_s2mid(선택, NAESIN_FLOW index 10) 기준 창은 [g3_s1mid, g3_s1final, g3_s2mid]
    // (index 8~10) 3개다. g1_s1mid(index 0)는 그 창 밖이라 채워져 있어도 무시된다.
    const result = validateIntakeBody(
      baseBody({
        naesin: {
          lastExam: "g3_s2mid",
          overall: "3",
          priorNaesinGrade: "",
          exams: {
            g3_s2mid: { groups: { korean: { avg: "2", subjects: [] } } },
            g1_s1mid: { groups: { korean: { avg: "4", subjects: [] } } },
          },
        },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(
      (result.input?.naesinExams ?? []).map((e: { key: string }) => e.key),
    ).toEqual(["g3_s2mid"]);
  });
});

describe("validateIntakeBody — 모의고사", () => {
  it("lastRound가 학년보다 앞선 회차면 400", () => {
    const result = validateIntakeBody(
      baseBody({
        grade: "g1",
        mockExam: { lastRound: "g2_mar", track: "과탐", rounds: {} },
      }),
    );
    expect(result.error?.status).toBe(400);
  });

  it("없음이 아닌데 track을 안 고르면 400", () => {
    const result = validateIntakeBody(
      baseBody({
        mockExam: {
          lastRound: "g3_mar",
          track: "",
          rounds: {
            g3_mar: {
              kor: { grade: "3" },
              math: { grade: "3" },
              eng: { grade: "3" },
              tam1: { grade: "3" },
              tam2: { grade: "3" },
            },
          },
        },
      }),
    );
    expect(result.error?.status).toBe(400);
  });

  it("마지막 회차의 5과목이 다 안 채워지면 400", () => {
    const result = validateIntakeBody(
      baseBody({
        mockExam: {
          lastRound: "g3_mar",
          track: "과탐",
          rounds: { g3_mar: { kor: { grade: "3" } } },
        },
      }),
    );
    expect(result.error?.status).toBe(400);
  });

  it("정상 입력은 통과하고 pct를 보존한다", () => {
    const result = validateIntakeBody(
      baseBody({
        mockExam: {
          lastRound: "g3_mar",
          track: "과탐",
          rounds: {
            g3_mar: {
              kor: { grade: "2", pct: "92" },
              math: { grade: "3" },
              eng: { grade: "2" },
              tam1: { grade: "1" },
              tam2: { grade: "1" },
            },
          },
        },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result.input?.mockRounds.g3_mar?.kor.pct).toBe(92);
    expect(result.input?.mockRounds.g3_mar?.math.pct).toBeNull();
  });
});

// 로컬 E2E 버그(팀장 지시) — GoalOnboardingContext는 mockExam.rounds에 MOCK_FLOW 14개
// 키를 전부 빈 객체({kor:{grade:"",pct:""}, ...})로 채워 항상 들고 있다가 그대로 서버에
// 보낸다. 서버가 "표시 창"(선택 회차 포함 역순 최대 3개) 밖도 전부 검증 대상으로 삼으면
// 빈 회차까지 "5과목 모두 채워야 한다"에 걸려 400이 났다. 재현 payload: 팀장 지시 그대로
// lastRound=g2_jun(5과목 입력), g2_mar・g1_oct는 빈 값(윈도우 안, 스킵돼야 함), 그 밖(예:
// g1_mar)은 완전히 창 밖(무시돼야 함).
function emptyMockRound() {
  return {
    kor: { grade: "", pct: "" },
    math: { grade: "", pct: "" },
    eng: { grade: "" },
    tam1: { grade: "", pct: "" },
    tam2: { grade: "", pct: "" },
  };
}

function filledMockRound(grade = "3") {
  return {
    kor: { grade, pct: "" },
    math: { grade, pct: "" },
    eng: { grade },
    tam1: { grade, pct: "" },
    tam2: { grade, pct: "" },
  };
}

describe("validateIntakeBody — 모의고사 표시 창(윈도우)", () => {
  it("창 안의 완전히 빈 회차(g2_mar・g1_oct)와 창 밖 빈 회차(전부)는 400을 내지 않는다", () => {
    const rounds: Record<string, unknown> = {};
    for (const round of MOCK_FLOW) rounds[round.key] = emptyMockRound();
    rounds.g2_jun = filledMockRound("3");

    const result = validateIntakeBody(
      baseBody({
        grade: "g2",
        mockExam: { lastRound: "g2_jun", track: "과탐", rounds },
      }),
    );
    expect(result.error).toBeUndefined();
    // 빈 회차(g2_mar・g1_oct 포함)는 저장하지 않는다 — g2_jun만 남는다.
    expect(Object.keys(result.input?.mockRounds ?? {})).toEqual(["g2_jun"]);
  });

  it("창 안이지만 lastRound가 아닌 회차가 일부만 채워지면 400", () => {
    const rounds: Record<string, unknown> = {};
    for (const round of MOCK_FLOW) rounds[round.key] = emptyMockRound();
    rounds.g2_jun = filledMockRound("3");
    // g2_mar(창 안, 참고용 회차)를 국어만 채운다 — 부분 입력.
    rounds.g2_mar = { ...emptyMockRound(), kor: { grade: "2", pct: "" } };

    const result = validateIntakeBody(
      baseBody({
        grade: "g2",
        mockExam: { lastRound: "g2_jun", track: "과탐", rounds },
      }),
    );
    expect(result.error?.status).toBe(400);
  });

  it("창 밖의 스테일 데이터(전에 다른 회차를 고르며 채워 둔 값)는 저장하지 않는다", () => {
    const rounds: Record<string, unknown> = {};
    for (const round of MOCK_FLOW) rounds[round.key] = emptyMockRound();
    rounds.g2_jun = filledMockRound("3");
    // g1_mar은 g2_jun 기준 창(g1_oct・g2_mar・g2_jun) 밖인데도 완전히 채워져 있다 —
    // 예전에 lastRound를 g1_mar로 골랐다가 g2_jun으로 바꾼 흔적이라고 가정한다.
    rounds.g1_mar = filledMockRound("5");

    const result = validateIntakeBody(
      baseBody({
        grade: "g2",
        mockExam: { lastRound: "g2_jun", track: "과탐", rounds },
      }),
    );
    expect(result.error).toBeUndefined();
    expect(Object.keys(result.input?.mockRounds ?? {})).toEqual(["g2_jun"]);
  });
});

describe("deriveNaesin", () => {
  it("고1・고2 overall(5등급제)을 fiveScaleToNine으로 9등급 환산한다", () => {
    const { currentScore } = deriveNaesin({
      naesinAllNone: false,
      priorNaesinGrade: "",
      gradeLabel: "고1",
      naesinScale: 5,
      naesinOverall: "1",
      selectedNaesinExam: {
        key: "g1_s1mid",
        gradeLabel: "고1",
        examLabel: "1학기 중간",
      },
    });
    // fiveScaleToNine(1.00) === 1.55(HS5_TO_NINE 표 첫 행) — 9등급 스케일로 넘어가야 한다.
    expect(currentScore).toBeGreaterThan(1);
    expect(currentScore).toBeLessThan(2);
  });

  it("고3 overall(9등급제)은 그대로 쓴다(항등)", () => {
    const { currentScore } = deriveNaesin({
      naesinAllNone: false,
      priorNaesinGrade: "",
      gradeLabel: "고3",
      naesinScale: 9,
      naesinOverall: "3.5",
      selectedNaesinExam: {
        key: "g3_s1mid",
        gradeLabel: "고3",
        examLabel: "1학기 중간",
      },
    });
    expect(currentScore).toBe(3.5);
  });

  it("lastExam이 학생의 현재 학년보다 이전 학년이어도 그 시험이 속한 학년으로 remain을 계산한다", () => {
    // 고3인데 마지막이 "고2 2학기 기말"(순번 8) → 남은 회차 10-8=2. 학생의 현재 학년(고3)
    // 으로 잘못 조회하면 "고3_2학기 기말"(순번 10) → 남은 0이 나와야 정상인데, 실제로는
    // 시험이 속한 학년(고2)으로 조회해 2가 나와야 한다.
    const { remainNaesin, lastNaesinExam } = deriveNaesin({
      naesinAllNone: false,
      priorNaesinGrade: "",
      gradeLabel: "고3",
      naesinScale: 9,
      naesinOverall: "2",
      selectedNaesinExam: {
        key: "g2_s2final",
        gradeLabel: "고2",
        examLabel: "2학기 기말",
      },
    });
    expect(remainNaesin).toBe(2);
    expect(lastNaesinExam).toBe("고2 2학기 기말");
  });

  it("전 시험 없음이면 고1은 중학교 평균 점수를 9등급으로 환산한다", () => {
    const { currentScore, remainNaesin } = deriveNaesin({
      naesinAllNone: true,
      priorNaesinGrade: "90",
      gradeLabel: "고1",
      naesinScale: 5,
      naesinOverall: "",
      selectedNaesinExam: null,
    });
    // middleAvgToNine(90)이 정확히 얼마인지는 룩업 표(diagnosisGradeScale.ts) 소관이라
    // 여기서는 "9등급 스케일로 환산됐다"만 확인한다(1~9 범위, 원점수 90 그대로가 아니다).
    expect(currentScore).toBeGreaterThan(1);
    expect(currentScore).toBeLessThan(9);
    expect(currentScore).not.toBe(90);
    expect(remainNaesin).toBe(10);
  });
});

describe("deriveMogo", () => {
  it("사용자가 고른 백분위(pct)를 gradeToPercentile 밴드 중앙값 대신 쓴다", () => {
    const withPct = deriveMogo({
      mockAllNone: false,
      gradeLabel: "고3",
      selectedMockRound: { key: "g3_mar", gradeLabel: "고3", examLabel: "3모" },
      mockRounds: {
        g3_mar: {
          kor: { grade: "1", pct: 100 },
          math: { grade: "1", pct: 100 },
          eng: { grade: "1" },
          tam1: { grade: "1", pct: 100 },
          tam2: { grade: "1", pct: 100 },
        },
      },
    });
    const withoutPct = deriveMogo({
      mockAllNone: false,
      gradeLabel: "고3",
      selectedMockRound: { key: "g3_mar", gradeLabel: "고3", examLabel: "3모" },
      mockRounds: {
        g3_mar: {
          kor: { grade: "1", pct: null },
          math: { grade: "1", pct: null },
          eng: { grade: "1" },
          tam1: { grade: "1", pct: null },
          tam2: { grade: "1", pct: null },
        },
      },
    });
    // 1등급 밴드는 96~100 — pct=100(만점)을 명시하면 밴드 중앙값(98)보다 종합 백분위가
    // 높게 나와야 pct가 실제로 반영된 것이다.
    expect(withPct.currentMogo).toBeGreaterThan(withoutPct.currentMogo);
  });

  it("lastRound가 이전 학년 회차여도 그 회차가 속한 학년으로 remain을 계산한다(고3 5・7모 포함, Q9 해소)", () => {
    const { remainMogo, lastMogoExam } = deriveMogo({
      mockAllNone: false,
      gradeLabel: "고3",
      selectedMockRound: { key: "g3_jul", gradeLabel: "고3", examLabel: "7모" },
      mockRounds: {
        g3_jul: {
          kor: { grade: "1", pct: null },
          math: { grade: "1", pct: null },
          eng: { grade: "1" },
          tam1: { grade: "1", pct: null },
          tam2: { grade: "1", pct: null },
        },
      },
    });
    // 고3 7모는 순번 12(총 14) → 남은 2.
    expect(remainMogo).toBe(2);
    expect(lastMogoExam).toBe("고3 7모");
  });

  it("전 회차 없음이면 currentMogo 0이고 학년별 잔여 표를 쓴다", () => {
    const { currentMogo, remainMogo } = deriveMogo({
      mockAllNone: true,
      gradeLabel: "고2",
      selectedMockRound: null,
      mockRounds: {},
    });
    expect(currentMogo).toBe(0);
    expect(remainMogo).toBe(10);
  });

  it("resolvedRounds에 pct가 전부 채워져 있다(mock_exam_scores 저장용)", () => {
    const { resolvedRounds } = deriveMogo({
      mockAllNone: false,
      gradeLabel: "고3",
      selectedMockRound: { key: "g3_mar", gradeLabel: "고3", examLabel: "3모" },
      mockRounds: {
        g3_mar: {
          kor: { grade: "2", pct: 95 },
          math: { grade: "3", pct: null },
          eng: { grade: "2" },
          tam1: { grade: "2", pct: null },
          tam2: { grade: "3", pct: null },
        },
      },
    });
    expect(resolvedRounds.g3_mar?.kor.pct).toBe(95);
    // pct를 안 골랐던 과목도 null이 아니라 gradeToPercentile 밴드 중앙값으로 채워진다.
    expect(resolvedRounds.g3_mar?.math.pct).toBe(83);
    expect(resolvedRounds.g3_mar?.tam1.pct).toBe(92);
    expect(resolvedRounds.g3_mar?.tam2.pct).toBe(83);
  });
});

// 로컬 E2E 실버그(팀장 지시) — isInRange('', 0, 100)이 Number('')===0을 유효 범위로
// 오판해, 백분위 칩을 안 고른 과목(pct='')이 gradeToPercentile 대체 없이 그대로 0으로
// 확정됐다. validateIntakeBody(와이어 그대로) → deriveMogo 전체 경로를 재현해 고정한다.
// 재현 입력: 고2 6모 국어 2등급(칩 95 선택), 수학 3등급(칩 미선택), 탐1 2등급(미선택),
// 탐2 3등급(미선택), 영어 2등급 → 기대 currentMogo ≈ 86.5(팀장 산출).
describe("로컬 E2E 실버그 재현 — 빈 pct('')가 0으로 확정되던 문제", () => {
  it("칩을 안 고른 과목은 pct=0이 아니라 gradeToPercentile 밴드 중앙값으로 대체돼 currentMogo ≈ 86.5가 나온다", () => {
    const validated = validateIntakeBody(
      baseBody({
        grade: "g2",
        mockExam: {
          lastRound: "g2_jun",
          track: "사탐",
          rounds: {
            g2_jun: {
              kor: { grade: "2", pct: "95" },
              math: { grade: "3", pct: "" },
              eng: { grade: "2" },
              tam1: { grade: "2", pct: "" },
              tam2: { grade: "3", pct: "" },
            },
          },
        },
      }),
    );
    expect(validated.error).toBeUndefined();
    // validateIntakeBody 단계에서 빈 pct는 정확히 null이어야 한다(0이면 이 버그가 재발한 것).
    expect(validated.input?.mockRounds.g2_jun?.math.pct).toBeNull();

    const { currentMogo, resolvedRounds } = deriveMogo(validated.input);
    expect(currentMogo).toBeCloseTo(86.5, 5);
    // 저장값(mock_exam_scores.rounds)도 보정된 pct로 채워져야 한다 — null이 남으면 안 된다.
    expect(resolvedRounds.g2_jun?.math.pct).toBe(83);
    expect(resolvedRounds.g2_jun?.tam1.pct).toBe(92);
    expect(resolvedRounds.g2_jun?.tam2.pct).toBe(83);
    expect(resolvedRounds.g2_jun?.kor.pct).toBe(95);
  });
});
