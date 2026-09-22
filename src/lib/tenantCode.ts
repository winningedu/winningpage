// 소속(tenant) 코드 클라이언트 형식 검증 — 서버 정규화(fn_normalize_tenant_code,
// supabase/migrations/20260922002929_tenants_core.sql)와 생성 알파벳
// (fn_generate_tenant_code, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' — 0/O/1/I/L
// 제외 31자)을 그대로 따른다. 이 모듈은 표시 전용 방어선이다 — "존재하는
// 코드인지"는 서버(fn_resolve_tenant_code/fn_set_my_tenant)만 판정할 수 있으므로,
// 여기서는 형식(8자, 허용 알파벳)만 걸러 오타를 조기에 잡는다.
const TENANT_CODE_PATTERN = /^[A-HJ-KM-NP-Z2-9]{8}$/;

// 대소문자·공백·하이픈 변형을 서버 저장 형식과 맞춘다(fn_normalize_tenant_code
// 와 동일 규칙: upper + 공백·하이픈 제거).
export function normalizeTenantCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, "");
}

// 정규화 후 8자 허용 알파벳 형식이면 true. 빈 문자열은 "선택 입력 미기재"로
// 별도 취급해야 하므로 여기서는 false를 돌려준다 — 호출부가 trim 결과가
// 빈 값인 경우를 먼저 걸러내고 이 함수를 쓴다.
export function isValidTenantCodeFormat(value: string): boolean {
  return TENANT_CODE_PATTERN.test(normalizeTenantCode(value));
}
