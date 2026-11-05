// GET /api/console/coaching?studentId=
//
// W9 개인종합코칭. 학생 한 명의 6종 서비스 자료를 코칭 판정 엔진(api/_lib/console/coaching.ts)에 넣은 결과.
// 담임은 현재 담당 학급의 학생만, 학교 관리자와 본사 대행은 기관 전체를 본다. 범위 밖과 졸업생은 404.
// 이름은 담임만 실명이고 그 밖에는 서버에서 가린다. 자료가 없는 지표는 판정에서 빠진다(결정 4).

import {
  coachingTypeOf,
  computeAxes,
  computeCompetencies,
  executionVerdict,
  indicatorsOf,
  learningVerdict,
  linkageVerdict,
  signalOf,
  summaryLine,
  urgencyOf,
} from "../_lib/console/coaching.js";
import { loadCoachingData } from "../_lib/console/coachingData.js";
import { buildCoachingText } from "../_lib/console/coachingText.js";
import {
  loadClassIndex,
  loadProfileNames,
  loadTenant,
  readAll,
} from "../_lib/console/directory.js";
import { displayNameFor } from "../_lib/console/maskName.js";
import { requireInScope } from "../_lib/console/scope.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
} from "../_lib/console/serviceUsage.js";
import { defineHandler } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

interface EnrollmentRow {
  student_id: string;
  grade: string | null;
  class_id: string | null;
  number: number | null;
}

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

    // 현재 학년도 재학생만 연다. 졸업생과 지난 담임의 옛 학급은 여기서 걸러진다.
    const { schoolYear } = await loadTenant(admin, actor.tenantId);
    const [enrollment] = await readAll<EnrollmentRow>(
      admin,
      "student_enrollments",
      "student_id, grade, class_id, number",
      (q) =>
        q
          .eq("tenant_id", actor.tenantId)
          .eq("student_id", studentId)
          .eq("school_year", schoolYear)
          .eq("status", "active"),
    );
    if (
      !enrollment ||
      !requireInScope(res, "coded", actor, {
        tenantId: actor.tenantId,
        classId: enrollment.class_id,
      })
    ) {
      if (!enrollment) {
        sendError(res, "coded", 404, "대상을 찾을 수 없습니다.", "NOT_FOUND");
      }
      return;
    }

    const [classes, names, usage] = await Promise.all([
      loadClassIndex(admin, actor.tenantId),
      loadProfileNames(admin, [studentId]),
      loadServiceUsage(admin, [studentId]),
    ]);
    const used = usage.get(studentId) ?? [];
    const cls = enrollment.class_id
      ? classes.get(enrollment.class_id)
      : undefined;

    const homeroom = enrollment.class_id
      ? await readAll<{ teacher_id: string }>(
          admin,
          "teacher_class_assignments",
          "teacher_id",
          (q) =>
            q
              .eq("tenant_id", actor.tenantId)
              .eq("class_id", enrollment.class_id as string),
          "teacher_id",
        )
      : [];
    const teachers = homeroom[0]
      ? await readAll<{ name: string }>(admin, "teachers", "name", (q) =>
          q
            .eq("tenant_id", actor.tenantId)
            .eq("id", homeroom[0]?.teacher_id as string),
        )
      : [];

    const data = await loadCoachingData(admin, studentId, used);
    const { metrics, targets } = data;
    const axesResult = computeAxes(metrics);
    const careerLink = axesResult.axes.find((a) => a.key === "careerLink");
    const week = metrics.goal?.week;
    const verdicts = {
      execution: executionVerdict({
        usesGoal: metrics.used.goal,
        ...(week ? { week } : {}),
      }),
      learning: learningVerdict(
        metrics.diagnosis
          ? {
              areas: metrics.diagnosis.areas,
              executionAvg: indicatorsOf(metrics).dxExecution.score as number,
            }
          : null,
      ),
      linkage: linkageVerdict(careerLink?.score ?? null),
    };
    const { signal, subLine } = signalOf(verdicts, axesResult.axes);

    const type = coachingTypeOf({
      verdicts,
      axes: axesResult.axes,
      achievementPct: week?.achievementPct ?? null,
      usesInquiry: metrics.used.inquiry,
    });
    const competencies = computeCompetencies(metrics);
    const text = buildCoachingText({
      grade: data.grade ?? enrollment.grade,
      month: Number(
        new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(5, 7),
      ),
      department:
        targets?.ideal?.department || targets?.min?.department || null,
      metrics,
      axes: axesResult,
      competencies,
      verdicts,
      type,
      goal: data.goalFacts,
      pendingPerformance: data.pendingPerformance,
      inquiryTopic: data.inquiryTopic,
      growthKeywords: data.growthKeywords,
      gradeCheck: null,
    });
    const { serviceCards, ...rest } = text;

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
        homeroomName: teachers[0]?.name ?? null,
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
