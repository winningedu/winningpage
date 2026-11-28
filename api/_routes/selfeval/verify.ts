// POST /api/selfeval/verify
// Authorization: Bearer <access_token>
//
// 본문 검증(계획서 §2 8, 명세 No.53~62). 모델이 확인 문장의 통과 여부를 판정하고,
// 점수, 형식 검사, 필수 수정은 서버가 계산한다. 검증 대상은 생성본과 편집본 중 나중에 만든 것이다.
// 요청, 응답 계약은 shared/selfeval/verify.ts 다.
//
// 요청  { sessionId }
//   200 { verification: { id, revision, sections, score, mandatoryFixes }, charged,
//         currentStep, attempts, softIssues }
//   400 VALIDATION_FAILED (요청 형식)
//   403 NO_ENTITLEMENT { tenantReason? }
//   404 SESSION_NOT_FOUND
//   409 SESSION_NOT_OPEN, STEP_ORDER { currentStep }, QUOTA_EXHAUSTED { tenantReason? }, STEP_RUNNING,
//       STEP_SUPERSEDED, ATTEMPTS_EXHAUSTED { terminal }
//   422 STEP_VALIDATION_FAILED { attempts, issues, terminal?, reversed? }
//   502 MODEL_UPSTREAM_FAILED, 504 STEP_TIMEOUT, 500 STEP_FATAL
//   실패 problem 의 reversed true 는 이번 실패로 차감한 이용권을 되돌렸다는 뜻이다(명세 No.16, No.81).
//   세션은 in_progress 로 남고 같은 요청을 다시 보낼 수 있다. 되돌린 뒤 성공하면 다시 차감한다.
//
// 핸들러 본문은 DB 에 묶여 단위 테스트는 단계 함수를 가짜로 바꾼다. 규칙은 api/_lib/selfeval/steps/verify.ts 에서 검증한다.

import type { z } from "zod";
import { SELFEVAL_ERROR } from "../../../shared/selfeval/contract.js";
import type { verifyResponse } from "../../../shared/selfeval/verify.js";
import { verifyBody } from "../../../shared/selfeval/verify.js";
import { startEarly } from "../../../src/lib/concurrency/startEarly.js";
import { callStructured } from "../../_lib/ai/gemini.js";
import { userFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed } from "../../_lib/hono/problem.js";
import { user } from "../../_lib/hono/user.js";
import { validate } from "../../_lib/hono/validate.js";
import { selfevalProblem } from "../../_lib/selfeval/access.js";
import { loadReports, loadSession } from "../../_lib/selfeval/db.js";
import {
  assertSessionOpen,
  outcomeBody,
} from "../../_lib/selfeval/stepResponse.js";
import { runVerify } from "../../_lib/selfeval/steps/verify.js";

const guard = user({
  unhandledMessage: "자기평가서 검증에 실패했습니다.",
  logLabel: "selfeval/verify",
  headers: { "Cache-Control": "no-store" },
});

export const verify = userFactory
  .createApp()
  .post("/", guard, validate("json", verifyBody), async (c) => {
    const startedAt = Date.now();
    const { sessionId } = c.req.valid("json");
    const { supabaseAdmin: db, user: me } = c.var;
    // 리포트 읽기는 세션 읽기와 함께 시작한다. 404 와 닫힌 세션 판정이 먼저 응답을 정한다.
    const reportsRead = startEarly(loadReports(db, me.id, sessionId));
    const session = await loadSession(db, me.id, sessionId);
    if (session === null) {
      throw selfevalProblem(
        404,
        SELFEVAL_ERROR.SESSION_NOT_FOUND,
        "자기평가서 세션을 찾을 수 없어요.",
      );
    }
    assertSessionOpen(session, false);
    const out = await runVerify(db, me.id, session, await reportsRead, {
      callStructured,
      now: () => new Date().toISOString(),
      startedAt,
    });
    return c.json(
      outcomeBody(
        out,
        (r) =>
          ({
            verification: r.verification,
            charged: r.charged,
            currentStep: r.currentStep,
          }) satisfies Omit<
            z.output<typeof verifyResponse>,
            "attempts" | "softIssues"
          >,
      ),
    );
  })
  .all("/", methodNotAllowed("POST"));
