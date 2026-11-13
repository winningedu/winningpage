// W13 화면이 쓰는 자리 표기. "{학년} {반} {번호}번", 그룹이 있으면 "1학년-A레벨 1반"(교 #216).

import type { GradeLabeler } from "./classLabel";

export interface Slot {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

export function slotLabel(s: Slot, gradeLabel: GradeLabeler): string {
  const grade = s.grade
    ? s.groupName
      ? `${gradeLabel(s.grade)}-${s.groupName}`
      : gradeLabel(s.grade)
    : s.groupName;
  return [
    grade,
    s.className && `${s.className}반`,
    s.number !== null && `${s.number}번`,
  ]
    .filter(Boolean)
    .join(" ");
}
