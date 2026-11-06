// PUT /api/console/counsel-status { studentId, status }
//
// W10 상담 상태 정하기(교 #51, 결정 2). 상태는 unset(미지정), scheduled(상담예정), done(상담완료), needed(상담필요)
// 중 하나를 절대값으로 정한다. 담임은 담당 학급의 중3, 고3 학생만, 학교 관리자와 본사 대행은 기관 전체다.
// 범위 밖, 다른 기관, 현재 학년도 재학생이 아니거나 중3과 고3이 아닌 학생은 404 로 숨긴다. 상태는 기관, 학생, 학년도별 한 행이고(결정 64)
// 현재 학년도 행을 정한다. 같은 상태를 다시 보내면 상태 행은 쓰지 않아 변경 일자가 움직이지 않고 같은 성공이다(감사 기록에는 unchanged 로 남긴다).
// 이전 값 읽기와 쓰기는 fn_set_counsel_status 한 번이라 동시 요청에도 감사 기록의 from 이 맞고, 접근 로그를 남기지 못하면 500 이다.

import { writeConsoleAuditLog } from "../_lib/console/audit.js";
import { loadTenant } from "../_lib/console/directory.js";
import {
  ADMISSION_GRADES,
  loadScopedEnrollment,
} from "../_lib/console/studentScope.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export const COUNSEL_STATUSES = [
  "unset",
  "scheduled",
  "done",
  "needed",
] as const;
type CounselStatus = (typeof COUNSEL_STATUSES)[number];

export default defineHandler({
  methods: ["PUT"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "상담 상태를 저장하지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/counsel-status]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const body = req.body as { studentId?: unknown; status?: unknown } | null;
    const studentId = body?.studentId;
    const status = body?.status;
    if (
      typeof studentId !== "string" ||
      studentId === "" ||
      !(COUNSEL_STATUSES as readonly unknown[]).includes(status)
    ) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const next = status as CounselStatus;

    const enrollment = await loadScopedEnrollment(admin, res, actor, studentId);
    if (!enrollment) return;
    if (
      !enrollment.grade ||
      !(ADMISSION_GRADES as readonly string[]).includes(enrollment.grade)
    ) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    // 이전 값을 읽고 바꾸는 일을 DB 함수 한 번에 한다. 동시 요청이 같은 이전 값을 읽어 감사 기록이 어긋나지 않는다.
    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const { data, error } = await admin.rpc("fn_set_counsel_status", {
      p_tenant_id: actor.tenantId,
      p_student_id: studentId,
      p_school_year: schoolYear,
      p_status: next,
      p_changed_by: actor.teacherId,
    });
    const result = (
      data as
        | {
            previous_status: CounselStatus;
            status_changed_at: string | null;
          }[]
        | null
    )?.[0];
    if (error || !result) throw new Error("counsel status set failed");

    // 바뀐 것이 없으면 행은 그대로이고, 앞선 요청이 감사 기록에서 실패했을 수 있어 기록은 다시 남긴다.
    const before = result.previous_status;
    const changedAt = result.status_changed_at;
    await writeConsoleAuditLog(
      { ...ctx, supabaseAdmin: admin, console: actor },
      {
        action: "update",
        resourceKey: "counselStatus",
        targetId: studentId,
        meta:
          before === next
            ? { from: before, to: next, unchanged: true }
            : { from: before, to: next },
      },
    );
    res.status(200).json({ ok: true, status: next, changedAt });
  },
});
