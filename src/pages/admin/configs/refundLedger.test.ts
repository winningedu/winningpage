// 환불 처리 기록·대장 회귀 테스트 (QA 273·275).
//
// 이 묶음의 위험은 두 가지다.
//
//   1. fn_complete_refund 는 환불 정합성의 심장이다. 이번 요구는 "기록을 더하라"
//      뿐인데, 함수를 통째로 다시 쓰면서 가드 하나를 흘리면 **금액을 초과 환불하거나
//      승인 없이 환불이 나간다.** 그런 사고는 테스트가 없으면 사고가 난 뒤에 안다.
//      그래서 원문 가드가 전부 살아 있는지를 문자열로 잠근다.
//
//   2. 대장은 감사 기록이다. 손으로 고칠 수 있으면 증거가 되지 못한다.

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

import { revenueConfigs } from "./revenue";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const MIGRATION =
  "supabase/migrations/20260831081100_refund_processing_record.sql";

const sql = fs.readFileSync(path.join(REPO_ROOT, MIGRATION), "utf8");

type LedgerConfig = {
  table: string;
  readOnly?: boolean;
  noCreate?: boolean;
  excel?: boolean;
  sensitiveDownload?: boolean;
  columns: { key: string; label: string }[];
  fields?: { key: string; readOnly?: boolean }[];
};

const ledger = revenueConfigs.refundLedger as unknown as LedgerConfig;
const requests = revenueConfigs.refundRequests as unknown as LedgerConfig;

// fn_complete_refund 원문이 지키던 가드들. 하나라도 빠지면 환불이 새거나
// 승인 절차가 무력화된다.
const REQUIRED_GUARDS = [
  "42501", // 어드민 아님
  "WC026", // 신청 없음
  "WC010", // 주문 없음
  "WC035", // 승인 전 완료 시도
  "WC036", // 처리 불가 상태
  "WC037", // 결제금액 초과 환불
  "WC039", // 신청 후 재견적이 줄었다
];

test.each(REQUIRED_GUARDS)(
  "fn_complete_refund 의 가드 %s 가 살아 있다",
  (code) => {
    expect(sql).toContain(code);
  },
);

test("권한 회수와 주문 종결도 그대로다", () => {
  // 환불했는데 이용권이 남아 있거나 주문이 paid 로 남으면 매출이 어긋난다.
  expect(sql).toContain("fn_revoke_program_access_for_order");
  expect(sql).toMatch(
    /update public\.orders[\s\S]*?set status\s*=\s*'refunded'/,
  );
});

test("완료 기록 세 가지를 찍는다", () => {
  expect(sql).toMatch(/completed_at\s*=\s*coalesce\(completed_at, now\(\)\)/);
  expect(sql).toMatch(
    /processed_by\s*=\s*coalesce\(processed_by, auth\.uid\(\)\)/,
  );
  expect(sql).toMatch(/refund_method\s*=\s*coalesce\(refund_method,/);
});

test("이미 찍힌 기록은 덮지 않는다", () => {
  // 최초 완료 시점이 정본이다. 재실행이 값을 밀어 쓰면 대장의 처리일이 바뀐다.
  for (const column of ["completed_at", "processed_by", "refund_method"]) {
    expect(sql, `${column} 이 coalesce 없이 덮어쓴다`).toMatch(
      new RegExp(`${column}\\s*=\\s*coalesce\\(${column},`),
    );
  }
});

test("환불방법은 완료 시점에 확정해 박는다 (뷰에서 유추하지 않는다)", () => {
  // 계좌 정보는 나중에 바뀔 수 있다. 유추하면 과거 대장이 조용히 달라진다.
  expect(sql).toContain("'계좌이체'");
  expect(sql).toContain("'카드취소'");
  // 뷰는 이미 박힌 컬럼을 그대로 내보내야 한다 — case 문이 있으면 유추다.
  const viewBody = sql.slice(sql.indexOf("create or replace view"));
  expect(viewBody).toContain("r.refund_method");
  expect(viewBody).not.toMatch(/case[\s\S]*계좌이체/);
});

test("기존 완료 건을 소급해서 채우지 않는다", () => {
  // updated_at·created_at 으로 메우면 그럴듯한 거짓 날짜가 대장에 박힌다.
  expect(sql).not.toMatch(
    /update public\.refund_requests[\s\S]{0,200}completed_at\s*=\s*(updated_at|created_at)/,
  );
});

test("대장 뷰는 완료 건만 싣고 security_invoker 다", () => {
  expect(sql).toMatch(/with \(security_invoker = on\)/i);
  expect(sql).toMatch(/where r\.status = 'completed'/);
});

test("QA 273 — 환불 신청 내역에 신청일과 처리일이 함께 있다", () => {
  const keys = requests.columns.map((column) => column.key);
  expect(keys).toContain("created_at");
  expect(keys).toContain("completed_at");
});

test("QA 275 — 대장에 파일18 의 열이 모두 있다", () => {
  const keys = ledger.columns.map((column) => column.key);
  for (const key of [
    "completed_at",
    "student_name",
    "program_name",
    "tenant_name",
    "paid_amount",
    "refund_amount",
    "refund_method",
    "processed_by_name",
    "reason",
  ]) {
    expect(keys, `${key} 가 대장 컬럼에 없다`).toContain(key);
  }
});

test("대장은 읽기 전용이고 상세 필드도 편집 불가다", () => {
  // 완료 처리는 fn_complete_refund 전용이다(WC038 트리거가 제네릭 PATCH 를 막는다).
  // 대장을 손으로 고칠 수 있으면 감사 기록이 되지 못한다.
  expect(ledger.table).toBe("admin_refund_ledger");
  expect(ledger.readOnly).toBe(true);
  expect(ledger.noCreate).toBe(true);
  for (const field of ledger.fields ?? []) {
    expect(field.readOnly, `${field.key} 가 편집 가능하다`).toBe(true);
  }
});

test("대장 다운로드는 개인정보 게이트를 탄다", () => {
  // 수강자명·소속명이 파일로 나간다.
  expect(ledger.excel).toBe(true);
  expect(ledger.sensitiveDownload).toBe(true);
});
