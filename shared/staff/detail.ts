// 관리자 한 명의 API 계약(GET, PATCH /api/admin/staff/:profileId, PUT /api/admin/staff/:profileId/permissions). 서버(api/_routes/admin/staff-detail.ts)가 요청 스키마로 검증하고, 브라우저(관리자 계정 화면)가 응답 스키마로 검증한다.
// 목록 경로와 공용 조각(directoryRowSchema, permissionItemSchema)은 shared/staff/contract.ts 에 있다.

import { z } from "zod";
import {
  directoryRowSchema,
  levelSchema,
  permissionItemSchema,
} from "./contract.js";

/** 경로 구간 :profileId. */
export const staffProfileParams = z.object({ profileId: z.guid() });

/** 이 라우트들의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const STAFF_ERROR = {
  LAST_SUPER_ADMIN: "LAST_SUPER_ADMIN",
} as const;

export const STAFF_STATUSES = ["invited", "active", "suspended"] as const;

export type StaffStatus = (typeof STAFF_STATUSES)[number];

/** PATCH 본문. 옛 화면 저장 폼의 세 칸만 받고 모르는 키(is_super, profile_id 등)는 400 이다. */
export const staffPatchBody = z.strictObject({
  roleId: z.guid().nullable(),
  department: z
    .string()
    .trim()
    .nullable()
    .transform((value) => value || null),
  status: z.enum(STAFF_STATUSES),
});

/** 브라우저가 보내는 모양. */
export type StaffPatchInput = z.input<typeof staffPatchBody>;

/** GET 응답. 목록 뷰의 행, 개별 권한(덮어쓰기), 묶음과 합친 실효 권한. PATCH 는 member 행만 돌려준다(directoryRowSchema). */
export const staffDetailSchema = z.object({
  member: directoryRowSchema,
  overrides: z.array(permissionItemSchema),
  effective: z.array(permissionItemSchema),
});

export type StaffDetail = z.output<typeof staffDetailSchema>;

// 옛 화면은 최대 48행이었다. 200 은 메뉴가 늘어도 여유 있는 상한이다.
export const PERMISSION_ITEMS_MAX = 200;

/** PUT 본문(관리자 개별 권한과 권한 묶음이 같이 쓴다). 항목은 통째로 바뀐다. */
export const permissionItemsBody = z.strictObject({
  items: z
    .array(
      z.strictObject({
        resourceKey: z.string().min(1),
        level: levelSchema,
      }),
    )
    .max(PERMISSION_ITEMS_MAX)
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((item, index) => {
        if (seen.has(item.resourceKey)) {
          ctx.addIssue({
            code: "custom",
            path: [index, "resourceKey"],
            message: "같은 메뉴가 두 번 들어 있습니다.",
          });
        }
        seen.add(item.resourceKey);
      });
    }),
});

/** 브라우저가 보내는 모양. */
export type PermissionItemsInput = z.input<typeof permissionItemsBody>;

/** PUT 응답. 저장한 항목. */
export const savedItemsSchema = z.object({
  items: z.array(permissionItemSchema),
});

export type SavedItems = z.output<typeof savedItemsSchema>;
