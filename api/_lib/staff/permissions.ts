// 관리자 권한 항목(메뉴 키별 level) 저장 규칙. 관리자 개별 권한과 권한 묶음 두 라우트가 같이 쓴다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import type { PermissionItemsInput } from "../../../shared/staff/detail.js";
import { ProblemError } from "../hono/problem.js";
import { VALIDATION_FAILED_MESSAGE } from "../httpResponse.js";

type PermissionItem = PermissionItemsInput["items"][number];

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
 * 항목의 메뉴 키가 모두 admin_resources 에 있어야 한다. 없는 키가 있으면 400 VALIDATION_FAILED 를 던진다.
 * FK 오류(23503)에 기대지 않고 쓰기 전에 막아, 지우기만 되고 넣기가 실패하는 일을 줄인다.
 */
export async function checkResourceKeys(
  admin: SupabaseClient,
  items: PermissionItem[],
): Promise<void> {
  if (items.length === 0) return;
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
  if (errors.length === 0) return;
  throw new ProblemError(
    400,
    VALIDATION_FAILED_MESSAGE,
    PROBLEM_CODE.VALIDATION_FAILED,
    { errors },
  );
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
