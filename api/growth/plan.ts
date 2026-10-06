// GET /api/growth/plan[?reportId=<uuid>]
// Authorization: Bearer <access_token>
//
// 성장설계 실행계획 조회(명세 No.155~160, 162~164). 쿼리 reportId 가 없으면 완료(completed) 회차 중
// issued_at 이 가장 늦은 회차를 쓴다.
//
// 응답 200 { ok: true, plan: {
//   reportId, issuedAt, track, theme, stage, currentGrade, subtheme,
//   groups[{ period, label, periodLabel, items[] }],   시기 묶음, 항목에 마감 상태와 이월 여부 포함
//     carried 항목은 groups 에도 들어가고 carried 목록에도 다시 나온다(이월 묶음 표시용)
//   progress{ total, done, remaining, percent },
//   nextDeadline, carried[], avoidRepeats[],
//   metrics|null,                            리포트 시점, 현재, 전부 완료 시 지표(조회 때 계산, 저장 안 함)
//   handoffs{ [itemId]: ProgramHandoff }     self, deep 항목의 프로그램 이동 전달값
// } }
//
// 오류 코드
//   INVALID_QUERY 400, PLAN_NOT_FOUND 404(완료 회차가 없거나 지정 id 가 없음, 남의 회차 포함),
//   METHOD_NOT_ALLOWED 405, UNAUTHENTICATED 401, INTERNAL 500.
//
// 오늘 날짜는 KST 기준(UTC+9)으로 만든다. 마감 판정은 날짜 문자열 앞 10자만 쓴다.
// 소유자 격리: service_role 로 읽으므로 모든 쿼리에 profile_id 조건을 건다.
// 핸들러 본문은 DB 에 묶여 단위 테스트하지 않는다. 판단은 api/_lib/growth/plan 의 순수 모듈에서 검증한다.

import type { VercelResponse } from "@vercel/node";
import { planMetrics } from "../_lib/growth/plan/metrics.js";
import { loadPlanItems, loadPlanReport } from "../_lib/growth/plan/planDb.js";
import { buildPlanBody, todayKstIso } from "../_lib/growth/plan/view.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
) {
  sendError(res, "coded", status, message, code, { ok: false });
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "실행계획을 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "growth/plan",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const raw = req.query?.reportId;
    if (raw !== undefined && (typeof raw !== "string" || !UUID_RE.test(raw))) {
      fail(res, 400, "INVALID_QUERY", "reportId 형식이 올바르지 않아요.");
      return;
    }
    const db = ctx.supabaseAdmin;
    const report = await loadPlanReport(db, userId, raw ?? null);
    if (!report) {
      fail(res, 404, "PLAN_NOT_FOUND", "실행계획을 찾을 수 없어요.");
      return;
    }
    const items = await loadPlanItems(db, userId, report.id);
    const metrics = planMetrics(report, items);
    const todayIso = todayKstIso(Date.now());
    res.status(200).json({
      ok: true,
      plan: buildPlanBody(report, items, todayIso, metrics),
    });
  },
});

export const config = { runtime: "nodejs" };
