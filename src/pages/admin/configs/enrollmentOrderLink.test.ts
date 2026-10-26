// 수강 신청 내역 ↔ 주문 연결 회귀 테스트 (QA 272).
//
// 이 배선의 위험은 로직이 아니라 **세 곳이 따로 논다**는 데 있다:
//   마이그레이션이 만든 뷰 / config.listTable(읽기) / config.listOnlyColumns(쓰기 제외).
// 뷰에 파생 컬럼을 하나 더 넣고 listOnlyColumns 에 안 적으면, 목록은 멀쩡히 뜨는데
// **수정 저장만 42703 으로 죽는다** — 편집 폼이 목록 행을 그대로 form 으로 받기
// 때문이다. 화면을 열어보는 것만으로는 안 드러나는 종류의 고장이라 여기서 묶는다.

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

import { memberConfigs } from "./member";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const MIGRATIONS = path.join(REPO_ROOT, "supabase/migrations");

// 마이그레이션 전체를 이름 순으로 이은 현재 스키마 원본(squash 후에는 baseline 하나다).
const schema = fs
  .readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => fs.readFileSync(path.join(MIGRATIONS, file), "utf8"))
  .join("\n");

// 뷰의 가장 나중 정의 본문(CREATE 부터 첫 줄끝 세미콜론까지).
const viewStart = schema.lastIndexOf(
  'CREATE OR REPLACE VIEW "public"."admin_enrollment_entries"',
);
const sql = schema.slice(viewStart, schema.indexOf(";\n", viewStart));

const enrollments = memberConfigs.enrollments as {
  table: string;
  listTable?: string;
  readOnly?: boolean;
  noCreate?: boolean;
  listOnlyColumns?: string[];
  listFilter?: { key: string; allLabel: string };
  columns: { key: string; label: string }[];
  fields: { key: string; label: string }[];
};

/**
 * enrollments 테이블의 실제 컬럼. 42703 위험을 재려면 "뷰에 뭐가 있나"가 아니라
 * "원본 테이블에 뭐가 없나"를 봐야 한다 — union 뷰는 모든 컬럼에 별칭을 달기 때문에
 * 별칭 목록으로는 파생 컬럼을 가려낼 수 없다.
 */
function enrollmentTableColumns(): Set<string> {
  const start = schema.indexOf(
    'CREATE TABLE IF NOT EXISTS "public"."enrollments"',
  );
  const columns = new Set<string>();

  // CREATE TABLE 블록을 줄 단위로 훑는다. 줄머리 ");" 가 블록 끝이다.
  for (const line of schema.slice(start).split(/\r?\n/).slice(1)) {
    if (line.startsWith(");")) break;
    const matched = line.match(/^\s+"([a-z_]+)"\s/);
    if (matched?.[1]) columns.add(matched[1]);
  }

  return columns;
}

test("합집합 뷰에서 읽고, 화면은 읽기 전용이다", () => {
  expect(enrollments.table).toBe("enrollments");
  expect(enrollments.listTable).toBe("admin_enrollment_entries");
  // 온라인 결제분이 섞여 나오므로 어드민이 고칠 수 있으면 안 된다 — 주문을 손으로
  // 수정하면 매출(admin_revenue_items)과 어긋난다.
  expect(enrollments.readOnly).toBe(true);
  expect(enrollments.noCreate).toBe(true);
});

test("뷰가 스키마에 존재한다", () => {
  // squash 후 스키마 원본은 pg_dump 형식이라 "drop 이 create 보다 먼저" 같은
  // 마이그레이션 순서 검사는 의미가 없다. 뷰가 있다는 사실만 잠근다.
  expect(viewStart, "admin_enrollment_entries 뷰가 없다").toBeGreaterThan(-1);
  expect(sql).toMatch(
    /^CREATE OR REPLACE VIEW "public"\."admin_enrollment_entries"/,
  );
});

test("뷰는 온라인 주문과 오프라인 장부를 union 한다", () => {
  expect(sql).toMatch(/union all/i);
  expect(sql).toContain('"public"."order_items"');
  expect(sql).toContain('"public"."enrollments"');
});

