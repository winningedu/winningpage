// 학급 목록(필터와 W13b 선택지). year 가 없으면 서버가 기관의 현재 학년도를 쓴다.

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "./api";
import { MIXED_GRADE } from "./classLabel";

export interface ClassOption {
  id: string;
  grade: string | null;
  groupId: string | null;
  groupName: string | null;
  name: string;
  hasHomeroom: boolean;
}

// 서버의 학년 CHECK 와 같은 순서다.
const GRADE_ORDER = ["중1", "중2", "중3", "고1", "고2", "고3"];

export function useClasses(year?: number) {
  return useQuery({
    queryKey: ["console", "classes", year ?? "current"],
    queryFn: async () => {
      const res = await consoleRequest(
        `/api/console/classes${year ? `?year=${year}` : ""}`,
      );
      if (res.status !== 200) throw new Error(`classes ${res.status}`);
      return (res.body as { classes: ClassOption[] }).classes;
    },
    retry: false,
  });
}

/** 학년 선택지. 학급이 있는 학년만, 학년 순서대로. 학년 없는 다학년 학급이 있으면 맨 뒤에 mixed. */
export function gradesOf(classes: ClassOption[]): string[] {
  const grades = new Set(classes.map((c) => c.grade));
  const options = GRADE_ORDER.filter((g) => grades.has(g));
  return grades.has(null) ? [...options, MIXED_GRADE] : options;
}

/** 학년 필터(빈 값은 전체, mixed 는 학년 없는 학급)에 이 학급이 드는지. */
function inGrade(c: ClassOption, grade: string): boolean {
  if (!grade) return true;
  return grade === MIXED_GRADE ? c.grade === null : c.grade === grade;
}

function groupsWhere(
  classes: ClassOption[],
  keep: (c: ClassOption) => boolean,
): { id: string; name: string }[] {
  const groups = new Map<string, string>();
  for (const c of classes) {
    if (keep(c) && c.groupId && c.groupName) {
      groups.set(c.groupId, c.groupName);
    }
  }
  return [...groups].map(([id, name]) => ({ id, name }));
}

/** 그룹 선택지. 학년을 골랐으면 그 학년 학급의 그룹만. */
export function groupsOf(
  classes: ClassOption[],
  grade: string,
): { id: string; name: string }[] {
  return groupsWhere(classes, (c) => inGrade(c, grade));
}

/** 반 선택지. 학년과 그룹을 골랐으면 거기에 맞는 학급만. */
export function classesOf(
  classes: ClassOption[],
  grade: string,
  groupId: string,
): ClassOption[] {
  return classes.filter(
    (c) => inGrade(c, grade) && (!groupId || c.groupId === groupId),
  );
}

// 학생 한 명의 학년과 학급을 고르는 화면(학적 편집, 직접 변경, 반 배정)용 선택지. 위의 필터용 함수와 달리
// 고른 학년은 학생의 실제 학년이라 mixed 를 담지 않고, 다학년 학급은 어느 학년의 학생도 받는다.

/** 학생 학년 선택지. 다학년 학급이 있으면 여섯 학년 모두, 없으면 학급이 있는 학년만. */
export function studentGradesOf(classes: ClassOption[]): string[] {
  return classes.some((c) => c.grade === null)
    ? [...GRADE_ORDER]
    : gradesOf(classes);
}

const fitsStudent = (c: ClassOption, grade: string) =>
  !grade || c.grade === null || c.grade === grade;

/** 학생 그룹 선택지. 학년을 골랐으면 그 학년 학급과 다학년 학급의 그룹. */
export function studentGroupsOf(
  classes: ClassOption[],
  grade: string,
): { id: string; name: string }[] {
  return groupsWhere(classes, (c) => fitsStudent(c, grade));
}

/** 학생 반 선택지. 학년을 골랐으면 그 학년 학급과 다학년 학급, 그룹을 골랐으면 그 그룹만. */
export function studentClassesOf(
  classes: ClassOption[],
  grade: string,
  groupId: string,
): ClassOption[] {
  return classes.filter(
    (c) => fitsStudent(c, grade) && (!groupId || c.groupId === groupId),
  );
}
