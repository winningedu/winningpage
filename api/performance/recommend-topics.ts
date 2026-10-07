// POST /api/performance/recommend-topics
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { sessionId, round? }
//   → 200 { round, topics[3], quotaRemaining, charged }
//   → 409 { error:{code:'QUOTA_EXHAUSTED'}, quotaRemaining:0, planEndsAt }
//   → 409 { error:{code:'ROUND_LIMIT'} }
//   → 429 { error:{code:'TOPIC_ATTEMPT_LIMIT'}, maxAttempts }   ← 계약 표에 없는 추가분(아래 게이트 ②)
//   → 422 { error:{code:'MODEL_CONTRACT_VIOLATION'} }
//   → 503 { error:{code:'MODEL_UNAVAILABLE'} }
//   ROUND_LIMIT / TOPIC_ATTEMPT_LIMIT / MODEL_CONTRACT_VIOLATION / MODEL_UNAVAILABLE 은
//   **전부 무차감**이다.
//
// ── 이 파일이 저장소 전체에서 유일한 회차 차감 지점이다 (§9.3)
//    세션 생성·안내문 분석·설계 리포트·평가는 전부 무차감이고, 차감은 여기 "주제 추천
//    최초 성공" 한 곳뿐이다. 외부 앱은 차감 지점이 4곳이었고 전부 **AI 호출 앞**에서
//    돌았다(`suhaengpyeong/api/recommend-topics.js:72` → 호출은 `:207`). 실패해도
//    롤백이 없어 5xx가 그대로 회차를 태웠다. 그 순서는 §9.3이 「이식 금지」로 못박은
//    버그이며, 여기서는 **AI 응답을 파싱·검증해 3건을 확보한 뒤에야** 차감 RPC를 부른다.
//
//    호출 순서는 아래 한 줄이 전부이고, 이 순서가 이 파일의 계약이다:
//      RAG 검색 → Gemini 호출 → 응답 검증 → 차감 RPC → performance_topics 저장 → 응답
//
//    차감 실패는 fail-closed다(§9.3 5항) — RPC가 소진/무권한/오류를 돌려주면 이미 받아둔
//    모델 산출물을 **버리고** 4xx/5xx로 끝낸다. 산출물을 먼저 내보내고 차감을 뒤로 미루면
//    "무료로 주제만 받아 가는" 경로가 열린다.
//
// ── 재추천은 추가 차감이 아니다 (§9.3 「다른 주제 다시 추천 | 없음」)
//    같은 세션이므로 RPC가 `already_charged`를 돌려주고 그것이 정상 경로다. 무차감이
//    코드 규율이 아니라 `performance_credit_ledger.session_id` UNIQUE 제약의 결과라는
//    점이 중요하다(sql/54 결정 ④) — 이 핸들러가 실수로 RPC를 두 번 불러도 이중 차감은
//    구조적으로 불가능하다.
//
// ── 텍스트 파서를 남기지 않는다 (§8.4)
//    외부 앱의 `countRecommendationBlocks`/`normalizeRecommendationHeaders`
//    (`suhaengpyeong/api/recommend-topics.js:15-29`)는 **이식하지 않았다.** 서버 정규식과
//    프론트 정규식이 어긋나 카드가 2장만 뜨던 BLOCK이 거기서 나왔고, §8.4는 "텍스트
//    파서를 폴백으로도 남기지 않는다 — 두 경로가 공존하면 재발한다"고 명시한다.
//    이 파일의 유일한 파싱은 `JSON.parse` 한 줄이며, 형식 강제는 `responseSchema`가 한다.
//
// ── 모델 앞에 게이트 2개가 있다 (비용 방어, 둘 다 무차감)
//    차감 RPC가 판정 권위를 독점하는 구조라 소진 판정이 모델 호출 **뒤**에야 나온다.
//    그 사이가 비어 있으면 "회차를 다 쓴 계정이 풀 추론을 무한히 무료로 태우는" 통로가
//    열리므로, RAG·모델을 부르기 직전에 두 가지를 본다:
//      ① 소진 선차단 — 원장 행이 없고(=미차감 신규 세션) 잔여가 0이면 즉시 409.
//         비권위적이라 새더라도 아래 RPC가 최종적으로 막는다.
//      ② 세션당 모델 시도 상한 — `performance_sessions.topic_attempt_count`(sql/56).
//         구조 실패(422/503)는 `performance_topics`에 행을 남기지 않아 `MAX_ROUNDS`가
//         영원히 안 오른다. 그 축을 시도 카운터가 따로 센다(§9.2 「과금과 남용 방지를
//         분리한다」 — 회차를 더 깎아 막지 않는다).
//
// ── 클라이언트는 프롬프트 입력을 보내지 않는다 (§8.6)
//    외부는 학년·과목·진로·안내문을 요청 바디로 받아(`:56-64`) 그대로 프롬프트에 넣었다 —
//    회차를 태우는 프롬프트를 클라이언트가 조작할 수 있었다. 여기서 바디로 받는 것은
//    `sessionId`와 `round`뿐이고 나머지는 전부 세션 행에서 읽는다.

import type { VercelResponse } from "@vercel/node";
import {
  performanceTraceContext,
  retryReasonOf,
  validationOf,
} from "../_lib/aiTelemetry/performanceContext.js";
import { createAiTrace } from "../_lib/aiTelemetry/trace.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  generateWithRetry,
  PERFORMANCE_MODEL,
} from "../_lib/performance/gemini.js";
import {
  formatRelevantStudentSessionsForPrompt,
  loadDynamicAssessmentKnowledge,
  loadRelevantStudentSessions,
  STUDENT_HISTORY_PROMPT_LIMIT,
  TOPIC_MAX_CHARS,
} from "../_lib/performance/knowledge.js";
import {
  buildTopicExclusionBlock,
  buildTopicRecommendationSystem,
  buildTopicRecommendationUser,
  NO_PREVIOUS_TOPIC_TEXT,
  TOPIC_DETAIL_SECTIONS,
  TOPIC_GENERATION_DEFAULTS,
  TOPIC_MAX_OUTPUT_TOKENS_RETRY,
  TOPIC_PROMPT_VERSION,
  TOPIC_RECOMMENDATION_SCHEMA,
} from "../_lib/performance/prompts.js";
import { TOPIC_MAX_ROUNDS as MAX_ROUNDS } from "../_lib/performance/topic-rounds.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";

