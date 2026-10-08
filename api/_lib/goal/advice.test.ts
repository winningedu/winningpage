// api/_lib/goal/advice.ts 순수 함수 검증, 로테이션 결정성, 프롬프트 조립, 컴플라이언스
// 후처리, 규칙 기반 폴백 shape. DB·Gemini 호출은 이 파일에 없으므로 전부 로컬에서
// 돈다(grades.test.ts와 동일 방침 — 분리 가능한 순수 함수만 검증).

import { describe, expect, test } from "vitest";
import {
  ADVICE_RESPONSE_SCHEMA,
  ADVICE_THEMES,
  type AdvicePromptInput,
  type AdviceStudentContext,
  buildAdvicePayload,
  buildAdvicePrompt,
  buildRuleFallback,
  MAJOR_THEMES,
  pickAdviceTheme,
  pickMajorTheme,
  pickPlanMode,
  postprocessAdviceText,
} from "./advice.js";

function makeStudent(
  overrides: Partial<AdviceStudentContext> = {},
): AdviceStudentContext {
  return {
    schoolType: "일반고",
    grade: "고3",
    currentScore: 2.1,
    currentMogo: 78,
    convertedGrade: 2.1,
    idealName: "서울대 컴퓨터공학과",
    minName: "한양대 소프트웨어학과",
    idealSusi: 40,
    idealJungsi: 35,
    minSusi: 65,
    minJungsi: 60,
    jungsiAvailable: true,
    studentType: null,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<AdvicePromptInput> = {},
): AdvicePromptInput {
  return {
    source: "daily",
    student: makeStudent(),
    today: {
      studyHours: 5,
      achievementRate: 80,
      condition: "보통",
      tasks: ["개념 학습"],
      reasons: [],
      memo: "",
    },
    tomorrow: {
      dayNameKr: "화요일",
      idealHours: 6,
      minHours: 4,
      planItems: [{ subject: "수학", duration: "2시간" }],
    },
    recentUsedText: "",
    adviceTheme: pickAdviceTheme(0),
    planMode: pickPlanMode(0),
    majorTheme: MAJOR_THEMES[0],
    ...overrides,
  };
}

describe("pickAdviceTheme/pickPlanMode — submitCount 나머지 연산 결정성", () => {
  test("submitCount와 submitCount+5는 같은 관점을 고른다", () => {
    expect(pickAdviceTheme(2)).toBe(pickAdviceTheme(7));
    expect(pickAdviceTheme(2)).toBe(ADVICE_THEMES[2]);
  });

  test("음수·소수 submitCount도 방어적으로 0 이상 정수로 취급한다", () => {
    expect(pickAdviceTheme(-3)).toBe(ADVICE_THEMES[0]);
    expect(pickAdviceTheme(2.9)).toBe(ADVICE_THEMES[2]);
  });

  test("planMode도 같은 나머지 연산을 쓴다", () => {
    expect(pickPlanMode(1).key).toBe(pickPlanMode(6).key);
  });
});

describe("pickMajorTheme — rand 주입 시 결정적", () => {
  test("rand()=0 이면 첫 테마, rand()에 근접한 1이면 마지막 테마", () => {
    expect(pickMajorTheme(() => 0)).toBe(MAJOR_THEMES[0]);
    expect(pickMajorTheme(() => 0.999)).toBe(
      MAJOR_THEMES[MAJOR_THEMES.length - 1],
    );
  });

  test("rand() 범위를 벗어나도(방어적 clamp) 배열 밖 인덱스를 내지 않는다", () => {
    expect(pickMajorTheme(() => 5)).toBe(MAJOR_THEMES[MAJOR_THEMES.length - 1]);
    expect(pickMajorTheme(() => -1)).toBe(MAJOR_THEMES[0]);
  });
});

describe("buildAdvicePrompt", () => {
  test("같은 입력이면 같은 프롬프트를 만든다(결정적)", () => {
    const input = makeInput();
    expect(buildAdvicePrompt(input)).toBe(buildAdvicePrompt(input));
  });

  test("학생명을 프롬프트 어디에도 넣지 않는다", () => {
    const prompt = buildAdvicePrompt(makeInput());
    expect(prompt).not.toContain("학생명");
    expect(prompt).toContain("학생 이름을 언급하지 마라");
  });

  test("[확률 요약]은 코드가 붙인다는 지시를 포함한다(모델이 수치를 만들지 않게)", () => {
    const prompt = buildAdvicePrompt(makeInput());
    expect(prompt).toContain(
      "[확률 요약]은 코드에서 따로 붙이므로 절대 쓰지 마라",
    );
  });

  test("source='intake'는 온보딩 직후 맥락 문장을 쓰고 today 필드를 참조하지 않는다", () => {
    const prompt = buildAdvicePrompt(
      makeInput({ source: "intake", today: null }),
    );
    expect(prompt).toContain("온보딩(최초 진단) 직후");
  });

  test("정시 컷 미확보(jungsiAvailable=false)면 정시 확률에 미산출을 쓴다", () => {
    const prompt = buildAdvicePrompt(
      makeInput({ student: makeStudent({ jungsiAvailable: false }) }),
    );
    expect(prompt).toContain("이상목표 정시 미산출");
    expect(prompt).toContain("최소목표 정시 미산출");
  });

  test("모의고사(백분위)와 내신(등급)에 단위·방향을 명시해 모델이 %로 오기하지 않게 한다", () => {
    // 2026-09-02 로컬 E2E에서 모델이 currentMogo(백분위)를 "모의고사 29.67%"로
    // 오기한 회귀 재현 — 단위 없이 숫자만 주면 모델이 임의로 단위를 추측한다.
    const prompt = buildAdvicePrompt(
      makeInput({
        student: makeStudent({
          currentScore: 3.7,
          currentMogo: 29.67,
          convertedGrade: 3.7,
        }),
      }),
    );
    expect(prompt).toContain("현재 내신 3.7등급(9등급제, 1이 최상)");
    expect(prompt).toContain("현재 모의고사 종합 백분위 29.67(100이 최상)");
    expect(prompt).toContain("변환등급 3.7등급(9등급제, 1이 최상)");
    expect(prompt).not.toContain("29.67%");
  });
});

describe("postprocessAdviceText — 컴플라이언스 후처리", () => {
  test("내부 분류명을 자연어로 치환한다", () => {
    expect(
      postprocessAdviceText("시간배치형 학습 방식을 바탕으로 계획을 세워라"),
    ).toBe("목표 시간을 과목별로 나누어 계획을 세워라");
    expect(postprocessAdviceText("컨디션관리형으로 접근하자")).toBe(
      "컨디션 관리으로 접근하자",
    );
  });

  test("'백분위'/'모의고사' 뒤에 붙은 숫자+%에서 %만 제거한다(백분위는 퍼센트가 아니다)", () => {
    expect(postprocessAdviceText("모의고사 29.67%를 기록했습니다")).toBe(
      "모의고사 29.67를 기록했습니다",
    );
    expect(postprocessAdviceText("종합 백분위 92.3%로 상위권입니다")).toBe(
      "종합 백분위 92.3로 상위권입니다",
    );
  });

  test("'백분위'/'모의고사'와 무관한 정상적인 퍼센트 표현은 그대로 둔다", () => {
    expect(postprocessAdviceText("이상목표 수시 40%입니다")).toBe(
      "이상목표 수시 40%입니다",
    );
  });

  test("확정 단정(100%/보장) 표현을 중립 문구로 바꾼다", () => {
    const text = postprocessAdviceText("이 페이스면 100% 합격 보장합니다");
    expect(text).not.toMatch(/100\s*%/);
    expect(text).not.toContain("보장합니다");
  });

  test("공포 소구(늦었다/돌이킬 수 없다) 표현을 중립 문구로 바꾼다", () => {
    expect(postprocessAdviceText("이미 늦었습니다")).toBe(
      "지금부터 시작해도 늦지 않았습니다",
    );
    expect(
      postprocessAdviceText("지금 안 하면 돌이킬 수 없습니다"),
    ).not.toContain("돌이킬 수 없");
  });

  test("낙인 문구(의지가 약하다)를 중립 문구로 바꾼다", () => {
    expect(
      postprocessAdviceText("의지가 약하다고 느껴질 수 있다"),
    ).not.toContain("의지가 약하");
  });

  test("[확률 요약] 잔여 텍스트를 제거한다", () => {
    expect(postprocessAdviceText("[확률 요약]\n안녕하세요")).toBe("안녕하세요");
  });
});

describe("buildRuleFallback — Gemini 실패/키 미설정 시 규칙 기반 폴백", () => {
  test("source='daily'는 today 데이터를 반영한 문장을 만든다", () => {
    const result = buildRuleFallback(makeInput());
    expect(result.todayAdvice.length).toBeGreaterThan(0);
    expect(result.tomorrowPlan.length).toBeGreaterThan(0);
    expect(Array.isArray(result.majorTips)).toBe(true);
  });

  test("source='daily' todayAdvice는 '은(는)' 조사 병기를 쓰지 않는다", () => {
    // 2026-09-02 로컬 E2E 발견 회귀 재현 — studentType이 없어(makeStudent 기본값 null)
    // idealName/minName 비교 문장 분기를 탄다.
    const result = buildRuleFallback(makeInput());
    expect(result.todayAdvice).not.toContain("은(는)");
    expect(result.todayAdvice).toContain(
      "최소 목표 한양대 소프트웨어학과에 가까워지고 있으니 이상 목표 서울대 컴퓨터공학과까지",
    );
  });

  test("source='intake'는 today 없이도 todayAdvice를 만든다(최초 진단 맥락)", () => {
    const result = buildRuleFallback(
      makeInput({ source: "intake", today: null }),
    );
    expect(result.todayAdvice).toContain("온보딩");
  });

  test("source='intake' todayAdvice는 '과(와)' 조사 병기를 쓰지 않는다", () => {
    const result = buildRuleFallback(
      makeInput({ source: "intake", today: null }),
    );
    expect(result.todayAdvice).not.toContain("과(와)");
    expect(result.todayAdvice).toContain(
      "이상 목표 서울대 컴퓨터공학과, 최소 목표 한양대 소프트웨어학과 사이의 격차",
    );
  });

  test("내일 목표 시간이 0이면 일정 등록 안내 문장을 만든다(억지 산출 금지)", () => {
    const result = buildRuleFallback(
      makeInput({
        tomorrow: {
          dayNameKr: "수요일",
          idealHours: 0,
          minHours: 0,
          planItems: [],
        },
      }),
    );
    expect(result.tomorrowPlan).toContain("아직 설정되지");
  });

  test("이상/최소 목표 학과가 있으면 majorTips 2건을 만든다", () => {
    const result = buildRuleFallback(makeInput());
    expect(result.majorTips).toHaveLength(2);
    expect(result.majorTips[0]?.department).toBe("서울대 컴퓨터공학과");
  });

  test("majorTips 문구는 '은(는)' 같은 조사 병기를 쓰지 않는다", () => {
    // 2026-09-02 로컬 E2E에서 "고려대학교 경영대학은(는)…"으로 나온 회귀 재현.
    const result = buildRuleFallback(makeInput());
    for (const tip of result.majorTips) {
      expect(tip.text).not.toContain("은(는)");
      expect(tip.text).not.toContain("이(가)");
      expect(tip.text).not.toContain("을(를)");
      expect(tip.text).not.toContain("과(와)");
    }
    expect(result.majorTips[0]?.text).toBe(
      "서울대 컴퓨터공학과: 관련 교과 성취와 전공 연계 활동을 꾸준히 쌓아가면 좋습니다.",
    );
  });
});

describe("buildAdvicePayload — source별 라벨, origin 전달", () => {
  test("source='daily'는 [오늘의 조언]/[내일 계획 제시] 라벨을 쓴다", () => {
    const input = makeInput();
    const result = buildRuleFallback(input);
    const payload = buildAdvicePayload(input, result, "rule");

    expect(payload.origin).toBe("rule");
    expect(payload.sections[0]?.label).toBe("[오늘의 조언]");
    expect(payload.sections[1]?.label).toBe("[내일 계획 제시]");
  });

  test("source='intake'는 [AI 입시조언]/[다음 계획 제시] 라벨을 쓴다", () => {
    const input = makeInput({ source: "intake", today: null });
    const result = buildRuleFallback(input);
    const payload = buildAdvicePayload(input, result, "ai");

    expect(payload.origin).toBe("ai");
    expect(payload.sections[0]?.label).toBe("[AI 입시조언]");
    expect(payload.sections[1]?.label).toBe("[다음 계획 제시]");
  });

  test("probabilitySummary는 정시 미확보 시 미산출을 쓴다", () => {
    const input = makeInput({
      student: makeStudent({ jungsiAvailable: false }),
    });
    const result = buildRuleFallback(input);
    const payload = buildAdvicePayload(input, result, "rule");

    expect(payload.probabilitySummary).toContain("미산출");
  });

  test("majorTips 본문도 컴플라이언스 후처리를 거친다", () => {
    const input = makeInput();
    const payload = buildAdvicePayload(
      input,
      {
        todayAdvice: "오늘도 화이팅",
        tomorrowPlan: "내일도 화이팅",
        majorTips: [{ department: "테스트학과", text: "100% 합격 보장합니다" }],
      },
      "ai",
    );

    expect(payload.majorTips[0]?.text).not.toContain("보장");
  });
});

describe("ADVICE_RESPONSE_SCHEMA — 구조화 출력 계약", () => {
  test("todayAdvice/tomorrowPlan/majorTips가 필수 필드다", () => {
    expect(ADVICE_RESPONSE_SCHEMA.required).toEqual([
      "todayAdvice",
      "tomorrowPlan",
      "majorTips",
    ]);
  });

  test("majorTips는 정확히 2건(이상/최소 목표 학과)만 받는다", () => {
    expect(ADVICE_RESPONSE_SCHEMA.properties.majorTips.minItems).toBe(2);
    expect(ADVICE_RESPONSE_SCHEMA.properties.majorTips.maxItems).toBe(2);
  });
});
