// GET /api/console/coaching?studentId=
//
// W9 개인종합코칭. 학생 한 명의 6종 서비스 자료를 코칭 판정 엔진(api/_lib/console/coaching.ts)에 넣은 결과.
// 담임은 현재 담당 학급의 학생만, 학교 관리자와 본사 대행은 기관 전체를 본다. 범위 밖과 졸업생은 404.
// 여는 일은 접근 로그에 남기고(결정 66) 남기지 못하면 500 이다.
// 이름은 담임만 실명이고 그 밖에는 서버에서 가린다. 자료가 없는 지표는 판정에서 빠진다(결정 4).

import { writeConsoleAuditLog } from "../_lib/console/audit.js";
import { summaryLine, urgencyOf } from "../_lib/console/coaching.js";
import { buildCoaching } from "../_lib/console/coachingBuild.js";
import {
  loadClassIndex,
  loadHomeroomName,
  loadProfileNames,
} from "../_lib/console/directory.js";
import { displayNameFor } from "../_lib/console/maskName.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
} from "../_lib/console/serviceUsage.js";
import { loadScopedEnrollment } from "../_lib/console/studentScope.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "개인종합코칭을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/coaching]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const raw = Array.isArray(req.query.studentId)
      ? req.query.studentId[0]
      : req.query.studentId;
    if (!raw) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    const studentId = raw;

    const enrollment = await loadScopedEnrollment(admin, res, actor, studentId);
    if (!enrollment) return;

    const [classes, names, usage] = await Promise.all([
      loadClassIndex(admin, actor.tenantId),
      loadProfileNames(admin, [studentId]),
      loadServiceUsage(admin, [studentId]),
    ]);
    const used = usage.get(studentId) ?? [];
    const cls = enrollment.class_id
      ? classes.get(enrollment.class_id)
      : undefined;

    const homeroomName = await loadHomeroomName(
      admin,
      actor.tenantId,
      enrollment.class_id,
    );

    const built = await buildCoaching(admin, studentId, used, enrollment.grade);
    const {
      data: { metrics, targets },
      axesResult,
      verdicts,
      type,
      competencies,
      text,
      signal,
      subLine,
      week,
    } = built;
    const { serviceCards, ...rest } = text;

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      { action: "view", resourceKey: "coaching", targetId: studentId },
    );

    res.status(200).json({
      text: rest,
      serviceCards,
      student: {
        id: studentId,
        name: displayNameFor(actor, names.get(studentId) ?? ""),
        grade: enrollment.grade,
        groupName: cls?.groupName ?? null,
        className: cls?.name ?? null,
        number: enrollment.number,
        homeroomName,
        servicesUsed: used.length,
        services: Object.fromEntries(
          SERVICE_KEYS.map((k) => [
            k,
            used.includes(k) ? "using" : "not_joined",
          ]),
        ),
        targets,
      },
      verdicts,
      signal,
      signalSubLine: subLine,
      coachingType: type,
      summary: summaryLine(axesResult),
      axes: axesResult.axes,
      highlights: {
        strongest: axesResult.strongest,
        weakest: axesResult.weakest,
      },
      competencies,
      goalWeek: week ?? null,
      diagnosisUrgency: metrics.diagnosis
        ? urgencyOf(metrics.diagnosis.areas)
        : null,
    });
  },
});
