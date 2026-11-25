// 증빙 파일 부재 판정(isObjectNotFound) 회귀 테스트.
//
// 배경(QA 318): 증빙 파일 열람에서 스토리지 원문 "Object not found"가 그대로 보였다.
// 계약은 두 방향이다. 객체 부재는 true(PROOF_NOT_FOUND 로 흡수), 그 외 실패(권한, 네트워크)는 false(원문을 살려 원인을 좁힌다).

import { expect, test } from "vitest";
import { isObjectNotFound } from "./isObjectNotFound.js";

test("dev 실측 응답 형태를 객체 부재로 판정한다(2026-08-31 확인)", () => {
  // HTTP 는 400 인데 statusCode 는 문자열 "404" 다. 이 불일치가 이 함수가 있는 이유다.
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

test("권한, 네트워크 실패는 객체 부재가 아니다", () => {
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
