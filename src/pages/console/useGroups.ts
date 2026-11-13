// 그룹(레벨) 목록. 그룹 관리(GET /api/console/groups)와 같은 읽기를 여러 화면이 함께 쓴다.

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "./api";
import { type ClassOption, groupsOf } from "./useClasses";
import { useConsoleMe } from "./useConsoleMe";

export function useGroups(enabled = true) {
  return useQuery({
    queryKey: ["console", "groups"],
    queryFn: async () => {
      const res = await consoleRequest("/api/console/groups");
      if (res.status !== 200) throw new Error(`groups ${res.status}`);
      return (res.body as { groups: { id: string; name: string }[] }).groups;
    },
    enabled,
    retry: false,
  });
}

/**
 * 그룹 선택지. 학교 관리자와 본사 대행은 학급이 없는 그룹까지 그룹 관리 순서대로,
 * 담임은 그룹 관리를 읽을 수 없으니 담당 학급의 그룹만 보인다. show 가 false 면(학교) 읽지 않는다.
 */
export function useGroupOptions(
  classes: ClassOption[],
  grade: string,
  show = true,
) {
  const { me } = useConsoleMe();
  const homeroom = me.kind === "homeroom";
  const groups = useGroups(show && !homeroom);
  return homeroom ? groupsOf(classes, grade) : (groups.data ?? []);
}
