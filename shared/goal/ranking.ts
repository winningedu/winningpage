// 오늘의 학습 순위 계약. GET /api/goal/ranking 의 응답 스키마(요청 본문 없음).

import { z } from "zod";
import { withNotAllowed } from "./gate.js";

const entry = z.object({
  rank: z.number(),
  name: z.string(),
  hours: z.number(),
});

/** visible 이 false 면 활성 학생 수가 모자라 순위를 그리지 않는다(top 은 빈 배열, me 는 null). */
export const rankingPayload = z.object({
  date: z.string(),
  visible: z.boolean(),
  top: z.array(entry),
  me: entry.nullable(),
});

export const rankingResponse = withNotAllowed(rankingPayload);

export type GoalRankingEntry = z.output<typeof entry>;
