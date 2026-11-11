// GET /api/performance/bootstrap
// Authorization: Bearer <supabase access token>
//
// 수행평가 인앱 셸(`/app/performance`)이 진입 시 **한 번** 호출해 초기 상태를
// 통째로 받아오는 엔드포인트다. 명세서 §8.6 엔드포인트 표의 계약을 따른다:
//
//   200 { profile, entitlement, lastSession|null, latestDraft|null }
//   401 { error: { code:'UNAUTHENTICATED', message } }
//   403 { error: { code:'NO_ENTITLEMENT',  message } }
//   405 { error: { code:'METHOD_NOT_ALLOWED', message } }
//   500 { error: { code:'INTERNAL', message } }
//
// 최상위 키를 정확히 4개로 고정한 것은 스타일이 아니라 계약 준수다. 편의
// 필드를 최상위에 얹기 시작하면 §8.6 표와 실제 응답이 갈라지고, 다음 슬라이스가
// 어느 쪽을 정본으로 읽어야 하는지 알 수 없게 된다. 파생값(재개 지점 등)은
// 전부 `lastSession` 안에 넣는다.
//
// ── 무엇을 대체하는가
//    외부 앱 `POST /api/login`의 두 분기를 함께 대체한다 — SSO 분기(학생 행
//    생성 + `session_id` 발급)와 `{context_only:true}` 분기(직전 기록 조회).
//    **`session_id`를 인증 수단으로 쓰던 방식은 이식하지 않는다.** 그 토큰은
//    만료도 서명도 소유권 검증도 없어서, 한 번 새어 나가면 결제가 환불된 뒤에도
//    영구히 AI 호출이 가능했다(명세서 §2.2 「외부 앱의 판정 공백」). 여기서는
//    Supabase access token만 인증 수단이고, 세션 id는 리소스 ID일 뿐이다.
//
// ── 인증·인가
//    ① Bearer 토큰 → `supabaseAdmin.auth.getUser(token)` (api/_routes/check-service-access.js 선례)
//    ② 이용권 재판정 — `api/_lib/serviceAccess.js`의 `hasPaidServiceAccess`.
//       클라이언트 가드(RequireEntitlement)를 통과했다는 사실은 신뢰하지 않는다.
//       모든 `api/performance/*`가 매 요청 재판정하는 것이 권위다(§8.6 공통 규약).
//    ③ 모든 조회는 `auth.uid()`(= profiles.id) 기준으로만 한다. service_role
//       클라이언트라 RLS가 우회되므로, 소유자 격리는 이 파일의 `.eq('profile_id',
//       userId)` 조건이 유일한 방어선이다. 세션 id를 요청에서 받지 않는 것도
//       같은 이유다 — 받을 게 없으면 IDOR도 없다.
//
// ── 회차 소진은 403이 아니다
//    `quotaRemaining === 0`이어도 **200**으로 통과시킨다(§2.2 / §11.1 Q47).
//    저장 리포트 열람과 이미 차감이 끝난 세션 이어가기는 이미 대가를 지불한
//    산출물이라 진입을 막을 근거가 없다. 403은 "이용권 미보유" 하나뿐이다.
//
// ⚠️ `entitlement.quota*`는 **안내용 스냅샷**이다. 잠금 없이 읽으므로 다른
//    탭·기기가 동시에 차감하면 즉시 낡는다(TOCTOU). 진행 가능 여부의 권위는
//    언제나 `consume_performance_credit` RPC를 감싼 응답(409 QUOTA_EXHAUSTED)이다
//    (sql/54_performance_app.sql (4), 명세서 §9.3).

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";
import { chargedPerformanceSessionIds } from "../../_lib/performance/tenantCredit.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../../_lib/serviceAccess.js";
import { tenantReasonExtra } from "../../_lib/tenantUsage.js";

// 이용권 조회 키. 신규 자산은 performance 네이밍이지만 이 값은 운영 DB의
// `program_access.program_key`와 `SERVICE_CONFIGS`에 이미 박혀 있어 개명
// 대상이 아니다(명세서 §1.4, sql/54_performance_app.sql (4-b)).
const SERVICE_KEY = "suhaeng";

// 재방문 분기(§5.4) 판정 대상이 되는 세션 상태. `completed`/`archived`는
// 이어갈 것이 없으므로 제외한다 — 끝난 세션까지 이어하기 후보로 올리면
// 사용자는 매번 "이어서 하기 / 새로 시작하기"를 다시 골라야 한다.
const RESUMABLE_STATUSES = ["draft", "in_progress"];

