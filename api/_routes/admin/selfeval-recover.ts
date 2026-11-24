// POST /api/admin/selfeval-recover { sessionId }
// Authorization: Bearer <supabase access token>   (관리자)
//
// 종결(archived + step_state.terminal, 학생 파기 포함)된 세션을 같은 입력 재료로 새로 시작한다.
// 새 세션은 draft 이고 기본 입력과 선택 활동(분석 포함)만 복사한다. 생성, 검증 리포트와
// 차감 이력은 가져오지 않는다. 원본은 그대로 두고 step_state.recoveredTo 에 새 세션 id 만 남긴다.
//
// 차감: 종결 때 원본의 차감은 이미 되돌려졌다. 새 세션은 ledger_id 가 없어 다음 모델 호출
// 단계 성공 시점에 다시 차감된다. 복구 자체는 차감하지 않는다.
//
// 권한: 메뉴 selfevalSessions(POST edit).
//
// 응답 200 { newSessionId }
// 오류(problem): 400 VALIDATION_FAILED, 400 INVALID_BODY, 404 SESSION_NOT_FOUND, 409 NOT_RECOVERABLE,
//   409 ALREADY_RECOVERED, 409 SESSION_OPEN, 401/403 인증, 405, 500
//
// 원본 표시 update 가 0행이면(그 사이 원본이 바뀜) 새 세션을 지우고 409 NOT_RECOVERABLE 로 끝낸다.
// 판정과 복제는 판정과 복제는 api/_lib/selfeval/ops/recover.ts.

import { z } from "zod";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import {
  canRecover,
  cloneActivitiesForRecovery,
  cloneSessionForRecovery,
  type RecoverActivityRow,
  type RecoverSourceRow,
  validateRecoverBody,
} from "../../_lib/selfeval/ops/recover.js";

const PG_UNIQUE_VIOLATION = "23505";

const SOURCE_COLUMNS =
  "id, profile_id, status, current_step, academic_year, grade_label, semester, area, subject, activity_name, school_prompt, teacher_note, target_chars, target_chars_mode, career, growth_report_id, growth_applied, growth_snapshot, plan_item_id, step_state";

const bodySchema = z.object({ sessionId: z.string() });

const NOT_RECOVERABLE_MESSAGE =
  "복구할 수 없는 세션입니다. 종결된 세션만 복구할 수 있습니다.";

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "selfevalSessions" },
  unhandledMessage: "자기평가서 세션 복구에 실패했습니다.",
  logLabel: "admin/selfeval-recover",
  headers: { "Cache-Control": "no-store" },
  body: bodySchema,
  handler: async (_req, res, ctx) => {
    const parsed = validateRecoverBody(ctx.body);
    if (!parsed.ok) {
      sendError(res, "problem", 400, parsed.reason, "INVALID_BODY");
      return;
    }
    const db = ctx.supabaseAdmin;

    const { data: source, error: sourceError } = await db
      .from("selfeval_sessions")
      .select(SOURCE_COLUMNS)
      .eq("id", parsed.sessionId)
      .maybeSingle();
    if (sourceError)
      throw new Error(`selfeval_sessions 조회 실패: ${sourceError.message}`);
    if (!source) {
      sendError(
        res,
        "problem",
        404,
        "세션을 찾을 수 없습니다.",
        "SESSION_NOT_FOUND",
      );
      return;
    }
    const row = source as RecoverSourceRow;

    const verdict = canRecover(row);
    if (!verdict.ok) {
      const message =
        verdict.code === "ALREADY_RECOVERED"
          ? "이미 복구한 세션입니다."
          : NOT_RECOVERABLE_MESSAGE;
      sendError(res, "problem", 409, message, verdict.code);
      return;
    }

    const openMessage = "이 학생에게 진행 중인 세션이 있어 복구할 수 없습니다.";
    const { data: open, error: openError } = await db
      .from("selfeval_sessions")
      .select("id")
      .eq("profile_id", row.profile_id)
      .in("status", ["draft", "in_progress"])
      .limit(1);
    if (openError) throw new Error(`미완 세션 조회 실패: ${openError.message}`);
    if ((open ?? []).length > 0) {
      sendError(res, "problem", 409, openMessage, "SESSION_OPEN");
      return;
    }

    const { data: activities, error: activityError } = await db
      .from("selfeval_session_activities")
      .select(
        "activity_record_id, role, fit_score, fit_reasons, analysis, analysis_source",
      )
      .eq("session_id", row.id);
    if (activityError)
      throw new Error(`선택 활동 조회 실패: ${activityError.message}`);

    const nowIso = new Date().toISOString();
    const { data: created, error: insertError } = await db
      .from("selfeval_sessions")
      .insert(cloneSessionForRecovery(row, nowIso))
      .select("id")
      .single();
    if (insertError) {
      // 위 확인과 insert 사이에 학생이 세션을 만든 경우(학생당 미완 1개 부분 유니크).
      if (insertError.code === PG_UNIQUE_VIOLATION) {
        sendError(res, "problem", 409, openMessage, "SESSION_OPEN");
        return;
      }
      throw new Error(`복구 세션 생성 실패: ${insertError.message}`);
    }

    const copies = cloneActivitiesForRecovery(
      (activities ?? []) as RecoverActivityRow[],
      created.id,
      row.profile_id,
    );
    if (copies.length > 0) {
      const { error: copyError } = await db
        .from("selfeval_session_activities")
        .insert(copies);
      if (copyError) {
        // 활동이 빠진 draft 가 남으면 학생이 2단계에서 막히므로 새 세션을 되돌린다.
        await db.from("selfeval_sessions").delete().eq("id", created.id);
        throw new Error(`선택 활동 복제 실패: ${copyError.message}`);
      }
    }

    const state =
      row.step_state && typeof row.step_state === "object"
        ? row.step_state
        : {};
    const { data: marked, error: markError } = await db
      .from("selfeval_sessions")
      .update({ step_state: { ...state, recoveredTo: created.id } })
      .eq("id", row.id)
      .eq("status", "archived")
      .select("id");
    if (markError)
      throw new Error(`원본 recoveredTo 기록 실패: ${markError.message}`);
    if ((marked ?? []).length === 0) {
      // 원본이 그 사이 바뀌어 표시가 안 됐다. 새 세션을 남기면 학생의 미완 세션 자리를 막는다.
      await db.from("selfeval_sessions").delete().eq("id", created.id);
      sendError(
        res,
        "problem",
        409,
        NOT_RECOVERABLE_MESSAGE,
        "NOT_RECOVERABLE",
      );
      return;
    }

    res.status(200).json({ newSessionId: created.id });
  },
});

export const config = { runtime: "nodejs" };
