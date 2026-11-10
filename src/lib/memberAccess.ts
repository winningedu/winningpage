// 회원 유형 판정의 단일 소스. 헤더, MY 메뉴, 마이페이지, 결제 안내가 같은 규칙을 쓴다.
export type MemberKind =
  | "admin"
  | "parent"
  | "teacher"
  | "mentor"
  | "student"
  | "unset"
  | "unknown";

const MEMBER_TYPE_KINDS: Record<string, MemberKind> = {
  parent: "parent",
  parents: "parent",
  학부모: "parent",
  학부모회원: "parent",
  teacher: "teacher",
  교사: "teacher",
  mentor: "mentor",
  멘토: "mentor",
  멘토회원: "mentor",
  student: "student",
  학생: "student",
  학생회원: "student",
};

// role=admin이 member_type보다 우선한다(관리자 계정도 member_type을 가질 수 있다).
// 비어 있으면 unset, 모르는 값은 unknown이다. 학생으로 조용히 바꾸지 않는다.
export function classifyMember(input: {
  memberType?: string | null;
  role?: string | null;
}): MemberKind {
  if ((input.role ?? "").trim().toLowerCase() === "admin") return "admin";
  const memberType = (input.memberType ?? "").trim().toLowerCase();
  if (!memberType) return "unset";
  return MEMBER_TYPE_KINDS[memberType] ?? "unknown";
}

// 공개 사이트(요금표, 결제)의 회원 유형 판정. 관리자(profiles.role='admin',
// 총괄 포함)는 member_type 이 비어 있거나 mentor 여도 막히지 않고 학생과 같은
// 경로를 본다. 이용권 판정은 바꾸지 않는다(이용권은 별도 어드민 도구로 부여).
export function resolvePublicMemberType(input: {
  memberType: string | null;
  role?: string | null;
}): string | null {
  if (classifyMember(input) === "admin") return "student";
  return input.memberType;
}
