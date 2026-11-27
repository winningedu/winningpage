// problem 바디의 공통 code. 서버(api/)가 내고 브라우저(src/)가 ApiError.code 로 비교한다. 도메인 코드는 그 도메인 계약 파일에 둔다.

export const PROBLEM_CODE = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  CONFLICT: "CONFLICT",
  INVALID_TIME_ZONE: "INVALID_TIME_ZONE",
  TIME_ZONE_REQUIRED: "TIME_ZONE_REQUIRED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ProblemCode = (typeof PROBLEM_CODE)[keyof typeof PROBLEM_CODE];
