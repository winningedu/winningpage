// 관리자 본인 API 계약. 서버(api/_routes/admin/me.ts)가 응답을 만들고, 브라우저(src/lib/adminPermissions.ts, src/lib/routeMiddleware.ts)가 검증한다.

import { z } from "zod";
import { ADMIN_LEVELS } from "../admin-permission/menu.js";

/** GET /api/admin/me/permissions 응답. permissions 에 없는 메뉴 키는 접근 불가다(default deny). */
export const adminPermissionsSchema = z.object({
  permissions: z.record(z.string(), z.enum(ADMIN_LEVELS)),
  isSuper: z.boolean(),
});
export type AdminPermissions = z.output<typeof adminPermissionsSchema>;

/** POST /api/admin/me/activate 응답. 본인 admin_members 행이 없으면 status 가 null 이다. */
export const adminActivationSchema = z.object({
  status: z.string().nullable(),
});
export type AdminActivation = z.output<typeof adminActivationSchema>;