const SERVICE_KEY = "suhaeng";

// 라운드 상한 값·조정 근거(QA 행278)는 `../_lib/performance/topic-rounds.js`
// (`TOPIC_MAX_ROUNDS`)가 정본이다 — `session.js`도 재개 응답의 `maxRounds`를 같은
// 곳에서 읽어 값이 갈라지지 않는다(QA 재개 시 "남은 추가 추천"이 잘못 표시되던 버그의
// 원인이 두 파일이 각자 `MAX_ROUNDS`를 들고 있던 것이었다).

/**
 * 모델 호출 총 예산. `generateWithRetry`의 과부하 재시도와 아래 구조 재시도가 **모두**
 * 이 한 신호를 공유하므로 시한은 시도당이 아니라 총합이다(gemini.js `abortSignal` 주석).
 * 플랫폼이 함수를 죽이기 전에 우리가 502를 만들어 돌려주는 것이 목적이다.
 */
const MODEL_TIMEOUT_MS = 50 * 1000;

/** 구조 실패(절단·파싱 실패·계약 위반) 시 재시도 횟수. §8.4 「1회 재요청 후 실패 처리」. */
const STRUCTURE_RETRY = 1;

/**
 * 세션당 **모델 호출 시도** 상한(sql/56, `performance_sessions.topic_attempt_count`).
 * `MAX_ROUNDS`와는 **다른 축**이다 — 저쪽은 성공해서 `performance_topics`에 행이 남은
 * 라운드만 센다.
 *
 * 왜 별도 축이 필요한가: `MODEL_CONTRACT_VIOLATION`(422)·`MODEL_UNAVAILABLE`(503)은
 * 무차감이면서 `performance_topics`에 아무것도 남기지 않으므로 `nextRound`가 그대로다.
 * 즉 구조 실패를 유도할 수 있는 입력이면 같은 세션에서 **무한 반복**이 가능하고, 1회당
 * 임베딩 2회 + 최대 6회(과부하 재시도 3 × 구조 재시도 2)의 Gemini 생성 호출이 나간다.
 * §9.2가 「과금과 남용 방지를 분리한다」고 정했으므로 회차를 더 깎아 막지 않고
 * `analyze-guide.js`의 `MAX_ANALYSIS_PER_SESSION`과 같은 방식으로 시도 수에 상한을 건다.
 *
 * 성공 라운드 `MAX_ROUNDS`(현재 2) + 정상 재시도를 넉넉히 덮는 값으로 10을 쓴다
 * (analyze-guide와 같은 수치). `MAX_ROUNDS`가 바뀌어도 이 여유값은 그대로 충분하다.
 */
const MAX_MODEL_ATTEMPTS_PER_SESSION = 10;

/** 카드 부제 — 모델 산출물이 아니라 서버 고정 문자열이다(§8.3 `subtitle`, §13). */
const TOPIC_SUBTITLE = "통합 수행평가 설계 리포트";

/** 태그 4번째 칸 고정 문자열(§5.10 `고1 / 국어/공통국어1 / 의학 / 설계 리포트`). */
const TOPIC_TAG_SUFFIX = "설계 리포트";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COLUMNS = [
  "id",
  "profile_id",
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
  "guide_freetext",
  "guide_json",
  // sql/56. 이 컬럼 없이 배포하면 PostgREST 42703으로 라우트 전체가 죽는다 —
  // `analyze-guide.js`의 `guide_analysis_count`(sql/55)와 같은 선행 조건이다.
  "topic_attempt_count",
].join(",");

/** 세션 SELECT 컬럼(§ SESSION_COLUMNS)과 정확히 대응하는 최소 필드 형태. */
type SessionRow = {
  id: string;
  profile_id: string;
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
  guide_freetext: string | null;
  guide_json: unknown;
  topic_attempt_count: number | null;
};

/** performance_topics 저장/조회 행. */
type TopicRow = {
  id: string;
  round: number;
  idx: number;
  title: string;
  subtitle: string;
  tags: unknown;
  detail: unknown;
  selected: boolean;
};

/** 모델이 낸 주제 1건(구조 검증 전). 키 존재만 스키마가 보장하므로 값은 unknown으로 받는다. */
type ModelTopic = Record<string, unknown>;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

/**
 * 프롬프트에 넣을 안내문 본문. STEP2가 두 갈래(업로드/직접 입력)이므로 세션이 기록한
 * `guide_input_mode`를 정본으로 읽되, 반대편 컬럼도 폴백으로 본다 — 사용자가 업로드 후
 * 직접 입력으로 갈아탄 세션에서 빈 문자열이 프롬프트에 들어가는 것을 막기 위함이다.
 *
 * `guide_json`은 P7 시점에 **평문을 담는 봉투**다(`analyze-guide.js`의 `{mode,text,…}`).
 * §8.4의 안내문 스키마로 승격되면 이 함수가 그 구조를 평문으로 펴는 자리가 된다.
 */
function readAssessmentText(sessionRow: SessionRow): string {
  const guideJson =
    sessionRow.guide_json && typeof sessionRow.guide_json === "object"
      ? (sessionRow.guide_json as Record<string, unknown>)
      : null;

  const fromUpload = String(guideJson?.text || "").trim();
  const fromManual = String(sessionRow.guide_freetext || "").trim();

  return sessionRow.guide_input_mode === "manual"
    ? fromManual || fromUpload
    : fromUpload || fromManual;
}

