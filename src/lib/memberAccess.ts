// 공개 사이트(요금표·결제)의 회원 유형 판정. 관리자(profiles.role='admin',
// 총괄 포함)는 member_type 이 비어 있거나 mentor 여도 막히지 않고 학생과 같은
// 경로를 본다. 이용권 판정은 바꾸지 않는다(이용권은 별도 어드민 도구로 부여).
export function resolvePublicMemberType(input: {
  memberType: string | null;
  role?: string | null;
}): string | null {
  if ((input.role ?? "").trim().toLowerCase() === "admin") return "student";
  return input.memberType;
}
