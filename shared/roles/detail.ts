// 권한 묶음 한 개의 API 계약(GET, PATCH, DELETE /api/admin/roles/:id, PUT /api/admin/roles/:id/permissions). 서버(api/_routes/admin/roles-detail.ts)가 요청 스키마로 검증하고, 브라우저(권한 묶음 화면)가 응답 스키마로 검증한다.
// 목록 경로와 본문(roleBody)은 shared/roles/contract.ts, 권한 항목 본문(permissionItemsBody)은 shared/staff/detail.ts 에 있다.

import { z } from "zod";

/** 경로 구간 :id. */
export const roleIdParams = z.object({ id: z.guid() });

/** 이 라우트들의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const ROLE_ERROR = {
  SYSTEM_ROLE: "SYSTEM_ROLE",
  ROLE_IN_USE: "ROLE_IN_USE",
} as const;
