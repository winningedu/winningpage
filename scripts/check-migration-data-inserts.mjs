// =====================================================================
// 마이그레이션 데이터 문 린트 — supabase/migrations/*.sql에 데이터 변경이
// 없는지 검사한다.
//
// 규칙 — 마이그레이션은 스키마(테이블, 컬럼, 제약, 인덱스, 함수, 트리거,
// RLS 정책, 권한)만 담는다. INSERT INTO, UPDATE ... SET, DELETE FROM,
// TRUNCATE, MERGE INTO, COPY ... FROM은 어떤 스키마의 어떤 테이블이든
// 마이그레이션에 둘 수 없다. 데이터 변경은 supabase CLI로 실행하는 데이터
// SQL 파일로 처리한다. 허용 목록과 예외 파일은 없다.
//
// 검사 대상에서 빠지는 경우
//   - 함수/프로시저 본문(create [or replace] function|procedure ...
//     $tag$...$tag$) 안의 문. 실행 시점 로직이라 데이터 변경이 아니다.
//     do $$ ... end $$; 블록은 제외되지 않는다.
//
// 위반이 있으면 파일명, 줄 번호, 문 종류와 테이블을 출력하고 종료 코드 1로
// 끝난다.
//
// db-migrations-ci.yml의 "Check new migration timestamps" 바로 뒤,
// npm ci보다 먼저 실행되므로 node 내장 모듈만 쓴다(의존성 없이 동작해야 함).
//
// 사용:
//   node scripts/check-migration-data-inserts.mjs
// =====================================================================

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkMigrationFile } from "./lib/migrationDataInserts.mjs";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "supabase",
  "migrations",
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let violationCount = 0;

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const { violations } = checkMigrationFile(file, sql);

  for (const { kind, table, line } of violations) {
    violationCount++;
    console.log(
      `::error file=supabase/migrations/${file},line=${line}::${file}:${line} ${kind} ${table} - 마이그레이션에는 스키마만 둔다. 데이터 변경은 마이그레이션이 아니라 supabase CLI 데이터 SQL 파일로 실행할 것`,
    );
  }
}

if (violationCount > 0) {
  process.exit(1);
}

console.log(`검사 ${files.length}개 파일 - 위반 없음`);
