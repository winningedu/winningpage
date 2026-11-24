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

const staffListSchema = z.object({
  items: z.array(directoryRowSchema),
  roles: z.array(roleOptionSchema),
  resources: z.array(resourceSchema),
});

export type DirectoryRow = z.infer<typeof directoryRowSchema>;
export type RoleOption = z.infer<typeof roleOptionSchema>;
export type Resource = z.infer<typeof resourceSchema>;
export type StaffList = z.infer<typeof staffListSchema>;

export const staffKeys = {
  all: ["admin", "staff"] as const,
  list: ["admin", "staff", "list"] as const,
  detail: (id: string) => ["admin", "staff", "detail", id] as const,
};

const opts = (signal?: AbortSignal) => (signal ? { signal } : {});

export const fetchStaffList = (signal?: AbortSignal) =>
  api.get("admin/staff", opts(signal)).json(staffListSchema);
