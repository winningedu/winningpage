// 학급 표시 규칙(스펙 1.6). 학교는 "고2" 를 "2학년", 학원은 "고2" 그대로. 학년 없는 학급은 "다학년".
// 반 이름 "3" 은 "3반". 그룹이 있으면 앞에 붙인다.

import type { ConsoleClass } from "./api";

/** 목록 필터에서 다학년(학년 없는 학급)을 가리키는 값. API 의 grade=mixed 와 같다. */
export const MIXED_GRADE = "mixed";

export type GradeLabeler = (grade: string | null) => string;

export function gradeLabel(grade: string | null, academy: boolean): string {
  if (grade === null || grade === MIXED_GRADE) return "다학년";
  return academy ? grade : `${grade.slice(1)}학년`;
}

export function classLabel(c: ConsoleClass, label: GradeLabeler): string {
  return `${c.group ? `${c.group} ` : ""}${label(c.grade)} ${c.name}반`;
}

/** 학년(다학년은 맨 뒤), 반 이름(숫자는 숫자 순) 순서. */
export function sortClasses(classes: ConsoleClass[]): ConsoleClass[] {
  return [...classes].sort(
    (a, b) =>
      Number(a.grade === null) - Number(b.grade === null) ||
      (a.grade ?? "").localeCompare(b.grade ?? "", "ko") ||
      a.name.localeCompare(b.name, "ko", { numeric: true }),
  );
}

export function primaryClass(classes: ConsoleClass[]): ConsoleClass | null {
  return classes.find((c) => c.isPrimary) ?? null;
}
