// 관리자 계정 API 계약(루트 경로 GET /api/admin/staff). 서버(api/_routes/admin/staff.ts)가 이 모양으로 돌려주고, 브라우저(관리자 계정 화면)가 응답 스키마로 검증한다.
// 권한 묶음 계약(shared/roles/contract.ts)도 메뉴와 권한 항목 스키마를 여기서 가져다 쓴다.

import { z } from "zod";

const text = z.string().nullish();

export const levelSchema = z.enum(["edit", "view", "none"]);

export type Level = z.output<typeof levelSchema>;

export const directoryRowSchema = z.looseObject({
  profile_id: z.string(),
  role_id: text,
  department: text,
  status: z.string(),
  invited_at: text,
  activated_at: text,
  role_name: text,
  role_is_super: z.boolean().nullish(),
  member_name: text,
  member_email: text,
  member_phone: text,
  joined_at: text,
});

export type DirectoryRow = z.output<typeof directoryRowSchema>;

export const roleOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_super: z.boolean(),
});

export type RoleOption = z.output<typeof roleOptionSchema>;

/** 관리자 메뉴 한 줄(admin_resources). */
export const resourceSchema = z.object({
  key: z.string(),
  group_title: z.string(),
  label: z.string(),
  sort_order: z.number().optional(),
});

export type Resource = z.output<typeof resourceSchema>;

/** 권한 항목 한 줄. 메뉴 키와 단계. */
export const permissionItemSchema = z.object({
  resourceKey: z.string(),
  level: levelSchema,
});

export type PermissionItem = z.output<typeof permissionItemSchema>;

/** GET /api/admin/staff 응답. 목록, 권한 묶음 선택지, 메뉴 목록. */
export const staffListSchema = z.object({
  items: z.array(directoryRowSchema),
  roles: z.array(roleOptionSchema),
  resources: z.array(resourceSchema),
});

export type StaffList = z.output<typeof staffListSchema>;
