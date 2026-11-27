// 자기평가서 계약의 공통 층: 서버(api/_lib/selfeval, api/_routes/selfeval)와 브라우저(src/lib/selfeval)가 함께 쓰는 상수, 도메인 problem code, 열거값.
// 요청, 응답 스키마는 자원별 파일(session.ts, reports.ts)에 둔다.

import { z } from "zod";

/** 마지막 활동 후 이 일 수가 지나면 세션을 만료로 본다(회원 시간대의 달력 날짜 기준). */
export const SESSION_EXPIRY_DAYS = 90;
/** 모델 단계 선점이 이 초를 넘으면 죽은 것으로 보고 다시 선점할 수 있다. */
export const CLAIM_STALE_SECONDS = 120;
/** 모델 단계 한 번의 시간 예산(ms). */
export const STEP_BUDGET_MS = 50_000;

/** 자기평가서 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const SELFEVAL_ERROR = {
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  NO_ENTITLEMENT: "NO_ENTITLEMENT",
  QUOTA_EXHAUSTED: "QUOTA_EXHAUSTED",
  SESSION_OPEN: "SESSION_OPEN",
  SESSION_LOCKED: "SESSION_LOCKED",
  SESSION_NOT_OPEN: "SESSION_NOT_OPEN",
  PLAN_ITEM_INVALID: "PLAN_ITEM_INVALID",
} as const;

export type SelfevalErrorCode =
  (typeof SELFEVAL_ERROR)[keyof typeof SELFEVAL_ERROR];

export const SESSION_STATUSES = [
  "draft",
  "in_progress",
  "completed",
  "archived",
] as const;
/** 단계(current_step): 0 생성됨, 1 기본 입력 저장, 2 활동 선택 확정, 3 분석 완료, 4 생성 성공, 5 검증 완료, 6 최종 저장. */
export const SESSION_STEPS = [0, 1, 2, 3, 4, 5, 6] as const;
/** 작성 영역. subject 는 교과, 나머지는 창의적 체험활동 영역. */
export const AREAS = ["subject", "autonomy", "club", "career"] as const;
export const HIGH_GRADES = ["고1", "고2", "고3"] as const;
export const TARGET_CHARS_MODES = ["with_space", "without_space"] as const;
export const MODEL_STEP_KEYS = ["link", "analyze", "write", "verify"] as const;
export const GROWTH_STAGES = ["seed", "flower", "bloom"] as const;
export const SESSION_ROUTES = [
  "new",
  "activities",
  "analysis",
  "result",
  "verify",
  "done",
] as const;
export const ANALYSIS_FIELDS = [
  "motive",
  "concept",
  "action",
  "method",
  "result",
  "role",
  "collaboration",
  "learning",
  "career",
  "limitation",
  "next",
] as const;

export const sessionStatusSchema = z.enum(SESSION_STATUSES);
export const sessionStepSchema = z.literal(SESSION_STEPS);
export const areaSchema = z.enum(AREAS);
export const highGradeSchema = z.enum(HIGH_GRADES);
export const semesterSchema = z.literal([1, 2]);
export const targetCharsModeSchema = z.enum(TARGET_CHARS_MODES);
export const modelStepKeySchema = z.enum(MODEL_STEP_KEYS);
