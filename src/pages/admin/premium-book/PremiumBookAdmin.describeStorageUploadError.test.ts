// PremiumBookAdmin.tsx의 describeStorageUploadError(Storage 업로드 실패 원인 구체화)
// 회귀 테스트.
//
// 배경(QA 223): 프리미엄책자관리 [적용]에서 원본 PDF 업로드가 "원본PDF업로드
// 실패-적용중단: mime type application/pdf is not supported"로 실패했다.
// banners 버킷이 원래 이미지 배너 전용으로 만들어져 있었고, 이 리포의 어떤
// 마이그레이션도 allowed_mime_types 컬럼을 건드린 적이 없어(20260821000001_storage.sql
// 은 id/name/public 3컬럼만 upsert) 그 제한이 남아 있었던 것이 근본 원인이다
// (수정: supabase/migrations/20260902103514_premium_book_banners_pdf_mime.sql).
//
// 이 테스트는 그 원인이 재발해도(또는 다른 원인 — 용량 초과/권한/로그인 만료가
// 섞여도) 어드민 화면에 원인이 구체적으로 뜨는지를 검증한다. dev 로컬에서
// banners 버킷의 allowed_mime_types를 이미지 전용으로 재현해 실제로 받은 응답
// 형태(statusCode "415")를 그대로 고정값으로 쓴다.
//
// Supabase·네트워크 없이 순수 함수만 검증한다.

import { expect, test } from "vitest";
import { describeStorageUploadError } from "./PremiumBookAdmin";

test("QA 223 dev 실측 응답 — mime type 거부(415)를 형식 문제로 구체화한다", () => {
  const result = describeStorageUploadError({
    name: "StorageApiError",
    message: "mime type application/pdf is not supported",
    status: 400,
    statusCode: "415",
  });
  expect(result).toContain("허용되지 않는 파일 형식");
  expect(result).toContain("mime type application/pdf is not supported");
});

test("statusCode 413 — 용량 초과로 구체화한다", () => {
  const result = describeStorageUploadError({
    message: "The object exceeded the maximum allowed size",
    statusCode: "413",
  });
  expect(result).toContain("용량이 허용 한도를 초과");
});

test("statusCode 403 — 권한 없음(로그인 재확인 안내)으로 구체화한다", () => {
  const result = describeStorageUploadError({
    message: "new row violates row-level security policy",
    statusCode: "403",
  });
  expect(result).toContain("업로드 권한이 없습니다");
  expect(result).toContain("다시 로그인");
});

test("statusCode 401 — 로그인 만료로 구체화한다", () => {
  const result = describeStorageUploadError({
    message: "JWT expired",
    statusCode: "401",
  });
  expect(result).toContain("로그인이 만료됐습니다");
});

test("알 수 없는 statusCode는 원문 메시지를 그대로 살린다 — 원인 추적 가능해야 한다", () => {
  const result = describeStorageUploadError({
    message: "Internal server error",
    statusCode: "500",
  });
  expect(result).toBe("Internal server error");
});

test("statusCode가 없으면 메시지만으로 폴백한다", () => {
  expect(describeStorageUploadError({ message: "Failed to fetch" })).toBe(
    "Failed to fetch",
  );
});

test("에러가 아예 없거나 원시값이면 문자열로 안전하게 폴백한다", () => {
  expect(describeStorageUploadError(null)).toBe("알 수 없는 오류");
  expect(describeStorageUploadError(undefined)).toBe("알 수 없는 오류");
  expect(describeStorageUploadError("network down")).toBe("network down");
});