// ⚠️ 이 status 기반 판정은 명세서 §12.2 재개 분기 판정표의 5+1 OR
//    (selected_topic/topics/resources/evaluation/assessment_info/draft)을
//    축약한 것이다. 두 판정이 동치인 근거는 **status가 'completed'로 바뀌는
//    유일한 지점이 finalize RPC(sql/58_performance_submission.sql의
//    finalize_performance_submission)** 라는 불변식이다 — 세션에 산출물이
//    하나라도 있으면 status는 반드시 draft/in_progress에 머무른다. 이
//    불변식이 깨지는 변경(예: archive/abandon 상태 신설, status를 갱신하는
//    새 경로)을 넣을 때는 이 판정을 명세의 명시적 산출물 OR 검사로
//    되돌려야 한다.

// 최근 세션 조회 상한. 정확히 필요한 것은 ① 가장 최근 미완료 세션 1건과
// ② 가장 최근 미차감 세션 1건뿐이지만, 후자는 원장 조인 없이 SQL 한 방으로
// 못 고른다(PostgREST에 anti-join이 없다). 최근 N건을 받아 애플리케이션에서
// 고르는 대신 N을 작게 묶는다. 미차감 세션은 §9.3 규칙상 동시 1개가 상한이라
// 정상 데이터에서는 20건 안에 반드시 들어온다.
const RECENT_SESSION_LIMIT = 20;

const SESSION_COLUMNS = [
  "id",
  "status",
  "current_step",
  "completed_steps",
  "grade_label",
  "semester",
  "school_type",
  "subject_group",
  "subject",
  "career_goal",
  "previous_topic",
  "guide_input_mode",
  "selected_topic_id",
  "created_at",
  "updated_at",
].join(",");

type SessionRow = {
  id: string;
  status: string;
  current_step: number | null;
  completed_steps: unknown;
  grade_label: string | null;
  semester: string | null;
  school_type: string | null;
  subject_group: string | null;
  subject: string | null;
  career_goal: string | null;
  previous_topic: string | null;
  guide_input_mode: string | null;
  selected_topic_id: string | null;
  created_at: string;
  updated_at: string;
};

type SessionSummaryContext = {
  charged: boolean;
  topicTitle: string | null | undefined;
  reportTypes: Set<string>;
};

/**
 * 재개 지점. 명세서 §5.4 제안은 `session.last_completed_step + 1`인데,
 * 스키마에는 그 이름의 컬럼이 없고 `completed_steps smallint[]`가 있다
 * (sql/54_performance_app.sql (1-1)). 배열의 최댓값이 곧 마지막 완료 단계다.
 *
 * `current_step`을 그대로 쓰지 않는 이유: 외부 앱의 활성 스텝 표시에 off-by-one
 * 결함이 있었고(§10.2, 프론트 사이드바 파생은 `src/components/performance/deriveStepStates.js`가
 * 그 결함을 피하는 규율을 명시한다), `current_step`은 사용자가 뒤로 돌아가
 * 다시 본 화면일 수도 있어 "어디까지 했는가"의 답이 아니다. 완료 집합이 답이다.
 *
 * 둘이 어긋나면 **더 앞선 쪽**을 택한다 — 완료 표시가 누락된 세션을 이미 지난
 * 단계로 되돌려 보내면 사용자가 입력을 다시 하게 되기 때문이다.
 */
function deriveResumeStep(session: SessionRow) {
  const completed = Array.isArray(session.completed_steps)
    ? session.completed_steps
    : [];
  const numeric = completed
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 5);
  const lastCompleted = numeric.length ? Math.max(...numeric) : 0;
  const currentStep = Number.isInteger(session.current_step)
    ? (session.current_step as number)
    : 1;

  return {
    lastCompletedStep: lastCompleted,
    // 5단계가 끝이라 6으로 넘기지 않는다.
    resumeStep: Math.min(Math.max(lastCompleted + 1, currentStep, 1), 5),
  };
}

/**
 * 재방문 요약 카드(§5.4)가 쓰는 표시 필드 + 분기 판정 근거를 담은 형태로 변환.
 *
 * @param session performance_sessions 행
 * @param ctx { charged, topicTitle, reportTypes:Set<string> }
 */
