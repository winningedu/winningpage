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
//     200 { reused, report }
//   GET ?sessionId=<uuid>
//     200 { report }   report { sessionId, finalRevision, status: "ready"|"failed", attempts, builtAt, payload|null }
//
// 오류 코드
//   VALIDATION_FAILED 400(sessionId 가 uuid 가 아님), SESSION_NOT_FOUND 404(없는 세션과 남의 세션 동일),
//   SESSION_NOT_COMPLETED 409, FINAL_REPORT_MISSING 409, REPORT_BUSY 409, REPORT_NOT_FOUND 404,
//   REPORT_FAILED 500, INTERNAL 500.
//
// 요청, 응답 계약은 shared/selfeval/report.ts 다. payload 의 장별 모양은 src/lib/selfeval/reportTypes.ts 다. 조립 규칙은 api/_lib/selfeval/report/ 의 순수 함수에서 검증한다.

import type { Context } from "hono";
import {
  type ReportViewShape,
  reportBody,
  reportQuery,
} from "../../../shared/selfeval/report.js";
import { callStructured } from "../../_lib/ai/gemini.js";
import { createAiTrace } from "../../_lib/ai/telemetry/trace.js";
import { type UserEnv, userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import { selfevalProblem } from "../../_lib/selfeval/access.js";
import {
  type Db,
  loadMemberTimeZone,
  loadSession,
} from "../../_lib/selfeval/db.js";
import { loadReportInput } from "../../_lib/selfeval/report/load.js";
import {
  runReport,
  type StoredReport,
} from "../../_lib/selfeval/report/run.js";
import { createReportStore } from "../../_lib/selfeval/report/store.js";
import type { SessionRow } from "../../_lib/selfeval/rows.js";

const guard = user({
  unhandledMessage: "자기평가서 리포트 처리에 실패했습니다.",
  logLabel: "selfeval/report",
  headers: { "Cache-Control": "no-store" },
});

const toView = (r: StoredReport): ReportViewShape => ({
  sessionId: r.sessionId,
  finalRevision: r.finalRevision,
  status: r.status,
  attempts: r.attempts,
  builtAt: r.builtAt,
  payload: r.payload,
});

/** 소유자의 완료 세션을 돌려준다. 아니면 404, 409 로 던진다. */
async function openSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<SessionRow> {
  const session = await loadSession(db, userId, sessionId);
  if (session === null) {
    throw selfevalProblem(
      404,
      "SESSION_NOT_FOUND",
      "자기평가서 세션을 찾을 수 없어요.",
    );
  }
  if (session.status !== "completed") {
    throw selfevalProblem(
      409,
      "SESSION_NOT_COMPLETED",
      "최종 저장을 마친 자기평가서만 리포트를 만들 수 있어요.",
    );
  }
  return session;
}

async function read(c: Context<UserEnv>, sessionId: string) {
  const { supabaseAdmin: db, user: me } = c.var;
  await openSession(db, me.id, sessionId);
  const stored = await createReportStore(db, sessionId).read();
  if (stored === null) {
    throw selfevalProblem(
      404,
      "REPORT_NOT_FOUND",
      "아직 만들어진 리포트가 없어요.",
    );
  }
  return c.json({ report: toView(stored) });
}

async function build(c: Context<UserEnv>, sessionId: string) {
  const { supabaseAdmin: db, user: me } = c.var;
  const session = await openSession(db, me.id, sessionId);
  const trace = createAiTrace({
    service: "selfeval",
    feature: "report_compose",
    targetKind: "selfeval_session",
    targetId: sessionId,
    profileId: me.id,
  });
  let outcome: Awaited<ReturnType<typeof runReport>>;
  try {
    outcome = await runReport({
      sessionId,
      load: async () =>
        loadReportInput(
          db,
          me.id,
          session,
          await loadMemberTimeZone(db, me.id),
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
      return c.json({
        reused: outcome.reused,
        report: toView(outcome.report),
      });
    case "no_final":
      throw selfevalProblem(
        409,
        "FINAL_REPORT_MISSING",
        "최종 본문이 아직 없어요.",
      );
    case "busy":
      throw selfevalProblem(
        409,
        "REPORT_BUSY",
        "리포트를 만드는 중이에요. 잠시 뒤 다시 확인해 주세요.",
      );
    case "failed":
      throw selfevalProblem(
        500,
        "REPORT_FAILED",
        "리포트를 만들지 못했어요. 최종 저장은 그대로예요. 다시 만들어 주세요.",
      );
  }
}

export const report = userFactory
  .createApp()
  .get("/", guard, validate("query", reportQuery), (c) =>
    read(c, c.req.valid("query").sessionId),
  )
  .post("/", guard, validate("json", reportBody), (c) =>
    build(c, c.req.valid("json").sessionId),
  )
  .all("/", methodNotAllowed("GET", "POST"));
