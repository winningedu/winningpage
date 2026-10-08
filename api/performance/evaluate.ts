// POST /api/performance/evaluate
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { sessionId, submissionId }
//     — **`confirm_submit` 플래그 폐기**(클라이언트가 스스로 선언하는 값이라 방어가
//       아니었다. 외부 `api/evaluate-text.js:29-31`은 `confirm_submit !== true`면 400을
//       냈는데, 그 값을 보내는 것도 클라이언트다)
//     (+ 이 저장소 확장분 `regenerate?: true` — 아래 「멱등 재생 vs 재생성」)
//   → 200 { report{id,sections,score,summary,model,promptVersion}, submissionRevision, … }
//   → 400 SUBMISSION_TOO_SHORT / 400 REQUIRED_FIELD_EMPTY{field}
//   → 409 REEVALUATION_LIMIT / 502 MODEL_FAILED
//   계약 표에 없는 추가분(형제 라우트 관례를 그대로 따른 것):
//   → 400 INVALID_SESSION_ID / INVALID_SUBMISSION_ID / EMPTY_SUBMISSION / SESSION_INCOMPLETE
//   → 401 UNAUTHENTICATED  → 403 NO_ENTITLEMENT / NOT_SESSION_OWNER
//   → 404 SUBMISSION_NOT_IN_SESSION
//   → 409 SESSION_NOT_CHARGED (design-report.js가 같은 사유로 정의한 코드)
//   → 429 EVALUATION_ATTEMPT_LIMIT (아래 게이트 ⑤)
//   **위 실패 전부 무차감이다.** 애초에 이 파일에는 차감 코드가 없다(아래 「회차」).
//
// ─────────────────────────────────────────────────────────────────────
// 1. 회차 — 이 파일은 차감하지 않는다 (외부 앱과 가장 크게 갈리는 지점)
// ─────────────────────────────────────────────────────────────────────
// §9.3 표: 「제출 → 평가 리포트 생성 | 없음」, 「`추가 평가 받기` | 없음(상한 2회)」.
// 외부 앱은 `incrementCallCount`를 **모델 호출 전에** 불러 선차감했고
// (`api/evaluate-text.js:51`), 그 함수는 read-then-write + fail-open이라 실패 시
// `allowed:true`를 돌려줬다(`api/_lib/sessions.js:240-244`). §9.3이 이 배치를
// 「버그이므로 이식 금지」로 명시했다.
//
// 그래서 이 파일은
//   · `consume_performance_credit`을 **호출하지 않는다**(import조차 없다),
//   · `program_access.meta`를 **쓰지 않는다**(읽기 스냅샷만, 안내용 `quotaRemaining`),
//   · `performance_credit_ledger`를 **읽기만** 한다(게이트 ③).
// 설령 실수로 차감 RPC를 부르더라도 `performance_credit_ledger.session_id` UNIQUE가
// 이미 차감된 세션에 `already_charged`를 돌려준다(sql/54 1-7) — 규율이 아니라 스키마가 막는다.
//
// ─────────────────────────────────────────────────────────────────────
// 2. 멱등 재생(replay) vs 재생성(regenerate)
// ─────────────────────────────────────────────────────────────────────
// P8(`recommend-topics.js`)·P10(`design-report.js`)과 같은 문제이고 같은 방식으로 푼다.
// 판정 기준은 **평가 리포트가 어느 제출본을 대상으로 만들어졌는가**다(sql/58 (1)의
// `performance_reports.submission_id`):
//   · 같은 `submissionId`로 다시 요청 → **200 재생**(`reused:true`, 모델 미호출)
//   · 다른 `submissionId`             → 정상 생성. 평가 리포트는 세션당 1행이라
//     이전 리포트를 **덮어쓴다**(sql/58 (2), §8.6 저장 리포트 뷰 계약)
//   · 같은 제출본을 정말 다시 채점하려면 `regenerate:true`를 **명시**한다
//     (`analyze-guide.js`의 `force:true`, `design-report.js`의 `regenerate`와 같은 관례).
// 재생 경로는 모델을 부르지 않으므로 `evaluation_count`도 `evaluation_attempt_count`도
// 올리지 않는다.
//
// ─────────────────────────────────────────────────────────────────────
// 3. 100자 게이트가 재는 대상 (Q35 — §12.2 L2373 결정)
// ─────────────────────────────────────────────────────────────────────
// 임계값 100은 원문 그대로 유지하고(`evaluate-text.js:37`) **측정 대상만 바꾼다.**
// 외부는 클라이언트가 조립한 결합 문자열(`주제: …` + `[제출 형식] …` + `[라벨]` × N)의
// 길이를 쟀기 때문에 본문을 한 글자도 안 써도 라벨만으로 100자를 넘겼다 — 「주제명만
// 붙여넣고 회차를 태우는 오용을 막는다」는 규정의 정확히 그 케이스가 통과했다.
// 여기서는 `checkSubmissionMinLength`(submission-schema.js)가 **스키마에 선언된 필드
// 값의 순수 본문 합**만 센다. 라벨·주제·헬퍼·`notice`는 세지 않고, `fields`에 스키마
// 밖 키가 섞여 와도 무시한다(클라이언트가 임의 키로 게이트를 우회할 수 없다).
//
// **값은 DB에서 읽는다.** 요청 본문에 `fields`를 받지 않으므로(계약이 `submissionId`
// 뿐이다) 클라이언트가 게이트 통과용 값과 실제 저장값을 다르게 보낼 표면이 없다.
// 프롬프트에 들어갈 평문도 서버가 조립한다(`buildSubmissionText`, §8.6).
//
// ─────────────────────────────────────────────────────────────────────
// 4. 상한 2축 (§9.2 「과금과 남용 방지를 분리한다」)
// ─────────────────────────────────────────────────────────────────────
//   · `evaluation_count`(성공만) ≥ 3         → 409 REEVALUATION_LIMIT{limit:2}
//        §9.2 상한 표 「재평가 | 2회 | `409 REEVALUATION_LIMIT`」 = 최초 1 + 재평가 2.
//   · `evaluation_attempt_count`(성공·실패) ≥ 10 → 429 EVALUATION_ATTEMPT_LIMIT
//        모델 실패(502)는 리포트를 남기지 않아 위 축이 오르지 않는다. 55·56·57번이
//        각각 막은 것과 **완전히 같은 구멍**이라 같은 수치·같은 방식으로 막는다.
//   차감을 늘려 막지 않는다 — 이 단계는 애초에 무차감이라 회차가 억제 수단이 못 된다.
//
// ─────────────────────────────────────────────────────────────────────
// 5. Gemini 결함 완화 (§8.4 ⓐ~ⓓ — P8/P10과 동일 패턴)
// ─────────────────────────────────────────────────────────────────────
//   ⓐ `EVALUATION_REPORT_SCHEMA`에 `number` 타입 필드가 하나도 없다. 점수는 `string`
//      + `pattern`으로 받고 서버가 `parseEvaluationScore`로 승격한다.
//   ⓑ `maxOutputTokens` 산정 근거는 `EVALUATION_GENERATION_DEFAULTS` 주석에 있다.
//   ⓒ `finishReason === 'MAX_TOKENS'`면 **파싱하지 않고** 재시도한다.
//   ⓓ 모델 원문은 서버 로그에만 남긴다. 응답 본문에 싣지 않는다(§8.6 L1811).
//   그리고 **텍스트 파서 폴백을 만들지 않는다**(§8.4, §12.4가 `index.html:1769-1851`
//   전량을 폐기로 지정). 이 파일의 유일한 파싱은 `JSON.parse` 한 줄이다.

