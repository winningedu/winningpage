// 회원 소속 저장(fn_admin_set_profile_tenant) 오류를 어드민에게 보여줄 문구로 바꾼다.
// 옮길 기관에 같은 휴대폰 번호의 회원이 이미 있으면 profiles_tenant_phone_unique_idx가
// 23505(unique 위반)로 막는다.
export function tenantSaveErrorMessage(error: {
  code?: string;
  message: string;
}): string {
  if (error.code === "23505") {
    return "이 기관에 같은 휴대폰 번호의 회원이 이미 있어요. 확인 후 다시 옮겨 주세요.";
  }

  return `소속 저장 실패: ${error.message}`;
}
