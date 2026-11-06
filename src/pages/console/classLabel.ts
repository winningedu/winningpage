// 학급 표시 규칙(스펙 1.6). "고2" 는 "2학년", 반 이름 "3" 은 "3반". 그룹이 있으면 앞에 붙인다.

import type { ConsoleClass } from "./api";

export function gradeLabel(grade: string): string {
  return `${grade.slice(1)}학년`;
}

export function classLabel(c: ConsoleClass): string {
  return `${c.group ? `${c.group} ` : ""}${gradeLabel(c.grade)} ${c.name}반`;
}

/** 학년, 반 이름(숫자는 숫자 순) 순서. */
export function sortClasses(classes: ConsoleClass[]): ConsoleClass[] {
  return [...classes].sort(
    (a, b) =>
      a.grade.localeCompare(b.grade, "ko") ||
      a.name.localeCompare(b.name, "ko", { numeric: true }),
  );
}

export function primaryClass(classes: ConsoleClass[]): ConsoleClass | null {
  return classes.find((c) => c.isPrimary) ?? null;
}
