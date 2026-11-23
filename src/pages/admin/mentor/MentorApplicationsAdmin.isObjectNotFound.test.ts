// MentorApplicationsAdmin.tsx의 isObjectNotFound(증빙 파일 부재 판정) 회귀 테스트.
//
// 배경(QA 318): 멘토 신청 상세에서 [증빙 파일 열람]을 누르면 스토리지 원문인
// "Object not found"가 그대로 alert 로 떴다. 어드민 입장에선 시스템 장애처럼
// 읽히지만 실제로는 "파일이 없다"일 뿐이다.
//
// 이 함수가 지켜야 하는 계약은 두 방향이다:
//   1. 객체 부재는 true — "등록된 증빙 파일이 없습니다."로 흡수해야 한다.
//   2. 그 외 실패(권한·네트워크)는 false — 원문을 남겨야 원인을 좁힐 수 있다.
// 2번을 놓치면 403·네트워크 장애가 전부 "파일 없음"으로 뭉개져 디버깅이 막힌다.
//
// Supabase·네트워크 없이 순수 함수만 검증한다.

import { expect, test } from "vitest";
import { isObjectNotFound } from "./MentorApplicationsAdmin";

test("dev 실측 응답 형태를 객체 부재로 판정한다 (2026-08-31 확인)", () => {
  // createSignedUrl 이 없는 경로에 대해 실제로 돌려준 본문. HTTP 는 400 인데
  // statusCode 는 문자열 "404" 다 — 이 불일치가 이 함수가 존재하는 이유다.
  expect(
    isObjectNotFound({
      statusCode: "404",
      error: "not_found",
      message: "Object not found",
      name: "StorageApiError",
    }),
  ).toBe(true);
});

test("statusCode 가 숫자 404 여도 판정한다", () => {
  expect(isObjectNotFound({ statusCode: 404 })).toBe(true);
});

test("statusCode 가 없으면 메시지로 폴백한다", () => {
  expect(isObjectNotFound({ message: "Object not found" })).toBe(true);
  expect(isObjectNotFound({ message: "object NOT FOUND" })).toBe(true);
});

test("권한·네트워크 실패는 객체 부재가 아니다 — 원문을 살려야 한다", () => {
  expect(isObjectNotFound({ statusCode: "403", message: "Unauthorized" })).toBe(
    false,
  );
  expect(
    isObjectNotFound({ statusCode: "500", message: "Internal error" }),
  ).toBe(false);
  expect(isObjectNotFound(new TypeError("Failed to fetch"))).toBe(false);
});

test("에러가 아예 없거나 원시값이면 false", () => {
  expect(isObjectNotFound(null)).toBe(false);
  expect(isObjectNotFound(undefined)).toBe(false);
  expect(isObjectNotFound("Object not found")).toBe(false);
});
