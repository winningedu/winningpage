// 문제집 페이지 검증 — 현재 페이지는 전체 페이지를 넘을 수 없고, 전체 페이지는
// 등록 후 수정할 수 없다(사용자 확정 2026-09-02).
import { expect, test } from "vitest";
import { validateCreateBody, validateUpdateBody } from "./workbooks.js";

test("등록: 현재 페이지가 전체 페이지를 넘으면 400", () => {
  const result = validateCreateBody({
    subject: "math",
    title: "수능특강",
    totalPages: 200,
    currentPage: 201,
  });
  expect(result.error?.status).toBe(400);
  expect(result.error?.body.detail).toContain("넘을 수 없습니다");
});

test("등록: 현재 페이지 = 전체 페이지는 허용된다", () => {
  const result = validateCreateBody({
    subject: "math",
    title: "수능특강",
    totalPages: 200,
    currentPage: 200,
  });
  expect(result.value).toEqual({
    subject: "math",
    title: "수능특강",
    totalPages: 200,
    currentPage: 200,
  });
});

test("수정: totalPages를 보내면 400", () => {
  const result = validateUpdateBody({ id: 1, totalPages: 300 });
  expect(result.error?.status).toBe(400);
  expect(result.error?.body.detail).toContain("등록 후 수정할 수 없습니다");
});

test("수정: currentPage만 보내면 patch에 currentPage만 담긴다", () => {
  const result = validateUpdateBody({ id: 1, currentPage: 120 });
  expect(result.value).toEqual({ id: 1, patch: { currentPage: 120 } });
});
