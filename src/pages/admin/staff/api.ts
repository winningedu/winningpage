// 관리자 계정, 권한 묶음 화면의 HTTP 호출(/api/admin/staff, /api/admin/roles). 계약은 B10 계약서.

import { api } from "@/lib/http/client";
import {
  type InviteInput,
  type InviteResult,
  inviteResultSchema,
} from "../../../../shared/invite-member/contract.js";
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
  type RoleOption,
  resourceSchema,
  type StaffList,
  type StaffStatus,
  staffListSchema,
  staffStatusSchema,
} from "../../../../shared/staff/contract.js";
import {
  type StaffDetail,
  type StaffPatchInput,
  savedItemsSchema,
  staffDetailSchema,
} from "../../../../shared/staff/detail.js";

export type { Level, Resource } from "../../../../shared/staff/contract.js";
export type {
  DirectoryRow,
  InviteResult,
  PermissionItem,
  RoleOption,
  StaffDetail,
  StaffList,
  StaffStatus,
};
export { levelSchema, resourceSchema, staffStatusSchema };

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

export const patchStaff = (profileId: string, body: StaffPatchInput) =>
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

export const postInvite = (body: InviteInput) =>
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
