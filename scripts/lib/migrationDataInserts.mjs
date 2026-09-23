// scripts/check-migration-data-inserts.mjs가 쓰는 순수 모듈. DB 접속 없음.
//
// 왜 — supabase/migrations/*.sql은 위닝에듀(W)·스쿨멘토(S) 두 운영 DB에 공통
// 적용된다. 그런데 W 영업 데이터(상품·가격, 캠퍼스 테넌트, 약관 본문 등)를
// 마이그레이션 안에서 insert한 파일들이 있어 새 DB(S)에 W 데이터가 그대로
// 재현됐다. 마이그레이션은 앱 코드가 존재를 전제하는 "참조 데이터"
// (ALLOWED_TABLES)에만 insert하도록 하고, 그 외 영업/콘텐츠 데이터는
// 시드 스크립트(scripts/seed-prod-from-dev.mjs)·어드민으로 넣는다.

function stripLineComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

// create [or replace] function ... as $tag$ ... $tag$; 의 달러 인용 본문을
// 제거한다. 함수 본문 안의 insert는 실행 시점 로직(예: 결제 승인 시 orders
// insert)이라 마이그레이션 데이터 시딩이 아니다.
//
// do $$ ... end $$; 블록은 여기서 제거하지 않는다 — DO 블록 안의 insert는
// 마이그레이션이 직접 실행하는 데이터 시드이므로 검사 대상이다.
export function stripFunctionBodies(sql) {
  const withoutComments = stripLineComments(sql);
  return withoutComments.replace(
    /create\s+(?:or\s+replace\s+)?function\b[\s\S]*?\$([a-zA-Z_]*)\$[\s\S]*?\$\1\$/gi,
    "",
  );
}

// 함수 본문을 제거한 뒤 insert into [public.]<table> 패턴을 찾아 소문자
// 테이블명 배열(중복 제거, 등장 순)을 돌려준다. public. 접두어는 떼어내고
// (스키마 접두어 없는 것과 같은 값으로 취급), 다른 스키마(auth./storage.)는
// 접두어를 붙인 그대로 반환한다.
export function findInserts(sql) {
  const stripped = stripFunctionBodies(sql);
  const regex =
    /insert\s+into\s+((?:[a-zA-Z_][a-zA-Z0-9_]*\.)?[a-zA-Z_][a-zA-Z0-9_]*)/gi;

  const seen = new Set();
  const result = [];
  for (const match of stripped.matchAll(regex)) {
    const raw = match[1].toLowerCase();
    const dotIndex = raw.indexOf(".");
    const table =
      dotIndex !== -1 && raw.slice(0, dotIndex) === "public"
        ? raw.slice(dotIndex + 1)
        : raw;
    if (!seen.has(table)) {
      seen.add(table);
      result.push(table);
    }
  }
  return result;
}

// 앱 코드가 존재를 전제하는 참조 데이터 테이블 — 마이그레이션이 insert해도
// 되는 유일한 목록. 새 참조 테이블이 생기면 이 배열에 추가한다.
// storage.buckets는 데이터가 아니라 버킷 정의(인프라 설정)라 허용한다.
export const ALLOWED_TABLES = [
  "admin_resources",
  "admin_roles",
  "admin_role_permissions",
  "app_settings",
  "program_categories",
  "programs",
  "learning_diagnosis_v2_survey_copy",
  "storage.buckets",
];

// 이 값 미만(파일명 14자리 타임스탬프) 마이그레이션은 이 린트 도입 이전에
// 이미 병합된 기존 파일이라 손대지 않고 검사에서 제외한다.
export const BASELINE_CUTOFF = "20260923000000";

// 마이그레이션 파일 하나를 검사한다. 파일명이 <14자리>_ 형식이 아니면
// 컷오프로 건너뛸 근거가 없으므로 그대로 검사한다.
export function checkMigrationFile(
  fileName,
  sql,
  { allowed = ALLOWED_TABLES, cutoff = BASELINE_CUTOFF } = {},
) {
  const match = fileName.match(/^(\d{14})_/);
  if (match && match[1] < cutoff) {
    return { skipped: true, violations: [] };
  }

  const tables = findInserts(sql);
  const violations = tables.filter((table) => !allowed.includes(table));
  return { skipped: false, violations };
}
