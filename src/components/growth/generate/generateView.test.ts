import { describe, expect, test } from "vitest";
import type { StepProgress } from "@/lib/growth/api";
import {
  completedCount,
  describeGeneration,
  entitlementStatus,
  stepBadge,
  summarizeIssues,
} from "./generateView";
import type { GenerationState } from "./generationEngine";

function progressOf(done: number): StepProgress[] {
  return Array.from({ length: 8 }, (_, i) => ({
    step: i + 1,
    label: "",
    status: i < done ? "ok" : "pending",
    attempts: 0,
  }));
}

function stateOf(patch: Partial<GenerationState>): GenerationState {
  return {
    phase: "running",
    progress: progressOf(3),
    currentStep: 4,
    attempts: 0,
    issues: null,
    errorCode: null,
    errorMessage: null,
    charged: null,
    completion: null,
    ...patch,
  };
}

describe("stepBadge / completedCount", () => {
  test("끝난 단계는 완료, 실행 중 단계는 진행 중, 나머지는 대기", () => {
    const s = stateOf({});
    expect(completedCount(s.progress)).toBe(3);
    expect(stepBadge(s, 2)).toBe("완료");
    expect(stepBadge(s, 4)).toBe("진행 중");
    expect(stepBadge(s, 5)).toBe("대기");
  });

  test("waiting 도 진행 중, failed 와 terminal 의 현재 단계는 실패", () => {
    expect(stepBadge(stateOf({ phase: "waiting" }), 4)).toBe("진행 중");
    expect(stepBadge(stateOf({ phase: "failed" }), 4)).toBe("실패");
    expect(stepBadge(stateOf({ phase: "terminal" }), 4)).toBe("실패");
    expect(stepBadge(stateOf({ phase: "failed" }), 5)).toBe("대기");
  });
});

describe("describeGeneration", () => {
  test("진행 중에는 안내가 없다", () => {
    expect(describeGeneration(stateOf({}), 0)).toBeNull();
  });

  test("재진입이면 끝난 단계 수와 이어갈 단계를 알린다", () => {
    const d = describeGeneration(
      stateOf({ currentStep: 6, progress: progressOf(5) }),
      5,
    );
    expect(d?.title).toBe("5단계까지 만들어 두었어요");
    expect(d?.body).toContain("6단계 위닝 A부터 E 5축 진단");
  });

  test("검증 실패는 다시 시도와 시도 횟수를 보여 준다", () => {
    const d = describeGeneration(
      stateOf({
        phase: "failed",
        errorCode: "STEP_VALIDATION_FAILED",
        attempts: 2,
        issues: ["근거 활동 누락"],
      }),
      0,
    );
    expect(d?.body).toBe(
      "검증에 걸려 다시 요청했지만 통과하지 못했어요. 다시 시도해 주세요.",
    );
    expect(d?.action).toBe("retry");
    expect(d?.attemptsLabel).toBe("2 / 10");
    expect(d?.issues).toEqual(["근거 활동 누락"]);
  });

  test("모델 실패와 네트워크 실패는 그 단계부터 다시 시도하게 한다", () => {
    for (const errorCode of [
      "MODEL_UPSTREAM_FAILED",
      "STEP_TIMEOUT",
      "NETWORK",
      "TIMEOUT",
    ]) {
      const d = describeGeneration(stateOf({ phase: "failed", errorCode }), 0);
      expect(d?.title).toBe(
        "4단계 학생 조사 응답 대조에서 응답을 받지 못했어요",
      );
      expect(d?.action).toBe("retry");
    }
  });

  test("이용권 없음은 요금제 안내로 보낸다", () => {
    const d = describeGeneration(
      stateOf({ phase: "failed", errorCode: "NO_ENTITLEMENT" }),
      0,
    );
    expect(d?.action).toBe("pricing");
  });

  test("종결은 시작 화면으로 보내고 차감 이력에 따라 이용권 문구가 갈린다", () => {
    const charged = describeGeneration(
      stateOf({
        phase: "terminal",
        errorCode: "ATTEMPTS_EXHAUSTED",
        charged: true,
        attempts: 10,
      }),
      0,
    );
    expect(charged?.action).toBe("start");
    expect(charged?.body).toBe(
      "이 회차는 더 진행할 수 없어요. 이용권은 복구됐어요.",
    );
    const free = describeGeneration(
      stateOf({
        phase: "terminal",
        errorCode: "ATTEMPTS_EXHAUSTED",
        charged: null,
        progress: progressOf(0),
      }),
      0,
    );
    expect(free?.body).toBe(
      "이 회차는 더 진행할 수 없어요. 이용권은 차감되지 않았어요.",
    );
  });

  test("재진입으로 charged 응답이 없어도 1단계가 끝났으면 복구됐다고 안내한다", () => {
    const d = describeGeneration(
      stateOf({
        phase: "terminal",
        errorCode: "ATTEMPTS_EXHAUSTED",
        charged: null,
        progress: progressOf(2),
      }),
      0,
    );
    expect(d?.body).toBe("이 회차는 더 진행할 수 없어요. 이용권은 복구됐어요.");
  });

  test("복구할 수 없는 오류는 시도 상한 문구와 구분해 안내한다", () => {
    const d = describeGeneration(
      stateOf({
        phase: "terminal",
        errorCode: "STEP_FATAL",
        charged: null,
        progress: progressOf(0),
      }),
      0,
    );
    expect(d?.title).toBe("복구할 수 없는 오류로 이 회차를 닫았어요");
    expect(d?.title).not.toContain("10회");
    expect(d?.body).toBe(
      "이 회차는 더 진행할 수 없어요. 이용권은 차감되지 않았어요.",
    );
    expect(d?.action).toBe("start");
  });

  test("완료는 리포트 보기 버튼을 건넨다", () => {
    const d = describeGeneration(
      stateOf({
        phase: "done",
        completion: { issuedAt: "t", planItemCount: 3 },
      }),
      0,
    );
    expect(d?.title).toBe("리포트가 완성됐어요");
    expect(d?.action).toBe("report");
  });
});

describe("entitlementStatus", () => {
  test("차감 뒤에는 사용 중, 종결되면 복구됨, 차감 이력이 없으면 차감 안 됨", () => {
    expect(entitlementStatus(stateOf({ charged: true }))).toEqual({
      label: "사용 중",
      note: "1회 차감",
    });
    expect(
      entitlementStatus(stateOf({ phase: "terminal", charged: true })),
    ).toEqual({ label: "복구됨", note: "1회 되돌림" });
    expect(
      entitlementStatus(
        stateOf({ phase: "terminal", charged: null, progress: progressOf(0) }),
      ),
    ).toEqual({ label: "차감 안 됨", note: null });
    expect(
      entitlementStatus(stateOf({ charged: null, progress: progressOf(0) })),
    ).toBeNull();
  });

  test("재진입처럼 charged 응답이 없어도 1단계가 끝났으면 사용 중이다", () => {
    expect(
      entitlementStatus(stateOf({ charged: null, progress: progressOf(3) })),
    ).toEqual({ label: "사용 중", note: "1회 차감" });
  });
});

describe("summarizeIssues", () => {
  test("문자열과 message 필드를 최대 3개까지 뽑는다", () => {
    expect(
      summarizeIssues(["a", { message: "b" }, { reason: "c" }, "d"]),
    ).toEqual(["a", "b", "c"]);
    expect(summarizeIssues(null)).toEqual([]);
    expect(summarizeIssues({ x: 1 })).toEqual([]);
  });
});
