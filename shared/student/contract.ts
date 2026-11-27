// 학생 검색 API 계약. 서버(api/_routes/admin/students.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/shared/studentSearch.ts)는 응답 스키마로 검증한다.

import { z } from "zod";

/** 검색 결과 수. */
export const STUDENT_SEARCH_LIMIT = 20;
export const STUDENT_SEARCH_MAX_LENGTH = 100;

/** 학생 검색을 부르는 화면의 메뉴 키. 서버가 이 키로 view 권한을 본다. */
export const STUDENT_SEARCH_SECTIONS = [
  "growthReports",
  "inquirySessions",
  "selfevalSessions",
  "serviceCreditAdjust",
] as const;
export type StudentSearchSection = (typeof STUDENT_SEARCH_SECTIONS)[number];

/** GET /api/admin/students/search 쿼리. */
export const studentSearchQuery = z.object({
  q: z.string().min(1).max(STUDENT_SEARCH_MAX_LENGTH),
  section: z.enum(STUDENT_SEARCH_SECTIONS),
});

/** 응답. role 은 돌려주지 않고 관리자 여부만 isAdmin 으로 낸다. */
export const studentSearchSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      isAdmin: z.boolean(),
    }),
  ),
});
export type StudentSearchList = z.output<typeof studentSearchSchema>;
export type StudentSearchItem = StudentSearchList["items"][number];
