// POST /api/admin/tenants/move-student  { profileId, tenantId, grade, groupName?, className?, number? }
//
// 스쿨멘토 본사 관리자가 학생을 다른 기관으로 옮긴다(사 결정 r4 4번, 결정 96, 101, 102). 소속만 바꾸던
// fn_admin_set_profile_tenant 와 달리 옛 기관 학적과 대기 신청을 정리하고 대상 기관 학적을 만든다
// (fn_admin_move_student_tenant, 한 트랜잭션). 반은 비워도 된다(결정 102.14). 위닝에서는 404.
// 권한: 로그인 + HQ 권한 members edit. 옮긴 기록은 admin_access_logs 에 update / members 로 남긴다.

import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { sendEnrollmentRpcError } from "../../../_lib/console/enrollmentErrors.js";
import {
  isEnrollmentGrade,
  isEnrollmentNumber,
} from "../../../_lib/console/enrollmentInput.js";
import { hasAdminEditPermission } from "../../../_lib/console/proxy.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import { assertQaAdminMayWrite } from "../../../_lib/qaAccount.js";
import { isSchoolmentorSite } from "../../../_lib/site.js";

export const config = { runtime: "nodejs" };

const MEMBERS_RESOURCE_KEY = "members";

interface MoveBody {
  profileId: string;
  tenantId: string;
  grade: string;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() === "" ? null : value;
}

function parseBody(raw: unknown): MoveBody | null {
  const body = (raw ?? {}) as Record<string, unknown>;
  const { profileId, tenantId, grade } = body;
  if (typeof profileId !== "string" || profileId === "") return null;
  if (typeof tenantId !== "string" || tenantId === "") return null;
  if (!isEnrollmentGrade(grade)) return null;
  const groupName = optionalText(body.groupName);
  const className = optionalText(body.className);
  if (groupName === undefined || className === undefined) return null;
  const number = body.number ?? null;
  if (number !== null && !isEnrollmentNumber(number)) return null;
  return { profileId, tenantId, grade, groupName, className, number };
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "학생을 옮기지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[admin/tenants/move-student]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    if (!isSchoolmentorSite()) {
      sendError(res, "coded", 404, "Not found", "NOT_FOUND");
      return;
    }
    const userId = ctx.userId as string;
    if (
      !(await hasAdminEditPermission(
        ctx.supabaseAdmin,
        userId,
        MEMBERS_RESOURCE_KEY,
      ))
    ) {
      sendError(res, "coded", 403, "회원 관리 권한이 없습니다.", "FORBIDDEN");
      return;
    }

    await assertQaAdminMayWrite(ctx.supabaseAdmin, userId);

    const body = parseBody(req.body);
    if (!body) {
      sendError(res, "coded", 400, "입력값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }

    const { data, error } = await ctx.supabaseAdmin.rpc(
      "fn_admin_move_student_tenant",
      {
        p_actor: userId,
        p_student: body.profileId,
        p_tenant: body.tenantId,
        p_grade: body.grade,
        // 빈 값은 null 로 넘겨 DB 의 원래 시그니처(text, smallint)와 맞춘다.
        p_group_name: body.groupName as string,
        p_class_name: body.className as string,
        p_number: body.number as number,
      },
    );
    if (error) {
      if (error.code === "P0002") {
        sendError(
          res,
          "coded",
          404,
          "기관을 찾을 수 없어요.",
          "TENANT_NOT_FOUND",
        );
        return;
      }
      // WC100: 올해 학적이 다른 기관에 남아 있다(기관마다 학년도 전환 시점이 달랐던 경우). 본사가 먼저 확인해야 한다.
      if (error.code === "WC100") {
        sendError(
          res,
          "coded",
          409,
          "이 학생의 올해 학적이 다른 기관에 남아 있어요. 그 기관의 학적을 먼저 확인해 주세요.",
          "OTHER_TENANT_ENROLLMENT",
        );
        return;
      }
      // WC077 의 점유 학생 이름은 가려서 싣는다(본사는 담임이 아니다).
      if (
        sendEnrollmentRpcError(res, error, {
          slot: {
            grade: body.grade,
            className: body.className,
            number: body.number,
          },
          maskName: true,
        })
      ) {
        return;
      }
      throw new Error("move student failed");
    }
    const moved = data?.[0];
    if (!moved) throw new Error("fn_admin_move_student_tenant no row");

    await writeConsoleAuditLog(
      {
        supabaseAdmin: ctx.supabaseAdmin,
        userId,
        user: ctx.user,
        console: {
          kind: "hq",
          tenantId: moved.tenant_id,
          teacherId: null,
          classIds: [],
          proxySessionId: null,
          mustChangePassword: false,
          loginId: null,
        },
      },
      {
        action: "update",
        resourceKey: MEMBERS_RESOURCE_KEY,
        targetId: body.profileId,
        meta: {
          fromTenantId: moved.from_tenant_id,
          toTenantId: moved.tenant_id,
          enrollmentId: moved.enrollment_id,
        },
      },
    );

    res.status(200).json({
      ok: true,
      fromTenantId: moved.from_tenant_id,
      tenantId: moved.tenant_id,
      enrollmentId: moved.enrollment_id,
    });
  },
});
