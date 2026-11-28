// POST /api/selfeval/write
// Authorization: Bearer <access_token>
//
// 본문 생성과 편집(계획서 §2 7, 명세 No.44~52). action 으로 가른다. 요청, 응답 계약은 shared/selfeval/write.ts 다.
//   generate         분석을 바탕으로 본문을 만든다. 성공 뒤 이용권 1회를 차감한다(재생성은 추가 차감 없음).
//   edit             학생이 고친 문단을 저장한다. 문단 수는 고정하지 않고 1개 이상이면 된다.
//   confirm-feeling  확인이 필요한 문장을 학생이 확인했다고 표시한다.
//   repick-evidence  학생이 한 문장의 근거를 선택 기록과 확인한 수기 메모에서 다시 고른다(명세 No.147).
//
// 요청  { sessionId, action: "generate" }
//       { sessionId, action: "edit", paragraphs: string[] }
//       { sessionId, action: "confirm-feeling", sentenceId }
//       { sessionId, action: "repick-evidence", sentenceId, picks: { refId, item }[] }
//   200 { report: { id, revision, sections, charCount }, charged, regenerationsLeft, currentStep,
//         attempts, softIssues }                                       (generate)
//   200 { report: { id, revision, sections, charCount } }              (edit, confirm-feeling, repick-evidence)
//       문장 근거 sections.paragraphs[].sentences[].evidence 는 { sourceType, refId, item, weight }[] 이다.
//       charged false 는 차감하지 못한 것이지 생성 실패가 아니다. 진행은 막지 않는다.
//       softIssues 는 목표 글자 수를 벗어난 사유로, 있어도 본문은 저장된다.
//   400 VALIDATION_FAILED (요청 형식), PARAGRAPH_COUNT
//   403 NO_ENTITLEMENT { tenantReason? }
//   404 SESSION_NOT_FOUND, SENTENCE_NOT_FOUND
//   409 SESSION_NOT_OPEN, STEP_ORDER { currentStep }, CONFLICTS_UNRESOLVED, QUOTA_EXHAUSTED,
//       REGENERATE_EXHAUSTED, STEP_RUNNING, STEP_SUPERSEDED, ATTEMPTS_EXHAUSTED { terminal }
//   422 STEP_VALIDATION_FAILED { attempts, issues, terminal? }
//   502 MODEL_UPSTREAM_FAILED, 504 STEP_TIMEOUT, 500 STEP_FATAL
//
// 핸들러 본문은 DB 에 묶여 단위 테스트는 단계 함수를 가짜로 바꾼다. 규칙은 api/_lib/selfeval/steps/write.ts 에서 검증한다.

import type { z } from "zod";
import { SELFEVAL_ERROR } from "../../../shared/selfeval/contract.js";
import type {
  writeEditResponse,
  writeGenerateResponse,
} from "../../../shared/selfeval/write.js";
import { writeBody } from "../../../shared/selfeval/write.js";
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
import {
  confirmFeelingSentence,
  repickSentenceEvidence,
  runWrite,
  saveEdit,
} from "../../_lib/selfeval/steps/write.js";
import { detailBody } from "../../_lib/selfeval/view.js";

const guard = user({
  unhandledMessage: "자기평가서 본문 처리에 실패했습니다.",
  logLabel: "selfeval/write",
  headers: { "Cache-Control": "no-store" },
});

export const write = userFactory
  .createApp()
  .post("/", guard, validate("json", writeBody), async (c) => {
    const startedAt = Date.now();
    const body = c.req.valid("json");
    const { supabaseAdmin: db, user: me } = c.var;
    // 리포트 읽기는 세션 읽기와 함께 시작한다. 404 와 닫힌 세션 판정이 먼저 응답을 정한다.
    const reportsRead = startEarly(loadReports(db, me.id, body.sessionId));
    const session = await loadSession(db, me.id, body.sessionId);
    if (session === null) {
      throw selfevalProblem(
        404,
        SELFEVAL_ERROR.SESSION_NOT_FOUND,
        "자기평가서 세션을 찾을 수 없어요.",
      );
    }
    assertSessionOpen(session, false);
    const reports = await reportsRead;

    if (body.action === "generate") {
      const out = await runWrite(db, me.id, session, reports, {
        callStructured,
        now: () => new Date().toISOString(),
        startedAt,
      });
      return c.json(
        outcomeBody(
          out,
          (r) =>
            ({
              report: r.report,
              charged: r.charged,
              regenerationsLeft: r.regenerationsLeft,
              currentStep: r.currentStep,
            }) satisfies Omit<
              z.output<typeof writeGenerateResponse>,
              "attempts" | "softIssues"
            >,
        ),
      );
    }

    // 편집과 확인의 기준 본문은 생성본과 편집본 중 나중에 만든 것이다.
    const current = detailBody(session, [], reports).current;
    if (current === null) {
      throw selfevalProblem(409, "STEP_ORDER", "본문을 먼저 생성해 주세요.", {
        currentStep: session.current_step,
      });
    }
    const base = current.sections;
    const out =
      body.action === "edit"
        ? await saveEdit(db, me.id, session, base, body.paragraphs)
        : body.action === "repick-evidence"
          ? await repickSentenceEvidence(
              db,
              me.id,
              session,
              base,
              body.sentenceId,
              body.picks,
            )
          : await confirmFeelingSentence(
              db,
              me.id,
              session,
              base,
              body.sentenceId,
            );
    return c.json(
      outcomeBody(
        out,
        (r) =>
          ({ report: r.report }) satisfies z.output<typeof writeEditResponse>,
      ),
    );
  })
  .all("/", methodNotAllowed("POST"));
