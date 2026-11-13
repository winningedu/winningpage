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
 * 그룹 선택지. 학교 관리자와 본사 대행은 그룹 관리 순서대로 보이고, 학년을 고르면 그 학년에 학급이 있는 그룹과
 * 학급이 하나도 없는 그룹만 남는다. 읽는 중이거나 실패하면 학급에서 만든 목록을 쓴다.
 * 담임은 그룹 관리를 읽을 수 없으니 담당 학급의 그룹만 보인다. show 가 false 면(학교) 읽지 않는다.
 * selectedId(주소에서 복원된 값 포함)는 걸러져도 선택지에 남긴다.
 */
export function useGroupOptions(
  classes: ClassOption[],
  grade: string,
  selectedId = "",
  show = true,
) {
  const { me } = useConsoleMe();
  const homeroom = me.kind === "homeroom";
  const groups = useGroups(show && !homeroom);
  const fromClasses = groupsOf(classes, grade);
  if (homeroom || !groups.data)
    return keepSelected(fromClasses, selectedId, classes);

  const withClass = new Set(classes.map((c) => c.groupId));
  const inGrade = new Set(fromClasses.map((g) => g.id));
  const options = groups.data.filter(
    (g) => !grade || inGrade.has(g.id) || !withClass.has(g.id),
  );
  return keepSelected(options, selectedId, classes, groups.data);
}

function keepSelected(
  options: { id: string; name: string }[],
  selectedId: string,
  classes: ClassOption[],
  registered: { id: string; name: string }[] = [],
) {
  if (!selectedId || options.some((g) => g.id === selectedId)) return options;
  const name =
    registered.find((g) => g.id === selectedId)?.name ??
    classes.find((c) => c.groupId === selectedId)?.groupName;
  return name ? [...options, { id: selectedId, name }] : options;
}