function toSessionSummary(session: SessionRow, ctx: SessionSummaryContext) {
  const { lastCompletedStep, resumeStep } = deriveResumeStep(session);

  return {
    sessionId: session.id,
    status: session.status,
    currentStep: session.current_step,
    completedSteps: Array.isArray(session.completed_steps)
      ? session.completed_steps
      : [],
    lastCompletedStep,
    // `이어서 하기`가 데려갈 단계(§5.4 제안). 클라이언트가 다시 계산하지 않는다.
    resumeStep,

    // §5.4 요약 문구 `📚 학년/과목: 고1 1학기 / 국어 / 공통국어 1`의 재료다.
    // 결합은 표시 시점에 한다 — 외부 앱은 `고1 1학기`를 결합 문자열로 저장해
    // 다시 쪼갤 수 없었다(sql/54_performance_app.sql (1-1) 주석).
    gradeLabel: session.grade_label,
    semester: session.semester,
    schoolType: session.school_type,
    subjectGroup: session.subject_group,
    subject: session.subject,
    careerGoal: session.career_goal,
    previousTopic: session.previous_topic,
    guideInputMode: session.guide_input_mode,

    // §5.4 요약 문구 `🎯 선택 주제: …`. 주제 미선택이면 둘 다 null이고,
    // 그 경우 요약 카드는 주제 줄을 빼고 렌더해야 한다.
    selectedTopicId: session.selected_topic_id || null,
    selectedTopicTitle: ctx.topicTitle || null,

    // 이 세션이 이미 회차를 소비했는가(= 원장 행 존재).
    // `이어서 하기`가 무료임을 보장하는 근거이자, 회차 소진 상태에서도 이
    // 세션만은 계속 진행 가능함을 클라이언트가 안내하는 근거다(§9.3 정정).
    charged: ctx.charged,

    // 어느 산출물까지 만들어졌는가. §5.4 문구 "평가 리포트까지 만들지 않았어도,
    // 선택한 주제부터 이어서 진행할 수 있습니다"의 조건 판정에 쓴다.
    hasDesignReport: ctx.reportTypes.has("design"),
    hasEvaluationReport: ctx.reportTypes.has("evaluation"),
    hasFinalReport: ctx.reportTypes.has("final_submission"),

    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

export default defineHandler({
  methods: ["GET"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "초기 정보를 불러오지 못했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/bootstrap",
  // 이용권·진행 상태가 담긴 개인화 응답이다. 중간 캐시에 남으면 다른 사용자에게
  // 새어 나갈 수 있으므로 저장 자체를 금지한다.
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);
    // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
    const serviceConfig = SERVICE_CONFIGS[SERVICE_KEY]!;

    // ── 이용권 재판정. 클라이언트 가드 통과 여부는 신뢰하지 않는다(§8.6).
    const { allowed: hasAccess, reason: accessReason } =
      await hasPaidServiceAccess(supabaseAdmin, userId, serviceConfig);
    if (!hasAccess) {
      return fail(
        res,
        403,
        "NO_ENTITLEMENT",
        "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
        tenantReasonExtra(accessReason),
      );
    }

    // ── 회차 스냅샷. 판정과 독립이라 실패해도 진입을 막지 않는다
    //    (check-service-access.js와 같은 취급 — 부가 정보를 못 읽었다고
    //     결제 완료 사용자를 튕기면 안 된다).
    let quota = await readQuotaSnapshot(supabaseAdmin, userId, null);
    try {
      quota = await readQuotaSnapshot(
        supabaseAdmin,
        userId,
        await findProgramAccessRow(supabaseAdmin, userId, serviceConfig),
      );
    } catch (quotaError) {
      console.error(
        "performance/bootstrap quota lookup 실패(무시):",
        quotaError,
      );
    }

    // ── 프로필 표시 정보. 인사말(`반갑습니다, 김형준님!` §5.4)과 사이드바
    //    프로필이 쓴다. school_type은 세션 생성 시 스냅샷으로 복사되는 값이며
    //    (sql/54_performance_app.sql (1-1)), 비어 있으면 null 그대로 내린다 —
    //    외부 앱처럼 '일반고'를 채워 넣지 않는다(이식 금지 항목).
    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, school_type, school_name")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(`프로필 조회 실패: ${profileError.message}`);
    }

    // ── 최근 세션. archived는 사용자가 스스로 치운 것이므로 후보에서 뺀다.
    const { data: sessionRows, error: sessionError } = await supabaseAdmin
      .from("performance_sessions")
      .select(SESSION_COLUMNS)
      .eq("profile_id", userId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(RECENT_SESSION_LIMIT);

    if (sessionError) {
      throw new Error(`세션 조회 실패: ${sessionError.message}`);
    }

    // `SESSION_COLUMNS`가 런타임 조립 문자열이라 supabase-js가 리터럴 파싱 기반
    // 열 추론을 못 하고 `GenericStringError`로 떨어진다 — select 목록과 SessionRow
    // 필드는 위 상수와 정확히 대응하므로 안전한 캐스트다.
    const sessions = (sessionRows || []) as unknown as SessionRow[];
    const sessionIds = sessions.map((row) => row.id);

    // ── 부수 정보 3종을 한 번에 모은다. 세션이 없으면 조회 자체를 건너뛴다
    //    (`in.()` 빈 배열은 PostgREST에서 파싱 오류가 된다).
    const chargedSessionIds = new Set<string>();
    const reportTypesBySession = new Map<string, Set<string>>();
    const topicTitleById = new Map<string, string>();

    if (sessionIds.length) {
      const topicIds = sessions
        .map((row) => row.selected_topic_id)
        .filter(Boolean);

      const [chargedIds, reportResult, topicResult] = await Promise.all([
        chargedPerformanceSessionIds(supabaseAdmin, userId, sessionIds),
        supabaseAdmin
          .from("performance_reports")
          .select("session_id, report_type")
          .in("session_id", sessionIds),
        topicIds.length
          ? supabaseAdmin
              .from("performance_topics")
              .select("id, title")
              .in("id", topicIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (reportResult.error)
        throw new Error(`리포트 조회 실패: ${reportResult.error.message}`);
      if (topicResult.error)
        throw new Error(`주제 조회 실패: ${topicResult.error.message}`);

      for (const id of chargedIds) chargedSessionIds.add(id);

      for (const row of reportResult.data || []) {
        if (!reportTypesBySession.has(row.session_id))
          reportTypesBySession.set(row.session_id, new Set());
        reportTypesBySession.get(row.session_id)?.add(row.report_type);
      }

      for (const row of topicResult.data || [])
        topicTitleById.set(row.id, row.title);
    }

    const summaryOf = (session: SessionRow) =>
      toSessionSummary(session, {
        charged: chargedSessionIds.has(session.id),
        topicTitle: session.selected_topic_id
          ? topicTitleById.get(session.selected_topic_id)
          : null,
        reportTypes: reportTypesBySession.get(session.id) || new Set(),
      });

    // ── lastSession — §5.4 재방문 분기의 판정 근거.
    //    있으면 `3754:5028`(이어서 하기 / 새로 시작하기), 없으면 신규 진입
    //    (`3754:3035` 인사 → STEP1 폼). 즉 **이 필드의 null 여부가 분기 자체다.**
    //    `updated_at desc` 정렬의 첫 미완료 세션이며, 이어갈 지점은
    //    `resumeStep`, 요약 카드에 뿌릴 값은 같은 객체 안에 있다.
    const lastSessionRow =
      sessions.find((row) => RESUMABLE_STATUSES.includes(row.status)) || null;

    // ── latestDraft — 아직 회차를 소비하지 않은 세션.
    //    §9.3의 "미차감 세션 동시 1개 제한" 때문에 `POST session.js
    //    {action:'create'}`가 `409 UNCHARGED_SESSION_EXISTS`로 막을 대상이 바로
    //    이 세션이다. 미리 알려주면 클라이언트가 `새로 시작하기`를 누르고 나서야
    //    409를 받는 대신, 누르기 전에 "기존 세션을 이어받거나 폐기" 안내를
    //    띄울 수 있다. lastSession과 같은 행일 수 있으며(그때는 sessionId가
    //    같다) 그건 정상이다 — 두 필드는 서로 다른 질문에 답한다:
    //      lastSession  = "이어서 할 게 있는가"
    //      latestDraft  = "새로 시작하기를 눌러도 되는가"
    const latestDraftRow =
      sessions.find((row) => !chargedSessionIds.has(row.id)) || null;

    res.status(200).json({
      profile: {
        id: userId,
        name: profileRow?.name || null,
        schoolType: profileRow?.school_type || null,
        schoolName: profileRow?.school_name || null,
      },
      entitlement: {
        serviceKey: SERVICE_KEY,
        hasAccess: true,
        // null = 무제한(0이 아니다). sentinel 해석은 serviceAccess.js /
        // sql/54_performance_app.sql (4-a)와 동일하다.
        quotaTotal: quota.quotaTotal,
        quotaRemaining: quota.quotaRemaining,
        planEndsAt: quota.planEndsAt,
        planLabel: quota.planLabel,
      },
      lastSession: lastSessionRow ? summaryOf(lastSessionRow) : null,
      latestDraft: latestDraftRow ? summaryOf(latestDraftRow) : null,
    });
  },
});

// 실행 시간: 모델을 부르지 않으므로 형제 라우트의 `maxDuration: 60`이 필요 없다.
export const config = { runtime: "nodejs" };
