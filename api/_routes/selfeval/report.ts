// POST, GET /api/selfeval/report
// Authorization: Bearer <access_token>
//
// 자기평가서 리포트 데이터(명세 No.133, 172, 173). 표지와 01~05장의 값을 담은 JSON 이며 PDF 는 이 값으로
// 화면이 그린 뒤 POST /api/report-pdf 로 만든다. 세션 소유자만 쓰고 세션은 완료(completed)여야 한다.
// 최종 저장과 따로 불리므로 리포트 생성이 실패해도 최종 저장은 그대로다.
//
//   POST { sessionId }
//     finalize 직후 리포트 데이터를 만들고, 문장이 비었거나 실패한 리포트는 다시 만든다.
//     같은 final 리비전의 완성된 리포트는 다시 만들지 않고 저장본을 돌려준다(멱등).
//     200 { ok, reused, report }
//   GET ?sessionId=<uuid>
//     200 { ok, report }   report { sessionId, finalRevision, status: "ready"|"failed", attempts, builtAt, payload|null }
//
// 오류 코드
//   INVALID_BODY 400, INVALID_QUERY 400, SESSION_NOT_FOUND 404(없는 세션과 남의 세션 동일),
//   SESSION_NOT_COMPLETED 409, FINAL_REPORT_MISSING 409, REPORT_BUSY 409, REPORT_NOT_FOUND 404,
//   REPORT_FAILED 500, INTERNAL 500.
//
// payload 모양은 src/lib/selfeval/reportTypes.ts. 조립 규칙은 api/_lib/selfeval/report/ 의 순수 함수에서 검증한다.

import type { VercelResponse } from "@vercel/node";
import type { ReportView } from "../../../src/lib/selfeval/reportTypes.js";
import { callStructured } from "../../_lib/ai/gemini.js";
import { createAiTrace } from "../../_lib/ai/telemetry/trace.js";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { fail } from "../../_lib/selfeval/access.js";
import { loadMemberTimeZone, loadSession } from "../../_lib/selfeval/db.js";
import { loadReportInput } from "../../_lib/selfeval/report/load.js";
import {
  runReport,
  type StoredReport,
} from "../../_lib/selfeval/report/run.js";
import { createReportStore } from "../../_lib/selfeval/report/store.js";
import type { SessionRow } from "../../_lib/selfeval/rows.js";
import { isRecord, isUuid } from "../../_lib/selfeval/steps/shared.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

const toView = (r: StoredReport): ReportView => ({
  sessionId: r.sessionId,
  finalRevision: r.finalRevision,
  status: r.status,
  attempts: r.attempts,
  builtAt: r.builtAt,
  payload: r.payload,
});

type Gate = { ok: true; session: SessionRow } | { ok: false };

/** 소유자의 완료 세션인지 확인하고 아니면 응답까지 보낸다. */
async function openSession(
  res: VercelResponse,
  db: Parameters<typeof loadSession>[0],
  userId: string,
  sessionId: string,
): Promise<Gate> {
  const session = await loadSession(db, userId, sessionId);
  if (session === null) {
    fail(res, 404, "SESSION_NOT_FOUND", "자기평가서 세션을 찾을 수 없어요.");
    return { ok: false };
  }
  if (session.status !== "completed") {
    fail(
      res,
      409,
      "SESSION_NOT_COMPLETED",
      "최종 저장을 마친 자기평가서만 리포트를 만들 수 있어요.",
    );
    return { ok: false };
  }
  return { ok: true, session };
}

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET, POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  authFailureExtra: { ok: false },
  unhandledMessage: "자기평가서 리포트 처리에 실패했습니다.",
  unhandledCode: "INTERNAL",
  unhandledExtra: { ok: false },
  logLabel: "selfeval/report",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const userId = requireUserId(ctx);
    const db = ctx.supabaseAdmin;

    if (req.method === "GET") {
      const sessionId = req.query?.sessionId;
      if (!isUuid(sessionId)) {
        fail(res, 400, "INVALID_QUERY", "sessionId 형식이 올바르지 않아요.");
        return;
      }
      const gate = await openSession(res, db, userId, sessionId);
      if (!gate.ok) return;
      const stored = await createReportStore(db, sessionId).read();
      if (stored === null) {
        fail(res, 404, "REPORT_NOT_FOUND", "아직 만들어진 리포트가 없어요.");
        return;
      }
      res.status(200).json({ ok: true, report: toView(stored) });
      return;
    }

    const sessionId = isRecord(req.body) ? req.body.sessionId : undefined;
    if (!isUuid(sessionId)) {
      fail(res, 400, "INVALID_BODY", "sessionId 형식이 올바르지 않아요.");
      return;
    }
    const gate = await openSession(res, db, userId, sessionId);
    if (!gate.ok) return;

    const trace = createAiTrace({
      service: "selfeval",
      feature: "report_compose",
      targetKind: "selfeval_session",
      targetId: sessionId,
      profileId: userId,
    });
    let outcome: Awaited<ReturnType<typeof runReport>>;
    try {
      outcome = await runReport({
        sessionId,
        load: async () =>
          loadReportInput(
            db,
            userId,
            gate.session,
            await loadMemberTimeZone(db, userId),
          ),
        store: createReportStore(db, sessionId),
        callStructured,
        now: () => new Date().toISOString(),
        trace,
      });
    } finally {
      await trace.flush(db);
    }
    switch (outcome.kind) {
      case "ok":
        res.status(200).json({
          ok: true,
          reused: outcome.reused,
          report: toView(outcome.report),
        });
        return;
      case "no_final":
        fail(res, 409, "FINAL_REPORT_MISSING", "최종 본문이 아직 없어요.");
        return;
      case "busy":
        fail(
          res,
          409,
          "REPORT_BUSY",
          "리포트를 만드는 중이에요. 잠시 뒤 다시 확인해 주세요.",
        );
        return;
      case "failed":
        fail(
          res,
          500,
          "REPORT_FAILED",
          "리포트를 만들지 못했어요. 최종 저장은 그대로예요. 다시 만들어 주세요.",
        );
        return;
    }
  },
});