test("결제가 성립한 주문만 싣는다", () => {
  // pending·failed·canceled 는 신청이 아니라 실패 이력이고, waiting_deposit 은
  // 가상계좌 미입금이라 돈이 안 들어온 건이다. 그걸 수강 신청으로 세면 안 된다.
  expect(sql).toMatch(
    /"o"\."status" = ANY \(ARRAY\['paid'::"text", 'refunded'::"text"\]\)/,
  );
  expect(sql).not.toMatch(/'waiting_deposit'/);
});

test("두 원장의 id 가 접두사로 구분된다", () => {
  // 같은 숫자 id 가 양쪽에 있을 수 있어 접두사 없이 합치면 행이 서로를 덮는다.
  expect(sql).toContain("'order:'");
  expect(sql).toContain("'enroll:'");
});

test("목록 컬럼 중 원본 테이블에 없는 것은 전부 listOnlyColumns 에 있다", () => {
  const tableColumns = enrollmentTableColumns();
  expect(tableColumns.size).toBeGreaterThan(5);

  const derived = enrollments.columns
    .map((column) => column.key)
    .filter((key) => !tableColumns.has(key));

  expect(
    derived.length,
    "파생 컬럼을 하나도 못 찾았다 — 탐지가 깨졌다",
  ).toBeGreaterThan(0);

  for (const column of derived) {
    expect(
      enrollments.listOnlyColumns,
      `${column} 은 enrollments 에 없는 컬럼이다 — listOnlyColumns 에 넣지 않으면 저장이 42703 으로 죽는다`,
    ).toContain(column);
  }
});

test("파생 컬럼은 편집 필드로 노출하지 않는다", () => {
  // 주문에서 따라오는 값이라 사람이 고칠 값이 아니고, 고쳐도 저장 때 버려진다.
  const fieldKeys = enrollments.fields.map((field) => field.key);
  for (const column of enrollments.listOnlyColumns || []) {
    expect(fieldKeys, `${column} 이 편집 필드에 있다`).not.toContain(column);
  }
});

test("온라인·오프라인 구분이 목록에 보인다", () => {
  // 두 원장이 한 표에 섞이는데 출처가 안 보이면 어드민이 "왜 이 건만 결제방식이
  // 비어 있나"를 알 수 없다.
  expect(enrollments.columns.map((column) => column.key)).toContain("source");
});

test("목록에 QA 272 가 요구한 세 항목이 있다", () => {
  const columnKeys = enrollments.columns.map((column) => column.key);
  expect(columnKeys).toContain("phone");
  expect(columnKeys).toContain("payment_method");
  expect(columnKeys).toContain("approval_no");
});

test("뷰는 security_invoker 로 만든다 (RLS 우회 방지)", () => {
  expect(schema).toMatch(
    /CREATE OR REPLACE VIEW "public"\."admin_enrollment_entries" WITH \("security_invoker"='on'\)/,
  );
});

test("승인번호는 payment_key 로 대체하지 않는다", () => {
  // payment_key 는 결제 토큰이지 승인번호가 아니다. 대사(對査)에 쓰면 틀린 값이
  // 되므로, 카드가 아니면 NULL 인 채로 둔다.
  expect(sql).toContain("'approveNo'");
  expect(sql).not.toMatch(/coalesce\([^)]*approveNo[^)]*payment_key/i);
});

// --- QA 227 상단 서비스 필터 -------------------------------------------------

test("서비스 필터는 종목 컬럼을 보고, 선택지를 하드코딩하지 않는다", () => {
  const filter = enrollments.listFilter;

  expect(filter?.key).toBe("category_name");
  expect(filter?.allLabel).toBeTruthy();
  // options 를 config 에 박아두면 종목이 늘 때 화면만 옛 목록으로 남는다 —
  // 실제 행에서 뽑는 설계라 config 에는 키와 '전체' 라벨만 있어야 한다.
  expect(Object.keys(filter ?? {}).sort()).toEqual(["allLabel", "key"]);
});

test("필터 대상 컬럼은 목록에 실제로 있는 컬럼이다", () => {
  const columnKeys = enrollments.columns.map((column) => column.key);
  expect(columnKeys).toContain(enrollments.listFilter?.key);
});
