import { describe, expect, test } from "vitest";
import type { ApiResult, TopicView } from "@/lib/inquiry/api";
import {
  classifyCall,
  MAX_RUNNING_RETRIES,
  nextLineIndex,
  PLAN_LINES,
  PROVISIONAL_BADGE,
  RECOMMEND_LINES,
  RUNNING_RETRY_MS,
  reliabilityNoteFor,
  remainingRerecommends,
  shouldStartRecommend,
  topicBadges,
} from "./topicsLogic";

function topic(over: Partial<TopicView> = {}): TopicView {
  return {
    id: "t1",
    round: 1,
    idx: 1,
    linkKind: "critique",
    linkageType: "direct",
    fit: "match",
    selected: false,
    detail: {} as TopicView["detail"],
    ...over,
  };
}

describe("shouldStartRecommend", () => {
  test("세션이 없으면 부르지 않는다", () => {
    expect(
      shouldStartRecommend({
        hasSession: false,
        startRecommend: true,
        topicsCount: 0,
      }),
    ).toBe(false);
  });

  test("startRecommend 상태가 있으면 주제가 있어도 부른다", () => {
    expect(
      shouldStartRecommend({
        hasSession: true,
        startRecommend: true,
        topicsCount: 3,
      }),
    ).toBe(true);
  });

  test("주제가 비어 있으면 부른다", () => {
    expect(
      shouldStartRecommend({
        hasSession: true,
        startRecommend: false,
        topicsCount: 0,
      }),
    ).toBe(true);
  });

  test("주제가 있고 상태도 없으면 부르지 않는다", () => {
    expect(
      shouldStartRecommend({
        hasSession: true,
        startRecommend: false,
        topicsCount: 3,
      }),
    ).toBe(false);
  });
});

describe("remainingRerecommends", () => {
  test.each([
    [0, 3],
    [1, 3],
    [2, 2],
    [4, 0],
    [9, 0],
  ])("라운드 %i 회 사용이면 남은 재추천은 %i", (rounds, left) => {
    expect(remainingRerecommends(rounds)).toBe(left);
  });
});

describe("topicBadges", () => {
  test("직접 연계는 연계 유형과 적합도 라벨 두 개만 낸다", () => {
    expect(topicBadges(topic())).toEqual([
      { key: "kind", label: "비판형" },
      { key: "fit", label: "맞음" },
    ]);
  });

  test("예비 주제는 예비 주제 배지를 앞에 붙인다", () => {
    const badges = topicBadges(
      topic({ linkageType: "interest_based_provisional", fit: "off" }),
    );
    expect(badges[0]).toEqual({ key: "provisional", label: PROVISIONAL_BADGE });
    expect(PROVISIONAL_BADGE).toBe("관심 기반 예비 주제, 연계 0점");
    expect(badges.map((b) => b.label)).toEqual([
      PROVISIONAL_BADGE,
      "비판형",
      "어긋남",
    ]);
  });
});

describe("reliabilityNoteFor", () => {
  test("신뢰도 C 일 때만 문장을 돌려준다", () => {
    expect(reliabilityNoteFor("C")).toBe(
      "입력한 주제 한 줄만으로 만든 주제예요.",
    );
    expect(reliabilityNoteFor("A")).toBeNull();
    expect(reliabilityNoteFor("B")).toBeNull();
    expect(reliabilityNoteFor(null)).toBeNull();
  });
});

function err(
  status: number,
  code: string,
  extra?: Record<string, unknown>,
): ApiResult<unknown> {
  return extra
    ? { kind: "error", status, code, message: "m", extra }
    : { kind: "error", status, code, message: "m" };
}

describe("classifyCall", () => {
  test("성공은 ok 로 분기한다", () => {
    expect(classifyCall({ kind: "ok", data: 1 }, 0)).toEqual({ type: "ok" });
  });

  test("GENERATION_RUNNING 은 3초 뒤 재시도하고 20회를 넘으면 실패로 본다", () => {
    expect(RUNNING_RETRY_MS).toBe(3000);
    expect(MAX_RUNNING_RETRIES).toBe(20);
    expect(classifyCall(err(409, "GENERATION_RUNNING"), 0)).toEqual({
      type: "retry",
    });
    expect(classifyCall(err(409, "GENERATION_RUNNING"), 19)).toEqual({
      type: "retry",
    });
    expect(classifyCall(err(409, "GENERATION_RUNNING"), 20).type).toBe(
      "failed",
    );
  });

  test.each([
    [422, "GENERATION_VALIDATION_FAILED"],
    [502, "MODEL_UPSTREAM_FAILED"],
    [504, "GENERATION_TIMEOUT"],
  ])("%i %s 는 시도 횟수와 함께 실패 카드로 간다", (status, code) => {
    expect(
      classifyCall(err(status, code, { attempts: 2, issues: [{ a: 1 }] }), 0),
    ).toEqual({ type: "failed", attempts: 2, issues: [{ a: 1 }] });
  });

  test("시도 횟수가 없으면 null 로 둔다", () => {
    expect(classifyCall(err(422, "GENERATION_VALIDATION_FAILED"), 0)).toEqual({
      type: "failed",
      attempts: null,
      issues: [],
    });
  });

  test("타임아웃과 네트워크 실패도 실패 카드다", () => {
    expect(classifyCall({ kind: "timeout" }, 0).type).toBe("failed");
    expect(classifyCall(err(0, "NETWORK"), 0).type).toBe("failed");
  });

  test("ATTEMPTS_EXHAUSTED 또는 extra.terminal 은 종결이다", () => {
    expect(classifyCall(err(409, "ATTEMPTS_EXHAUSTED"), 0)).toEqual({
      type: "terminal",
    });
    expect(
      classifyCall(err(500, "GENERATION_FATAL", { terminal: true }), 0),
    ).toEqual({ type: "terminal" });
  });

  test("권한, 상한, 주제, 잠금 오류는 각자의 분기다", () => {
    expect(classifyCall(err(403, "NO_ENTITLEMENT"), 0).type).toBe(
      "noEntitlement",
    );
    expect(classifyCall(err(409, "ROUND_LIMIT"), 0).type).toBe("roundLimit");
    expect(classifyCall(err(409, "TOPIC_NOT_IN_ROUND"), 0).type).toBe(
      "topicNotInRound",
    );
    expect(classifyCall(err(409, "SESSION_LOCKED"), 0).type).toBe(
      "sessionLocked",
    );
  });

  test("그 밖의 오류는 서버 메시지와 함께 error 로 둔다", () => {
    expect(classifyCall(err(500, "INTERNAL"), 0)).toEqual({
      type: "error",
      message: "m",
    });
  });
});

describe("진행 문구", () => {
  test("추천 진행 문구는 3줄이고 순환한다", () => {
    expect(RECOMMEND_LINES).toEqual([
      "고른 활동에서 이어질 질문을 찾는 중",
      "연계 유형이 서로 다른 세 가지를 고르는 중",
      "가설과 검증 방법을 붙이는 중",
    ]);
    expect(PLAN_LINES).toHaveLength(3);
    expect(nextLineIndex(0, 3)).toBe(1);
    expect(nextLineIndex(2, 3)).toBe(0);
  });
});
