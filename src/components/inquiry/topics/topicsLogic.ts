// 주제 추천 화면의 순수 로직(진입 판정, 재추천 수, 배지, 생성 결과 분기, 진행 문구).
// 화면은 이 파일의 결과만 그린다. 계약: docs/deep-inquiry-dev-plan.md 부록 B, C.
import type { ApiResult, Reliability, TopicView } from "@/lib/inquiry/api";
import {
  FIT_LABELS,
  LINK_KIND_LABELS,
  RELIABILITY_NOTES,
  TOPIC_MAX_ROUNDS,
} from "@/lib/inquiry/labels";

/** 재추천 상한. */
export const MAX_RERECOMMENDS = TOPIC_MAX_ROUNDS - 1;

export function shouldStartRecommend(input: {
  hasSession: boolean;
  startRecommend: boolean;
  topicsCount: number;
}): boolean {
  if (!input.hasSession) return false;
  return input.startRecommend || input.topicsCount === 0;
}

/** 남은 재추천 수. 첫 라운드는 재추천이 아니다. */
export function remainingRerecommends(topicRoundCount: number): number {
  const used = Math.max(0, topicRoundCount - 1);
  return Math.max(0, MAX_RERECOMMENDS - used);
}

export const PROVISIONAL_BADGE = "관심 기반 예비 주제, 연계 0점";

export type TopicBadge = {
  key: "provisional" | "kind" | "fit";
  label: string;
};

export function topicBadges(topic: TopicView): TopicBadge[] {
  const badges: TopicBadge[] = [];
  if (topic.linkageType === "interest_based_provisional") {
    badges.push({ key: "provisional", label: PROVISIONAL_BADGE });
  }
  badges.push({ key: "kind", label: LINK_KIND_LABELS[topic.linkKind] });
  badges.push({ key: "fit", label: FIT_LABELS[topic.fit] });
  return badges;
}

/** 신뢰도 C 면 카드에 붙일 문장(No.43). 배지가 아니라 문장이다. */
export function reliabilityNoteFor(
  reliability: Reliability | null,
): string | null {
  return reliability === "C" ? RELIABILITY_NOTES.C : null;
}

// ── 생성 호출 결과 분기(부록 C 오류 분기 공통) ─────────────────────────────

export const RUNNING_RETRY_MS = 3000;
export const MAX_RUNNING_RETRIES = 20;

export type CallOutcome =
  | { type: "ok" }
  | { type: "retry" }
  | { type: "failed"; attempts: number | null; issues: unknown[] }
  | { type: "terminal" }
  | { type: "noEntitlement" }
  | { type: "roundLimit" }
  | { type: "topicNotInRound" }
  | { type: "sessionLocked" }
  | { type: "error"; message: string };

const FAILED_CODES = new Set([
  "GENERATION_VALIDATION_FAILED",
  "MODEL_UPSTREAM_FAILED",
  "GENERATION_TIMEOUT",
]);

/** recommend-topics, plan-report 응답을 화면 분기로 바꾼다. runningRetries 는 지금까지 재시도한 횟수. */
export function classifyCall(
  result: ApiResult<unknown>,
  runningRetries: number,
): CallOutcome {
  if (result.kind === "ok") return { type: "ok" };
  if (result.kind === "timeout") {
    return { type: "failed", attempts: null, issues: [] };
  }
  const { code, extra } = result;
  if (code === "ATTEMPTS_EXHAUSTED" || extra?.terminal === true) {
    return { type: "terminal" };
  }
  if (code === "GENERATION_RUNNING") {
    return runningRetries < MAX_RUNNING_RETRIES
      ? { type: "retry" }
      : { type: "failed", attempts: null, issues: [] };
  }
  if (FAILED_CODES.has(code) || code === "NETWORK") {
    const attempts =
      typeof extra?.attempts === "number" ? extra.attempts : null;
    const issues = Array.isArray(extra?.issues) ? extra.issues : [];
    return { type: "failed", attempts, issues };
  }
  if (code === "NO_ENTITLEMENT") return { type: "noEntitlement" };
  if (code === "ROUND_LIMIT") return { type: "roundLimit" };
  if (code === "TOPIC_NOT_IN_ROUND") return { type: "topicNotInRound" };
  if (code === "SESSION_LOCKED") return { type: "sessionLocked" };
  return { type: "error", message: result.message };
}

// ── 진행 문구 ─────────────────────────────────────────────────────────────

export const RECOMMEND_LINES = [
  "고른 활동에서 이어질 질문을 찾는 중",
  "연계 유형이 서로 다른 세 가지를 고르는 중",
  "가설과 검증 방법을 붙이는 중",
] as const;

export const PLAN_LINES = [
  "고른 주제를 8절 구조로 나누는 중",
  "절마다 꼭 다룰 것과 피할 것을 정하는 중",
  "자료 출처표와 검색 계획을 붙이는 중",
] as const;

export function nextLineIndex(current: number, length: number): number {
  return (current + 1) % length;
}