import type { VercelResponse } from "@vercel/node";
import { generateWithRetry, PERFORMANCE_MODEL } from "../_lib/ai/gemini.js";
import {
  performanceTraceContext,
  retryReasonOf,
  validationOf,
} from "../_lib/ai/telemetry/performanceContext.js";
import { createAiTrace } from "../_lib/ai/telemetry/trace.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { scheduleAfterResponse } from "../_lib/performance/afterResponse.js";
import {
  guideTextFromSession,
  inferGuideStructure,
} from "../_lib/performance/guide-structure.js";
import { embedSessionVectorNow } from "../_lib/performance/instantEmbed.js";
import {
  buildEvaluationSystem,
  buildEvaluationUser,
  EMPTY_SUBMISSION_MESSAGE,
  EVALUATION_GENERATION_DEFAULTS,
  EVALUATION_MAX_OUTPUT_TOKENS_RETRY,
  EVALUATION_PROMPT_VERSION,
  EVALUATION_RECORD_SUMMARY_ROW_LABELS,
  EVALUATION_REPORT_SCHEMA,
  EVALUATION_REPORT_SECTIONS,
  EVALUATION_TRIAD_ROW_LABELS,
  NO_PREVIOUS_TOPIC_TEXT,
  parseEvaluationScore,
  SUBMISSION_TOO_SHORT_MESSAGE,
} from "../_lib/performance/prompts.js";
import {
  flattenReportSectionsToText,
  upsertSessionVectorMetadata,
} from "../_lib/performance/session-vectors.js";
import {
  buildSubmissionText,
  checkSubmissionMinLength,
  resolveSessionSubmissionSchema,
} from "../_lib/performance/submission-schema.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

const SERVICE_KEY = "suhaeng";

/** 성공한 평가 생성 상한 = 최초 1 + 재평가 2(§9.2 상한 표). */
const MAX_EVALUATIONS = 3;

/** §8.6/§9.2가 응답에 실을 값 = **재평가** 상한. */
const MAX_REEVALUATIONS = MAX_EVALUATIONS - 1;

/** 세션당 모델 호출 시도 상한(sql/58 (3)). 형제 라우트와 같은 10. */
const MAX_MODEL_ATTEMPTS_PER_SESSION = 10;

/**
 * 모델 호출 총 예산. `generateWithRetry`의 과부하 재시도와 아래 구조 재시도가 **모두**
 * 이 한 신호를 공유하므로 시한은 시도당이 아니라 총합이다. 파일 끝 `maxDuration: 60`을
 * 전제로 잡은 값이며 형제 라우트와 동일하다.
 */
const MODEL_TIMEOUT_MS = 50 * 1000;

/** 구조 실패(절단·파싱 실패·계약 위반) 시 재시도 횟수. §8.4 「1회 재요청 후 실패 처리」. */
const STRUCTURE_RETRY = 1;

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
  "submission_schema",
  "selected_topic_id",
  // sql/58 (3). 두 컬럼 없이 배포하면 PostgREST 42703으로 라우트 전체가 죽는다.
  "evaluation_count",
  "evaluation_attempt_count",
].join(",");

const REPORT_COLUMNS =
  "id,submission_id,report_type,sections,score,summary,model,prompt_version,created_at,updated_at";

/** 세션 SELECT 컬럼(SESSION_COLUMNS)과 정확히 대응하는 최소 필드 형태. */
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
  submission_schema: unknown;
  selected_topic_id: string | null;
  evaluation_count: number | null;
  evaluation_attempt_count: number | null;
};

/** performance_reports SELECT 컬럼(REPORT_COLUMNS)과 대응하는 최소 필드 형태. */
type ReportRow = {
  id: string;
  submission_id: string | null;
  report_type: string;
  sections: unknown;
  score: number | null;
  summary: string | null;
  model: string | null;
  prompt_version: string | null;
  created_at: string | null;
  updated_at: string | null;
  topic_id?: string | null;
};

/** 모델이 낸 평가 payload(구조 검증 전). */
type EvaluationPayload = Record<string, unknown>;

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

