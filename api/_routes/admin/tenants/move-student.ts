// POST /api/admin/tenants/move-student  { profileId, tenantId, grade, groupName?, className?, number? }
//
// 스쿨멘토 본사 관리자가 학생을 다른 기관으로 옮긴다(사 결정 r4 4번, 결정 96, 101, 102). 소속만 바꾸던
// fn_admin_set_profile_tenant 와 달리 옛 기관 학적과 대기 신청을 정리하고 대상 기관 학적을 만든다
// (fn_admin_move_student_tenant, 한 트랜잭션). 반은 비워도 된다(결정 102.14).
// 권한: 관리자 + 메뉴 members edit(defineHandler, QA 계정 쓰기 차단 포함). 옮긴 기록은 admin_access_logs 에 update / members 로 남긴다.

import { z } from "zod";
import { getBearerToken } from "../../../_lib/adminAuth.js";
import { writeConsoleAuditLog } from "../../../_lib/console/audit.js";
import { sendEnrollmentRpcError } from "../../../_lib/console/enrollmentErrors.js";
import {
  isEnrollmentGrade,
  isEnrollmentNumber,
} from "../../../_lib/console/enrollmentInput.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const MEMBERS_RESOURCE_KEY = "members";

// 빈 반, 그룹 이름은 null 로 맞춘다(비어 있지 않은 값은 그대로 둔다).
const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) =>
    value === undefined || value === null || value.trim() === "" ? null : value,
  );

const bodySchema = z.object({
  profileId: z.string().min(1),
  tenantId: z.string().min(1),
  grade: z.custom<string>(isEnrollmentGrade),
  groupName: optionalText,
  className: optionalText,
  number: z
    .custom<number | null>(
      (value) => value === null || isEnrollmentNumber(value),
    )
    .optional()
    .transform((value) => value ?? null),
});

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: MEMBERS_RESOURCE_KEY },
  // writeConsoleAuditLog 가 update 행을 직접 남긴다.
  audit: false,
  unhandledMessage: "학생을 옮기지 못했습니다.",
  logLabel: "[admin/tenants/move-student]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = ctx.userId as string;

    // 입력 검증 실패 문구는 화면이 그대로 보여 주던 것을 유지한다.
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(
        res,
        "problem",
        400,
        "입력값을 확인해 주세요.",
        "VALIDATION_FAILED",
      );
      return;
    }
    const body = parsed.data;

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
          "problem",
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
          "problem",
          409,
          "이 학생의 올해 학적이 다른 기관에 남아 있어요. 그 기관의 학적을 먼저 확인해 주세요.",
          "OTHER_TENANT_ENROLLMENT",
        );
        return;
      }
      // WC077 의 점유 학생 이름은 가려서 싣는다(본사는 담임이 아니다).
      if (
        sendEnrollmentRpcError(
          res,
          error,
          {
            slot: {
              grade: body.grade,
              className: body.className,
              number: body.number,
            },
            maskName: true,
          },
          "problem",
        )
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
        user:
          (await ctx.supabaseAdmin.auth.getUser(getBearerToken(req))).data
            .user ?? undefined,
        console: {
          kind: "hq",
          tenantId: moved.tenant_id,
          teacherId: null,
          classIds: [],
          proxySessionId: null,
          mustChangePassword: false,
          loginId: null,
          readOnly: false,
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
      fromTenantId: moved.from_tenant_id,
      tenantId: moved.tenant_id,
      enrollmentId: moved.enrollment_id,
    });
  },
});
