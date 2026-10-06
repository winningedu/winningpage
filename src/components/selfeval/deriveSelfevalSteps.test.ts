import { describe, expect, test } from "vitest";
import {
  type DeriveSelfevalStepsInput,
  deriveSelfevalSteps,
} from "./deriveSelfevalSteps";
import { SELFEVAL_PATHS } from "./selfevalPaths";

const SID = "s1";

function base(
  over: Partial<DeriveSelfevalStepsInput> = {},
): DeriveSelfevalStepsInput {
  return { screenStep: 1, openSession: null, ...over };
}

const open = (currentStep: number) => ({
  id: SID,
  currentStep: currentStep as never,
});

const statuses = (input: DeriveSelfevalStepsInput) =>
  deriveSelfevalSteps(input).map((s) => s.status);

describe("deriveSelfevalSteps 구성", () => {
  test("6단계를 시작, 기본 입력, 활동 선택, 분석 확인, 생성 결과, 검증과 저장 순서로 돌려준다", () => {
    const steps = deriveSelfevalSteps(base());
    expect(steps.map((s) => s.key)).toEqual([
      "start",
      "basics",
      "activities",
      "analysis",
      "result",
      "verify",
    ]);
    expect(steps.map((s) => s.label)).toEqual([
      "시작",
      "기본 입력",
      "활동 선택",
      "분석 확인",
      "생성 결과",
      "검증과 저장",
    ]);
  });
});

describe("세션이 없을 때", () => {
  test("시작과 기본 입력만 들어갈 수 있고 나머지는 잠긴다", () => {
    expect(statuses(base())).toEqual([
      "current",
      "upcoming",
      "locked",
      "locked",
      "locked",
      "locked",
    ]);
    const steps = deriveSelfevalSteps(base());
    expect(steps[0]?.to).toBe(SELFEVAL_PATHS.home);
    expect(steps[1]?.to).toBe(SELFEVAL_PATHS.new);
    expect(steps.slice(2).every((s) => s.to === null)).toBe(true);
  });
});

describe("열린 세션이 있을 때", () => {
  test("단계 1이면 시작과 기본 입력이 끝났고 활동 선택이 다음이다", () => {
    expect(statuses(base({ screenStep: 3, openSession: open(1) }))).toEqual([
      "done",
      "done",
      "current",
      "locked",
      "locked",
      "locked",
    ]);
  });

  test("단계 2이면 활동 선택까지 끝나 분석 확인이 열린다", () => {
    const steps = deriveSelfevalSteps(
      base({ screenStep: 1, openSession: open(2) }),
    );
    expect(steps.map((s) => s.status)).toEqual([
      "current",
      "done",
      "done",
      "upcoming",
      "locked",
      "locked",
    ]);
    expect(steps[2]?.to).toBe(SELFEVAL_PATHS.activities(SID));
    expect(steps[3]?.to).toBe(SELFEVAL_PATHS.analysis(SID));
    expect(steps[4]?.to).toBeNull();
  });

  test("단계 3이면 분석 확인이 끝나고 단계 4이면 생성 결과가 끝난다", () => {
    expect(statuses(base({ screenStep: 5, openSession: open(3) }))).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
      "locked",
    ]);
    expect(statuses(base({ screenStep: 6, openSession: open(4) }))).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "current",
    ]);
  });

  test("단계 6이면 검증과 저장까지 전부 끝난다", () => {
    expect(statuses(base({ screenStep: 6, openSession: open(6) }))).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "current",
    ]);
    expect(statuses(base({ screenStep: 1, openSession: open(6) }))[5]).toBe(
      "done",
    );
  });

  test("단계 5는 검증은 했으나 저장 전이라 검증과 저장은 아직 끝나지 않는다", () => {
    const steps = deriveSelfevalSteps(
      base({ screenStep: 1, openSession: open(5) }),
    );
    expect(steps[5]?.status).toBe("upcoming");
    expect(steps[5]?.to).toBe(SELFEVAL_PATHS.verify(SID));
  });

  test("기본 입력 링크는 세션 id 를 달고 단계 0 세션은 기본 입력부터 이어 간다", () => {
    const steps = deriveSelfevalSteps(
      base({ screenStep: 1, openSession: open(0) }),
    );
    expect(steps[1]?.to).toBe(`${SELFEVAL_PATHS.new}?sessionId=${SID}`);
    expect(steps[1]?.status).toBe("upcoming");
    expect(steps[2]?.status).toBe("locked");
  });

  test("화면 단계가 null 이면 current 가 없다", () => {
    expect(
      statuses(base({ screenStep: null, openSession: open(2) })),
    ).not.toContain("current");
  });
});
