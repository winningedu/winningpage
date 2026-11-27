// 관리자 계정, 권한 묶음 화면의 HTTP 호출(/api/admin/staff, /api/admin/roles). 계약은 B10 계약서.

import { z } from "zod";
import { api } from "@/lib/http/client";
import {
  type Role,
  type RoleBodyInput,
  type RolesList,
  type RoleWithPermissions,
  roleSchema,
  rolesListSchema,
  roleWithPermissionsSchema,
} from "../../../../shared/roles/contract.js";
import {
  type DirectoryRow,
  directoryRowSchema,
  levelSchema,
  type PermissionItem,
  permissionItemSchema,
  type RoleOption,
  resourceSchema,
  type StaffList,
  staffListSchema,
} from "../../../../shared/staff/contract.js";

const text = z.string().nullish();

export type { Level, Resource } from "../../../../shared/staff/contract.js";
export { levelSchema, resourceSchema };

const staffDetailSchema = z.object({
  member: directoryRowSchema,
  overrides: z.array(permissionItemSchema),
  effective: z.array(permissionItemSchema),
});

export type { DirectoryRow, PermissionItem, RoleOption, StaffList };
export type StaffDetail = z.infer<typeof staffDetailSchema>;

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

export type { Role, RolesList, RoleWithPermissions };
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

export const postRole = (body: RoleBodyInput) =>
  api.post("admin/roles", { json: body }).json(roleSchema);

export const patchRole = (id: string, body: RoleBodyInput) =>
  api.patch(roleUrl(id), { json: body }).json(roleSchema);

export const putRolePermissions = (id: string, items: PermissionItem[]) =>
  api
    .put(`${roleUrl(id)}/permissions`, { json: { items } })
    .json(savedItemsSchema);