/**
 * STEP3 진입 표시. **`completed_steps`에 3을 넣지 않는다** — 3(주제 추천)이 끝나는
 * 시점은 추천을 받은 순간이 아니라 사용자가 상세 모달에서 주제를 확정하는 순간이고
 * (§5.11, §3.3 활성 스텝 표에서 `3754:4872` 상세 모달까지가 스텝 3이다), 그 확정은
 * `session.js` PATCH / `design-report`(P10)가 기록한다.
 * 여기서 하는 일은 진행을 3보다 앞으로 되돌리지 않는 것뿐이다.
 */
function stepPatch(sessionRow: SessionRow) {
  return {
    status: sessionRow.status === "draft" ? "in_progress" : sessionRow.status,
    current_step: Math.max(Number(sessionRow.current_step) || 1, 3),
  };
}

/** 카드 태그 4종. 전부 세션 파생값이며 모델 산출물이 아니다(§8.3 `tags`, §13). */
function buildTags(sessionRow: SessionRow): string[] {
  const subjectText = [sessionRow.subject_group, sessionRow.subject]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("/");

  return [
    String(sessionRow.grade_label || "").trim(),
    subjectText,
    String(sessionRow.career_goal || "").trim(),
    TOPIC_TAG_SUFFIX,
  ].filter(Boolean);
}

/**
 * 모델 JSON → `performance_topics.detail`(6요소 고정 배열).
 *
 * 스키마는 `title` + 6필드를 required로 잡고 있으므로 여기서 하는 일은 **순서 고정**과
 * 공백 정리뿐이다. 순서·라벨의 정본은 `TOPIC_DETAIL_SECTIONS`(시안 `3754:4872` 실측)이며
 * 모델이 필드를 어떤 순서로 내든 렌더 순서는 여기서 정해진다.
 */
function buildDetail(topic: ModelTopic) {
  return TOPIC_DETAIL_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    text: String(topic[section.id] || "").trim(),
  }));
}

/**
 * 구조화 응답 검증. 통과 기준은 **3건 + 각 건의 title·6필드가 전부 비어 있지 않을 것**
 * 하나뿐이다. 정규식도, 헤더 보정도, 블록 카운팅도 없다(§8.4).
 *
 * 빈 문자열을 통과시키지 않는 이유: `responseSchema`의 required는 **키의 존재**만
 * 보장하고 값이 `""`인 것을 막지 못한다. 빈 값이 통과하면 상세 모달에 라벨만 있고 본문이
 * 없는 섹션이 뜬다 — 회차를 태운 뒤에 발견되는 종류의 하자라 차감 **전에** 걸러야 한다.
 *
 * @returns {{ok: true, topics: object[]} | {ok: false, reason: string}}
 */
function validateTopicsPayload(
  payload: unknown,
): { ok: true; topics: ModelTopic[] } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "not-an-object" };
  }

  const topics = (payload as Record<string, unknown>).topics;
  if (!Array.isArray(topics) || topics.length !== 3) {
    return {
      ok: false,
      reason: `topics-length:${Array.isArray(topics) ? topics.length : "none"}`,
    };
  }

  const keys = ["title", ...TOPIC_DETAIL_SECTIONS.map((section) => section.id)];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i] as ModelTopic;
    if (!topic || typeof topic !== "object") {
      return { ok: false, reason: `topic-${i + 1}:not-an-object` };
    }

    for (const key of keys) {
      if (!String(topic[key] || "").trim()) {
        return { ok: false, reason: `topic-${i + 1}:empty-${key}` };
      }
    }
  }

  return { ok: true, topics: topics as ModelTopic[] };
}