const trimmed = (value: unknown): string => String(value ?? "").trim();

/**
 * 잔여 회차 **읽기 전용** 스냅샷. 이 엔드포인트는 차감 RPC를 부르지 않으므로
 * (§9.3 「제출 → 평가 리포트 생성 | 없음」) 응답의 `quotaRemaining`은 안내용이다.
 * 조회가 실패해도 평가 응답을 죽이지 않는다.
 */
async function readQuota(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
) {
  try {
    return await readQuotaSnapshot(
      supabaseAdmin,
      userId,
      await findProgramAccessRow(
        supabaseAdmin,
        userId,
        // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
        SERVICE_CONFIGS[SERVICE_KEY]!,
      ),
    );
  } catch (error) {
    console.error("performance/evaluate quota lookup 실패(무시):", error);
    return await readQuotaSnapshot(supabaseAdmin, userId, null);
  }
}

/** `KeyValueView`가 읽는 행 계약: `rows[].{label, content}`(§8.5). */
function keyValueBlock(rows: { label: string; content: string }[]) {
  return { kind: "keyValue", rows: rows.filter((row) => row.content) };
}

/**
 * 모델 payload → §8.5 `sections[{id,label,blocks[]|text}]`.
 *
 * **라벨·순서·kind는 전부 서버 상수다**(`EVALUATION_REPORT_SECTIONS` /
 * `EVALUATION_TRIAD_ROW_LABELS` / `EVALUATION_RECORD_SUMMARY_ROW_LABELS`).
 * 모델은 값만 낸다 — P8 `TOPIC_DETAIL_SECTIONS`, P10 `DESIGN_REPORT_SECTIONS`와 같은
 * 원칙이라 §5.16 실측 라벨이 모델 온도에 흔들리지 않는다.
 *
 * kind 3종의 렌더 형태(§8.4):
 *   · `triad`    → keyValue 3행(잘한 점/아쉬운 점/보완할 점)
 *   · `note`     → 섹션 `text`(단문 1단락). `SectionedReportView`가 `<p>`로 렌더한다.
 *                  **3분할을 강제하지 않는 것이 요점**이다 — 강제하면 빈 필드가 나오거나
 *                  모델이 억지로 채운다(§8.4·§5.16 실측).
 *   · `keyValue` → 누적 기록용 요약 4행
 * `종합 평가 점수`(프롬프트 1번)는 `score`/`summary`로 승격돼 여기 들어오지 않는다.
 */
function buildEvaluationSections(payload: EvaluationPayload) {
  return EVALUATION_REPORT_SECTIONS.map((section) => {
    if (section.kind === "triad") {
      const source = (payload[section.id] || {}) as Record<string, unknown>;
      return {
        id: section.id,
        label: section.label,
        blocks: [
          keyValueBlock(
            EVALUATION_TRIAD_ROW_LABELS.map((row) => ({
              label: row.label,
              content: trimmed(source[row.key]),
            })),
          ),
        ],
      };
    }

    if (section.kind === "note") {
      return {
        id: section.id,
        label: section.label,
        text: trimmed(payload.plagiarism),
      };
    }

    const source = (payload.record_summary || {}) as Record<string, unknown>;
    return {
      id: section.id,
      label: section.label,
      blocks: [
        keyValueBlock(
          EVALUATION_RECORD_SUMMARY_ROW_LABELS.map((row) => ({
            label: row.label,
            content: trimmed(source[row.key]),
          })),
        ),
      ],
    };
  }).filter((section) =>
    Array.isArray(section.blocks)
      ? section.blocks.some((block) => block.rows.length)
      : Boolean(section.text),
  );
}

/**
 * 구조화 응답 검증. 통과 기준은 **필수 필드가 전부 비어 있지 않을 것 + 점수가 0~100
 * 정수로 파싱될 것** 둘뿐이다. 정규식도 헤더 보정도 없다(§8.4).
 *
 * 빈 문자열을 통과시키지 않는 이유는 P8·P10과 같다: `responseSchema`의 required는
 * **키의 존재**만 보장하고 값이 `""`인 것을 막지 못한다. 빈 값이 통과하면 라벨만 있고
 * 본문이 없는 섹션이 §5.16 모달에 뜬다.
 *
 * 점수가 없으면 계약 위반으로 다룬다 — `종합 평가 점수`는 모달 1번 카드라(§5.16)
 * 비면 화면이 무너진다. **텍스트에서 숫자를 긁어내는 폴백은 두지 않는다**(§12.4).
 *
 * @returns {{ok: true, score: number} | {ok: false, reason: string}}
 */
function validateEvaluationPayload(
  payload: unknown,
): { ok: true; score: number } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "not-an-object" };
  }

  const record = payload as Record<string, unknown>;
  const score = parseEvaluationScore(record.score);
  if (score === null) return { ok: false, reason: "score:unparseable" };
  if (!trimmed(record.summary)) return { ok: false, reason: "summary:empty" };

  for (const section of EVALUATION_REPORT_SECTIONS) {
    if (section.kind === "triad") {
      const source = record[section.id];
      if (!source || typeof source !== "object")
        return { ok: false, reason: `${section.id}:missing` };
      const sourceRecord = source as Record<string, unknown>;
      for (const row of EVALUATION_TRIAD_ROW_LABELS) {
        if (!trimmed(sourceRecord[row.key]))
          return { ok: false, reason: `${section.id}.${row.key}:empty` };
      }
      continue;
    }

    if (section.kind === "note") {
      if (!trimmed(record.plagiarism))
        return { ok: false, reason: "plagiarism:empty" };
      continue;
    }

    const source = record.record_summary;
    if (!source || typeof source !== "object")
      return { ok: false, reason: "record_summary:missing" };
    const sourceRecord = source as Record<string, unknown>;
    for (const row of EVALUATION_RECORD_SUMMARY_ROW_LABELS) {
      if (!trimmed(sourceRecord[row.key]))
        return { ok: false, reason: `record_summary.${row.key}:empty` };
    }
  }

  return { ok: true, score };
}

