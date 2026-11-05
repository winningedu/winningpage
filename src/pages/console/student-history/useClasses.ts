// 학급 목록(필터와 W13b 선택지). year 가 없으면 서버가 기관의 현재 학년도를 쓴다.

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "../api";

export interface ClassOption {
  id: string;
  grade: string;
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

/** 학년 선택지. 학급이 있는 학년만, 학년 순서대로. */
export function gradesOf(classes: ClassOption[]): string[] {
  const grades = new Set(classes.map((c) => c.grade));
  return GRADE_ORDER.filter((g) => grades.has(g));
}

/** 그룹 선택지. 학년을 골랐으면 그 학년 학급의 그룹만. */
export function groupsOf(
  classes: ClassOption[],
  grade: string,
): { id: string; name: string }[] {
  const groups = new Map<string, string>();
  for (const c of classes) {
    if ((!grade || c.grade === grade) && c.groupId && c.groupName) {
      groups.set(c.groupId, c.groupName);
    }
  }
  return [...groups].map(([id, name]) => ({ id, name }));
}

/** 반 선택지. 학년과 그룹을 골랐으면 거기에 맞는 학급만. */
export function classesOf(
  classes: ClassOption[],
  grade: string,
  groupId: string,
): ClassOption[] {
  return classes.filter(
    (c) => (!grade || c.grade === grade) && (!groupId || c.groupId === groupId),
  );
}
