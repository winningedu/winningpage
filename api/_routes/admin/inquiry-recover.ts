// /api/admin/inquiry-recover. 관리자 앱(api/_routes/admin/app.ts)이 .route("/inquiry-recover", inquiryRecover) 로 붙인다.
// 요청 검증과 응답 모양은 shared/inquiry-ops/contract.ts 를 따른다.
//
// POST /api/admin/inquiry-recover { sessionId }
// Authorization: Bearer <supabase access token>   (관리자)
//
// 종결(archived + generation_state.terminal)된 세션을 같은 입력 재료로 새로 시작한다.
// 새 세션은 draft, current_step 1 이고 정보 입력 값과 자산만 복사한다. 주제, 설계, 작성본은
// 복사하지 않아 학생이 주제 추천부터 다시 한다. 원본은 그대로 두고 generation_state.recoveredTo 에
// 새 세션 id 만 남긴다.
//
// 차감: 종결 때 원본의 차감은 이미 되돌려졌다. 새 세션은 ledger_id 가 없는 draft 라 첫 주제
// 추천 성공 시점에 다시 차감된다. 복구 자체는 차감하지 않는다.
//
// 응답 200 { newSessionId }
// 오류(problem): 400 VALIDATION_FAILED(모양, 정의되지 않은 키), 400 INVALID_BODY(값 규칙), 404 SESSION_NOT_FOUND, 409 NOT_RECOVERABLE,
//   409 ALREADY_RECOVERED, 409 OPEN_SESSION_EXISTS, 401/403 인증, 405, 500 INTERNAL_ERROR
// 원본 기록이 0행이면(확인 뒤 상태가 바뀜) 만든 세션을 지우고 409 NOT_RECOVERABLE 이다.
// 권한: 메뉴 inquirySessions edit.
//
// 판정과 복제는 api/_lib/inquiry/ops/recover.ts.

import {
  INQUIRY_OPS_ERROR,
  type InquiryRecoverResult,
  inquiryRecoverBody,
} from "../../../shared/inquiry-ops/contract.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, ProblemError } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  planRecovery,
  type RecoverAssetRow,
  type RecoverSourceRow,
  validateRecoverBody,
} from "../../_lib/inquiry/ops/recover.js";

const PG_UNIQUE_VIOLATION = "23505";

const SOURCE_COLUMNS =
  "id, profile_id, status, grade_label, semester, career, area, subject, activity_name, growth_report_id, plan_item_id, generation_state";
const ASSET_COLUMNS =
  "kind, reliability, position, activity_record_id, interview_answers, gaps, oneline_text";

const guard = admin({
  permission: { key: "inquirySessions" },
  // 종결된 원본 세션을 고치는 복구라 수정으로 남긴다.
  audit: { action: "update" },
  unhandledMessage: "심화탐구 세션 복구에 실패했습니다.",
  logLabel: "admin/inquiry-recover",
});

export const inquiryRecover = adminFactory
  .createApp()
  // 모양만 거르고 값 규칙과 한국어 사유는 validateRecoverBody 가 맡는다.
  .post("/", guard, validate("json", inquiryRecoverBody), async (c) => {
    const parsed = validateRecoverBody(c.req.valid("json"));
    if (!parsed.ok) {
      throw new ProblemError(
        400,
        parsed.reason,
        INQUIRY_OPS_ERROR.INVALID_BODY,
      );
    }
    const db = c.var.supabaseAdmin;

    const { data: source, error: sourceError } = await db
      .from("inquiry_sessions")
      .select(SOURCE_COLUMNS)
      .eq("id", parsed.sessionId)
      .maybeSingle();
    if (sourceError)
      throw new Error(`inquiry_sessions 조회 실패: ${sourceError.message}`);
    if (!source) {
      throw new ProblemError(
        404,
        "세션을 찾을 수 없습니다.",
        INQUIRY_OPS_ERROR.SESSION_NOT_FOUND,
      );
    }
    const row = source as RecoverSourceRow;

    const openMessage = "이 학생에게 진행 중인 세션이 있어 복구할 수 없습니다.";
    // 자산 읽기와 미완 세션 확인은 서로 기다릴 필요가 없다. 오류는 확인 순서대로 본다.
    const [{ data: assetData, error: assetError }, openRead] =
      await Promise.all([
        db
          .from("inquiry_assets")
          .select(ASSET_COLUMNS)
          .eq("session_id", row.id)
          .order("position", { ascending: true }),
        db
          .from("inquiry_sessions")
          .select("id")
          .eq("profile_id", row.profile_id)
          .in("status", ["draft", "in_progress"])
          .limit(1),
      ]);
    if (assetError)
      throw new Error(`inquiry_assets 조회 실패: ${assetError.message}`);

    const nowIso = new Date().toISOString();
    const plan = planRecovery(
      row,
      (assetData ?? []) as RecoverAssetRow[],
      nowIso,
    );
    if (!plan.ok) {
      const message =
        plan.code === "ALREADY_RECOVERED"
          ? "이미 복구한 세션입니다."
          : "복구할 수 없는 세션입니다. 종결된 세션만 복구할 수 있습니다.";
      throw new ProblemError(409, message, plan.code);
    }

    const { data: open, error: openError } = openRead;
    if (openError) throw new Error(`미완 세션 조회 실패: ${openError.message}`);
    if ((open ?? []).length > 0) {
      throw new ProblemError(
        409,
        openMessage,
        INQUIRY_OPS_ERROR.OPEN_SESSION_EXISTS,
      );
    }

    const { data: created, error: insertError } = await db
      .from("inquiry_sessions")
      .insert(plan.session)
      .select("id")
      .single();
    if (insertError) {
      // 위 확인과 insert 사이에 학생이 세션을 만든 경우(학생당 미완 1개 부분 유니크).
      if (insertError.code === PG_UNIQUE_VIOLATION) {
        throw new ProblemError(
          409,
          openMessage,
          INQUIRY_OPS_ERROR.OPEN_SESSION_EXISTS,
        );
      }
      throw new Error(`복구 세션 생성 실패: ${insertError.message}`);
    }

    if (plan.assets.length > 0) {
      const { error: copyError } = await db
        .from("inquiry_assets")
        .insert(plan.assets.map((a) => ({ ...a, session_id: created.id })));
      if (copyError) {
        // 자산 없는 빈 세션이 남지 않도록 방금 만든 세션을 되돌린다.
        await db.from("inquiry_sessions").delete().eq("id", created.id);
        throw new Error(`자산 복사 실패: ${copyError.message}`);
      }
    }

    const state =
      row.generation_state && typeof row.generation_state === "object"
        ? row.generation_state
        : {};
    const { data: marked, error: markError } = await db
      .from("inquiry_sessions")
      .update({ generation_state: { ...state, recoveredTo: created.id } })
      .eq("id", row.id)
      .eq("status", "archived")
      .select("id");
    if (markError)
      throw new Error(`원본 recoveredTo 기록 실패: ${markError.message}`);
    if ((marked ?? []).length === 0) {
      // 확인 뒤 원본이 종결 상태를 벗어났다. 성공으로 답하지 않고 방금 만든 세션을 되돌린다.
      await db.from("inquiry_sessions").delete().eq("id", created.id);
      throw new ProblemError(
        409,
        "복구할 수 없는 세션입니다. 종결된 세션만 복구할 수 있습니다.",
        INQUIRY_OPS_ERROR.NOT_RECOVERABLE,
      );
    }

    return c.json({ newSessionId: created.id } satisfies InquiryRecoverResult);
  })
  .all("/", methodNotAllowed("POST"));
