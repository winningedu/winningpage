// 이용권 부여와 이용횟수 조정 화면이 같이 쓰는 학생 검색(GET /api/admin/students/search).
// section 은 서버가 권한을 확인하는 메뉴 키다. 호출 화면의 메뉴 키를 그대로 넘긴다.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";

export const STUDENT_SEARCH_SECTIONS = [
  "growthReports",
  "inquirySessions",
  "selfevalSessions",
  "serviceCreditAdjust",
] as const;
export type StudentSearchSection = (typeof STUDENT_SEARCH_SECTIONS)[number];

const studentSearchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      isAdmin: z.boolean(),
    }),
  ),
});
export type StudentSearchItem = z.infer<
  typeof studentSearchSchema
>["items"][number];

export const studentSearchKeys = {
  all: ["admin", "student-search"] as const,
  search: (section: StudentSearchSection, term: string) =>
    [...studentSearchKeys.all, section, term.trim()] as const,
};

/** useQuery(studentSearchQueryOptions(section, term)). 공백뿐인 검색어는 요청하지 않는다. */
export function studentSearchQueryOptions(
  section: StudentSearchSection,
  term: string,
) {
  const q = term.trim();
  return queryOptions({
    queryKey: studentSearchKeys.search(section, q),
    enabled: q !== "",
    queryFn: ({ signal }) =>
      api
        .get("admin/students/search", { searchParams: { q, section }, signal })
        .json(studentSearchSchema),
  });
}
