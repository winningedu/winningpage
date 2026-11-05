// 배너 노출 기간/대상 지정(#153) 마이그레이션이 필요한 컬럼을 모두 담는지 잠근다.
// 원격 DB 에는 적용하지 않으므로 파일 내용으로만 본다.

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const MIGRATIONS = path.resolve(
  import.meta.dirname,
  "../../../../supabase/migrations",
);

function readBannerTargetMigration(): string {
  const file = fs
    .readdirSync(MIGRATIONS)
    .find((name) => name.endsWith("_banners_tenant_target.sql"));
  expect(file).toBeDefined();
  return fs.readFileSync(path.join(MIGRATIONS, file as string), "utf8");
}

test("banners 에 start_date, end_date 를 date null 로 추가한다", () => {
  const sql = readBannerTargetMigration();
  expect(sql).toMatch(
    /"banners"[\s\S]*ADD COLUMN IF NOT EXISTS "start_date" date/,
  );
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "end_date" date/);
});

test.each(["banners", "home_side_banners"])(
  "%s 에 tenants 를 참조하는 tenant_id 를 null 허용으로 추가한다",
  (table) => {
    const sql = readBannerTargetMigration();
    const pattern = new RegExp(
      `ALTER TABLE "public"."${table}"[^;]*ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "public"."tenants"\\("id"\\)`,
    );
    expect(sql).toMatch(pattern);
    expect(sql).not.toMatch(/"tenant_id" uuid NOT NULL/);
  },
);
