// 권한 묶음 API 계약(루트 경로 GET, POST /api/admin/roles). 서버(api/_routes/admin/roles.ts)가 요청 스키마로 검증하고, 브라우저(권한 묶음 화면)가 응답 스키마로 검증한다.

import { z } from "zod";
import { permissionItemSchema, resourceSchema } from "../staff/contract.js";

const NAME_MESSAGE = "권한 묶음 이름을 입력해 주세요.";

/** POST 본문. is_super, is_system 은 받지 않는다(strict 라 400). 서비스 롤은 RLS 를 건너뛰므로 서버가 막는다. */
export const roleBody = z.strictObject({
  name: z.string({ error: NAME_MESSAGE }).trim().min(1, NAME_MESSAGE),
  description: z
    .string()
    .trim()
    .nullable()
    .transform((value) => value || null),
});

/** 브라우저가 보내는 모양. */
export type RoleBodyInput = z.input<typeof roleBody>;

export const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  is_super: z.boolean(),
  is_system: z.boolean(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type Role = z.output<typeof roleSchema>;

export const roleWithPermissionsSchema = roleSchema.extend({
  permissions: z.array(permissionItemSchema),
});

export type RoleWithPermissions = z.output<typeof roleWithPermissionsSchema>;

/** GET /api/admin/roles 응답. 묶음마다 권한 항목을 붙이고 메뉴 목록을 함께 준다. */
export const rolesListSchema = z.object({
  items: z.array(roleWithPermissionsSchema),
  resources: z.array(resourceSchema),
});

export type RolesList = z.output<typeof rolesListSchema>;
