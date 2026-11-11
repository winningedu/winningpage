// GET /api/console/groups
//   그룹 목록(W11). { groups: [{ id, name, studentCount }] }. studentCount 는 올해 학급의 재학생 수로
//   fn_group_soft_delete 가 막는 기준과 같다. 삭제된 그룹은 빼고 이름순이다.
// POST /api/console/groups  { name }
//
// 그룹 만들기(W11). 학교 관리자와 본사 대행만, 기관은 행위자에서 정한다.
// 같은 이름(대소문자 무시, 삭제된 그룹 제외)은 유일 인덱스가 막아 409 로 답한다.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { loadTenant, readAll } from "../../_lib/console/directory.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "console",
  consoleRole: "schoolAdmin",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "그룹 요청을 처리하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/groups]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");

    if (req.method === "GET") {
      const admin = ctx.supabaseAdmin;
      const { schoolYear } = await loadTenant(admin, actor.tenantId);
      const [groups, classes, enrollments] = await Promise.all([
        readAll<{ id: string; name: string; deleted_at: string | null }>(
          admin,
          "class_groups",
          "id, name, deleted_at",
          (q) => q.eq("tenant_id", actor.tenantId),
        ),
        readAll<{ id: string; group_id: string | null }>(
          admin,
          "classes",
          "id, group_id",
          (q) =>
            q.eq("tenant_id", actor.tenantId).eq("school_year", schoolYear),
        ),
        readAll<{ class_id: string | null }>(
          admin,
          "student_enrollments",
          "class_id",
          (q) =>
            q
              .eq("tenant_id", actor.tenantId)
              .eq("school_year", schoolYear)
              .eq("status", "active"),
        ),
      ]);
      const groupOfClass = new Map(classes.map((c) => [c.id, c.group_id]));
      const counts = new Map<string, number>();
      for (const e of enrollments) {
        const groupId = e.class_id ? groupOfClass.get(e.class_id) : null;
        if (groupId) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
      }
      res.status(200).json({
        groups: groups
          .filter((g) => g.deleted_at === null)
          .map((g) => ({
            id: g.id,
            name: g.name,
            studentCount: counts.get(g.id) ?? 0,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      });
      return;
    }

    const { name: rawName } = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (name === "") {
      sendError(res, "coded", 400, "그룹 이름을 입력해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data: group, error } = await ctx.supabaseAdmin
      .from("class_groups")
      .insert({ tenant_id: actor.tenantId, name })
      .select("id")
      .single();
    if (error?.code === "23505") {
      sendError(
        res,
        "coded",
        409,
        "이미 있는 그룹 이름이에요.",
        "GROUP_EXISTS",
      );
      return;
    }
    if (error || !group) throw new Error("class group insert failed");

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      {
        action: "update",
        resourceKey: "classGroup",
        targetId: group.id,
        meta: { op: "create", name },
      },
    );

    res.status(200).json({ ok: true, groupId: group.id });
  },
});
