// =====================================================================
// 마이그레이션 데이터 insert 린트 — supabase/migrations/*.sql이 "앱 계약
// 참조 데이터"(ALLOWED_TABLES) 밖 테이블에 insert하지 않는지 검사한다.
//
// 왜 — 이 저장소의 마이그레이션은 위닝에듀(W)·스쿨멘토(S) 두 운영 DB에
// 공통 적용된다. 그런데 W 영업 데이터(상품·가격, 캠퍼스 테넌트, 약관 본문
// 등)를 마이그레이션 안에서 insert한 파일들이 있어 새 DB(S)에 W 데이터가
// 그대로 재현됐다. 앞으로는 마이그레이션이 앱 코드가 존재를 전제하는
// 참조 데이터에만 insert하도록 하고, 영업/콘텐츠 데이터는 시드 스크립트
// (scripts/seed-prod-from-dev.mjs)·어드민으로 넣는다.
//
// 검사 대상에서 빠지는 경우
//   - 함수 본문(create [or replace] function ... $tag$...$tag$) 안 insert.
//     실행 시점 로직(예: 결제 승인 시 orders insert)이라 데이터 시딩이
//     아니다. do $$ ... end $$; 블록은 제외되지 않는다 — 그 안의 insert는
//     마이그레이션이 직접 실행하는 데이터 시드다.
//   - 파일명 14자리 타임스탬프가 BASELINE_CUTOFF 미만인 파일. 이 린트
//     도입 이전에 이미 병합된 기존 파일은 손대지 않는다.
//
// 허용 목록을 바꾸려면 scripts/lib/migrationDataInserts.mjs의
// ALLOWED_TABLES 배열에 테이블명을 추가/삭제한다.
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

let hasViolation = false;
let checked = 0;
let skipped = 0;

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const result = checkMigrationFile(file, sql);

  if (result.skipped) {
    skipped++;
    continue;
  }
  checked++;

  if (result.violations.length > 0) {
    hasViolation = true;
    console.log(
      `::error file=supabase/migrations/${file}::마이그레이션이 참조 데이터 허용 목록 밖 테이블에 insert함: ${result.violations.join(", ")} — 영업/콘텐츠 데이터는 시드 스크립트(scripts/seed-prod-from-dev.mjs)·어드민으로 넣을 것`,
    );
  }
}

if (hasViolation) {
  process.exit(1);
}

console.log(`검사 ${checked}개 파일(제외 ${skipped}개) — 위반 없음`);
