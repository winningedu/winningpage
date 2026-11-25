// GET, PATCH, DELETE /api/admin/roles/:id
//
// 권한 묶음 한 개 읽기(권한 항목 포함), 이름과 설명 고치기, 지우기. 최고 관리자 전용이다.
// id 는 경로에서 오고(디스패처가 req.query.id 에 넣는다) 본문에는 없다.

import { z } from "zod";
import { defineHandler, parseOrReject } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import { toItems } from "../../../_lib/staff/permissions.js";
import { ROLE_COLUMNS, roleBody } from "../../../_lib/staff/roles.js";

export const config = { runtime: "nodejs" };

const idSchema = z.object({ id: z.guid() });

const NOT_FOUND_MESSAGE = "권한 묶음을 찾을 수 없습니다.";

export default defineHandler({
  methods: ["GET", "PATCH", "DELETE"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "adminRoles" },
  unhandledMessage: "권한 묶음을 처리하지 못했습니다.",
  logLabel: "[admin/roles/id]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const notFound = () =>
      sendError(res, "problem", 404, NOT_FOUND_MESSAGE, "NOT_FOUND");

    if (req.method === "GET") {
      // 형식이 틀린 id 도 없는 묶음과 같이 404 로 알린다(uuid 캐스트 오류로 500 이 되지 않게).
      const idOnly = idSchema.safeParse(req.query);
      if (!idOnly.success) return notFound();
      const { id } = idOnly.data;

      const { data: role, error } = await admin
        .from("admin_roles")
        .select(ROLE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("role read failed");
      if (!role) return notFound();

      const { data: permissions, error: permError } = await admin
        .from("admin_role_permissions")
        .select("resource_key, level")
        .eq("role_id", id);
      if (permError) throw new Error("role permissions read failed");
      res.status(200).json({ ...role, permissions: toItems(permissions) });
      return;
    }

    const idParsed = parseOrReject(res, "problem", idSchema, req.query);
    if (!idParsed) return;
    const { id } = idParsed.value as z.output<typeof idSchema>;

    if (req.method === "PATCH") {
      const parsed = parseOrReject(res, "problem", roleBody, req.body);
      if (!parsed) return;
      const { name, description } = parsed.value as z.output<typeof roleBody>;
      const { data, error } = await admin
        .from("admin_roles")
        .update({ name, description })
        .eq("id", id)
        .select(ROLE_COLUMNS)
        .maybeSingle();
      if (error) throw new Error("role update failed");
      if (!data) return notFound();
      res.status(200).json(data);
      return;
    }

    // DELETE. 옛 화면은 브라우저에서 기본 묶음을 막았다. 서비스 롤은 그 막이 없어 서버가 막는다.
    const { data: role, error: readError } = await admin
      .from("admin_roles")
      .select("id, is_system")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw new Error("role read failed");
    if (!role) return notFound();
    if (role.is_system) {
      sendError(
        res,
        "problem",
        409,
        "기본 권한 묶음은 삭제할 수 없습니다.",
        "SYSTEM_ROLE",
      );
      return;
    }

    const { data: deleted, error } = await admin
      .from("admin_roles")
      .delete()
      .eq("id", id)
      .eq("is_system", false)
      .select("id");
    // admin_members.role_id 가 ON DELETE RESTRICT 라 쓰는 관리자가 있으면 FK 오류가 난다.
    if (error?.code === "23503") {
      sendError(
        res,
        "problem",
        409,
        "이 권한 묶음을 쓰는 관리자가 있어 삭제할 수 없습니다.",
        "ROLE_IN_USE",
      );
      return;
    }
    if (error) throw new Error("role delete failed");
    if (!deleted || deleted.length === 0) return notFound();
    res.status(204).end();
  },
});
