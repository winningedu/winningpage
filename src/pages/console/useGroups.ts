// 그룹(레벨) 목록. 그룹 관리(GET /api/console/groups)와 같은 읽기를 여러 화면이 함께 쓴다.

import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "./api";

export function useGroups() {
  return useQuery({
    queryKey: ["console", "groups"],
    queryFn: async () => {
      const res = await consoleRequest("/api/console/groups");
      if (res.status !== 200) throw new Error(`groups ${res.status}`);
      return (res.body as { groups: { id: string; name: string }[] }).groups;
    },
    retry: false,
  });
}
