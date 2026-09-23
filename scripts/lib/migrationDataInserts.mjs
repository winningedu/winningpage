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