/** 응답에 실을 주제 카드 1장. DB 행과 같은 모양이라 저장 전/후 형태가 갈리지 않는다. */
function toClientTopic(row: TopicRow) {
  return {
    id: row.id,
    round: row.round,
    idx: row.idx,
    title: row.title,
    subtitle: row.subtitle,
    tags: Array.isArray(row.tags) ? row.tags : [],
    detail: Array.isArray(row.detail) ? row.detail : [],
    selected: row.selected === true,
  };
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "주제 추천에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/recommend-topics",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);

    // ── 이용권 재판정(§8.6 공통 규약). 클라이언트 가드 통과 여부를 신뢰하지 않는다.
    //    회차 **잔여**는 여기서 보지 않는다 — 잔여 판정과 차감은 RPC가 한 트랜잭션에서
    //    같이 해야 두 탭 경쟁에서 갈리지 않는다(§9.3 「멱등 차감」).
    const { allowed: hasAccess } = await hasPaidServiceAccess(
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
      );
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId.trim() : "";

    if (!UUID_RE.test(sessionId)) {
      return fail(
        res,
        400,
        "INVALID_SESSION_ID",
        "sessionId가 올바르지 않습니다.",
      );
    }

    // ── 세션 소유권. 없는 세션과 남의 세션을 같은 응답으로 묶어 id 존재 여부가 새지
    //    않게 한다(RPC 단계 1과 같은 취지).
    const { data: sessionRowRaw, error: sessionError } = await supabaseAdmin
      .from("performance_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", sessionId)
      .eq("profile_id", userId)
      .maybeSingle();

    if (sessionError)
      throw new Error(`세션 조회 실패: ${sessionError.message}`);
    if (!sessionRowRaw) {
      return fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.");
    }

    // `SESSION_COLUMNS`가 런타임 조립 문자열이라 supabase-js가 리터럴 파싱 기반 열
    // 추론을 못 하고 `GenericStringError`로 떨어진다(bootstrap.ts와 같은 사유) —
    // select 목록과 SessionRow 필드는 정확히 대응하므로 안전한 캐스트다.
    const sessionRow = sessionRowRaw as unknown as SessionRow;

    // ── STEP1/STEP2 선행 조건. 여기서 막지 않으면 `미입력`투성이 프롬프트가 회차를
    //    태우고 쓸모없는 주제 3건을 돌려준다. 둘 다 **무차감**이다.
    const missingBasic = [
      "grade_label",
      "semester",
      "subject_group",
      "subject",
      "career_goal",
    ].find((column) => !String(sessionRow[column] || "").trim());

    if (missingBasic) {
      return fail(
        res,
        400,
        "SESSION_INCOMPLETE",
        "기본 정보를 먼저 입력해 주세요.",
        {
          step: 1,
          field: missingBasic,
          charged: false,
        },
      );
    }

    const assessmentText = readAssessmentText(sessionRow);
    if (!assessmentText) {
      return fail(
        res,
        400,
        "GUIDE_REQUIRED",
        "수행평가 안내문을 먼저 입력해 주세요.",
        {
          step: 2,
          charged: false,
        },
      );
    }

    // ── 라운드 결정. 기존 라운드를 세어 다음 값을 정한다. 클라이언트가 `round`를 보내면
    //    **의도 확인용으로만** 쓴다(§8.6 계약의 `round?`):
    //      · 이미 있는 라운드 → 그 라운드의 저장된 결과를 그대로 돌려준다(재요청 멱등).
    //        더블클릭·새로고침이 모델을 다시 부르지 않게 하는 것이 목적이다.
    //      · 그 밖의 값 → 400. 서버가 정한 다음 라운드와 어긋나는 요청은 거부한다.
    const { data: existingTopics, error: existingError } = await supabaseAdmin
      .from("performance_topics")
      .select("id,round,idx,title,subtitle,tags,detail,selected")
      .eq("session_id", sessionRow.id)
      .order("round", { ascending: true })
      .order("idx", { ascending: true });

    if (existingError)
      throw new Error(`기존 주제 조회 실패: ${existingError.message}`);

    const priorTopics = existingTopics || [];
    const lastRound = priorTopics.reduce(
      (max, row) => Math.max(max, Number(row.round) || 0),
      0,
    );
    const nextRound = lastRound + 1;

    const requestedRoundRaw = body.round;
    let requestedRound: number | null = null;
    if (
      requestedRoundRaw !== undefined &&
      requestedRoundRaw !== null &&
      requestedRoundRaw !== ""
    ) {
      requestedRound = Number(requestedRoundRaw);
      if (!Number.isInteger(requestedRound) || requestedRound < 1) {
        return fail(
          res,
          400,
          "INVALID_ROUND",
          "round 값이 올바르지 않습니다.",
          { charged: false },
        );
      }
    }

    if (requestedRound !== null && requestedRound <= lastRound) {
      // 이미 만든 라운드 재요청 = 모델 미호출·미차감 재생(replay).
      const replay = priorTopics
        .filter((row) => Number(row.round) === requestedRound)
        .map(toClientTopic);

      // 차감 RPC를 부르지 않는 경로라 잔여 회차는 읽기 전용 스냅샷으로 채운다.
      // 여기서 null을 돌려주면 §5.20 배너가 "정보 없음"으로 떨어진다.
      let quota = await readQuotaSnapshot(supabaseAdmin, userId, null);
      try {
        quota = await readQuotaSnapshot(
          supabaseAdmin,
          userId,
          await findProgramAccessRow(
            supabaseAdmin,
            userId,
            // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
            SERVICE_CONFIGS[SERVICE_KEY]!,
          ),
        );
      } catch (quotaError) {
        console.error(
          "performance/recommend-topics quota lookup 실패(무시):",
          quotaError,
        );
      }

      res.status(200).json({
        round: requestedRound,
        topics: replay,
        quotaRemaining: quota.quotaRemaining,
        charged: false,
        reused: true,
        maxRounds: MAX_ROUNDS,
      });
      return;
    }

    if (requestedRound !== null && requestedRound !== nextRound) {
      return fail(
        res,
        400,
        "INVALID_ROUND",
        "요청한 회차가 진행 상태와 맞지 않습니다.",
        {
          expectedRound: nextRound,
          charged: false,
        },
      );
    }

    // ── 상한(§9.2 상한 표 · §10.2 P8). **무차감**이다 — 남용 방지는 회차를 더 깎는 대신
    //    거부로 처리한다(§9.2 「과금과 남용 방지를 분리한다」).
    if (nextRound > MAX_ROUNDS) {
      return fail(
        res,
        409,
        "ROUND_LIMIT",
        `주제 추천은 최대 ${MAX_ROUNDS}회까지 받을 수 있어요.`,
        {
          round: lastRound,
          maxRounds: MAX_ROUNDS,
          charged: false,
        },
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // 모델을 부르기 전에 거는 두 게이트. 둘 다 **무차감**이고 둘 다 비용 방어다.
    // ─────────────────────────────────────────────────────────────────

    // 이 세션이 이미 차감된 세션인가. `performance_credit_ledger.session_id`가 UNIQUE라
    // 행 존재 = 차감 완료다(sql/54 1-7). 아래 두 게이트가 모두 이 값을 본다.
    const { data: ledgerRow, error: ledgerLookupError } = await supabaseAdmin
      .from("performance_credit_ledger")
      .select("id")
      .eq("session_id", sessionRow.id)
      .maybeSingle();

    if (ledgerLookupError)
      throw new Error(`차감 원장 조회 실패: ${ledgerLookupError.message}`);

    const alreadyCharged = Boolean(ledgerRow);

    // ── 게이트 ① 회차 소진 **선차단**(비권위적)
    //    진입 게이트(위 `hasPaidServiceAccess`)는 보유 여부만 보고 잔여를 일부러 보지
    //    않는다 — 판정과 차감을 RPC 한 트랜잭션에 묶기 위해서다. 그 결과 소진 판정이
    //    모델 호출 **뒤**(아래 `quota_exhausted`)에야 나오는데, 그 지점까지 오려면
    //    임베딩 2회 + 최대 6회의 Gemini 생성 호출을 이미 완주한 뒤다. 즉 회차를 다 쓴
    //    사용자가 이 엔드포인트를 반복 호출하면 매번 풀 추론을 무료로 태울 수 있다
    //    (409 응답은 `charged:false`라 억제 장치가 하나도 없다).
    //
    //    그래서 여기서 **미리 한 번 본다**. 두 조건을 모두 걸어야 §9.3/§5.20의
    //    「이미 차감된 세션은 소진·만료 뒤에도 계속 진행(재추천 포함)」이 깨지지 않는다:
    //      ⓐ 원장 행이 없다(= 아직 차감 안 된 신규 세션)  ⓑ 잔여가 정확히 0
    //    `quotaRemaining === null`은 "정보 없음/무제한"이므로 차단하지 않는다.
    //
    //    **판정 권위는 그대로 RPC에 있다.** 여기서 TOCTOU로 새더라도 아래 차감 단계가
    //    최종적으로 막으므로 동시성 정합성은 손상되지 않는다. 조회 실패도 통과시킨다 —
    //    비권위적 최적화가 정상 경로를 죽이면 안 된다.
    if (!alreadyCharged) {
      try {
        const preQuota = await readQuotaSnapshot(
          supabaseAdmin,
          userId,
          await findProgramAccessRow(
            supabaseAdmin,
            userId,
            // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
            SERVICE_CONFIGS[SERVICE_KEY]!,
          ),
        );

        if (preQuota.quotaRemaining === 0) {
          return fail(
            res,
            409,
            "QUOTA_EXHAUSTED",
            "이용 가능한 횟수를 모두 사용했어요.",
            {
              quotaRemaining: 0,
              planEndsAt: preQuota.planEndsAt ?? null,
              charged: false,
            },
          );
        }
      } catch (quotaError) {
        console.error(
          "performance/recommend-topics 소진 선차단 조회 실패(무시):",
          quotaError,
        );
      }
    }

    // ── 게이트 ② 세션당 모델 시도 상한(sql/56)
    //    성공 라운드 상한(`MAX_ROUNDS`)이 세지 못하는 축이다 — 위 상수 주석 참조.
    const attemptCount = Number(sessionRow.topic_attempt_count) || 0;
    if (attemptCount >= MAX_MODEL_ATTEMPTS_PER_SESSION) {
      return fail(
        res,
        429,
        "TOPIC_ATTEMPT_LIMIT",
        "이 수행평가에서 주제 추천을 너무 여러 번 요청했어요. 잠시 후 새 수행평가로 다시 시작해 주세요.",
        { maxAttempts: MAX_MODEL_ATTEMPTS_PER_SESSION, charged: false },
      );
    }

    // 모델(임베딩 포함)을 실제로 부르기 **직전**에 올린다. 성공/실패 어느 쪽이든 비용은
    // 이미 발생하므로 실패도 세어야 상한이 의미를 갖는다 — 애초에 이 게이트가 겨냥하는
    // 것이 "실패만 반복하는" 경로다. (동시 요청 2건이 같은 값을 읽어 한 번을 덜 셀 수
    // 있으나 이 값은 정밀 회계가 아니라 남용 상한이다. 정밀 회계가 필요한 회차 차감은
    // `consume_performance_credit`이 `for update`로 한다 — analyze-guide.js와 같은 판단.)
    const { error: attemptCounterError } = await supabaseAdmin
      .from("performance_sessions")
      .update({ topic_attempt_count: attemptCount + 1 })
      .eq("id", sessionRow.id);

    if (attemptCounterError)
      throw new Error(
        `주제 추천 시도 횟수 갱신 실패: ${attemptCounterError.message}`,
      );

    // 계기판 기록. 모델과 RAG 를 부르는 구간 전체를 try/finally 로 감싸 어떤 경로로
    // 빠져나가도 응답 직전에 한 번 내보낸다. 기록 실패는 요청에 영향을 주지 않는다.
    const trace = createAiTrace(
      performanceTraceContext({
        feature: "recommend_topics",
        sessionId: sessionRow.id,
        profileId: userId,
        promptVersion: TOPIC_PROMPT_VERSION,
        step: String(nextRound),
      }),
    );
    try {
      const previousTopic =
        String(sessionRow.previous_topic || "").trim() ||
        NO_PREVIOUS_TOPIC_TEXT;
      const gradeLabel = String(sessionRow.grade_label || "").trim();
      const subject = String(sessionRow.subject || "").trim();
      const career = String(sessionRow.career_goal || "").trim();

      // ── RAG 질의문에 넣는 값은 **프롬프트와 같은 결합 규칙**을 쓴다 (§12.3 문자 단위 이식)
      //    외부 앱은 결합 문자열 하나만 들고 다녔다 — 프론트가
      //      `subject = `${group} / ${realSubject}``            (`suhaengpyeong/index.html:996`)
      //      `gradeWithSemester = `${grade} ${semester}``       (`같은 파일 :1749`)
      //    를 만들어 요청 바디에 실었고(`:1747-1748`), 서버는 **그 값을 프롬프트와 RAG에
      //    똑같이** 넘겼다(`api/recommend-topics.js:83-92`(위닝DB) / `:94-104`(과거 수행) /
      //    `:186-188`(프롬프트)). 즉 `현재 과목: 과학 / 고급 생명과학` · `학년: 고1 1학기`가
      //    임베딩되는 것이 원문이다.
      //
      //    여기서는 §8.3 결정 ㄴ에 따라 컬럼을 분리 저장하므로(`grade_label`/`semester`,
      //    `subject_group`/`subject`) 결합은 **사용 시점**에 한다. 프롬프트 쪽은 이미
      //    `buildTopicRecommendationUser`가 `' / '`·`' '`로 결합하고 있으므로(prompts.js),
      //    RAG에도 같은 값을 넘겨야 ⓐ 임베딩 문자열이 원문과 일치하고 ⓑ 같은 요청 안에서
      //    프롬프트와 검색이 같은 과목 표기를 본다. 맨 과목명만 임베딩하면 질의문 템플릿만
      //    원문이고 실제 벡터가 달라져, `knowledge.js`가 "튜닝된 그 조건 그대로"라고 못박은
      //    threshold 0.50/0.48의 전제가 무너진다.
      //
      //    RPC 인자·정규화 결과는 바뀌지 않는다 — `getBaseGradeForRpc('고1 1학기') === '고1'`
      //    (knowledge.js:270), `normalizeSubject('과학 / 고급 생명과학') === '과학'`(같은 파일
      //    `:93`, 공백 제거 후 substring 매칭이라 결합형도 같은 교과군을 돌려준다).
      //    바뀌는 것은 임베딩 입력 문자열뿐이다.
      const ragSubject = [sessionRow.subject_group, subject]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" / ");

      const ragGrade = [gradeLabel, String(sessionRow.semester || "").trim()]
        .filter(Boolean)
        .join(" ");

      // ── RAG 2소스. 둘 다 **프롬프트 보조 입력**이라 비어도 진행한다(dev 지식베이스가
      //    0행이면 `관련 위닝DB 항목 없음`이 렌더되는 것이 정상이다).
      //    `loadRelevantStudentSessions`는 내부에서 검색 실패를 빈 배열로 흡수하지만
      //    `profileId` 누락은 프로그래밍 오류로 던지므로 여기서만 감싼다.
      const knowledge = await loadDynamicAssessmentKnowledge({
        supabase: supabaseAdmin,
        grade: ragGrade,
        subject: ragSubject,
        career,
        selectedTopic: previousTopic,
        assessmentInfo: assessmentText,
        purpose: "topic",
        maxItems: 6,
        maxChars: TOPIC_MAX_CHARS,
        // 다른 과목 후보가 검색 결과에 들어와야 CROSS_SUBJECT_CONNECTION_GUIDE 11조와
        // 「다른 과목 선배 데이터 활용 규칙」 5조가 사문이 되지 않는다(knowledge.js 주석).
        includeOtherSubjects: true,
        telemetry: trace,
      });

      let studentSessions: Awaited<
        ReturnType<typeof loadRelevantStudentSessions>
      > = [];
      try {
        studentSessions = await loadRelevantStudentSessions({
          supabase: supabaseAdmin,
          profileId: userId,
          grade: ragGrade,
          subject: ragSubject,
          career,
          selectedTopic: previousTopic,
          assessmentInfo: assessmentText,
          telemetry: trace,
        });
      } catch (historyError) {
        console.error(
          "performance/recommend-topics 과거 수행 RAG 실패(무시):",
          historyError,
        );
      }

      const system = buildTopicRecommendationSystem({
        topicKnowledgeText: knowledge.text,
        studentHistoryText: formatRelevantStudentSessionsForPrompt(
          studentSessions.slice(0, STUDENT_HISTORY_PROMPT_LIMIT),
          // **여기만 맨 `subject`다(결합값 금지).** 이 인자는 검색 질의문이 아니라
          // `performance_session_vectors.subject`와의 **등가 비교** 대상이고
          // (knowledge.js `sameSubject = r.subject === currentSubject`), 그 컬럼은
          // `subject_group`과 별도로 맨 과목명을 담는다(sql/54 1-8). 결합값을 넘기면
          // `현재 과목과의 관계: 같은 과목` 판정이 영구히 false가 된다.
          subject,
        ),
      });

      // ── 재추천이면 이전 라운드 주제명을 배제 블록으로 덧붙인다(§8.3 `round` 정의).
      //    원문 작업 지시 8조는 손대지 않고 뒤에 블록만 붙인다 — round 1 프롬프트는
      //    원문과 바이트 동일하다(prompts.js `buildTopicExclusionBlock` 주석).
      const excludedTitles = Array.from(
        new Set(
          priorTopics
            .map((row) => String(row.title || "").trim())
            .filter(Boolean),
        ),
      );

      // buildTopicRecommendationUser는 값을 `|| ""`로 다루므로 null→"" 치환은 결과에 영향 없다.
      const baseUser = buildTopicRecommendationUser({
        gradeLabel,
        semester: sessionRow.semester || "",
        schoolType: sessionRow.school_type || "",
        subjectGroup: sessionRow.subject_group || "",
        subject,
        career,
        previousTopic,
        assessmentText,
      });

      const exclusionBlock = buildTopicExclusionBlock(excludedTitles);
      const userMsg = exclusionBlock
        ? `${baseUser}\n\n${exclusionBlock}`
        : baseUser;

      // ── 모델 호출. 실패 형태가 3가지라 각각 다르게 다룬다(§8.4 완화책 ⓑ·ⓒ·ⓓ):
      //      ⓑ maxOutputTokens를 원문 4200에서 상향(prompts.js 근거 주석)
      //      ⓒ finishReason === 'MAX_TOKENS' → **파싱을 시도하지 않고** 재시도
      //      ⓓ 파싱 실패 시 모델 원문을 응답에 싣지 않는다(서버 로그에만 남긴다)
      const abortController = new AbortController();
      const abortTimer = setTimeout(
        () => abortController.abort(),
        MODEL_TIMEOUT_MS,
      );

      let validated: ModelTopic[] | null = null;
      let lastFailure = "unknown";

      try {
        for (let attempt = 0; attempt <= STRUCTURE_RETRY; attempt++) {
          const isRetry = attempt > 0;
          trace.beginAttempt(retryReasonOf(isRetry, lastFailure));

          let response: Awaited<ReturnType<typeof generateWithRetry>>;
          try {
            response = await generateWithRetry(
              {
                model: PERFORMANCE_MODEL,
                contents: userMsg,
                config: {
                  systemInstruction: system,
                  // 재시도는 원문 재시도와 같은 취지로 온도를 낮춘다
                  // (`suhaengpyeong/api/recommend-topics.js:221` — 0.25 → 0.2).
                  temperature: isRetry
                    ? 0.2
                    : TOPIC_GENERATION_DEFAULTS.temperature,
                  // 같은 상한으로 다시 부르면 같은 자리에서 다시 잘린다 → 올려서 재시도.
                  maxOutputTokens: isRetry
                    ? TOPIC_MAX_OUTPUT_TOKENS_RETRY
                    : TOPIC_GENERATION_DEFAULTS.maxOutputTokens,
                  thinkingConfig: { thinkingBudget: 0 },
                  responseMimeType: "application/json",
                  responseSchema: TOPIC_RECOMMENDATION_SCHEMA,
                  abortSignal: abortController.signal,
                },
              },
              2,
              trace,
            );
          } catch (modelError) {
            // 과부하 재시도(700ms×2^n, 2회)는 generateWithRetry가 이미 소진했다.
            // 여기까지 오면 상류가 실제로 죽었거나 우리 시한이 끝난 것이다. **무차감**.
            console.error(
              "performance/recommend-topics 모델 호출 실패:",
              modelError,
            );
            return fail(
              res,
              503,
              "MODEL_UNAVAILABLE",
              "주제를 추천하지 못했어요. 잠시 후 다시 시도해 주세요.",
              {
                charged: false,
              },
            );
          }

          const finishReason = response?.candidates?.[0]?.finishReason;

          // ⓒ — 절단된 응답은 파싱하지 않는다. 결함 ①(숫자 리터럴 반복 루프)과
          //      ②(무작위 중간 절단)의 공통 징후이며, 반쯤 온 JSON을 어떻게든 살리려는
          //      시도가 곧 §8.4가 금지한 텍스트 수술이다.
          if (finishReason === "MAX_TOKENS") {
            lastFailure = "finish-reason:MAX_TOKENS";
            console.warn(
              `performance/recommend-topics MAX_TOKENS 절단 (attempt ${attempt + 1})`,
            );
            trace.annotateLastCall(validationOf(false, lastFailure));
            continue;
          }

          if (finishReason && finishReason !== "STOP") {
            lastFailure = `finish-reason:${finishReason}`;
            console.warn(
              `performance/recommend-topics 비정상 종료 ${finishReason} (attempt ${attempt + 1})`,
            );
            trace.annotateLastCall(validationOf(false, lastFailure));
            continue;
          }

          const rawText = String(response?.text || "").trim();
          if (!rawText) {
            lastFailure = "empty-response";
            trace.annotateLastCall(validationOf(false, lastFailure));
            continue;
          }

          let parsed: unknown;
          try {
            // 유일한 파싱이다. `responseMimeType:'application/json'`이 형식을 보장하므로
            // 코드펜스 제거·헤더 보정 같은 전처리를 두지 않는다(§8.4).
            parsed = JSON.parse(rawText);
          } catch (parseError) {
            lastFailure = "json-parse-failed";
            // ⓓ — 원문은 서버 로그에만 남긴다. 응답 본문에는 싣지 않는다.
            console.error(
              "performance/recommend-topics JSON 파싱 실패:",
              parseError?.message,
              rawText.slice(0, 400),
            );
            trace.annotateLastCall(validationOf(false, lastFailure));
            continue;
          }

          const check = validateTopicsPayload(parsed);
          if (!check.ok) {
            // tsconfig가 strictNullChecks를 끄고 있어(strict:false) 이 boolean 판별
            // 유니온이 `!check.ok`만으로는 좁혀지지 않는다(strict:true에서만 좁혀짐을
            // 격리 재현으로 확인) — 그래서 여기서만 명시적으로 좁힌다.
            const { reason } = check as { ok: false; reason: string };
            lastFailure = `contract:${reason}`;
            console.warn(
              `performance/recommend-topics 계약 위반 ${reason} (attempt ${attempt + 1})`,
            );
            trace.annotateLastCall(validationOf(false, lastFailure));
            continue;
          }

          validated = check.topics;
          trace.annotateLastCall(validationOf(true, ""));
          break;
        }
      } finally {
        clearTimeout(abortTimer);
      }

      if (!validated) {
        // 재시도까지 실패. **무차감**이다(§8.4 「검증 실패 시 1회 재요청 후 실패 처리,
        // 회차는 차감하지 않는다」). 사용자에게는 모델 원문 대신 안내만 준다(ⓓ).
        console.error(
          `performance/recommend-topics 계약 위반 확정: ${lastFailure}`,
        );
        return fail(
          res,
          422,
          "MODEL_CONTRACT_VIOLATION",
          "주제를 정리하지 못했어요. 다시 시도해 주세요.",
          {
            charged: false,
          },
        );
      }

      // ─────────────────────────────────────────────────────────────────
      // 여기부터가 차감 구간이다. 위에서 3건을 확보한 **뒤에만** 도달한다.
      // ─────────────────────────────────────────────────────────────────
      const { data: creditRaw, error: creditError } = await supabaseAdmin.rpc(
        "consume_performance_credit",
        {
          p_session_id: sessionRow.id,
          p_profile_id: userId,
          p_reason: "recommend-topics:first-success",
        },
      );

      if (creditError) {
        // fail-closed(§9.3 5항) — 차감을 커밋하지 못했으면 산출물을 내보내지 않는다.
        console.error(
          "performance/recommend-topics 차감 RPC 실패:",
          creditError,
        );
        return fail(res, 500, "INTERNAL", "주제 추천 처리에 실패했습니다.");
      }

      const credit =
        creditRaw && typeof creditRaw === "object" ? creditRaw : {};
      const creditStatus = String(credit.status || "");

      if (creditStatus === "quota_exhausted") {
        // §5.20 (B) 인라인 소진 카드가 이 응답을 받아 AiLoadingBubble을 대체한다.
        // 표현은 사용량이 아니라 **잔여량** 기준이다(§9.3 「소진 응답 계약」).
        return fail(
          res,
          409,
          "QUOTA_EXHAUSTED",
          "이용 가능한 횟수를 모두 사용했어요.",
          {
            quotaRemaining: 0,
            planEndsAt: credit.plan_ends_at ?? null,
            charged: false,
          },
        );
      }

      if (creditStatus === "no_entitlement") {
        return fail(
          res,
          403,
          "NO_ENTITLEMENT",
          "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
          {
            charged: false,
          },
        );
      }

      if (creditStatus === "entitlement_expired") {
        // RPC가 돌려주는 5번째 상태다(sql/54 (4) 단계 6). 이용권 기간 만료·환불·정지는
        // "권한 없음"과 원인이 다르므로 코드를 갈라 §5.20이 다른 문구를 쓸 수 있게 한다.
        return fail(
          res,
          403,
          "ENTITLEMENT_EXPIRED",
          "이용권 사용 기간이 끝났어요.",
          {
            planEndsAt: credit.plan_ends_at ?? null,
            charged: false,
          },
        );
      }

      if (creditStatus === "session_not_found") {
        return fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.", {
          charged: false,
        });
      }

      // `charged` = 이번 요청이 실제로 회차를 깎았는가.
      // `already_charged`는 **재추천의 정상 경로**다(§9.3) — 같은 세션의 원장 행이 이미
      // 있다는 뜻이고, 그 멱등성은 `performance_credit_ledger.session_id` UNIQUE가 보장한다.
      if (creditStatus !== "charged" && creditStatus !== "already_charged") {
        console.error(
          "performance/recommend-topics 알 수 없는 차감 상태:",
          creditStatus,
        );
        return fail(res, 500, "INTERNAL", "주제 추천 처리에 실패했습니다.");
      }

      const charged = credit.charged === true;
      const quotaRemaining = credit.quota_remaining ?? null;

      // ── 저장. 라운드당 3행이며 `(session_id, round, idx)` UNIQUE가 재시도로 인한
      //    중복 저장을 막는다(sql/54 1-4).
      const rows = validated.map((topic, index) => ({
        session_id: sessionRow.id,
        round: nextRound,
        idx: index + 1,
        title: String(topic.title || "").trim(),
        subtitle: TOPIC_SUBTITLE,
        tags: buildTags(sessionRow),
        detail: buildDetail(topic),
        selected: false,
      }));

      const { data: insertedRows, error: insertError } = await supabaseAdmin
        .from("performance_topics")
        .insert(rows)
        .select("id,round,idx,title,subtitle,tags,detail,selected");

      if (insertError)
        throw new Error(`주제 저장 실패: ${insertError.message}`);

      const { error: sessionUpdateError } = await supabaseAdmin
        .from("performance_sessions")
        .update(stepPatch(sessionRow))
        .eq("id", sessionRow.id);

      // 진행 표시 갱신 실패로 이미 차감된 요청을 실패로 뒤집지 않는다. 주제는 저장됐고
      // 재방문 시 `deriveResumeStep`(bootstrap.js)이 실제 데이터로 재개 지점을 다시
      // 계산하고, 프론트 사이드바는 라이브 세션 상태에서 `deriveStepStates`(P13)가
      // 다시 파생한다.
      if (sessionUpdateError) {
        console.error(
          "performance/recommend-topics 세션 단계 갱신 실패(무시):",
          sessionUpdateError,
        );
      }

      res.status(200).json({
        round: nextRound,
        topics: (insertedRows || [])
          .sort((a, b) => a.idx - b.idx)
          .map(toClientTopic),
        quotaRemaining,
        charged,
        maxRounds: MAX_ROUNDS,
        promptVersion: TOPIC_PROMPT_VERSION,
        model: PERFORMANCE_MODEL,
        knowledge: {
          source: knowledge.source,
          hitCount: knowledge.hitCount,
          degraded: knowledge.degraded,
          studentHistoryCount: Math.min(
            studentSessions.length,
            STUDENT_HISTORY_PROMPT_LIMIT,
          ),
        },
      });
    } finally {
      await trace.flush(supabaseAdmin);
    }
  },
});

