// 관리자 계정, 권한 묶음 화면의 HTTP 호출(/api/admin/staff, /api/admin/roles). 계약은 B10 계약서.

import { z } from "zod";
import { api } from "@/lib/http/client";

const text = z.string().nullish();

export const levelSchema = z.enum(["edit", "view", "none"]);
export type Level = z.infer<typeof levelSchema>;

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

const roleOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_super: z.boolean(),
});

export const resourceSchema = z.object({
  key: z.string(),
  group_title: z.string(),
  label: z.string(),
  sort_order: z.number().optional(),
});

const permissionItemSchema = z.object({
  resourceKey: z.string(),
  level: levelSchema,
});

const staffDetailSchema = z.object({
  member: directoryRowSchema,
  overrides: z.array(permissionItemSchema),
  effective: z.array(permissionItemSchema),
});

const staffListSchema = z.object({
  items: z.array(directoryRowSchema),
  roles: z.array(roleOptionSchema),
  resources: z.array(resourceSchema),
});

export type DirectoryRow = z.infer<typeof directoryRowSchema>;
export type RoleOption = z.infer<typeof roleOptionSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type PermissionItem = z.infer<typeof permissionItemSchema>;
export type StaffDetail = z.infer<typeof staffDetailSchema>;
export type StaffList = z.infer<typeof staffListSchema>;

export const staffKeys = {
  all: ["admin", "staff"] as const,
  list: ["admin", "staff", "list"] as const,
  detail: (id: string) => ["admin", "staff", "detail", id] as const,
};

const opts = (signal?: AbortSignal) => (signal ? { signal } : {});

export const fetchStaffList = (signal?: AbortSignal) =>
  api.get("admin/staff", opts(signal)).json(staffListSchema);

export const fetchStaffDetail = (profileId: string, signal?: AbortSignal) =>
  api
    .get(`admin/staff/${encodeURIComponent(profileId)}`, opts(signal))
    .json(staffDetailSchema);

const savedItemsSchema = z.object({ items: z.array(permissionItemSchema) });

export interface StaffInfoBody {
  roleId: string | null;
  department: string | null;
  status: string;
}

export const patchStaff = (profileId: string, body: StaffInfoBody) =>
  api
    .patch(`admin/staff/${encodeURIComponent(profileId)}`, { json: body })
    .json(directoryRowSchema);

export const putStaffPermissions = (
  profileId: string,
  items: PermissionItem[],
) =>
  api
    .put(`admin/staff/${encodeURIComponent(profileId)}/permissions`, {
      json: { items },
    })
    .json(savedItemsSchema);

const inviteResultSchema = z.object({
  profileId: z.string(),
  resent: z.boolean(),
  emailed: z.boolean(),
});

export interface InviteBody {
  email: string;
  name: string;
  roleId: string;
  department?: string;
  confirmExisting: boolean;
}

export type InviteResult = z.infer<typeof inviteResultSchema>;

export const postInvite = (body: InviteBody) =>
  api.post("admin/invite-member", { json: body }).json(inviteResultSchema);

// ---------------------------------------------------------------------------
// 권한 묶음(adminRoles)
// ---------------------------------------------------------------------------

const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: text,
  is_super: z.boolean(),
  is_system: z.boolean(),
  created_at: text,
  updated_at: text,
});

const roleWithPermissionsSchema = roleSchema.extend({
  permissions: z.array(permissionItemSchema),
});

const rolesListSchema = z.object({
  items: z.array(roleWithPermissionsSchema),
  resources: z.array(resourceSchema),
});

export type Role = z.infer<typeof roleSchema>;
export type RoleWithPermissions = z.infer<typeof roleWithPermissionsSchema>;
export type RolesList = z.infer<typeof rolesListSchema>;

export const roleKeys = {
  all: ["admin", "roles"] as const,
  list: ["admin", "roles", "list"] as const,
  detail: (id: string) => ["admin", "roles", "detail", id] as const,
};

const roleUrl = (id: string) => `admin/roles/${encodeURIComponent(id)}`;

export const fetchRoles = (signal?: AbortSignal) =>
  api.get("admin/roles", opts(signal)).json(rolesListSchema);

export const deleteRole = (id: string) => api.delete(roleUrl(id));

export const fetchRole = (id: string, signal?: AbortSignal) =>
  api.get(roleUrl(id), opts(signal)).json(roleWithPermissionsSchema);
