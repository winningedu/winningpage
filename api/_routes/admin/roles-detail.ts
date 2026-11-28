// /api/admin/roles 아래 권한 묶음 한 개 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/roles", rolesDetail) 로 붙인다.
// 루트 경로 GET, POST /api/admin/roles 는 roles.ts 가 받는다. 요청 검증과 응답 모양은 shared/roles/detail.ts 와 shared/roles/contract.ts 를 따른다.
//
// GET, PATCH, DELETE /api/admin/roles/:id
//   권한 묶음 한 개 읽기(권한 항목 포함), 이름과 설명 고치기, 지우기.
// PUT /api/admin/roles/:id/permissions
//   권한 묶음의 권한 항목을 통째로 바꾼다. 옛 화면처럼 지우고 다시 넣는다(두 단계라 원자적이지 않다).
// 둘 다 최고 관리자 전용이다.

import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import {
  type Role,
  type RoleWithPermissions,
  roleBody,
} from "../../../shared/roles/contract.js";
import { ROLE_ERROR, roleIdParams } from "../../../shared/roles/detail.js";
import {
  permissionItemsBody,
  type SavedItems,
} from "../../../shared/staff/detail.js";
import { allInOrder } from "../../../src/lib/concurrency/allInOrder.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  checkResourceKeys,
  replacePermissions,
  toItems,
} from "../../_lib/staff/permissions.js";
import { ROLE_COLUMNS } from "../../_lib/staff/roles.js";

const NOT_FOUND_MESSAGE = "권한 묶음을 찾을 수 없습니다.";

const roleNotFound = () =>
  new ProblemError(404, NOT_FOUND_MESSAGE, PROBLEM_CODE.NOT_FOUND);

const guard = admin({
  permission: { key: "adminRoles" },
  unhandledMessage: "권한 묶음을 처리하지 못했습니다.",
  logLabel: "[admin/roles/id]",
});
const permissionsGuard = admin({
  permission: { key: "adminRoles" },
  unhandledMessage: "권한 항목을 저장하지 못했습니다.",
  logLabel: "[admin/roles/id/permissions]",
});

export const rolesDetail = adminFactory
  .createApp()
  .get("/:id", guard, async (c) => {
    // 형식이 틀린 id 도 없는 묶음과 같이 404 로 알린다(uuid 캐스트 오류로 500 이 되지 않게).
    const idOnly = roleIdParams.safeParse(c.req.param());
    if (!idOnly.success) throw roleNotFound();
    const { id } = idOnly.data;
    const supabase = c.var.supabaseAdmin;

    const [{ data: role, error }, { data: permissions, error: permError }] =
      await allInOrder(
        supabase
          .from("admin_roles")
          .select(ROLE_COLUMNS)
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("admin_role_permissions")
          .select("resource_key, level")
          .eq("role_id", id),
      );
    if (error) throw new Error("role read failed");
    if (!role) throw roleNotFound();
    if (permError) throw new Error("role permissions read failed");
    return c.json({
      ...role,
      // DB 의 level 열은 edit, view, none 만 받는다(권한 단계 CHECK).
      permissions: toItems(permissions) as RoleWithPermissions["permissions"],
    } satisfies RoleWithPermissions);
  })
  .patch(
    "/:id",
    guard,
    validate("param", roleIdParams),
    validate("json", roleBody),
    async (c) => {
      const { id } = c.req.valid("param");
      const { name, description } = c.req.valid("json");
      const { data, error } = await c.var.supabaseAdmin
        .from("admin_roles")
        .update({ name, description })
        .eq("id", id)
        .select(ROLE_COLUMNS)
        .maybeSingle();
      if (error) throw new Error("role update failed");
      if (!data) throw roleNotFound();
      return c.json(data satisfies Role);
    },
  )
  .delete("/:id", guard, validate("param", roleIdParams), async (c) => {
    const { id } = c.req.valid("param");
    const supabase = c.var.supabaseAdmin;

    // 옛 화면은 브라우저에서 기본 묶음을 막았다. 서비스 롤은 그 막이 없어 서버가 막는다.
    const { data: role, error: readError } = await supabase
      .from("admin_roles")
      .select("id, is_system")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw new Error("role read failed");
    if (!role) throw roleNotFound();
    if (role.is_system) {
      throw new ProblemError(
        409,
        "기본 권한 묶음은 삭제할 수 없습니다.",
        ROLE_ERROR.SYSTEM_ROLE,
      );
    }

    const { data: deleted, error } = await supabase
      .from("admin_roles")
      .delete()
      .eq("id", id)
      .eq("is_system", false)
      .select("id");
    // admin_members.role_id 가 ON DELETE RESTRICT 라 쓰는 관리자가 있으면 FK 오류가 난다.
    if (error?.code === "23503") {
      throw new ProblemError(
        409,
        "이 권한 묶음을 쓰는 관리자가 있어 삭제할 수 없습니다.",
        ROLE_ERROR.ROLE_IN_USE,
      );
    }
    if (error) throw new Error("role delete failed");
    if (!deleted || deleted.length === 0) throw roleNotFound();
    return c.body(null, 204);
  })
  .all("/:id", methodNotAllowed("GET", "PATCH", "DELETE"))
  .put(
    "/:id/permissions",
    permissionsGuard,
    validate("param", roleIdParams),
    validate("json", permissionItemsBody),
    async (c) => {
      const supabase = c.var.supabaseAdmin;
      const { id } = c.req.valid("param");
      const { items } = c.req.valid("json");

      // 없는 묶음에 항목 행을 만들지 않도록 쓰기 전에 확인한다.
      // 메뉴 키 확인은 묶음 확인과 함께 시작하되, 응답은 묶음 확인(404)이 먼저다.
      const keysChecked = checkResourceKeys(supabase, items).then(
        () => undefined,
        (keysError: unknown) => keysError,
      );
      const { data: role, error } = await supabase
        .from("admin_roles")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("role read failed");
      if (!role) throw roleNotFound();
      const keysError = await keysChecked;
      if (keysError) throw keysError;

      await replacePermissions(
        supabase,
        {
          table: "admin_role_permissions",
          ownerColumn: "role_id",
          ownerId: id,
        },
        items,
      );
      return c.json({ items } satisfies SavedItems);
    },
  )
  .all("/:id/permissions", methodNotAllowed("PUT"));
