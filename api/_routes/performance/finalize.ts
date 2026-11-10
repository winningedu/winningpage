// POST /api/performance/finalize
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { sessionId, submissionId, action:'confirm'|'new_assessment' }
//   → 200 { submission{isFinal,finalizedAt,finalizeReason}, nextSessionId? }
//        — **이미 확정된 세션이면 동일 200(멱등)**
//   → 400 NO_EVALUATION_YET / 409 ALREADY_FINALIZED_OTHER
//   계약 표에 없는 추가분(형제 라우트 관례를 그대로 따른 것):
//   → 400 INVALID_SESSION_ID / INVALID_SUBMISSION_ID / INVALID_ACTION
//   → 401 UNAUTHENTICATED  → 403 NO_ENTITLEMENT / NOT_SESSION_OWNER
//   → 404 SUBMISSION_NOT_IN_SESSION
//   **이 파일에는 차감 코드가 없다**(§9.3 — 차감 지점은 recommend-topics 1곳뿐).
//
// ─────────────────────────────────────────────────────────────────────
// 1. 3분기 확정 의미론 (§12.2 「평가 후 3분기 확정 의미론」 — 정본)
// ─────────────────────────────────────────────────────────────────────
// 「**'확정짓기'와 '추가 수행평가 진행하기' 둘 다 마지막 제출본을 최종본으로 확정
//   저장한다. '추가 평가 받기'만 확정 없이 폼을 복원한다**」 — 시안이 말해주지 않는
// 제품 규칙이라 외부 구현(`index.html:2493-2506`, `api/finalize-submission.js:59-71`)이
// 유일한 정본이다. 그래서
//   · `이대로 확정짓기`        → 이 엔드포인트, `action:'confirm'`
//   · `추가 수행평가 진행하기` → 이 엔드포인트, `action:'new_assessment'`
//   · `추가 평가 받기`         → **이 엔드포인트를 부르지 않는다.** 폼 복원(프론트) 뒤
//                                `PUT /api/performance/submission`이 새 revision을 연다.
// `action` 값은 그대로 `performance_submissions.finalize_reason`에 들어간다(외부 승계).
//
// ─────────────────────────────────────────────────────────────────────
// 2. 멱등 — 외부는 조건 없는 insert라 중복 행이 쌓였다
// ─────────────────────────────────────────────────────────────────────
// 외부 `api/finalize-submission.js:46-72`는 `saveAssessmentReport`를 무조건 insert해서
// 재시도·다중 탭·더블클릭마다 `final_submission` 행이 하나씩 늘었다(§8.3). 여기서는
// 세 겹으로 막는다(sql/58 (5) 주석에 같은 표가 있다):
//   ① `performance_submissions_one_final_per_session_idx`(sql/54 1-6) 부분 UNIQUE —
//      세션당 `is_final` 행은 **물리적으로** 1개를 넘을 수 없다.
//   ② 같은 제출본 재확정 → RPC가 `already_final`을 돌려주고 **아무것도 바꾸지 않는다**
//      → 여기서 200(§8.6 「이미 확정된 세션이면 동일 200(멱등)」). `finalized_at`·
//      `finalize_reason`을 덮어쓰지 않는 것이 핵심이다 — 최초 확정이 정본이다.
//   ③ **다른** 제출본이 이미 확정 → `409 ALREADY_FINALIZED_OTHER`.
//   그리고 RPC가 대상 행을 `for update`로 잠그므로 두 탭이 동시에 들어와도 뒤늦은 쪽이
//   23505(500)가 아니라 ②·③으로 **정상 분기**한다.
//
// ── Q67 결정: 확정 후에도 재평가를 허용하되 최종본은 1건만 고정한다
//    근거는 §12.2가 기술한 외부 의미론(확정 뒤에도 `추가 평가 받기`가 살아 있다)과
//    §8.3의 `unique (session_id) where is_final`이 이미 그 모델을 전제한다는 것이다.
//    세션을 잠그면 오확정을 되돌릴 수 없고, 같은 세션은 이미 차감돼 재평가가 무료다.
//    그래서 이 파일도 sql/58 (5)도 **세션을 잠그지 않는다** — `status='completed'`는
//    재방문 재개 후보에서 빠진다는 뜻일 뿐이고, `submission.js`·`evaluate.js` 어느
//    쪽도 `status`를 게이트로 쓰지 않는다.
//    ⚠ 그 대가로 **최종본 포인터는 움직이지 않는다.** 확정 뒤 새 revision을 평가받고
//      그것을 다시 확정하려 하면 ③ 409다. §8.6이 `ALREADY_FINALIZED_OTHER`를 정의해
//      둔 것이 그 상태이며, 최종본을 옮기는 동작은 명세 어디에도 계약이 없다(옮기려면
//      먼저 해제하는 엔드포인트가 있어야 하는데 §8.6에 없다). 응답에 확정된
//      `finalSubmissionId`를 실어 화면이 "이미 확정된 제출본"을 가리킬 수 있게 한다.
//
// ─────────────────────────────────────────────────────────────────────
// 3. `nextSessionId` — 새 세션에 회차가 새로 드는가
// ─────────────────────────────────────────────────────────────────────
// §9.3 표: 「`추가 수행평가 진행하기` | 신규 세션 → **다음 주제 추천 성공 시 1회 차감**」.
// 즉 세션을 만드는 것 자체는 무차감이고(`session.js` POST create와 같다), 차감은 그
// 세션에서 `recommend-topics`가 처음 성공할 때 `consume_performance_credit`이 한다.
// 「1회 = 수행평가 세션 1건」(§9.2)이 그대로 유지된다 — 이 파일은 회차를 건드리지 않는다.
//
// 새 세션은 `session.js`의 create와 같은 제약을 받는다: **미차감 세션 동시 1개**
// (§9.3 무료 vision 게이트 차단). 그래서 여기서는 먼저 미차감 세션을 찾아
//   · 있으면 그 id를 `nextSessionId`로 돌려주고(= `409 UNCHARGED_SESSION_EXISTS`가
//     클라이언트에게 시키려던 "이어받기"를 서버가 대신 해 준다),
//   · 없으면 빈 draft를 새로 만든다(STEP1부터 다시 — 외부도 `showWelcome()`으로
//     처음부터 시작한다, `index.html:2634-2640`).
// **확정이 이미 성공한 뒤이므로 이 단계 실패로 요청 전체를 실패시키지 않는다.**
// 실패하면 `nextSessionId:null`로 돌려주고 클라이언트가 `POST /api/performance/session`
// 으로 이어가면 된다(아래 「실패 경로별 잔여 상태」).

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { resolveSessionSubmissionSchema } from "../../_lib/performance/submission-schema.js";
import { chargedPerformanceSessionIds } from "../../_lib/performance/tenantCredit.js";
import {
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "../../_lib/serviceAccess.js";
import type { createSupabaseAdmin } from "../../_lib/supabaseAdmin.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

const SERVICE_KEY = "suhaeng";

const FINALIZE_ACTIONS = new Set(["confirm", "new_assessment"]);

/** 미차감 후보로 볼 상태. `session.js`의 `UNCHARGED_CANDIDATE_STATUSES`와 같은 축이다. */
const UNCHARGED_CANDIDATE_STATUSES = ["draft", "in_progress"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COLUMNS = [
  "id",
  "profile_id",
  "status",
  "guide_input_mode",
  "guide_freetext",
  "guide_json",
  "submission_schema",
  "selected_topic_id",
].join(",");

type SessionRow = {
  id: string;
  profile_id: string;
  status: string;
  guide_input_mode?: string;
  guide_freetext?: string;
  guide_json?: { mode?: string; text?: string };
  submission_schema?: NonNullable<
    Parameters<typeof resolveSessionSubmissionSchema>[0]
  >["submission_schema"];
  selected_topic_id: string | null;
};

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

const trimmed = (value: unknown) => String(value ?? "").trim();

/**
 * 최종 제출 리포트 본문 — **학생이 쓴 필드를 서버가 섹션으로 편 것**이다.
 *
 * 왜 리포트 행을 만드는가: §8.3 `report_type`이 `final_submission`을 3종에 포함하고,
 * 시안 `3754:3121` 칩이 설계/평가/**최종** 3종이며, §8.6 저장 리포트 상세 계약이
 * 「`performance_reports.sections` 단일 필드」다. 최종 제출본을 그 계약으로 열려면
 * 리포트 행이 있어야 한다. 외부도 finalize에서 `final_submission` 행을 저장했다
 * (`api/finalize-submission.js:46-72`) — 다른 점은 `report_content`/`submission_text`/
 * `evaluation_result` 3필드 폴백(§8.6 「계약이 없어 폐기」)이 아니라 `sections` 하나로
 * 정규화됐다는 것뿐이다.
 *
 * 모델 산출물이 아니므로 `score`/`summary`는 null이다(sql/58 (5)).
 * 라벨은 제출 스키마(서버 소유)가 정하고, 값은 학생 원고를 **가공 없이** 옮긴다 —
 * 여기서 요약·정규화를 하면 "최종본"이 학생이 낸 글과 달라진다.
 */
function buildFinalSections({
  schema,
  fields,
  topicTitle,
}: {
  schema: ReturnType<typeof resolveSessionSubmissionSchema>["schema"];
  fields: unknown;
  topicTitle: string;
}) {
  const source = (fields && typeof fields === "object" ? fields : {}) as Record<
    string,
    unknown
  >;
  const sections: Array<{ id: string; label: string; text: string }> = [];

  if (trimmed(topicTitle)) {
    // 외부는 리포트 `title`을 `${topic} 최종 수행평가`로 저장했는데(`:50`) 우리
    // `performance_reports`에는 title 컬럼이 없다. 주제를 잃지 않도록 첫 섹션으로 남긴다.
    sections.push({ id: "topic", label: "주제", text: trimmed(topicTitle) });
  }

  for (const field of schema.fields) {
    const value = String(source[field.key] ?? "");
    if (!value.trim()) continue;
    sections.push({ id: field.key, label: field.label, text: value });
  }

  return sections;
}

/**
 * `action:'new_assessment'`용 다음 세션. 위 「nextSessionId」 주석의 규칙을 그대로 실행한다.
 * 미차감 세션이 이미 있으면 만들지 않고 그것을 돌려준다(§9.3 동시 1개 제한).
 */
async function resolveNextSession(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
) {
  const { data: candidates, error: candidateError } = await supabaseAdmin
    .from("performance_sessions")
    .select("id,updated_at")
    .eq("profile_id", userId)
    .in("status", UNCHARGED_CANDIDATE_STATUSES)
    .order("updated_at", { ascending: false });

  if (candidateError)
    throw new Error(`세션 조회 실패: ${candidateError.message}`);

  const rows = candidates || [];
  if (rows.length) {
    // PostgREST에 anti-join이 없어 후보를 먼저 뽑고 센 세션 id를 뺀다
    // (`session.js findUnchargedSession` / `bootstrap.js`와 동일 패턴).
    const chargedIds = await chargedPerformanceSessionIds(
      supabaseAdmin,
      userId,
      rows.map((row) => row.id),
    );
    const reusable = rows.find((row) => !chargedIds.has(row.id));

    if (reusable) return { sessionId: reusable.id, created: false };
  }

  // school_type — 요청 바디를 읽지 않는다. `profiles` 스냅샷만 신뢰한다(Q61-ⓔ,
  // `session.js`와 동일). 값이 없으면 null이고 프롬프트는 `미입력`을 렌더한다.
  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("school_type")
    .eq("id", userId)
    .maybeSingle();

  if (profileError)
    throw new Error(`프로필 조회 실패: ${profileError.message}`);

  const { data: created, error: insertError } = await supabaseAdmin
    .from("performance_sessions")
    .insert({
      profile_id: userId,
      school_type: profileRow?.school_type || null,
      status: "draft",
      current_step: 1,
      completed_steps: [],
    })
    .select("id")
    .single();

  if (insertError) throw new Error(`세션 생성 실패: ${insertError.message}`);

  return { sessionId: created.id, created: true };
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "최종본 저장에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/finalize",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);

    // ── 이용권 재판정(§8.6 공통 규약). 잔여 회차는 보지 않는다(§9.3 정정).
    const { allowed: hasAccess, reason: accessReason } =
      await hasPaidServiceAccess(
        supabaseAdmin,
        userId,
        // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
        SERVICE_CONFIGS[SERVICE_KEY]!,
      );
    if (!hasAccess) {
      return fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
        tenantReasonExtra(accessReason),
      );
    }

    // 아래 본문 처리 중 던져지는 예외는 원래(마이그레이션 전)와 동일하게
    // `{charged:false}` extra를 실은 채 500으로 응답해야 한다 — 공통
    // defineHandler 최상위 catch는 그 extra를 모른다(고정 unhandledMessage/
    // unhandledCode만 보냄). 그래서 이 지점부터는 로컬 try/catch로 감싸
    // 기존 catch 블록의 동작을 그대로 재현한다(배치-2 이슈로 별도 기록).
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const sessionId =
        typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const submissionId =
        typeof body.submissionId === "string" ? body.submissionId.trim() : "";
      const action =
        typeof body.action === "string" ? body.action.trim() : "confirm";

      if (!UUID_RE.test(sessionId)) {
        return fail(
          res,
          400,
          "INVALID_SESSION_ID",
          "sessionId가 올바르지 않습니다.",
          { charged: false },
        );
      }
      if (!UUID_RE.test(submissionId)) {
        return fail(
          res,
          400,
          "INVALID_SUBMISSION_ID",
          "submissionId가 올바르지 않습니다.",
          { charged: false },
        );
      }
      if (!FINALIZE_ACTIONS.has(action)) {
        return fail(
          res,
          400,
          "INVALID_ACTION",
          "action은 'confirm' 또는 'new_assessment'여야 합니다.",
          {
            charged: false,
          },
        );
      }

      // ── 세션 소유권. 없는 세션과 남의 세션을 같은 응답으로 묶는다.
      const { data: sessionRow, error: sessionError } = await supabaseAdmin
        .from("performance_sessions")
        .select(SESSION_COLUMNS)
        .eq("id", sessionId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (sessionError)
        throw new Error(`세션 조회 실패: ${sessionError.message}`);
      if (!sessionRow) {
        return fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.", {
          charged: false,
        });
      }

      // `SESSION_COLUMNS`가 런타임 조립 문자열이라 supabase-js가 리터럴 파싱 기반
      // 열 추론을 못 하고 `GenericStringError`로 떨어진다 — select 목록과 SessionRow
      // 필드는 위 상수와 정확히 대응하므로 안전한 캐스트다.
      const session = sessionRow as unknown as SessionRow;

      // ── 제출본 소유권. **세션 id로 묶어서** 조회하므로 남의 제출본 id는 행이 나오지 않는다.
      const { data: submissionRow, error: submissionError } =
        await supabaseAdmin
          .from("performance_submissions")
          .select(
            "id,revision,fields,is_draft,is_final,finalized_at,finalize_reason,submitted_at",
          )
          .eq("id", submissionId)
          .eq("session_id", session.id)
          .maybeSingle();

      if (submissionError)
        throw new Error(`제출본 조회 실패: ${submissionError.message}`);
      if (!submissionRow) {
        return fail(
          res,
          404,
          "SUBMISSION_NOT_IN_SESSION",
          "이 수행평가의 제출물이 아니에요.",
          {
            charged: false,
          },
        );
      }

      // ── 확정 주제(최종 리포트 첫 섹션). 없으면 그 섹션만 빠진다.
      let topicTitle = "";
      if (session.selected_topic_id) {
        const { data: topicRow, error: topicError } = await supabaseAdmin
          .from("performance_topics")
          .select("title")
          .eq("id", session.selected_topic_id)
          .eq("session_id", session.id)
          .maybeSingle();

        if (topicError)
          throw new Error(`주제 조회 실패: ${topicError.message}`);
        topicTitle = trimmed(topicRow?.title);
      }

      // session은 SubmissionSession이 실제로 읽는 필드를 전부 포함하는 DB 행이다.
      const { schema } = resolveSessionSubmissionSchema(
        session as Parameters<typeof resolveSessionSubmissionSchema>[0],
      );
      const sections = buildFinalSections({
        schema,
        fields: submissionRow.fields,
        topicTitle,
      });

      // ─────────────────────────────────────────────────────────────────
      // 커밋 — 최종본 고정 + 최종 리포트 저장 + 세션 종료 + rag_use 승격이
      // **한 트랜잭션**이다(sql/58 (5)). 평가 선행 조건(`NO_EVALUATION_YET`)도
      // 그 안에서 판정한다 — 핸들러가 미리 조회해 판정하면 그 사이에 평가 리포트가
      // 다른 제출본으로 덮어써질 수 있다(재평가 동시 진행).
      // ─────────────────────────────────────────────────────────────────
      const { data: commitRaw, error: commitError } = await supabaseAdmin.rpc(
        "finalize_performance_submission",
        {
          p_session_id: session.id,
          p_profile_id: userId,
          p_submission_id: submissionRow.id,
          p_reason: action,
          p_sections: { v: 1, type: "final_submission", sections },
        },
      );

      if (commitError) {
        console.error("performance/finalize 커밋 RPC 실패:", commitError);
        return fail(res, 500, "INTERNAL", "최종본 저장에 실패했습니다.", {
          charged: false,
        });
      }

      const commit = (
        commitRaw && typeof commitRaw === "object" ? commitRaw : {}
      ) as Record<string, unknown>;
      const commitStatus = String(commit.status || "");

      if (commitStatus === "session_not_found") {
        return fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.", {
          charged: false,
        });
      }
      if (commitStatus === "submission_not_in_session") {
        return fail(
          res,
          404,
          "SUBMISSION_NOT_IN_SESSION",
          "이 수행평가의 제출물이 아니에요.",
          {
            charged: false,
          },
        );
      }
      if (commitStatus === "no_evaluation") {
        // §8.6 `400 NO_EVALUATION_YET`. 평가 리포트가 **이 제출본을 대상으로** 있어야 한다
        // (sql/58 (1) `submission_id`). 다른 revision을 평가한 리포트로는 확정할 수 없다.
        return fail(
          res,
          400,
          "NO_EVALUATION_YET",
          "평가 리포트를 먼저 받아 주세요.",
          {
            charged: false,
          },
        );
      }
      if (commitStatus === "already_finalized_other") {
        // §8.6 `409 ALREADY_FINALIZED_OTHER`. Q67 결정의 뒷부분 — 최종본은 1건만 고정된다.
        return fail(
          res,
          409,
          "ALREADY_FINALIZED_OTHER",
          "이미 다른 제출본을 최종본으로 확정했어요.",
          {
            finalSubmissionId: commit.submission_id ?? null,
            charged: false,
          },
        );
      }
      if (commitStatus !== "finalized" && commitStatus !== "already_final") {
        console.error(
          "performance/finalize 알 수 없는 커밋 상태:",
          commitStatus,
        );
        return fail(res, 500, "INTERNAL", "최종본 저장에 실패했습니다.", {
          charged: false,
        });
      }

      // ── `추가 수행평가 진행하기`의 다음 세션. **확정은 이미 성립했으므로** 여기서
      //    실패해도 요청 전체를 실패시키지 않는다(위 「nextSessionId」 주석).
      let nextSessionId: string | null = null;
      let nextSessionCreated = false;

      if (action === "new_assessment") {
        try {
          const next = await resolveNextSession(supabaseAdmin, userId);
          nextSessionId = next.sessionId;
          nextSessionCreated = next.created;
        } catch (nextError) {
          console.error(
            "performance/finalize 다음 세션 준비 실패(확정은 성립):",
            nextError,
          );
        }
      }

      res.status(200).json({
        submission: {
          submissionId: submissionRow.id,
          revision: commit.revision ?? submissionRow.revision,
          isFinal: true,
          finalizedAt: commit.finalized_at ?? null,
          finalizeReason: commit.finalize_reason ?? action,
        },
        finalReportId: commit.report_id ?? null,
        // 같은 제출본 재확정(멱등)인지 이번에 확정된 것인지 구분해 화면이 토스트를
        // 두 번 띄우지 않게 한다. 상태코드는 §8.6대로 둘 다 200이다.
        reused: commitStatus === "already_final",
        ...(action === "new_assessment"
          ? { nextSessionId, nextSessionCreated }
          : {}),
        // §9.3 「`추가 수행평가 진행하기` | 신규 세션 → 다음 주제 추천 성공 시 1회 차감」.
        // 이 요청 자체는 무차감이다.
        charged: false,
      });
    } catch (error) {
      // 원 예외 메시지를 응답에 싣지 않는다(§8.6 공통 규약 「실패 응답」).
      console.error("performance/finalize error:", error);
      return fail(res, 500, "INTERNAL", "최종본 저장에 실패했습니다.", {
        charged: false,
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────
// 실패 경로별 잔여 상태 (전부 무차감 — 이 파일에는 차감 코드가 없다)
// ─────────────────────────────────────────────────────────────────────
//   인증/이용권/소유권/action 오류                → 아무것도 안 남음
//   NO_EVALUATION_YET / ALREADY_FINALIZED_OTHER   → 아무것도 안 남음
//        (RPC가 판정 후 즉시 반환한다 — is_final도 리포트도 건드리지 않는다)
//   커밋 RPC 실패(500)                            → 아무것도 안 남음(단일 트랜잭션)
//   확정 성공 + 다음 세션 준비 실패               → **확정은 성립**, nextSessionId:null.
//        클라이언트가 `POST /api/performance/session {action:'create'}`로 이어간다.
//   확정 성공 후 응답 직렬화 중 함수 종료         → 전부 커밋됨.
//        재요청하면 `already_final`로 같은 200이 나온다(멱등 ②).
//
// 실행 시간: 모델을 부르지 않으므로 `maxDuration`을 선언하지 않는다(`submission.js`와 동일).
export const config = { runtime: "nodejs" };
