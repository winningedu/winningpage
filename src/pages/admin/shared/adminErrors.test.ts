// @vitest-environment jsdom
// 어드민 오류 안내 문구 회귀 테스트 (QA 316 · 335).
//
// 이 파일이 지켜야 하는 계약은 둘이다.
//   1. 제약 위반은 **어느 항목** 때문인지 말한다. 못 말하면 관리자는 배너 등록에서
//      겪은 것처럼 "등록된 값이 아닌데 왜?" 로 막힌다.
//   2. 그러면서 DB 원문·실제 값은 alert 로 새지 않는다. details 의 값 부분에는
//      중복된 이름·연락처가 그대로 들어 있어 그걸 띄우면 개인정보 노출이다.

import { expect, test, vi } from "vitest";
import { buildFieldLabels, reportAdminError } from "./adminErrors";

function captureAlert(
  error: unknown,
  labels: Record<string, string> = {},
): string {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    reportAdminError("등록 실패", error as never, labels);
    return String(alertSpy.mock.calls[0]?.[0] ?? "");
  } finally {
    alertSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

// 2026-08-31 메인 배너 관리에서 실제로 뜬 케이스. banners_seed_unique_idx 는
// 제목·강조문구·부제·이미지·버튼문구·버튼링크·순서를 통째로 묶은 **식 인덱스**라
// details 에 coalesce(...) 가 그대로 실린다.
const BANNER_DUPLICATE = {
  code: "23505",
  message:
    'duplicate key value violates unique constraint "banners_seed_unique_idx"',
  details:
    "Key (coalesce(title, ''::text), coalesce(highlight, ''::text), coalesce(sort_order, 0))=(, , 1) already exists.",
};

const BANNER_LABELS = buildFieldLabels({
  columns: [
    { key: "title", label: "제목" },
    { key: "sort_order", label: "순서" },
  ],
  fields: [
    { key: "title", label: "제목" },
    { key: "highlight", label: "강조 문구" },
    { key: "sort_order", label: "순서" },
  ],
});

test("배너 중복 — 겹친 항목 이름을 전부 말한다", () => {
  const message = captureAlert(BANNER_DUPLICATE, BANNER_LABELS);

  expect(message).toContain("「제목」");
  expect(message).toContain("「강조 문구」");
  // 순서가 진짜 원인이었는데 옛 문구는 이걸 못 알려줬다.
  expect(message).toContain("「순서」");
  expect(message).toContain("이 중 하나를 바꿔");
});

test("중복 안내에 DB 원문·실제 값이 새지 않는다", () => {
  const message = captureAlert(BANNER_DUPLICATE, BANNER_LABELS);

  expect(message).not.toContain("banners_seed_unique_idx");
  expect(message).not.toContain("duplicate key");
  expect(message).not.toContain("coalesce");
  expect(message).not.toContain("already exists");
});

test("한 칸만 겹치면 그 칸만 짚는다", () => {
  const message = captureAlert(
    {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "admission_universities_name_key"',
      details: "Key (name)=(서울대학교) already exists.",
    },
    { name: "대학명" },
  );

  expect(message).toContain("「대학명」");
  expect(message).toContain("다른 값으로 바꿔");
  // 실제 값(서울대학교)은 노출하지 않는다.
  expect(message).not.toContain("서울대학교");
});

test("NOT NULL 위반은 비어 있는 칸 이름을 말한다 (QA 335)", () => {
  const message = captureAlert(
    {
      code: "23502",
      message:
        'null value in column "school_name" of relation "enrollments" violates not-null constraint',
      details: "Failing row contains (1, null, ...).",
    },
    { school_name: "학교명" },
  );

  expect(message).toContain("「학교명」");
  expect(message).not.toContain("school_name の");
  expect(message).not.toContain("not-null constraint");
});

test("라벨을 모르는 컬럼은 컬럼 이름이라도 보여준다", () => {
  const message = captureAlert(
    {
      code: "23502",
      message:
        'null value in column "weird_column" of relation "x" violates not-null constraint',
    },
    {},
  );

  expect(message).toContain("「weird_column」");
});

test("컬럼을 알아낼 수 없으면 기존 문구로 물러난다", () => {
  // details 없이 코드만 오는 경우(RPC 래핑 등).
  expect(
    captureAlert({ code: "23505", message: "duplicate key" }, {}),
  ).toContain("이미 등록된 값입니다(중복)");
  expect(captureAlert({ code: "23502", message: "null value" }, {})).toContain(
    "필수 값이 비어 있습니다",
  );
});

test("기존 WC 코드 매핑은 그대로다", () => {
  expect(captureAlert({ message: "WC035" })).toContain(
    "아직 승인되지 않은 환불 신청입니다.",
  );
  expect(
    captureAlert({ code: "23514", message: "check constraint" }),
  ).toContain("저장 조건을 벗어났습니다");
  expect(captureAlert({ message: "무슨 소린지 모를 오류" })).toContain(
    "요청을 처리하지 못했습니다",
  );
});

test("buildFieldLabels 는 fields 라벨을 columns 보다 우선한다", () => {
  const labels = buildFieldLabels({
    columns: [{ key: "phone", label: "전화번호" }],
    fields: [{ key: "phone", label: "연락처" }],
  });

  expect(labels.phone).toBe("연락처");
});
