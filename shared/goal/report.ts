// 성장 리포트와 학습방향 리포트 계약. GET /api/goal/report 의 쿼리와 응답 스키마.
// 리포트 본문은 type(weekly, monthly, direction)별로 모양이 크고 달라서 화면이 자기 타입으로 좁혀 읽는다.
// 그래서 본문은 looseObject 로 두고 두 종류가 모두 가진 activePeriod 만 본다.

import { z } from "zod";
import { withNotAllowed } from "./gate.js";

export const REPORT_TYPES = ["weekly", "monthly", "direction"] as const;
export const REPORT_TRACKS = ["naesin", "jeongsi"] as const;

/**
 * 쿼리. period 는 weekly(그 주 월요일 YYYY-MM-DD)나 monthly(YYYY-MM) 전용이고,
 * track 과 reportId 는 direction 전용이다. studentId 는 학부모가 자녀 리포트를 열 때만 싣는다.
 * type 과 다른 쿼리의 조합(direction 과 studentId 같은)은 서버가 도메인 규칙으로 막는다.
 */
export const reportQuery = z.object({
  type: z.enum(REPORT_TYPES),
  period: z.string().optional(),
  track: z.enum(REPORT_TRACKS).optional(),
  reportId: z.string().optional(),
  studentId: z.guid().optional(),
});

/** 브라우저가 보내는 모양. */
export type ReportQueryInput = z.input<typeof reportQuery>;

export const reportPayload = z.looseObject({ activePeriod: z.string() });

export const reportResponse = withNotAllowed(
  z.object({ report: reportPayload }),
);

export type GoalReportPayload = z.output<typeof reportPayload>;
