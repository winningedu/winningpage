// scripts/check-migration-data-inserts.mjs가 쓰는 순수 모듈. DB 접속 없음.
//
// 규칙 — supabase/migrations/*.sql은 스키마(테이블, 컬럼, 제약, 인덱스,
// 함수, 트리거, RLS 정책, 권한)만 담는다. 데이터 변경(INSERT, UPDATE,
// DELETE, TRUNCATE, MERGE, COPY ... FROM)은 어떤 스키마의 어떤 테이블이든
// 마이그레이션에 둘 수 없고, supabase CLI로 실행하는 데이터 SQL 파일로
// 처리한다. 허용 목록과 예외 파일은 없다.

// 지운 구간의 줄바꿈은 남겨 둬서 위반의 줄 번호가 원본과 어긋나지 않게 한다.
function keepNewlines(text) {
  return text.replace(/[^\n]/g, "");
}

function stripLineComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

// create [or replace] function/procedure ... as $tag$ ... $tag$; 의 달러
// 인용 본문을 제거한다. 함수 본문 안의 데이터 문은 실행 시점 로직(예: 결제
// 승인 시 orders insert)이라 마이그레이션이 직접 실행하는 데이터 변경이
// 아니다.
//
// do $$ ... end $$; 블록은 여기서 제거하지 않는다 — DO 블록 안의 문은
// 마이그레이션이 직접 실행하므로 검사 대상이다.
export function stripFunctionBodies(sql) {
  const withoutComments = stripLineComments(sql);
  return withoutComments.replace(
    /create\s+(?:or\s+replace\s+)?(?:function|procedure)\b[\s\S]*?\$([a-zA-Z_]*)\$[\s\S]*?\$\1\$/gi,
    keepNewlines,
  );
}

const NAME = String.raw`((?:"?[a-zA-Z_][a-zA-Z0-9_]*"?\.)?"?[a-zA-Z_][a-zA-Z0-9_]*"?)`;

// kind별 패턴. update는 DDL의 on update / for update / before update on 과
// 구분하려고 "update <table> [alias] set" 꼴만 잡는다.
const PATTERNS = [
  ["insert", new RegExp(String.raw`\binsert\s+into\s+(?:only\s+)?${NAME}`, "gi")],
  [
    "update",
    new RegExp(
      String.raw`(?<!\bon\s)(?<!\bfor\s)\bupdate\s+(?:only\s+)?${NAME}(?:\s+(?:as\s+)?[a-zA-Z_][a-zA-Z0-9_]*)?\s+set\b`,
      "gi",
    ),
  ],
  ["delete", new RegExp(String.raw`\bdelete\s+from\s+(?:only\s+)?${NAME}`, "gi")],
  ["truncate", new RegExp(String.raw`\btruncate\s+(?:table\s+)?(?:only\s+)?${NAME}`, "gi")],
  ["merge", new RegExp(String.raw`\bmerge\s+into\s+(?:only\s+)?${NAME}`, "gi")],
  ["copy", new RegExp(String.raw`\bcopy\s+${NAME}[^;]*?\bfrom\b`, "gi")],
];

// public. 접두어는 떼어내 스키마 접두어 없는 이름과 같은 값으로 취급하고,
// 다른 스키마(auth./storage.)는 접두어를 붙인 그대로 둔다.
function normalizeTable(raw) {
  const name = raw.toLowerCase().replaceAll('"', "");
  return name.startsWith("public.") ? name.slice("public.".length) : name;
}

// 함수 본문을 제거한 뒤 데이터 문을 찾아 { kind, table, line } 배열로
// 돌려준다(줄 번호 오름차순).
export function findDataStatements(sql) {
  const stripped = stripFunctionBodies(sql);
  const found = [];
  for (const [kind, regex] of PATTERNS) {
    for (const match of stripped.matchAll(regex)) {
      const line = stripped.slice(0, match.index).split("\n").length;
      found.push({ kind, table: normalizeTable(match[1]), line, index: match.index });
    }
  }
  return found
    .sort((a, b) => a.index - b.index)
    .map(({ kind, table, line }) => ({ kind, table, line }));
}

// 마이그레이션 파일 하나를 검사한다. 모든 파일이 대상이다.
export function checkMigrationFile(fileName, sql) {
  return { violations: findDataStatements(sql) };
}
