// 수행평가 주제 확정과 설계 리포트 계약. POST /api/performance/design-report 의 요청과 응답 스키마.
// 형식 검사(uuid, regenerate 타입)는 여기서 하고, 소유권, 선행 조건, 재생성 상한은 도메인 규칙이라 라우트가 판정한다.
// 리포트 섹션과 구조는 모델 산출물이라 안쪽은 화면이 좁혀 읽는다.

import { z } from "zod";

export const designReportBody = z.object({
  // DB uuid 컬럼에 가므로 형식만 본다(버전 숫자는 보지 않는다).
  sessionId: z.guid(),
  topicId: z.guid(),
  /** true 면 같은 주제라도 모델을 다시 부른다(재생성 예산을 쓴다). */
  regenerate: z.boolean().optional(),
});

/** 브라우저가 보내는 모양. */
export type DesignReportBodyInput = z.input<typeof designReportBody>;

export const designReportResponse = z.looseObject({
  reportId: z.string().nullable(),
  topicId: z.string().nullable(),
  structure: z.unknown(),
  sections: z.array(z.unknown()),
  resources: z.array(z.unknown()),
  quotaRemaining: z.number().nullable(),
  charged: z.literal(false),
  /** 저장된 리포트를 그대로 돌려준 재생 응답이면 true. */
  reused: z.boolean().optional(),
  generationCount: z.number(),
  maxGenerations: z.number(),
  promptVersion: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});
