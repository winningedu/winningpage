// GET, PATCH /api/admin/staff/:profileId
//
// GET 은 관리자 한 명의 상세: 목록 뷰의 행, 개별 권한(덮어쓰기), 묶음과 합친 실효 권한.
// PATCH 는 옛 화면의 저장 폼과 같은 세 칸(권한 묶음, 부서, 상태)만 고친다.
// profileId 는 경로에서 오고(디스패처가 req.query.profileId 에 넣는다) 최고 관리자 전용이다.

import { z } from "zod";
import { defineHandler, parseOrReject } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const pathSchema = z.object({ profileId: z.guid() });

// 칸은 옛 화면 saveInfo 의 payload 와 같다. 모르는 키(is_super, profile_id 등)는 400 이다.
const patchSchema = z.strictObject({
  roleId: z.guid().nullable(),
  department: z
    .string()
    .trim()
    .nullable()
    .transform((value) => value || null),
  status: z.enum(["invited", "active", "suspended"]),
});

const NOT_FOUND_MESSAGE = "관리자를 찾을 수 없습니다.";
const LAST_SUPER_MESSAGE =
  "최고 관리자가 1명뿐이라 강등, 정지, 삭제할 수 없습니다. 다른 사람을 먼저 최고 관리자로 올려 주세요.";

const toItems = (rows: { resource_key: string; level: string }[] | null) =>
  (rows ?? []).map((row) => ({
    resourceKey: row.resource_key,
    level: row.level,
  }));

export default defineHandler({
  methods: ["GET", "PATCH"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "adminMembers" },
  query: pathSchema,
  unhandledMessage: "관리자 정보를 처리하지 못했습니다.",
  logLabel: "[admin/staff/profileId]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const admin = ctx.supabaseAdmin;
    const { profileId } = ctx.query;

    if (req.method === "PATCH") {
      const parsed = parseOrReject(res, "problem", patchSchema, req.body);
      if (!parsed) return;
      const { roleId, department, status } = parsed.value as z.output<
        typeof patchSchema
      >;

      const { data: saved, error: updateError } = await admin
        .from("admin_members")
        .update({ role_id: roleId, department, status })
        .eq("profile_id", profileId)
        .select("profile_id");
      if (updateError?.code === "WC059") {
        // 마지막 최고 관리자 보호 트리거가 올린 오류다.
        sendError(res, "problem", 409, LAST_SUPER_MESSAGE, "LAST_SUPER_ADMIN");
        return;
      }
      if (updateError?.code === "23503") {
        sendError(
          res,
          "problem",
          400,
          "요청 값이 올바르지 않아요.",
          "VALIDATION_FAILED",
          {
            errors: [
              { path: "roleId", message: "권한 묶음을 찾을 수 없습니다." },
            ],
          },
        );
        return;
      }
      if (updateError) throw new Error("staff update failed");
      if (!saved || saved.length === 0) {
        sendError(res, "problem", 404, NOT_FOUND_MESSAGE, "NOT_FOUND");
        return;
      }
    }

    const { data: member, error } = await admin
      .from("admin_member_directory")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw new Error("staff read failed");
    if (!member) {
      sendError(res, "problem", 404, NOT_FOUND_MESSAGE, "NOT_FOUND");
      return;
    }

    if (req.method === "PATCH") {
      // 저장한 뒤의 뷰 행을 돌려줘 화면이 목록을 다시 받지 않아도 된다.
      res.status(200).json(member);
      return;
    }

    const [overrides, effective] = await Promise.all([
      admin
        .from("admin_member_permissions")
        .select("resource_key, level")
        .eq("profile_id", profileId),
      admin.rpc("fn_admin_effective_permissions", { p_profile_id: profileId }),
    ]);
    if (overrides.error || effective.error) {
      throw new Error("staff permissions read failed");
    }

    res.status(200).json({
      member,
      overrides: toItems(overrides.data),
      effective: toItems(effective.data),
    });
  },
});
