// POST /api/selfeval/finalize
// Authorization: Bearer <access_token>
//
// 최종 저장(계획서 §2 9, 명세 No.63, No.75, No.132). 최종본(final) 리포트 저장, 활동 기록 승격,
// 세션 완료를 DB 한 트랜잭션으로 한다. 이미 완료된 세션의 재요청은 같은 결과를 돌려준다(멱등).
// 요청, 응답 계약은 shared/selfeval/finalize.ts 다.
//
// 요청  { sessionId, promoted: { topic, concept, method, result, limitation, numbers: string[],
//         sources: string[] }, fulfillsPlanItem?: boolean(기본 true), acknowledgeMandatory?: boolean(기본 false) }
//   200 { activityRecordId, finalRevision, reply: { status, code? }, currentStep: 6 }
//       reply.status 는 "sent"(성장설계에 회신함), "skipped"(연결된 항목이 없거나 이행하지
//       않음), "failed"(회신 실패, 저장은 유효하고 다음 진입 때 다시 보낸다, code 가 실린다).
//   400 VALIDATION_FAILED (요청 형식), PROMOTED_INVALID (승격 7항목)
//   404 SESSION_NOT_FOUND
//   409 SESSION_NOT_OPEN(archived), STEP_ORDER { currentStep }, VERIFICATION_MISSING,
//       VERIFICATION_STALE(검증 뒤 본문이 바뀜), NOT_SUBMITTABLE(필수 수정이 남음)
//
// 핸들러 본문은 DB 에 묶여 단위 테스트는 단계 함수를 가짜로 바꾼다. 규칙은 api/_lib/selfeval/steps/finalize.ts 에서 검증한다.

import { SELFEVAL_ERROR } from "../../../shared/selfeval/contract.js";
import {
  finalizeBody,
  promotedRecord,
} from "../../../shared/selfeval/finalize.js";
import { completePlanItemFromProgram } from "../../_lib/growth/plan/complete.js";
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
import { runFinalize } from "../../_lib/selfeval/steps/finalize.js";

const guard = user({
  unhandledMessage: "자기평가서 저장에 실패했습니다.",
  logLabel: "selfeval/finalize",
  headers: { "Cache-Control": "no-store" },
});

export const finalize = userFactory
  .createApp()
  .post("/", guard, validate("json", finalizeBody), async (c) => {
    const body = c.req.valid("json");
    const { supabaseAdmin: db, user: me } = c.var;
    // 승격 7항목은 요청 형식과 달리 학생이 고칠 수 있는 입력이라 코드와 문구를 따로 둔다.
    const promoted = promotedRecord.safeParse(body.promoted);
    if (!promoted.success) {
      throw selfevalProblem(
        400,
        "PROMOTED_INVALID",
        "활동 기록으로 남길 7항목을 확인해 주세요.",
      );
    }
    const session = await loadSession(db, me.id, body.sessionId);
    if (session === null) {
      throw selfevalProblem(
        404,
        SELFEVAL_ERROR.SESSION_NOT_FOUND,
        "자기평가서 세션을 찾을 수 없어요.",
      );
    }
    assertSessionOpen(session, true);
    const out = await runFinalize(
      db,
      me.id,
      session,
      await loadReports(db, me.id, session.id),
      {
        sessionId: body.sessionId,
        promoted: promoted.data,
        fulfillsPlanItem: body.fulfillsPlanItem,
        acknowledgeMandatory: body.acknowledgeMandatory,
      },
      {
        complete: completePlanItemFromProgram,
        now: () => new Date().toISOString(),
      },
    );
    return c.json(
      outcomeBody(out, (r) => ({
        activityRecordId: r.activityRecordId,
        finalRevision: r.finalRevision,
        reply: r.reply,
        currentStep: r.currentStep,
      })),
    );
  })
  .all("/", methodNotAllowed("POST"));
