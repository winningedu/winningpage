// 서버가 검증 실패(400 VALIDATION_FAILED)의 사유를 errors[0].message 에 담는 화면에서 쓰는 문구 선택.
// 사유 문구는 서버의 zod 스키마가 정한 한국어다. 그런 스키마가 아닌 요청의 검증 실패에는 쓰지 않는다(기본 zod 문구는 영어다).

import { ApiError } from "@/lib/http/client";
import { PROBLEM_CODE } from "../../../../shared/http/codes.js";

/** 검증 실패면 첫 오류 문구, 아니면 서버 detail, ApiError 가 아니면 fallback. */
export function problemDetail(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === PROBLEM_CODE.VALIDATION_FAILED) {
    const message = error.problem?.errors?.[0]?.message;
    if (message) return message;
  }
  return error.detail;
}
