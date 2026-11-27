// /api/admin/staff 아래 관리자 한 명 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/staff", staffDetail) 로 붙인다.
// 루트 경로 GET /api/admin/staff 는 staff.ts 가 받는다. 요청 검증과 응답 모양은 shared/staff/detail.ts 를 따른다.
//
// GET, PATCH /api/admin/staff/:profileId
//   GET 은 관리자 한 명의 상세: 목록 뷰의 행, 개별 권한(덮어쓰기), 묶음과 합친 실효 권한.
//   PATCH 는 옛 화면의 저장 폼과 같은 세 칸(권한 묶음, 부서, 상태)만 고친다.
// PUT /api/admin/staff/:profileId/permissions
//   관리자 한 명의 개별 권한(덮어쓰기)을 통째로 바꾼다. 옛 화면처럼 지우고 다시 넣는다(두 단계라 원자적이지 않다). granted_by 는 채우지 않는다.
// 둘 다 최고 관리자 전용이다.

import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import type {
  DirectoryRow,
  PermissionItem,
} from "../../../shared/staff/contract.js";
import {
  permissionItemsBody,
  type SavedItems,
  STAFF_ERROR,
  type StaffDetail,
  staffPatchBody,
  staffProfileParams,
} from "../../../shared/staff/detail.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import { VALIDATION_FAILED_MESSAGE } from "../../_lib/httpResponse.js";
import {
  checkResourceKeys,
  replacePermissions,
  toItems,
} from "../../_lib/staff/permissions.js";

const NOT_FOUND_MESSAGE = "관리자를 찾을 수 없습니다.";
const LAST_SUPER_MESSAGE =
  "최고 관리자가 1명뿐이라 강등, 정지, 삭제할 수 없습니다. 다른 사람을 먼저 최고 관리자로 올려 주세요.";

const staffNotFound = () =>
  new ProblemError(404, NOT_FOUND_MESSAGE, PROBLEM_CODE.NOT_FOUND);

const guard = admin({
  permission: { key: "adminMembers" },
  unhandledMessage: "관리자 정보를 처리하지 못했습니다.",
  logLabel: "[admin/staff/profileId]",
});
const permissionsGuard = admin({
  permission: { key: "adminMembers" },
  unhandledMessage: "개별 권한을 저장하지 못했습니다.",
  logLabel: "[admin/staff/profileId/permissions]",
});

export const staffDetail = adminFactory
  .createApp()
  .get(
    "/:profileId",
    guard,
    validate("param", staffProfileParams),
    async (c) => {
      const supabase = c.var.supabaseAdmin;
      const { profileId } = c.req.valid("param");

      const { data: member, error } = await supabase
        .from("admin_member_directory")
        .select("*")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) throw new Error("staff read failed");
      if (!member) throw staffNotFound();

      const [overrides, effective] = await Promise.all([
        supabase
          .from("admin_member_permissions")
          .select("resource_key, level")
          .eq("profile_id", profileId),
        supabase.rpc("fn_admin_effective_permissions", {
          p_profile_id: profileId,
        }),
      ]);
      if (overrides.error || effective.error) {
        throw new Error("staff permissions read failed");
      }

      return c.json({
        member,
        overrides: toItems(overrides.data) as PermissionItem[],
        effective: toItems(effective.data) as PermissionItem[],
      } satisfies StaffDetail);
    },
  )
  .patch(
    "/:profileId",
    guard,
    validate("param", staffProfileParams),
    validate("json", staffPatchBody),
    async (c) => {
      const supabase = c.var.supabaseAdmin;
      const { profileId } = c.req.valid("param");
      const { roleId, department, status } = c.req.valid("json");

      const { data: saved, error: updateError } = await supabase
        .from("admin_members")
        .update({ role_id: roleId, department, status })
        .eq("profile_id", profileId)
        .select("profile_id");
      if (updateError?.code === "WC059") {
        // 마지막 최고 관리자 보호 트리거가 올린 오류다.
        throw new ProblemError(
          409,
          LAST_SUPER_MESSAGE,
          STAFF_ERROR.LAST_SUPER_ADMIN,
        );
      }
      if (updateError?.code === "23503") {
        throw new ProblemError(
          400,
          VALIDATION_FAILED_MESSAGE,
          PROBLEM_CODE.VALIDATION_FAILED,
          {
            errors: [
              { path: "roleId", message: "권한 묶음을 찾을 수 없습니다." },
            ],
          },
        );
      }
      if (updateError) throw new Error("staff update failed");
      if (!saved || saved.length === 0) throw staffNotFound();

      // 저장한 뒤의 뷰 행을 돌려줘 화면이 목록을 다시 받지 않아도 된다.
      const { data: member, error } = await supabase
        .from("admin_member_directory")
        .select("*")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) throw new Error("staff read failed");
      if (!member) throw staffNotFound();
      return c.json(member satisfies DirectoryRow);
    },
  )
  .all("/:profileId", methodNotAllowed("GET", "PATCH"))
  .put(
    "/:profileId/permissions",
    permissionsGuard,
    validate("param", staffProfileParams),
    validate("json", permissionItemsBody),
    async (c) => {
      const supabase = c.var.supabaseAdmin;
      const { profileId } = c.req.valid("param");
      const { items } = c.req.valid("json");

      // 없는 관리자에게 권한 행을 만들지 않도록 쓰기 전에 확인한다.
      const { data: member, error } = await supabase
        .from("admin_members")
        .select("profile_id")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) throw new Error("staff read failed");
      if (!member) throw staffNotFound();
      await checkResourceKeys(supabase, items);

      await replacePermissions(
        supabase,
        {
          table: "admin_member_permissions",
          ownerColumn: "profile_id",
          ownerId: profileId,
        },
        items,
      );
      return c.json({ items } satisfies SavedItems);
    },
  )
  .all("/:profileId/permissions", methodNotAllowed("PUT"));
