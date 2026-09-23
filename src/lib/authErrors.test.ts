// authErrors.ts(Supabase Auth 에러 판정 공용 함수) 회귀 테스트.
//
// isServerFailure는 FindPassword.tsx 전용이었던 것을 여기로 옮겼다
// (배경은 원래 위치했던 src/pages/FindPassword.isServerFailure.test.ts 참고,
// 이 파일로 대체됐다). isRateLimited는 token_hash 전환 작업(2026-09-23)에서
// 신규 추가 — Supabase 발송 한도 초과(429)를 서버 장애와 구분해 판정한다.
//
// Supabase·네트워크 없이 순수 함수만 검증한다.

import { expect, test } from "vitest";
import { isRateLimited, isServerFailure } from "./authErrors";

test("AuthRetryableFetchError 는 서버 장애다 (2026-08-23 SMTP 사고의 실제 타입)", () => {
  const error = Object.assign(new Error("{}"), {
    name: "AuthRetryableFetchError",
  });
  expect(isServerFailure(error)).toBe(true);
});

test("status 가 500 이상이면 서버 장애다", () => {
  expect(isServerFailure({ status: 500 })).toBe(true);
  expect(isServerFailure({ status: 502 })).toBe(true);
  expect(isServerFailure({ status: 503 })).toBe(true);
});

test("4xx 는 서버 장애로 보지 않는다 — 계정 존재 여부가 새면 안 된다", () => {
  expect(isServerFailure({ status: 400 })).toBe(false);
  expect(isServerFailure({ status: 404 })).toBe(false);
  expect(isServerFailure({ status: 422 })).toBe(false);
});

test("rate limit(429)은 서버 장애가 아니다 — isRateLimited가 따로 판정한다", () => {
  expect(isServerFailure({ status: 429 })).toBe(false);
});

test("에러가 아닌 값에는 반응하지 않는다", () => {
  expect(isServerFailure(null)).toBe(false);
  expect(isServerFailure(undefined)).toBe(false);
  expect(isServerFailure("500")).toBe(false);
  expect(isServerFailure({})).toBe(false);
  expect(isServerFailure(new Error("그냥 오류"))).toBe(false);
});

test("status 429는 rate limit이다", () => {
  expect(isRateLimited({ status: 429 })).toBe(true);
});

test("code가 over_email_send_rate_limit이면 rate limit이다", () => {
  expect(isRateLimited({ code: "over_email_send_rate_limit" })).toBe(true);
});

test("그 외 상태·코드는 rate limit이 아니다", () => {
  expect(isRateLimited({ status: 400 })).toBe(false);
  expect(isRateLimited({ status: 500 })).toBe(false);
  expect(isRateLimited({ code: "otp_expired" })).toBe(false);
});

test("에러가 아닌 값에는 반응하지 않는다", () => {
  expect(isRateLimited(null)).toBe(false);
  expect(isRateLimited(undefined)).toBe(false);
});
