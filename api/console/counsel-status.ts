// PUT /api/console/counsel-status { studentId, status }
//
// W10 상담 상태 정하기(교 #51, 결정 2). 상태는 unset(미지정), scheduled(상담예정), done(상담완료), needed(상담필요)
// 중 하나를 절대값으로 정한다. 담임은 담당 학급의 중3, 고3 학생만, 학교 관리자와 본사 대행은 기관 전체다.
// 범위 밖, 다른 기관, 중3과 고3이 아닌 학생은 404 로 숨긴다. 같은 상태를 다시 보내면 쓰지도 감사 기록을 남기지도
// 않고 같은 성공이며 변경 일자도 움직이지 않는다. 바뀔 때는 학생당 한 행을 upsert 하고(기본 키가 동시 요청을
// 한 행으로 모은다) 접근 로그를 남기며, 남기지 못하면 500 이다.

import { writeConsoleAuditLog } from "../_lib/console/audit.js";
import { readAll } from "../_lib/console/directory.js";
import {
  ADMISSION_GRADES,
  loadScopedStudents,
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

    const students = await loadScopedStudents(admin, actor, {
      grades: ADMISSION_GRADES,
    });
    if (!students.some((s) => s.studentId === studentId)) {
      sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      return;
    }

    const [current] = await readAll<{
      status: CounselStatus;
      changed_at: string;
    }>(
      admin,
      "counsel_statuses",
      "status, changed_at",
      (q) => q.eq("tenant_id", actor.tenantId).eq("student_id", studentId),
      "student_id",
    );
    const before = current?.status ?? "unset";
    if (current && before === next) {
      res.status(200).json({
        ok: true,
        status: next,
        changedAt: current.changed_at,
      });
      return;
    }
    // 행이 없던 학생에게 미지정을 정하는 일은 바뀐 것이 없다.
    if (!current && next === "unset") {
      res.status(200).json({ ok: true, status: next, changedAt: null });
      return;
    }

    const changedAt = new Date().toISOString();
    const { error } = await admin.from("counsel_statuses").upsert(
      {
        student_id: studentId,
        tenant_id: actor.tenantId,
        status: next,
        changed_at: changedAt,
        changed_by: actor.teacherId,
      },
      { onConflict: "student_id" },
    );
    if (error) throw new Error("counsel status upsert failed");

    await writeConsoleAuditLog(
      { ...ctx, supabaseAdmin: admin, console: actor },
      {
        action: "update",
        resourceKey: "counselStatus",
        targetId: studentId,
        meta: { from: before, to: next },
      },
    );
    res.status(200).json({ ok: true, status: next, changedAt });
  },
});
