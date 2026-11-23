// 배너 노출 기간/대상 지정(#153)이 현재 스키마(스쿼시한 baseline 이후 마이그레이션 전체)에
// 필요한 컬럼을 모두 담는지 잠근다. 원격 DB 에는 적용하지 않으므로 SQL 텍스트로만 본다.
// pg_dump 형식이라 컬럼은 CREATE TABLE 본문에, 외래 키는 ALTER TABLE ONLY 문에 있다.

import { expect, test } from "vitest";
import { MIGRATIONS_SQL } from "../../../../supabase/grants/migrationGrants";

function tableBody(table: string): string {
  const match = MIGRATIONS_SQL.match(
    new RegExp(
      `CREATE TABLE IF NOT EXISTS "public"\\."${table}" \\(([\\s\\S]*?)\\n\\);`,
    ),
  );
  expect(match).not.toBeNull();
  return (match as RegExpMatchArray)[1] ?? "";
}

test("banners 에 start_date, end_date 가 date null 로 있다", () => {
  const body = tableBody("banners");
  expect(body).toMatch(/^\s+"start_date" "date",$/m);
  expect(body).toMatch(/^\s+"end_date" "date",$/m);
});

test.each(["banners", "home_side_banners"])(
  "%s 에 tenants 를 참조하는 tenant_id 가 null 허용으로 있다",
  (table) => {
    expect(tableBody(table)).toMatch(/^\s+"tenant_id" "uuid",$/m);
    expect(MIGRATIONS_SQL).toContain(
      `ALTER TABLE ONLY "public"."${table}"\n    ADD CONSTRAINT "${table}_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");`,
    );
  },
);
