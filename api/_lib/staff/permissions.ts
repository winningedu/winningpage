// 관리자 권한 항목(메뉴 키별 level) 저장 규칙. 관리자 개별 권한과 권한 묶음 두 라우트가 같이 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { z } from "zod";
import { sendError } from "../httpResponse.js";

const itemSchema = z.strictObject({
  resourceKey: z.string().min(1),
  level: z.enum(["edit", "view", "none"]),
});

// 옛 화면은 최대 48행이었다. 200 은 메뉴가 늘어도 여유 있는 상한이다.
export const permissionItemsBody = z.strictObject({
  items: z
    .array(itemSchema)
    .max(200)
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

export type PermissionItem = z.output<typeof itemSchema>;

/** DB 행(resource_key, level)을 응답 항목으로 바꾼다. */
export function toItems(
  rows: { resource_key: string; level: string }[] | null,
) {
  return (rows ?? []).map((row) => ({
    resourceKey: row.resource_key,
    level: row.level,
  }));
}

/**
 * 항목의 메뉴 키가 모두 admin_resources 에 있어야 한다. 없는 키가 있으면 400 을 보내고 false.
 * FK 오류(23503)에 기대지 않고 쓰기 전에 막아, 지우기만 되고 넣기가 실패하는 일을 줄인다.
 */
export async function checkResourceKeys(
  res: VercelResponse,
  admin: SupabaseClient,
  items: PermissionItem[],
): Promise<boolean> {
  if (items.length === 0) return true;
  const { data, error } = await admin
    .from("admin_resources")
    .select("key")
    .in(
      "key",
      items.map((item) => item.resourceKey),
    );
  if (error) throw new Error("admin resources read failed");
  const known = new Set((data ?? []).map((row) => String(row.key)));
  const errors = items.flatMap((item, index) =>
    known.has(item.resourceKey)
      ? []
      : [
          {
            path: `items.${index}.resourceKey`,
            message: "알 수 없는 메뉴입니다.",
          },
        ],
  );
  if (errors.length === 0) return true;
  sendError(
    res,
    "problem",
    400,
    "요청 값이 올바르지 않아요.",
    "VALIDATION_FAILED",
    { errors },
  );
  return false;
}

/**
 * 한 주인(관리자 또는 권한 묶음)의 권한 항목을 지우고 다시 넣는다. 옛 화면과 같은 방식이라
 * 지우기와 넣기 사이에 실패하면 항목이 비어 있을 수 있다(RPC 로 묶는 것은 별건).
 */
export async function replacePermissions(
  admin: SupabaseClient,
  target: {
    table: "admin_member_permissions" | "admin_role_permissions";
    ownerColumn: "profile_id" | "role_id";
    ownerId: string;
  },
  items: PermissionItem[],
): Promise<void> {
  const { error: deleteError } = await admin
    .from(target.table)
    .delete()
    .eq(target.ownerColumn, target.ownerId);
  if (deleteError) throw new Error(`${target.table} delete failed`);
  if (items.length === 0) return;

  const { error: insertError } = await admin.from(target.table).insert(
    items.map((item) => ({
      [target.ownerColumn]: target.ownerId,
      resource_key: item.resourceKey,
      level: item.level,
    })),
  );
  if (insertError) throw new Error(`${target.table} insert failed`);
}
