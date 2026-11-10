// 계정 종류 판정의 단일 소스. 위닝 헤더, 스쿨멘토 헤더, MY 메뉴가 같은 규칙을 쓴다.
// role=admin이 member_type보다 우선한다(관리자 계정도 member_type을 가질 수 있다).
// member_type 별칭은 Header.tsx getMemberLabel이 라벨로 바꾸는 값과 같다.

export type UserType = "admin" | "parent" | "teacher" | "student";

const PARENT_MEMBER_TYPES = ["parent", "parents", "학부모", "학부모회원"];
const TEACHER_MEMBER_TYPES = ["mentor", "teacher", "멘토", "교사", "멘토회원"];

export function resolveUserType(input: {
  role?: string | null;
  memberType?: string | null;
}): UserType {
  const role = (input.role ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  const memberType = (input.memberType ?? "").trim().toLowerCase();
  if (PARENT_MEMBER_TYPES.includes(memberType)) return "parent";
  if (TEACHER_MEMBER_TYPES.includes(memberType)) return "teacher";
  return "student";
}
