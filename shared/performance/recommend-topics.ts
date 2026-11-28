// 수행평가 주제 추천 계약. POST /api/performance/recommend-topics 의 요청과 응답 스키마.
// 형식 검사(uuid, round 가 1 이상 정수)는 여기서 하고, 이미 만든 회차의 재생, 진행 상태와 맞지 않는 회차, 회차 상한, 이용권,
// 안내문 선행 조건은 도메인 규칙이라 라우트가 판정한다. 태그와 상세는 모델 산출물이라 화면이 좁혀 읽는다.

import { z } from "zod";
import { topicSchema } from "./session.js";

export const recommendTopicsBody = z.object({
  // DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
  sessionId: z.guid(),
  /** 생략하면 서버가 다음 회차를 정한다. 보내면 의도 확인용이다. */
  round: z.int().min(1).optional(),
});

/** 브라우저가 보내는 모양. */
export type RecommendTopicsBodyInput = z.input<typeof recommendTopicsBody>;

export const recommendTopicsResponse = z.looseObject({
  round: z.number(),
  topics: z.array(topicSchema),
  quotaRemaining: z.number().nullable(),
  charged: z.boolean(),
  /** 이미 만든 회차를 다시 요청해 저장분을 돌려준 경우에만 true 로 온다. */
  reused: z.boolean().optional(),
  maxRounds: z.number(),
});
