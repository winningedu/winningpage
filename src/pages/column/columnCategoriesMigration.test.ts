// column_categories 가 현재 스키마(스쿼시한 baseline 이후 마이그레이션 전체)에 테이블, RLS,
// 이름 변경 전파 트리거를 담는지 잠근다. 원격 DB 에는 적용하지 않으므로 SQL 텍스트로만 본다.
// seed 는 마이그레이션이 아니라 supabase/data 에 둔다(check-migration-data-inserts.mjs).

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { MIGRATIONS_SQL } from "../../../supabase/grants/migrationGrants";

const MIGRATIONS = path.resolve(
  import.meta.dirname,
  "../../../supabase/migrations",
);

// pg_dump 는 문장을 줄 단위로 적고 식별자를 인용부호로 감싼다.
function flatSql(): string {
  return MIGRATIONS_SQL.replace(/\s+/g, " ");
}

function tableBody(table: string): string {
  const match = MIGRATIONS_SQL.match(
    new RegExp(
      `CREATE TABLE IF NOT EXISTS "public"\\."${table}" \\(([\\s\\S]*?)\\n\\);`,
    ),
  );
  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[1] ?? "";
}

test("label unique, sort_order, is_active 를 가진 column_categories 테이블이 있다", () => {
  const body = tableBody("column_categories");
  expect(body).toMatch(/^\s+"label" "text" NOT NULL,$/m);
  expect(body).toMatch(/^\s+"sort_order" integer DEFAULT 0 NOT NULL,$/m);
  expect(body).toMatch(/^\s+"is_active" boolean DEFAULT true NOT NULL,$/m);
  expect(body).toMatch(
    /^\s+"created_at" timestamp with time zone DEFAULT "now"\(\) NOT NULL$/m,
  );
  expect(flatSql()).toContain(
    'ALTER TABLE ONLY "public"."column_categories" ADD CONSTRAINT "column_categories_label_key" UNIQUE ("label");',
  );
});

test("RLS 가 켜져 있고 공개 조회와 관리자 전용 쓰기 정책이 있다", () => {
  const sql = flatSql();
  expect(sql).toContain(
    'ALTER TABLE "public"."column_categories" ENABLE ROW LEVEL SECURITY;',
  );
  expect(sql).toContain(
    'CREATE POLICY "column_categories public read" ON "public"."column_categories" FOR SELECT TO "authenticated", "anon" USING (("is_active" OR "public"."is_winning_admin"()));',
  );
  expect(sql).toContain(
    'CREATE POLICY "column_categories admin all" ON "public"."column_categories" TO "authenticated" USING ("public"."is_winning_admin"()) WITH CHECK ("public"."is_winning_admin"());',
  );
});

test("label 이 바뀌면 같은 트랜잭션에서 galleries.category 를 새 이름으로 바꾼다", () => {
  const sql = flatSql();
  expect(sql).toContain(
    'CREATE OR REPLACE TRIGGER "trg_column_categories_propagate_label" AFTER UPDATE OF "label" ON "public"."column_categories" FOR EACH ROW WHEN (("old"."label" IS DISTINCT FROM "new"."label")) EXECUTE FUNCTION "public"."column_categories_propagate_label"();',
  );
  expect(sql).toMatch(
    /CREATE OR REPLACE FUNCTION "public"\."column_categories_propagate_label"\(\)[^$]*\$\$ begin update public\.galleries set category = new\.label where category = old\.label;/,
  );
});

test("마이그레이션에는 seed insert 를 두지 않는다", () => {
  // 함수 본문은 들여쓰기가 있으므로 줄 맨 앞의 데이터 문장만 본다.
  expect(MIGRATIONS_SQL).not.toMatch(/^insert\s+into/im);
});

test("seed 데이터 SQL 이 현재 7개 칩을 기존 순서대로 멱등하게 넣는다", () => {
  const dataDir = path.resolve(MIGRATIONS, "../data");
  const file = fs
    .readdirSync(dataDir)
    .find((name) => name.endsWith("_column_categories_seed.sql"));
  expect(file).toBeDefined();
  const sql = fs.readFileSync(path.join(dataDir, file as string), "utf8");
  const labels = [
    "학습관리 방법",
    "수시 및 정시 전략",
    "특목고 입학",
    "해외 및 대학원",
    "입시제도 변화",
    "대학 입시 제로",
    "학생부•수행평가•세특",
  ];
  const positions = labels.map((label, i) => {
    expect(sql).toContain(`('${label}', ${(i + 1) * 10})`);
    return sql.indexOf(`('${label}'`);
  });
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(sql).toMatch(/on conflict \(label\) do nothing/i);
});
