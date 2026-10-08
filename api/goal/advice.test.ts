// api/goal/advice.ts 순수 함수 검증 — grades.test.ts와 동일 방침: DB·Gemini I/O가 있는
// 핸들러 전체(openGoalSession/handleGet/handlePost)는 여기서 돌리지 않고, 분리 가능한
// 순수 함수(buildTomorrowPlanItems/buildRecentUsedText/isValidAdviceSource/
// resolveDayNameKr)만 검증한다. 세션 게이트(401/403/409)·캐시 히트·Gemini 호출 경로는
// 로컬 스택 QA로 확인한다(daily-record.ts 등 같은 컨벤션의 다른 goal 라우트도 핸들러
// 단위 테스트 파일이 없다).

import { describe, expect, test, vi } from "vitest";

const gemini = vi.hoisted(() => ({ callText: vi.fn() }));
vi.mock("../_lib/gemini.js", () => gemini);

import { createAiTrace } from "../_lib/telemetry/trace.js";
import {
  buildRecentUsedText,
  buildTomorrowPlanItems,
  generateAdviceModelResult,
  isValidAdviceSource,
  resolveDayNameKr,
} from "./advice.js";

describe("isValidAdviceSource — POST body.source 400 분기 판정", () => {
  test("intake/daily만 통과시킨다", () => {
    expect(isValidAdviceSource("intake")).toBe(true);
    expect(isValidAdviceSource("daily")).toBe(true);
  });

  test("그 외 값·undefined·객체는 400 대상이다", () => {
    expect(isValidAdviceSource("weekly")).toBe(false);
    expect(isValidAdviceSource(undefined)).toBe(false);
    expect(isValidAdviceSource(null)).toBe(false);
    expect(isValidAdviceSource({})).toBe(false);
  });
});

describe("buildTomorrowPlanItems — 내일 계획 과목 배분", () => {
  test("idealHours가 0 이하면 빈 배열(억지 산출 금지)", () => {
    expect(buildTomorrowPlanItems(0, [])).toEqual([]);
    expect(buildTomorrowPlanItems(-1, [])).toEqual([]);
  });

  test("타이머 목표가 없으면 4과목 균등 배분", () => {
    const result = buildTomorrowPlanItems(4, []);
    expect(result).toHaveLength(4);
    // 4시간을 4과목 균등 배분하면 과목당 1시간.
    expect(result.every((item) => item.duration === "1시간")).toBe(true);
  });

  test("타이머 목표가 있으면 비율대로 배분하고, 배분 결과 0시간인 과목은 행을 뺀다", () => {
    const result = buildTomorrowPlanItems(6, [
      { subject: "math", targetHours: 3 },
      { subject: "korean", targetHours: 1 },
      // 카탈로그 밖 과목은 배분 대상에서 제외된다(DEFAULT_TIMER_SUBJECTS 화이트리스트).
      { subject: "social", targetHours: 10 },
    ]);

    // math:korean = 3:1 비율로 6시간 배분 → math 4.5시간, korean 1.5시간.
    const bySubject = Object.fromEntries(
      result.map((r) => [r.subject, r.duration]),
    );
    expect(bySubject.수학).toBe("4시간 30분");
    expect(bySubject.국어).toBe("1시간 30분");
    // english/science는 targetHours가 없어 0시간 배분 → 행 자체가 없어야 한다.
    expect(bySubject.영어).toBeUndefined();
  });
});

describe("buildRecentUsedText — 최근 기록 요약(오늘 제외, 500자 컷)", () => {
  test("오늘 날짜 행은 제외한다", () => {
    const text = buildRecentUsedText(
      [
        { record_date: "2026-09-01", study_hours: 3, tasks: ["개념 학습"] },
        { record_date: "2026-09-02", study_hours: 5, tasks: [] },
      ],
      "2026-09-02",
    );

    expect(text).toContain("2026-09-01");
    expect(text).not.toContain("2026-09-02");
  });

  test("tasks가 있으면 괄호로 덧붙이고, 없으면 생략한다", () => {
    const text = buildRecentUsedText(
      [
        {
          record_date: "2026-08-30",
          study_hours: 2,
          tasks: ["오답 정리", "학원 숙제"],
        },
      ],
      "2026-09-02",
    );
    expect(text).toBe("2026-08-30 순공 2시간 (오답 정리/학원 숙제)");
  });

  test("500자를 넘으면 컷한다", () => {
    const records = Array.from({ length: 50 }, (_, i) => ({
      record_date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      study_hours: 5,
      tasks: ["개념 학습", "오답 정리"],
    }));
    const text = buildRecentUsedText(records, "2026-09-02");
    expect(text.length).toBeLessThanOrEqual(500);
  });
});

describe("resolveDayNameKr — getDayIndexFromYMDServer(0~6, 월~일) → 한글 요일 라벨", () => {
  test("월~일 인덱스를 한글 요일로 정확히 매핑한다(VIRTUAL_DAY_NAMES 영문 키를 그대로 쓰지 않는다)", () => {
    // 2026-09-02 로컬 E2E에서 "thursday요일에는…"으로 나온 회귀 재현 — 목요일은 인덱스 3.
    expect(resolveDayNameKr(3)).toBe("목요일");
    expect(resolveDayNameKr(3)).not.toContain("thursday");

    expect(resolveDayNameKr(0)).toBe("월요일");
    expect(resolveDayNameKr(6)).toBe("일요일");
  });

  test("범위 밖 인덱스는 방어적으로 '내일'을 쓴다", () => {
    expect(resolveDayNameKr(7)).toBe("내일");
    expect(resolveDayNameKr(-1)).toBe("내일");
  });
});

describe("generateAdviceModelResult 계기판 기록", () => {
  const okReply = JSON.stringify({
    todayAdvice: "a",
    tomorrowPlan: "b",
    majorTips: [],
  });

  test("callText 옵션에 telemetry 를 싣고 성공이면 ok 로 표시한다", async () => {
    const trace = createAiTrace({ service: "goal", feature: "advice" });
    const annotate = vi.spyOn(trace, "annotateLastCall");
    gemini.callText.mockResolvedValue(okReply);
    await generateAdviceModelResult("p", trace);
    expect(gemini.callText.mock.calls[0]?.[2].telemetry).toBe(trace);
    expect(annotate).toHaveBeenCalledWith({ validation: "ok" });
  });

  test("shape 이 다르면 failed shape 로 표시하고 던진다", async () => {
    const trace = createAiTrace({ service: "goal", feature: "advice" });
    const annotate = vi.spyOn(trace, "annotateLastCall");
    gemini.callText.mockResolvedValue(JSON.stringify({ todayAdvice: 1 }));
    await expect(generateAdviceModelResult("p", trace)).rejects.toThrow();
    expect(annotate).toHaveBeenCalledWith({
      validation: "failed",
      issueCodes: ["shape"],
    });
  });
});
