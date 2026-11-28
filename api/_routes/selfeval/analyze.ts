// POST /api/selfeval/analyze
// Authorization: Bearer <access_token>
//
// 11항목 분석(계획서 §2 6, 명세 No.37~43). action 으로 가른다. 요청, 응답 계약은 shared/selfeval/analyze.ts 다.
//   run               핵심 활동을 모델로 분석한다. 직접 입력한 활동은 모델 없이 단계만 올린다.
//   save              학생이 고친 항목을 저장한다. 고친 항목만 출처를 다시 가른다.
//   resolve-conflict  보조 활동과 어긋난 수치 중 하나를 고른다.
//
//   200 { analysis, conflicts, analysisSource, currentStep, attempts, softIssues }   (run)
//   200 { analysis }                                                                (save, resolve-conflict)
//   400 VALIDATION_FAILED (요청 형식), CONFLICT_INDEX_INVALID
//   404 SESSION_NOT_FOUND
//   409 SESSION_NOT_OPEN, STEP_ORDER { currentStep }, STEP_RUNNING, STEP_SUPERSEDED,
//       ATTEMPTS_EXHAUSTED { terminal }
//   422 STEP_VALIDATION_FAILED { attempts, issues, terminal? }
//   502 MODEL_UPSTREAM_FAILED, 504 STEP_TIMEOUT, 500 STEP_FATAL
//
// 핸들러 본문은 DB 에 묶여 단위 테스트는 단계 함수를 가짜로 바꾼다. 규칙은 api/_lib/selfeval/steps/analyze.ts 에서 검증한다.

import type { z } from "zod";
import type {
  analyzeEditResponse,
  analyzeRunResponse,
} from "../../../shared/selfeval/analyze.js";
import { analyzeBody } from "../../../shared/selfeval/analyze.js";
import { SELFEVAL_ERROR } from "../../../shared/selfeval/contract.js";
import { callStructured } from "../../_lib/ai/gemini.js";
import { userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import { selfevalProblem } from "../../_lib/selfeval/access.js";
import { loadSession } from "../../_lib/selfeval/db.js";
import {
  assertSessionOpen,
  outcomeBody,
} from "../../_lib/selfeval/stepResponse.js";
import {
  resolveAnalysisConflict,
  runAnalyze,
  saveAnalysis,
} from "../../_lib/selfeval/steps/analyze.js";

const guard = user({
  unhandledMessage: "자기평가서 분석에 실패했습니다.",
  logLabel: "selfeval/analyze",
  headers: { "Cache-Control": "no-store" },
});

export const analyze = userFactory
  .createApp()
  .post("/", guard, validate("json", analyzeBody), async (c) => {
    const startedAt = Date.now();
    const body = c.req.valid("json");
    const { supabaseAdmin: db, user: me } = c.var;
    const session = await loadSession(db, me.id, body.sessionId);
    if (session === null) {
      throw selfevalProblem(
        404,
        SELFEVAL_ERROR.SESSION_NOT_FOUND,
        "자기평가서 세션을 찾을 수 없어요.",
      );
    }
    assertSessionOpen(session, false);

    if (body.action === "run") {
      const out = await runAnalyze(db, me.id, session, {
        callStructured,
        now: () => new Date().toISOString(),
        startedAt,
      });
      return c.json(
        outcomeBody(
          out,
          (r) =>
            ({
              analysis: r.analysis,
              conflicts: r.analysis.conflicts,
              analysisSource: r.analysisSource,
              currentStep: r.currentStep,
            }) satisfies Omit<
              z.output<typeof analyzeRunResponse>,
              "attempts" | "softIssues"
            >,
        ),
      );
    }
    const out =
      body.action === "save"
        ? await saveAnalysis(db, me.id, session, body.edits)
        : await resolveAnalysisConflict(
            db,
            me.id,
            session,
            body.index,
            body.choice,
          );
    return c.json(
      outcomeBody(
        out,
        (r) =>
          ({ analysis: r.analysis }) satisfies z.output<
            typeof analyzeEditResponse
          >,
      ),
    );
  })
  .all("/", methodNotAllowed("POST"));
