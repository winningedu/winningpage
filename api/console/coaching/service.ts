// GET /api/console/coaching/service?studentId=&service=
//
// W9a 서비스 상세 창. 서비스는 diagnosis, goal, growth, performance, selfeval, inquiry 중 하나다.
// 범위는 코칭 조회와 같다(담임은 현재 담당 학급, 학교 관리자와 대행은 기관 전체, 범위 밖은 404).
// 학생이 쓰지 않는 서비스는 404 SERVICE_NOT_USED 다(그 카드에는 상세 버튼이 없다).

import { buildCoaching } from "../../_lib/console/coachingBuild.js";
import { serviceDetail } from "../../_lib/console/serviceDetail.js";
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

export default defineHandler({
  methods: ["GET"],
  auth: "console",
  errorShape: "coded",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "서비스 상세를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "[console/coaching/service]",
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
    const enrollment = await loadScopedEnrollment(admin, res, actor, studentId);
    if (!enrollment) return;

    const used =
      (await loadServiceUsage(admin, [studentId])).get(studentId) ?? [];
    const detail = used.includes(service)
      ? serviceDetail(
          service,
          await buildCoaching(admin, studentId, used, enrollment.grade),
        )
      : null;
    if (!detail) {
      sendError(
        res,
        "coded",
        404,
        "이용 중인 서비스가 아닙니다.",
        "SERVICE_NOT_USED",
      );
      return;
    }
    res.status(200).json({ detail });
  },
});
