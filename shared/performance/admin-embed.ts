// 수행평가 지식 임베딩 계약. POST /api/performance/admin-embed 의 요청 스키마.
// 형식 검사(action, id 와 limit 의 타입, force)는 여기서 하고, embed-one 에 id 가 없는 경우(ID_REQUIRED)는 action 에 따라 달라지는
// 규칙이라 라우트가 판정한다. limit 의 범위(1 이상 50 이하)도 서버가 자른다.

import { z } from "zod";

export const adminEmbedBody = z.object({
  /** 생략하면 embed-one 이다. */
  action: z.enum(["embed-one", "backfill"]).default("embed-one"),
  /** embed-one 의 대상 지식 항목 id. */
  id: z.string().optional(),
  /** backfill 한 번에 처리할 건수. */
  limit: z.number().optional(),
  /** true 이거나 "true" 이면 이미 임베딩한 항목도 다시 한다. */
  force: z.union([z.boolean(), z.literal("true")]).optional(),
});

/** 브라우저가 보내는 모양. */
export type AdminEmbedBodyInput = z.input<typeof adminEmbedBody>;