// ── 실행 시간 (형제 라우트와 동일)
//    `MODEL_TIMEOUT_MS`(50초)는 **`maxDuration: 60`을 전제로 잡은 총 예산**이다. 이 선언이
//    없으면 Fluid compute가 꺼진 프로젝트의 기본 실행시간(Hobby 10초 / Pro 15초)이 적용돼
//    50초 AbortController는 발화조차 못 하고 플랫폼이 먼저 함수를 죽인다. 그러면
//      ① gemini-2.5-flash가 주제 3건 × 6섹션 장문을 만드는 **통상 경로**가 본문 없는 504로
//         끊겨 `src/lib/performance/topics.js`의 `response.json().catch(()=>null)`이 null이
//         되고 code='UNKNOWN'으로 떨어진다 — 원인이 사용자에게도 로그에도 남지 않는다.
//      ② 모델이 14초대에 돌아온 경우가 더 나쁘다. `consume_performance_credit`은 자체
//         트랜잭션으로 이미 커밋됐는데 직후 `performance_topics` INSERT나 응답 직렬화 중
//         함수가 죽으면 사용자는 **차감만 당하고 주제 0건 + 504**를 받는다(재시도하면
//         `already_charged`로 복구되지만, 상단 주석이 계약이라 선언한 "플랫폼이 함수를
//         죽이기 전에 우리가 응답을 만들어 돌려준다"가 성립하지 않는다).
//    `analyze-guide.js` / `admin-embed.js` / `cleanup-attachments.js`와 같은 60초를 쓴다.
export const config = { runtime: "nodejs", maxDuration: 60 };
