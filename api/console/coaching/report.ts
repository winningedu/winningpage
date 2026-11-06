// GET /api/console/coaching/report?studentId=&service=
//
// W9b 리포트 보기 전용. 학생이 쓰는 서비스의 가장 최근 리포트를 글로만 돌려준다(인쇄와 내려받기 없음).
// 열람마다 report_view 접근 로그를 남기고(교 #66) 남기지 못하면 500 이라 리포트를 보여 주지 않는다.
// 범위는 코칭 조회와 같다. 목표관리는 저장된 리포트가 없어 404 NO_REPORT 다.

import { writeConsoleAuditLog } from "../../_lib/console/audit.js";
import { readAll, readLatest } from "../../_lib/console/directory.js";
import {
  flattenText,
  type ReportSection,
  reportSections,
} from "../../_lib/console/reportView.js";
import {
  loadServiceUsage,
  SERVICE_KEYS,
  type ServiceKey,
} from "../../_lib/console/serviceUsage.js";
import { loadScopedEnrollment } from "../../_lib/console/studentScope.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const first = (raw: string | string[] | undefined) =>
  Array.isArray(raw) ? raw[0] : raw;

const TITLE: Record<ServiceKey, string> = {
  diagnosis: "학습진단 리포트",
  goal: "목표관리 리포트",
  growth: "성장설계 리포트",
  performance: "수행평가 리포트",
  selfeval: "자기평가 리포트",
  inquiry: "심화탐구 리포트",
};

async function loadReport(
  admin: Parameters<typeof readAll>[0],
  service: ServiceKey,
  studentId: string,
): Promise<{ summary: string; sections: ReportSection[] } | null> {
  switch (service) {
    case "diagnosis": {
      const row = await readLatest<{ payload: unknown }>(
        admin,
        "diagnosis_reports",
        "payload",
        (q) => q.eq("profile_id", studentId),
      );
      const payload = row?.payload as Record<string, unknown> | undefined;
      if (!payload) return null;
      const readiness = payload.readiness as
        | Record<string, unknown>
        | undefined;
      const sections = [
        { title: "요약", text: flattenText(payload.headlineLines) },
        {
          title: "학교생활 준비도",
          text: flattenText(readiness?.summaryLines),
        },
      ].filter((s) => s.text !== "");
      return { summary: "", sections };
    }
    case "growth": {
      const row = await readLatest<{ sections: unknown }>(
        admin,
        "growth_reports",
        "sections",
        (q) => q.eq("profile_id", studentId).eq("status", "completed"),
      );
      return row
        ? { summary: "", sections: reportSections(row.sections) }
        : null;
    }
    case "performance": {
      const sessions = await readAll<{ id: string }>(
        admin,
        "performance_sessions",
        "id",
        (q) => q.eq("profile_id", studentId),
      );
      const ids = sessions.map((s) => s.id);
      if (ids.length === 0) return null;
      const row = await readLatest<{
        summary: string | null;
        sections: unknown;
      }>(admin, "performance_reports", "summary, sections", (q) =>
        q.in("session_id", ids).eq("report_type", "evaluation"),
      );
      return row
        ? { summary: row.summary ?? "", sections: reportSections(row.sections) }
        : null;
    }
    case "inquiry": {
      const row = await readLatest<{ sections: unknown }>(
        admin,
        "inquiry_reports",
        "sections",
        (q) => q.eq("profile_id", studentId),
      );
      return row
        ? { summary: "", sections: reportSections(row.sections) }
        : null;
    }
    case "selfeval": {
      const row = await readLatest<{ sections: unknown }>(
        admin,
        "selfeval_reports",
        "sections",
        (q) => q.eq("profile_id", studentId),
      );
      return row
        ? { summary: "", sections: reportSections(row.sections) }
        : null;
    }
    default:
      return null;
  }
}

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "리포트를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/coaching/report]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const actor = ctx.console;
    if (!actor) throw new Error("console actor missing");
    const admin = ctx.supabaseAdmin;

    const studentId = first(req.query.studentId);
    const service = first(req.query.service) as ServiceKey | undefined;
    if (!studentId || !service || !SERVICE_KEYS.includes(service)) {
      sendError(res, "coded", 400, "입력 값을 확인해 주세요.", "BAD_REQUEST");
      return;
    }
    if (!(await loadScopedEnrollment(admin, res, actor, studentId))) return;

    const used =
      (await loadServiceUsage(admin, [studentId])).get(studentId) ?? [];
    const report = used.includes(service)
      ? await loadReport(admin, service, studentId)
      : null;
    if (!report || (report.summary === "" && report.sections.length === 0)) {
      sendError(res, "coded", 404, "열람할 리포트가 없습니다.", "NO_REPORT");
      return;
    }

    await writeConsoleAuditLog(
      { ...ctx, console: actor },
      {
        action: "report_view",
        resourceKey: "coachingReport",
        targetId: studentId,
        meta: { service },
      },
    );
    res.status(200).json({ title: TITLE[service], ...report });
  },
});
