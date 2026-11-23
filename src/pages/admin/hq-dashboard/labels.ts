import type { LoginSource } from "./api";

export const SOURCE_LABEL: Record<LoginSource, string> = {
  measured: "실측",
  estimated: "추정",
  none: "기록 없음",
};

// 회원 유형 표시 순서. none 은 유형이 비어 있는 계정(주로 본사 관리자)이다.
const MEMBER_TYPES: [string, string][] = [
  ["student", "학생"],
  ["parent", "학부모"],
  ["mentor", "멘토"],
  ["teacher", "선생님"],
  ["none", "미지정"],
];

export function memberTypeLabel(type: string | null): string {
  return (
    MEMBER_TYPES.find(([key]) => key === (type ?? "none"))?.[1] ??
    type ??
    "미지정"
  );
}

export function formatByMemberType(counts: Record<string, number>): string {
  return MEMBER_TYPES.filter(([key]) => (counts[key] ?? 0) > 0)
    .map(([key, label]) => `${label} ${counts[key]}`)
    .join(", ");
}