/**
 * `performance_reports.sections`에 저장하는 봉투. P10 `buildReportEnvelope`와 같은 모양이다.
 *
 * `score`/`summary`는 **컬럼에도 넣고 봉투에도 넣는다** — 컬럼은 목록 조회·정렬용
 * (§8.3 「시안 `86/100` 카드용」)이고, 봉투는 리포트 1건을 통째로 읽을 때 화면이
 * 컬럼과 봉투를 따로 조립하지 않게 하기 위함이다.
 * `structure`는 §12.2 3행대로 **설계 리포트가 저장해 둔 판정을 그대로 옮긴 것**이고,
 * `submissionId`/`revision`은 "어느 제출본을 채점했나"를 리포트 안에서도 답하게 한다.
 */
function buildReportEnvelope({
  score,
  summary,
  sections,
  structure,
  submissionId,
  revision,
}: {
  score: number;
  summary: string;
  sections: unknown;
  structure: unknown;
  submissionId: string;
  revision: number;
}) {
  return {
    v: 1,
    type: "evaluation",
    score,
    summary,
    sections,
    structure,
    submissionId,
    revision,
  };
}

/** 저장 봉투 → 응답 본문 공통부. 재생 경로와 신규 생성 경로가 같은 모양을 쓴다. */
function toClientReport(reportRow: ReportRow | null | undefined) {
  const envelope = (
    reportRow?.sections && typeof reportRow.sections === "object"
      ? reportRow.sections
      : {}
  ) as Record<string, unknown>;

  return {
    id: reportRow?.id ?? null,
    sections: Array.isArray(envelope.sections) ? envelope.sections : [],
    score: reportRow?.score ?? envelope.score ?? null,
    summary: reportRow?.summary ?? envelope.summary ?? "",
    structure: envelope.structure || null,
    model: reportRow?.model ?? null,
    promptVersion: reportRow?.prompt_version ?? null,
    createdAt: reportRow?.created_at ?? null,
    updatedAt: reportRow?.updated_at ?? null,
  };
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "평가 리포트 생성에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/evaluate",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);

    // 아래 본문 처리 중 던져지는 예외는 원래(마이그레이션 전)와 동일하게
    // `{charged:false}` extra를 실은 채 500으로 응답해야 한다 — 공통
    // defineHandler 최상위 catch는 그 extra를 모른다. 그래서 이 지점부터는
    // 로컬 try/catch로 감싸 기존 catch 블록의 동작을 그대로 재현한다
    // (배치-2 이슈로 별도 기록).
    try {
      // ── 이용권 재판정(§8.6 공통 규약). 잔여 회차는 보지 않는다 — 이미 차감된 세션은
      //    소진·만료 뒤에도 계속 진행하는 것이 규정이다(§9.3 정정).
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
      const submissionId =
        typeof body.submissionId === "string" ? body.submissionId.trim() : "";
      const regenerate = body.regenerate === true;

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

      // ── 게이트 ① 세션 소유권. 없는 세션과 남의 세션을 같은 응답으로 묶는다.
      const { data: sessionRowRaw, error: sessionError } = await supabaseAdmin
        .from("performance_sessions")
        .select(SESSION_COLUMNS)
        .eq("id", sessionId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (sessionError)
        throw new Error(`세션 조회 실패: ${sessionError.message}`);
      if (!sessionRowRaw) {
        return fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.", {
          charged: false,
        });
      }

      // `SESSION_COLUMNS`가 런타임 조립 문자열이라 supabase-js가 리터럴 파싱 기반 열
      // 추론을 못 하고 `GenericStringError`로 떨어진다(recommend-topics.ts와 같은 사유).
      const sessionRow = sessionRowRaw as unknown as SessionRow;

      // ── 게이트 ② 제출본 소유권. **세션 id로 묶어서** 조회하므로 남의 세션 제출본 id를
      //    넣으면 애초에 행이 나오지 않는다(§8.6 소유권 규약 + sql/54 RLS 이중 방어).
      const { data: submissionRow, error: submissionError } =
        await supabaseAdmin
          .from("performance_submissions")
          .select(
            "id,revision,fields,char_counts,is_draft,is_final,submitted_at",
          )
          .eq("id", submissionId)
          .eq("session_id", sessionRow.id)
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

      // ── 기존 평가 리포트(세션당 최대 1행, sql/58 (2)).
      const { data: existingReport, error: existingError } = await supabaseAdmin
        .from("performance_reports")
        .select(REPORT_COLUMNS)
        .eq("session_id", sessionRow.id)
        .eq("report_type", "evaluation")
        .maybeSingle();

      if (existingError)
        throw new Error(`평가 리포트 조회 실패: ${existingError.message}`);

      // 같은 제출본 재요청 = 더블클릭·새로고침·응답 유실. **모델을 부르지 않는다.**
      if (
        existingReport &&
        existingReport.submission_id === submissionRow.id &&
        !regenerate
      ) {
        const quota = await readQuota(supabaseAdmin, userId);

        res.status(200).json({
          report: toClientReport(existingReport),
          submissionId: submissionRow.id,
          submissionRevision: submissionRow.revision,
          quotaRemaining: quota.quotaRemaining,
          charged: false,
          reused: true,
          evaluationCount: Number(sessionRow.evaluation_count) || 0,
          maxEvaluations: MAX_EVALUATIONS,
        });
        return;
      }

      // ── 게이트 ③ 차감된 세션인가. `performance_credit_ledger.session_id`가 UNIQUE라
      //    행 존재 = 차감 완료다(sql/54 1-7). 이 파일은 차감하지 않으므로 **읽기만** 한다.
      //    정상 흐름에서 제출본이 있는 세션은 반드시 차감을 거쳤다 — 방어선이다.
      const { data: ledgerRow, error: ledgerError } = await supabaseAdmin
        .from("performance_credit_ledger")
        .select("id")
        .eq("session_id", sessionRow.id)
        .maybeSingle();

      if (ledgerError)
        throw new Error(`차감 원장 조회 실패: ${ledgerError.message}`);
      if (!ledgerRow) {
        return fail(
          res,
          409,
          "SESSION_NOT_CHARGED",
          "주제 추천을 먼저 받아 주세요.",
          {
            step: 3,
            charged: false,
          },
        );
      }

      // ── 게이트 ④ 설계 리포트 선행 조건.
      //    두 가지가 여기서만 나온다: ⓐ §12.2 3행이 「판정 결과를 구조체로 리포트 JSON에
      //    저장해 **STEP5가 재판정하지 않게** 한다」고 규정한 안내문 구조 판정,
      //    ⓑ 확정된 주제(프롬프트 `[선택 주제]`). 설계 리포트 없이 평가에 들어오면 둘 다
      //    없으므로 §8.6 표에 없는 코드지만 형제 라우트 관례대로 `SESSION_INCOMPLETE`로 막는다.
      const { data: designReport, error: designError } = await supabaseAdmin
        .from("performance_reports")
        .select("id,sections,topic_id")
        .eq("session_id", sessionRow.id)
        .eq("report_type", "design")
        .maybeSingle();

      if (designError)
        throw new Error(`설계 리포트 조회 실패: ${designError.message}`);
      if (!designReport) {
        return fail(
          res,
          400,
          "SESSION_INCOMPLETE",
          "설계 리포트를 먼저 받아 주세요.",
          {
            step: 4,
            charged: false,
          },
        );
      }

      // ── 제출 스키마. 세션에 영속화된 값이 정본이고(§8.3 「서버 소유로 승격」) 없으면
      //    판정한다. 판정 결과를 여기서 저장하지는 않는다 — 저장 지점은 `submission.js`
      //    하나로 둔다(두 곳에서 쓰면 어느 쪽이 먼저 도느냐로 값이 갈릴 수 있다).
      // sessionRow는 SubmissionSession이 실제로 읽는 필드를 전부 포함하는 DB 행이다.
      const { schema } = resolveSessionSubmissionSchema(
        sessionRow as Parameters<typeof resolveSessionSubmissionSchema>[0],
      );
      const fields =
        submissionRow.fields && typeof submissionRow.fields === "object"
          ? submissionRow.fields
          : {};
      const gate = checkSubmissionMinLength(schema, fields);

      // ── 게이트 ⑤ 제출물 게이트(§8.6 400 3종). 상한 게이트보다 **먼저** 본다 —
      //    형식 미달 요청이 재평가 슬롯을 태우면 안 된다.
      if (gate.total === 0) {
        return fail(res, 400, "EMPTY_SUBMISSION", EMPTY_SUBMISSION_MESSAGE, {
          charged: false,
        });
      }
      if (gate.missingRequired.length) {
        return fail(
          res,
          400,
          "REQUIRED_FIELD_EMPTY",
          "필수 항목을 모두 작성해 주세요.",
          {
            field: gate.missingRequired[0],
            missingRequired: gate.missingRequired,
            charged: false,
          },
        );
      }
      if (gate.total < gate.threshold) {
        // 문구는 원문 그대로다(`evaluate-text.js:39`).
        return fail(
          res,
          400,
          "SUBMISSION_TOO_SHORT",
          SUBMISSION_TOO_SHORT_MESSAGE,
          {
            total: gate.total,
            threshold: gate.threshold,
            charged: false,
          },
        );
      }

      // ── 게이트 ⑥ 재평가 상한(§9.2). 사용자에게 보이는 상한이며 **성공한 생성만** 센다.
      //    ⚠ read-then-write다 — 실제 +1은 커밋 RPC 안에서 일어나므로(sql/58 (4)) 같은
      //    세션 동시 요청 2건은 둘 다 통과한 뒤 각각 +1 할 수 있다(fail-safe 방향: 덜
      //    세지 않고 더 센다). 리포트 행이 2개가 되지는 않는다 — 부분 UNIQUE + upsert가
      //    세션당 evaluation 1행을 강제한다(sql/58 (2)).
      //    **모델 호출이 실제로 몇 번 나가느냐를 막는 것은 게이트 ⑦이다** — 아래 시도
      //    카운터가 원자적 CAS라 동시 요청 중 한 건만 통과한다(검토 P11).
      const evaluationCount = Number(sessionRow.evaluation_count) || 0;
      if (evaluationCount >= MAX_EVALUATIONS) {
        return fail(
          res,
          409,
          "REEVALUATION_LIMIT",
          `평가는 최대 ${MAX_REEVALUATIONS}번까지 다시 받을 수 있어요.`,
          {
            limit: MAX_REEVALUATIONS,
            maxEvaluations: MAX_EVALUATIONS,
            evaluationCount,
            reportId: existingReport?.id ?? null,
            charged: false,
          },
        );
      }

      // ── 게이트 ⑦ 세션당 모델 시도 상한(sql/58 (3)). 게이트 ⑥이 세지 못하는 축이다.
      const attemptCount = Number(sessionRow.evaluation_attempt_count) || 0;
      if (attemptCount >= MAX_MODEL_ATTEMPTS_PER_SESSION) {
        return fail(
          res,
          429,
          "EVALUATION_ATTEMPT_LIMIT",
          "이 수행평가에서 평가를 너무 여러 번 요청했어요. 잠시 후 새 수행평가로 다시 시작해 주세요.",
          { maxAttempts: MAX_MODEL_ATTEMPTS_PER_SESSION, charged: false },
        );
      }

      // 모델을 실제로 부르기 **직전**에 올린다. 실패도 세야 상한이 의미를 갖는다.
      //
      // ⚠️ **낙관적 잠금(CAS)이다**(검토 P11). `attemptCount + 1`을 조건 없이 덮어쓰면
      //    동시 요청 N건이 전부 같은 스냅샷을 읽고 같은 값을 써서 카운터가 1만 오르고,
      //    게이트 ⑥·⑦이 함께 무력화된다. 평가는 **무차감**이라(§9.3) 회차가 억제 수단이
      //    아니고, evaluate 1회는 최대 6회(과부하 재시도 3 × 구조 재시도 2)의 생성 호출에
      //    최대 `MAX_TOTAL_CHARS` 분량 프롬프트를 싣는다 — 이 두 상한이 유일한 방어선이다.
      //    `.eq('evaluation_attempt_count', attemptCount)`를 붙여 **읽은 값 그대로일 때만**
      //    쓰고, 0행이면 그 사이 다른 요청이 선점했다는 뜻이라 429로 떨어뜨린다(같은 코드다 —
      //    사용자에게는 "지금은 다시 요청할 수 없다"로 동일하고, 클라이언트 분기도
      //    §5.20 code 기준이라 갈리지 않는다).
      const { data: attemptRow, error: attemptCounterError } =
        await supabaseAdmin
          .from("performance_sessions")
          .update({ evaluation_attempt_count: attemptCount + 1 })
          .eq("id", sessionRow.id)
          .eq("evaluation_attempt_count", attemptCount)
          .select("id")
          .maybeSingle();

      if (attemptCounterError) {
        throw new Error(
          `평가 시도 횟수 갱신 실패: ${attemptCounterError.message}`,
        );
      }

      if (!attemptRow) {
        // 경합에서 졌다 — 모델을 부르지 않고 끝낸다. 여기서 그냥 진행하면 상한이
        // 있으나 마나가 된다(위 ⚠️).
        return fail(
          res,
          429,
          "EVALUATION_ATTEMPT_LIMIT",
          "평가 요청이 이미 진행 중이에요. 잠시 후 다시 시도해 주세요.",
          {
            maxAttempts: MAX_MODEL_ATTEMPTS_PER_SESSION,
            concurrent: true,
            charged: false,
          },
        );
      }

      // ── 확정 주제. 설계 리포트가 있으면 반드시 확정돼 있다(sql/57 (4)가 한 트랜잭션으로
      //    묶는다). 그래도 조회 실패를 프롬프트 붕괴로 만들지 않고 `미입력`으로 축퇴시킨다.
      let selectedTopic = "";
      const topicId = sessionRow.selected_topic_id || designReport.topic_id;
      if (topicId) {
        const { data: topicRow, error: topicError } = await supabaseAdmin
          .from("performance_topics")
          .select("title")
          .eq("id", topicId)
          .eq("session_id", sessionRow.id)
          .maybeSingle();

        if (topicError)
          throw new Error(`주제 조회 실패: ${topicError.message}`);
        selectedTopic = trimmed(topicRow?.title);
      }

      // ── Q68 제출 형식 주입에 쓸 판정. **설계 리포트가 저장해 둔 값을 그대로 읽는다**
      //    (§12.2 3행). 같은 세션에서 두 번 판정하면 안내문이 그대로여도 결과가 갈릴
      //    여지가 생기기 때문이다. 옛 배포본이 만든 리포트 등 봉투에 판정이 없는 경우에만
      //    현장 판정으로 축퇴한다(프롬프트를 비우지 않는다).
      const designEnvelope =
        designReport.sections && typeof designReport.sections === "object"
          ? designReport.sections
          : {};
      const storedStructure = designEnvelope.structure;
      // sessionRow는 GuideSession이 실제로 읽는 필드를 전부 포함하는 DB 행이다(unknown 캐스트 경유).
      const structure =
        storedStructure && trimmed(storedStructure.type)
          ? storedStructure
          : inferGuideStructure(
              sessionRow as Parameters<typeof inferGuideStructure>[0],
            );

      const assessmentText = guideTextFromSession(
        sessionRow as Parameters<typeof guideTextFromSession>[0],
      );
      const submissionText = buildSubmissionText(selectedTopic, schema, fields);

      const system = buildEvaluationSystem({
        structureType: structure.type,
        structureReason: structure.reason,
        writingFrame: structure.writingFrame,
      });

      // ⚠ `buildEvaluationUser`는 RAG 텍스트 인자를 **아예 받지 않는다**(시그니처가 계약).
      //   원문 작업 지시 `내부 위닝DB 자료는 사용하지 말고`(`evaluate-text.js:151`)가
      //   평가 단계의 계약이라, 여기서 자료를 끌어오면 채점이 오염된다. 설계 리포트와
      //   정반대 방향이므로 `loadDynamicAssessmentKnowledge`를 import조차 하지 않는다.
      // buildEvaluationUser는 값을 `|| ""`로 다루므로 null→"" 치환은 결과에 영향 없다.
      const userMsg = buildEvaluationUser({
        assessmentText,
        selectedTopic,
        career: sessionRow.career_goal || "",
        gradeLabel: sessionRow.grade_label || "",
        semester: sessionRow.semester || "",
        schoolType: sessionRow.school_type || "",
        subjectGroup: sessionRow.subject_group || "",
        subject: sessionRow.subject || "",
        previousTopic:
          trimmed(sessionRow.previous_topic) || NO_PREVIOUS_TOPIC_TEXT,
        submissionText,
      });

      // 계기판 기록. 모델 호출부터 응답까지를 try/finally 로 감싸 어떤 경로로
      // 빠져나가도 응답 직전에 한 번 내보낸다. 기록 실패는 요청에 영향을 주지 않는다.
      const trace = createAiTrace(
        performanceTraceContext({
          feature: "evaluate",
          sessionId: sessionRow.id,
          profileId: userId,
          promptVersion: EVALUATION_PROMPT_VERSION,
        }),
      );
      try {
        // ── 모델 호출. 실패 형태 3가지를 각각 다르게 다룬다(§8.4 ⓑ·ⓒ·ⓓ).
        const abortController = new AbortController();
        const abortTimer = setTimeout(
          () => abortController.abort(),
          MODEL_TIMEOUT_MS,
        );

        let payload: EvaluationPayload | null = null;
        let score: number | null = null;
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
                      : EVALUATION_GENERATION_DEFAULTS.temperature,
                    // 같은 상한으로 다시 부르면 같은 자리에서 다시 잘린다 → 올려서 재시도.
                    maxOutputTokens: isRetry
                      ? EVALUATION_MAX_OUTPUT_TOKENS_RETRY
                      : EVALUATION_GENERATION_DEFAULTS.maxOutputTokens,
                    thinkingConfig: { thinkingBudget: 0 },
                    responseMimeType: "application/json",
                    responseSchema: EVALUATION_REPORT_SCHEMA,
                    abortSignal: abortController.signal,
                  },
                },
                2,
                trace,
              );
            } catch (modelError) {
              // 과부하 재시도(700ms×2^n, 2회)는 generateWithRetry가 이미 소진했다.
              // §8.6이 이 엔드포인트에 정의한 실패 코드는 `502 MODEL_FAILED` 하나뿐이라
              // 상류 장애도 구조 위반도 같은 코드로 나간다(형제 라우트의 503/422 2분할과
              // 다른 점이며, 계약 표를 따른 결과다). **무차감**.
              console.error("performance/evaluate 모델 호출 실패:", modelError);
              return fail(
                res,
                502,
                "MODEL_FAILED",
                "평가 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
                {
                  charged: false,
                },
              );
            }

            const finishReason = response?.candidates?.[0]?.finishReason;

            // ⓒ — 절단된 응답은 **파싱하지 않는다.**
            if (finishReason === "MAX_TOKENS") {
              lastFailure = "finish-reason:MAX_TOKENS";
              console.warn(
                `performance/evaluate MAX_TOKENS 절단 (attempt ${attempt + 1})`,
              );
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            if (finishReason && finishReason !== "STOP") {
              lastFailure = `finish-reason:${finishReason}`;
              console.warn(
                `performance/evaluate 비정상 종료 ${finishReason} (attempt ${attempt + 1})`,
              );
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            const rawText = trimmed(response?.text);
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
              // ⓓ — 원문은 서버 로그에만 남긴다.
              console.error(
                "performance/evaluate JSON 파싱 실패:",
                parseError?.message,
                rawText.slice(0, 400),
              );
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            const check = validateEvaluationPayload(parsed);
            if (!check.ok) {
              // tsconfig strict:false(strictNullChecks 꺼짐)에서 이 boolean 판별
              // 유니온이 `!check.ok`만으로 좁혀지지 않는다(recommend-topics.ts와 같은
              // 격리 재현 결과) — 그래서 여기서만 명시적으로 좁힌다.
              const { reason } = check as { ok: false; reason: string };
              lastFailure = `contract:${reason}`;
              console.warn(
                `performance/evaluate 계약 위반 ${reason} (attempt ${attempt + 1})`,
              );
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            payload = parsed as EvaluationPayload;
            score = (check as { ok: true; score: number }).score;
            trace.annotateLastCall(validationOf(true, ""));
            break;
          }
        } finally {
          clearTimeout(abortTimer);
        }

        if (!payload) {
          // 재시도까지 실패. **무차감**이고 제출본 상태도 그대로다(RPC를 부르지 않았다).
          console.error(`performance/evaluate 계약 위반 확정: ${lastFailure}`);
          return fail(
            res,
            502,
            "MODEL_FAILED",
            "평가 리포트를 정리하지 못했어요. 다시 시도해 주세요.",
            {
              charged: false,
            },
          );
        }

        const sections = buildEvaluationSections(payload);
        const summary = trimmed(payload.summary);

        // ── 학생 과거 수행 RAG용 벡터 메타데이터 upsert. **커밋 RPC보다 반드시 먼저** 한다 —
        //    RPC(sql/58_performance_submission.sql 약 289-293행)가
        //    `performance_session_vectors.rag_use`를 `where v.session_id = p_session_id`로
        //    승격하는데, 그 시점에 이 세션의 벡터 행이 이미 있어야 **첫 평가 커밋에서도**
        //    승격이 즉시 일어난다. 순서를 뒤집으면 첫 커밋에서는 행이 없어 그 UPDATE가
        //    0행에 적중하고 승격이 다음 평가나 finalize까지 늦어진다.
        //    실패해도 평가 리포트 저장 자체는 막지 않는다(부가 기능).
        //    성공했을 때만 응답 뒤 즉시 임베딩을 예약한다(아래 sessionVectorReady).
        let sessionVectorReady = false;
        try {
          await upsertSessionVectorMetadata({
            supabase: supabaseAdmin,
            sessionId: sessionRow.id,
            profileId: userId,
            // upsertSessionVectorMetadata 내부는 `|| null`로 저장하므로 null→"" 치환은 결과에 영향 없다.
            gradeLabel: sessionRow.grade_label || "",
            subjectGroup: sessionRow.subject_group || "",
            subject: sessionRow.subject || "",
            careerGoal: sessionRow.career_goal || "",
            topicTitle: selectedTopic,
            summaryText: `평가 총평: ${summary}\n설계 리포트: ${flattenReportSectionsToText(designEnvelope.sections)}`,
          });
          sessionVectorReady = true;
        } catch (vectorError) {
          // 학생 과거 수행 RAG는 부가 기능이다 — 실패해도 평가 리포트 저장 자체를 막지 않는다.
          console.error(
            "performance/evaluate 학생 과거 수행 벡터 갱신 실패:",
            vectorError,
          );
        }

        const structureForClient = {
          type: structure.type,
          reason: structure.reason,
          writingFrame: structure.writingFrame,
        };

        // ─────────────────────────────────────────────────────────────────
        // 커밋 — 제출 확정 + 리포트 저장 + 진행 단계 + rag_use 승격이 **한 트랜잭션**이다
        // (sql/58 (4)). 이 지점까지 오지 못하면 아무것도 남지 않는다.
        // ─────────────────────────────────────────────────────────────────
        const { data: commitRaw, error: commitError } = await supabaseAdmin.rpc(
          "commit_performance_evaluation_report",
          {
            p_session_id: sessionRow.id,
            p_profile_id: userId,
            p_submission_id: submissionRow.id,
            p_sections: buildReportEnvelope({
              // payload가 non-null이면(위 가드 통과) score도 같은 블록에서 함께 설정됐다.
              score: score!,
              summary,
              sections,
              structure: structureForClient,
              submissionId: submissionRow.id,
              revision: submissionRow.revision,
            }),
            p_score: score,
            p_summary: summary,
            p_model: PERFORMANCE_MODEL,
            p_prompt_version: EVALUATION_PROMPT_VERSION,
          },
        );

        if (commitError) {
          console.error("performance/evaluate 커밋 RPC 실패:", commitError);
          return fail(
            res,
            500,
            "INTERNAL",
            "평가 리포트 저장에 실패했습니다.",
            {
              charged: false,
            },
          );
        }

        const commit =
          commitRaw && typeof commitRaw === "object" ? commitRaw : {};
        const commitStatus = String(commit.status || "");

        // 소유권은 위에서 이미 확인했으므로 아래 두 상태는 경합(세션·제출본이 그 사이에
        // 지워짐)에서만 나온다. RPC가 판정 권위를 갖는 지점이라 그대로 전달한다.
        if (commitStatus === "session_not_found") {
          return fail(
            res,
            403,
            "NOT_SESSION_OWNER",
            "세션을 찾을 수 없습니다.",
            {
              charged: false,
            },
          );
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
        if (commitStatus !== "committed" || !commit.report_id) {
          console.error(
            "performance/evaluate 알 수 없는 커밋 상태:",
            commitStatus,
          );
          return fail(
            res,
            500,
            "INTERNAL",
            "평가 리포트 저장에 실패했습니다.",
            {
              charged: false,
            },
          );
        }

        const quota = await readQuota(supabaseAdmin, userId);

        res.status(200).json({
          report: {
            id: commit.report_id,
            sections,
            score,
            summary,
            structure: structureForClient,
            model: PERFORMANCE_MODEL,
            promptVersion: EVALUATION_PROMPT_VERSION,
          },
          submissionId: submissionRow.id,
          submissionRevision: submissionRow.revision,
          charCounts: gate.perField,
          quotaRemaining: quota.quotaRemaining,
          // §8.6이 이 엔드포인트 응답에 못박은 값이다. 이 파일에는 차감 코드가 없다.
          charged: false,
          evaluationCount:
            Number(commit.evaluation_count) || evaluationCount + 1,
          maxEvaluations: MAX_EVALUATIONS,
        });

        // 응답을 보낸 뒤 이 세션 벡터 1건을 바로 임베딩한다. 같은 날 다음 수행평가의
        // 과거 수행 검색에 직전 기록이 잡히게 하려는 것이다. 실패분은 매일 도는
        // embed-session-vectors 크론이 pending 으로 다시 잡는다.
        if (sessionVectorReady) {
          scheduleAfterResponse(async () => {
            const instantTrace = createAiTrace(
              performanceTraceContext({
                feature: "session_vectors",
                sessionId: sessionRow.id,
                profileId: userId,
                step: "instant",
              }),
            );
            await embedSessionVectorNow(supabaseAdmin, sessionRow.id, {
              telemetry: instantTrace,
            });
            await instantTrace.flush(supabaseAdmin);
          });
        }
      } finally {
        await trace.flush(supabaseAdmin);
      }
    } catch (error) {
      // 원 예외 메시지를 응답에 싣지 않는다(§8.6 공통 규약 「실패 응답」).
      console.error("performance/evaluate error:", error);
      return fail(res, 500, "INTERNAL", "평가 리포트 생성에 실패했습니다.", {
        charged: false,
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────
// 실패 경로별 잔여 상태 (전부 무차감)
// ─────────────────────────────────────────────────────────────────────
//   인증/이용권/소유권/제출물 게이트/각종 상한  → 아무것도 안 남음
//   attempt +1 이후 모델 실패(502)              → attempt +1만
//   커밋 RPC 실패(500)                          → attempt +1만.
//        제출본은 draft 그대로 · 리포트 없음 — **반쪽 상태가 원리적으로 없다**
//   RPC 성공 후 응답 직렬화 중 함수 종료        → 전부 커밋됨.
//        재요청하면 멱등 재생이 저장분을 그대로 돌려준다(모델 재호출 없음)
//
// 실행 시간 (형제 라우트와 동일)
//   `MODEL_TIMEOUT_MS`(50초)는 **`maxDuration: 60`을 전제로 잡은 총 예산**이다. 이 선언이
//   없으면 Fluid compute가 꺼진 프로젝트의 기본 실행시간(Hobby 10초 / Pro 15초)이 적용돼
//   50초 AbortController는 발화조차 못 하고 플랫폼이 먼저 함수를 죽인다 — 커밋 RPC는 이미
//   성립했는데 사용자는 "리포트는 저장됐는데 화면엔 실패"를 보게 된다(재요청하면 멱등
//   재생이 복구하지만 계약은 깨진다).
export const config = { runtime: "nodejs", maxDuration: 60 };
