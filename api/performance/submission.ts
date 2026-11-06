// PUT  /api/performance/submission   — 제출물 저장(중간 저장 / 제출)
// GET  /api/performance/submission?sessionId=…  — 제출폼 스키마 + 최신 제출본
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   PUT { sessionId, fields:{[k]:v}, mode:'draft'|'submit' }
//     — **평문 결합 텍스트를 클라이언트가 조립해 보내지 않는다**
//   → 200 { submissionId, revision, charCounts, savedAt }
//   → 400 EMPTY_SUBMISSION / 400 UNKNOWN_FIELD / 409 SESSION_FINALIZED
//   계약 표에 없는 추가분(형제 라우트 관례를 그대로 따른 것):
//   → 400 INVALID_SESSION_ID / INVALID_FIELDS / INVALID_FIELD_VALUE
//   → 401 UNAUTHENTICATED  → 403 NO_ENTITLEMENT / NOT_SESSION_OWNER
//   → 409 REEVALUATION_LIMIT (아래 「revision을 언제 올리는가」)
//   → 413 SUBMISSION_TOO_LARGE (아래 「크기 상한」)
//   mode:'submit'에서만: → 400 SUBMISSION_TOO_SHORT / 400 REQUIRED_FIELD_EMPTY{field}
//   **이 파일에는 차감 코드가 없다**(§9.3 — 차감 지점은 recommend-topics 1곳뿐).
//
// ─────────────────────────────────────────────────────────────────────
// 1. draft upsert 키가 `(session_id, revision)`인 이유 (§8.3 L1639)
// ─────────────────────────────────────────────────────────────────────
// 외부 앱의 임시저장 키는 `(main_id, report_type='draft', selected_topic)`이다
// (`api/_lib/reports.js:262-340`). **주제 문구를 한 글자라도 고치면 키가 달라져
// 이전 초안이 고아가 된다** — 학생은 "중간 저장했는데 사라졌다"를 겪고, DB에는
// 회수되지 않는 draft 행이 쌓인다(§12.4).
//
// 여기서는 키가 세션 + revision이라 **본문을 어떻게 고치든 같은 행에 떨어진다.**
// 주제는 애초에 제출 필드가 아니다(확정 주제는 `performance_sessions.selected_topic_id`
// 가 들고 있고 제출폼의 `주제*` 칸은 그 prefill 표시다, §5.14).
//
// ⚠ §8.3 L1623 단정: 「**draft는 리포트가 아니다.**」 외부는 중간저장을
//   `report_type='draft'` 리포트 행으로 넣고 `report_content`에 안내 문구
//   (`[중간 저장] …`)를 채워 넣었으며(`api/_lib/reports.js:264`, `:276`) 그 안내
//   문구까지 임베딩됐다(`:19`, `:279-280`). 여기서 draft는 `performance_submissions`
//   행이고 `performance_reports`에는 아무것도 만들지 않는다. 임베딩 승격(`rag_use`)도
//   평가·확정 2지점뿐이다(sql/58 (4)(5)).
//
// ── revision을 언제 올리는가 (서버가 정한다 — 클라이언트 플래그 없음)
//    §8.3: 「`revision` — `추가 평가 받기` 시 증가」. 그 시점을 클라이언트가 선언하는
//    플래그로 받으면 §8.6이 `confirm_submit`을 폐기한 이유(클라이언트가 스스로
//    선언하는 값)를 다시 들여오게 된다. 그래서 **최신 행의 상태로 유도**한다:
//      · 최신 행이 없음            → revision 1 신규
//      · 최신 행이 draft(미제출)   → **그 행을 덮어쓴다**(중간 저장 반복)
//      · 최신 행이 제출됨/최종본   → revision + 1 신규
//    `추가 평가 받기`는 UI에서 폼을 복원하는 동작이고(§12.2), 복원된 폼의 첫 저장이
//    자연스럽게 새 revision이 된다. 별도 신호가 필요 없다.
//
//    상한은 `MAX_REVISIONS`(3 = 최초 1 + 재평가 2, §9.2 「재평가 | 2회」)이며 초과 시
//    `409 REEVALUATION_LIMIT`이다. §8.6은 이 코드를 `evaluate`에 정의했는데, **같은
//    상한을 저장 단계에서 먼저 알려 주는 편이** 학생이 쓴 뒤에 거절당하는 것보다 낫다.
//    같은 사유·같은 코드라 클라이언트 분기(§5.20 code 기준)가 갈리지 않는다.
//
// ── `409 SESSION_FINALIZED`는 세션 잠금이 아니다 (Q67)
//    Q67 결정: 「확정 후에도 **재평가를 허용**하되 최종본은 1건만 고정한다」. 그래서
//    확정된 세션이라도 새 revision 저장은 열려 있고, 이 코드는 **이미 초안이 아닌 그 행
//    자체를 덮어쓰려는 경우**에만 난다. 정상 경로에서는 위 revision 규칙이 그런 요청을
//    만들지 않지만, 다중 탭에서 A가 draft를 쓰는 사이 B가 같은 행을 제출하거나 확정하면
//    A의 update가 `is_draft = true` / `is_final = false` 조건에 걸려 0행이 된다 — 그때
//    이 코드를 돌려준다. 즉 **제출·확정된 제출본은 불변**이라는 규칙의 실행부다.
//    (`is_draft` 조건이 없으면 뒤늦은 draft 저장이 이미 채점된 원고를 덮어써 평가 리포트와
//     저장 원고가 어긋난다 — `updateRevision` 주석 참고, 검토 P11.)
//
// ── 크기 상한
//    필드당 `MAX_FIELD_CHARS`, 합계 `MAX_TOTAL_CHARS`. 문항형은 최대 20필드라
//    상한이 없으면 요청 본문 하나로 jsonb 수 MB를 밀어 넣을 수 있고, 그 값은 이후
//    평가 프롬프트에 그대로 실린다(토큰 비용). §9.2 「과금과 남용 방지를 분리한다」에
//    따라 회차가 아니라 상한으로 막는다.

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  EMPTY_SUBMISSION_MESSAGE,
  SUBMISSION_TOO_SHORT_MESSAGE,
} from "../_lib/performance/prompts.js";
import {
  checkSubmissionMinLength,
  countSubmissionChars,
  resolveSessionSubmissionSchema,
  SUBMISSION_MIN_CHARS,
} from "../_lib/performance/submission-schema.js";
import {
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import { tenantReasonExtra } from "../_lib/tenantUsage.js";

const SERVICE_KEY = "suhaeng";

/** 세션당 제출본 최대 revision 수 = 최초 1 + 재평가 2(§9.2 상한 표). */
export const MAX_REVISIONS = 3;

/** §8.6이 `REEVALUATION_LIMIT` 응답에 실을 값 = **재평가** 상한. */
const MAX_REEVALUATIONS = MAX_REVISIONS - 1;

/**
 * 필드 1개 / 합계 최대 글자 수. 시안 카운터 실측이 `356자`·`840자`·`421자`이고
 * (§5.14) 문항형 20필드가 상한이므로, 정상 작성분의 10배 이상 여유를 두고 잡았다.
 * 넘으면 저장 자체를 거부한다 — 잘라서 저장하면 학생은 잘린 사실을 모른 채 제출한다.
 */
const MAX_FIELD_CHARS = 20000;
const MAX_TOTAL_CHARS = 120000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_COLUMNS = [
  "id",
  "profile_id",
  "status",
  "current_step",
  "completed_steps",
  "guide_input_mode",
  "guide_freetext",
  "guide_json",
  "submission_format",
  "submission_schema",
  "selected_topic_id",
].join(",");

const SUBMISSION_COLUMNS =
  "id,revision,fields,char_counts,is_draft,is_final,finalized_at,finalize_reason,submitted_at,created_at,updated_at";

type SessionRow = {
  id: string;
  profile_id: string;
  status: string;
  current_step: number | null;
  completed_steps: unknown;
  guide_input_mode?: string;
  guide_freetext?: string;
  guide_json?: { mode?: string; text?: string };
  submission_format?: string | null;
  submission_schema?: NonNullable<
    Parameters<typeof resolveSessionSubmissionSchema>[0]
  >["submission_schema"];
  selected_topic_id: string | null;
};

type SubmissionRow = {
  id: string;
  revision: number;
  fields: unknown;
  char_counts: unknown;
  is_draft: boolean;
  is_final: boolean;
  finalized_at: string | null;
  finalize_reason: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

type Schema = ReturnType<typeof resolveSessionSubmissionSchema>["schema"];

type NormalizeFieldsResult =
  | { ok: true; fields: Record<string, string> }
  | { ok: false; code: "INVALID_FIELDS" }
  | { ok: false; code: "UNKNOWN_FIELD"; field: string }
  | { ok: false; code: "INVALID_FIELD_VALUE"; field: string }
  | { ok: false; code: "FIELD_TOO_LARGE"; field: string; label: string }
  | { ok: false; code: "SUBMISSION_TOO_LARGE" };

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

function toClientSubmission(row: SubmissionRow | null) {
  if (!row) return null;
  return {
    submissionId: row.id,
    revision: row.revision,
    fields: row.fields && typeof row.fields === "object" ? row.fields : {},
    charCounts:
      row.char_counts && typeof row.char_counts === "object"
        ? row.char_counts
        : {},
    isDraft: row.is_draft === true,
    isFinal: row.is_final === true,
    finalizedAt: row.finalized_at ?? null,
    finalizeReason: row.finalize_reason ?? null,
    submittedAt: row.submitted_at ?? null,
    savedAt: row.updated_at ?? row.created_at ?? null,
  };
}

/**
 * 세션 행 → 제출 스키마. 이미 영속화된 값이 있으면 재판정하지 않고
 * (§12.2 3행 「STEP5가 재판정하지 않게 한다」), 없으면 판정한 뒤 **여기서 저장한다**.
 *
 * 저장 주체가 서버인 것이 §8.3의 요구다 — 외부는 DOM `data-schema` 속성 왕복이라
 * 학생이 개발자도구로 필드 목록을 바꿔 보낼 수 있었다(`index.html:2411`).
 * 저장에 실패해도 요청을 죽이지 않는다(다음 요청이 같은 판정을 다시 낸다).
 */
async function resolveAndPersistSchema(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  sessionRow: SessionRow,
) {
  // sessionRow는 SubmissionSession이 실제로 읽는 필드를 전부 포함하는 DB 행이다.
  const { schema, inferred } = resolveSessionSubmissionSchema(
    sessionRow as Parameters<typeof resolveSessionSubmissionSchema>[0],
  );

  if (inferred) {
    const { error } = await supabaseAdmin
      .from("performance_sessions")
      .update({ submission_schema: schema, submission_format: schema.label })
      .eq("id", sessionRow.id);

    if (error) {
      console.error(
        "performance/submission 스키마 영속화 실패(무시):",
        error.message,
      );
    }
  }

  return schema;
}

/** 세션의 최신 제출본 1건(없으면 null). revision 내림차순. */
async function loadLatestSubmission(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  sessionId: string,
): Promise<SubmissionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("performance_submissions")
    .select(SUBMISSION_COLUMNS)
    .eq("session_id", sessionId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`제출본 조회 실패: ${error.message}`);
  return (data as SubmissionRow) || null;
}

/**
 * 요청 `fields` 검증 + 스키마 키만 남긴 정규화.
 *
 * **스키마에 없는 키는 조용히 버리지 않고 거부한다**(§8.6 `400 UNKNOWN_FIELD`).
 * 버리면 학생이 쓴 내용이 소리 없이 사라지고, 클라이언트 폼이 서버 스키마와
 * 어긋났다는 사실도 드러나지 않는다.
 */
function normalizeFields(schema: Schema, raw: unknown): NormalizeFieldsResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "INVALID_FIELDS" };
  }

  const allowed = new Map(schema.fields.map((field) => [field.key, field]));
  const clean: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const field = allowed.get(key);
    if (!field) return { ok: false, code: "UNKNOWN_FIELD", field: key };

    // 문자열만 받는다. 숫자·객체를 String()으로 흡수하면 `[object Object]`가 학생
    // 원고로 저장되고 그대로 프롬프트에 실린다.
    if (typeof value !== "string") {
      return { ok: false, code: "INVALID_FIELD_VALUE", field: key };
    }
    if (value.length > MAX_FIELD_CHARS) {
      return {
        ok: false,
        code: "FIELD_TOO_LARGE",
        field: key,
        label: field.label,
      };
    }

    clean[key] = value;
  }

  const totalLength = Object.values(clean).reduce(
    (sum, value) => sum + value.length,
    0,
  );
  if (totalLength > MAX_TOTAL_CHARS) {
    return { ok: false, code: "SUBMISSION_TOO_LARGE" };
  }

  return { ok: true, fields: clean };
}

/** 세션 + 이용권 공통부(인증은 defineHandler auth:"user"가 이미 처리했다). 성공하면 `sessionRow`. */
async function authorize(
  res: VercelResponse,
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  sessionId: string,
): Promise<SessionRow | null> {
  // 이용권 재판정(§8.6 공통 규약). 잔여 회차는 보지 않는다 — 이미 차감된 세션은
  // 소진·만료 뒤에도 계속 진행하는 것이 규정이다(§9.3 정정 「막는 것은 새 세션뿐」).
  const { allowed: hasAccess, reason: accessReason } =
    await hasPaidServiceAccess(
      supabaseAdmin,
      userId,
      // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
      SERVICE_CONFIGS[SERVICE_KEY]!,
    );
  if (!hasAccess) {
    fail(
      res,
      403,
      "NO_ENTITLEMENT",
      "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
      tenantReasonExtra(accessReason),
    );
    return null;
  }

  if (!UUID_RE.test(sessionId)) {
    fail(res, 400, "INVALID_SESSION_ID", "sessionId가 올바르지 않습니다.");
    return null;
  }

  // 없는 세션과 남의 세션을 같은 응답으로 묶어 id 존재 여부가 새지 않게 한다
  // (형제 라우트와 동일).
  const { data: sessionRow, error: sessionError } = await supabaseAdmin
    .from("performance_sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (sessionError) throw new Error(`세션 조회 실패: ${sessionError.message}`);
  if (!sessionRow) {
    fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.");
    return null;
  }

  return sessionRow as unknown as SessionRow;
}

export default defineHandler({
  methods: ["GET", "PUT"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "GET 또는 PUT만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "제출물 저장에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/submission",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const sessionId =
      req.method === "GET"
        ? trimmed(req.query?.sessionId)
        : typeof body.sessionId === "string"
          ? body.sessionId.trim()
          : "";

    const authorized = await authorize(res, supabaseAdmin, userId, sessionId);
    if (!authorized) return;
    const sessionRow: SessionRow = authorized;

    const schema = await resolveAndPersistSchema(supabaseAdmin, sessionRow);

    // ─────────────────────────────────────────────────────────────────
    // GET — 제출폼 렌더용. §8.6 표에는 없는 추가분이다.
    //   STEP5 폼은 ⓐ 필드 목록(서버 소유 스키마)과 ⓑ 이어서 쓸 초안을 함께 알아야
    //   하는데, 스키마는 이 슬라이스에서 처음 서버로 올라왔고 §8.6이 그 전달 경로를
    //   따로 규정하지 않았다. 저장 리포트처럼 클라이언트 직접 select로 풀 수도 있지만
    //   (§8.6 「저장 리포트 조회는 엔드포인트를 만들지 않는다」) 스키마 판정은 세션
    //   컬럼이 비어 있을 때 **서버가 판정해 채워 넣어야** 하므로 read-only 경로로는
    //   성립하지 않는다. PUT과 같은 파일에 둔 이유는 판정·정규화 코드를 공유하기 위함이다.
    // ─────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const latest = await loadLatestSubmission(supabaseAdmin, sessionRow.id);

      res.status(200).json({
        schema,
        submission: toClientSubmission(latest),
        minChars: SUBMISSION_MIN_CHARS,
        maxRevisions: MAX_REVISIONS,
      });
      return;
    }

    // ─────────────────────────────────────────────────────────────────
    // PUT
    // ─────────────────────────────────────────────────────────────────
    const mode =
      body.mode === "submit"
        ? "submit"
        : body.mode === "draft"
          ? "draft"
          : null;
    if (!mode) {
      return fail(
        res,
        400,
        "INVALID_MODE",
        "mode는 'draft' 또는 'submit'이어야 합니다.",
      );
    }

    const normalized = normalizeFields(schema, body.fields);
    if (normalized.ok === false) {
      if (normalized.code === "UNKNOWN_FIELD") {
        return fail(
          res,
          400,
          "UNKNOWN_FIELD",
          "제출폼에 없는 항목이 포함돼 있어요.",
          {
            field: normalized.field,
          },
        );
      }
      if (normalized.code === "INVALID_FIELD_VALUE") {
        return fail(
          res,
          400,
          "INVALID_FIELD_VALUE",
          "제출 항목 값은 문자열이어야 합니다.",
          {
            field: normalized.field,
          },
        );
      }
      if (normalized.code === "FIELD_TOO_LARGE") {
        return fail(
          res,
          413,
          "SUBMISSION_TOO_LARGE",
          "작성 내용이 너무 깁니다.",
          {
            field: normalized.field,
            maxChars: MAX_FIELD_CHARS,
          },
        );
      }
      if (normalized.code === "SUBMISSION_TOO_LARGE") {
        return fail(
          res,
          413,
          "SUBMISSION_TOO_LARGE",
          "작성 내용이 너무 깁니다.",
          {
            maxChars: MAX_TOTAL_CHARS,
          },
        );
      }
      return fail(
        res,
        400,
        "INVALID_FIELDS",
        "fields 형식이 올바르지 않습니다.",
      );
    }

    const fields = normalized.fields;
    const { perField, total } = countSubmissionChars(schema, fields);

    // 빈 저장을 만들지 않는다(§8.6 `400 EMPTY_SUBMISSION`). 외부도 같은 자리에서
    // `저장할 작성 내용이 없습니다.`로 막았다(`index.html:2450`).
    if (total === 0) {
      return fail(res, 400, "EMPTY_SUBMISSION", EMPTY_SUBMISSION_MESSAGE);
    }

    const latest = await loadLatestSubmission(supabaseAdmin, sessionRow.id);
    // 최신 행이 아직 draft면 그 행을 덮어쓴다(중간 저장 반복). 제출됐거나 확정된
    // 행이면 새 revision을 연다(위 「revision을 언제 올리는가」).
    const reuseLatest = Boolean(
      latest && latest.is_draft === true && latest.is_final !== true,
    );
    const targetRevision = reuseLatest
      ? (latest as SubmissionRow).revision
      : (latest?.revision || 0) + 1;

    if (targetRevision > MAX_REVISIONS) {
      return fail(
        res,
        409,
        "REEVALUATION_LIMIT",
        `제출물은 최대 ${MAX_REEVALUATIONS}번까지 다시 낼 수 있어요.`,
        {
          limit: MAX_REEVALUATIONS,
          maxRevisions: MAX_REVISIONS,
          revision: latest?.revision ?? null,
        },
      );
    }

    const payload = {
      fields,
      char_counts: perField,
      updated_at: new Date().toISOString(),
    };

    /**
     * 기존 revision 덮어쓰기. **`is_draft = true` + `is_final = false` 두 조건이 붙는다.**
     *
     * · `is_final = false` — 확정된 최종본은 불변이다(위 Q67 주석).
     * · `is_draft = true`  — **아직 제출되지 않은 초안만** 덮어쓴다. 재사용 판정
     *   (`reuseLatest`)은 `loadLatestSubmission()` 스냅샷으로 하는데, 그 select 와 이
     *   update 사이에 다른 탭이 같은 revision을 `mode:'submit'`으로 제출하거나
     *   (`is_draft=false`) 평가 커밋이 같은 값을 세우면(sql/58 (4) 단계 3), 이 조건이
     *   없을 때 뒤늦은 draft 저장이 **이미 채점된 제출본의 본문을 조용히 덮어쓴다**
     *   (검토 P11). 그러면 `performance_reports`의 평가 리포트(점수·피드백)와
     *   `performance_submissions.fields`(최종 리포트가 그대로 옮기는 학생 원고,
     *   `finalize.js buildFinalSections`)가 서로 다른 원고를 가리키게 된다 —
     *   sql/58 (2) 주석이 못박은 「제출본 자체는 revision별로 전부 남는다」가 깨지는
     *   유일한 창이었다.
     *   0행이 되면 아래 `if (!row)`가 409로 갈라 주고, 학생이 다시 저장하면 그때는
     *   `reuseLatest`가 false라 **새 revision**이 열려 작성 내용을 잃지 않는다.
     *
     * 23505 복구 경로도 방금 insert 된 draft 행을 대상으로 하므로 이 조건에 걸리지 않는다.
     */
    async function updateRevision(revision: number) {
      const { data, error } = await supabaseAdmin
        .from("performance_submissions")
        .update(payload)
        .eq("session_id", sessionRow.id)
        .eq("revision", revision)
        .eq("is_draft", true)
        .eq("is_final", false)
        .select(SUBMISSION_COLUMNS)
        .maybeSingle();

      if (error) throw new Error(`제출본 저장 실패: ${error.message}`);
      return (data as SubmissionRow) || null;
    }

    let row: SubmissionRow | null = null;

    if (reuseLatest) {
      row = await updateRevision(targetRevision);
    } else {
      const { data, error } = await supabaseAdmin
        .from("performance_submissions")
        .insert({
          session_id: sessionRow.id,
          revision: targetRevision,
          ...payload,
          is_draft: true,
          is_final: false,
        })
        .select(SUBMISSION_COLUMNS)
        .single();

      if (error) {
        // 23505 = `performance_submissions_session_revision_key`. 다중 탭이 같은
        // revision을 동시에 열었다는 뜻이므로 **경합에서 진 쪽은 덮어쓰기로 합류한다**
        // (§8.3이 `(session_id, revision)`을 「draft 원자적 upsert 키」로 규정한 이유).
        // 마지막 write가 이긴다 — 같은 학생의 같은 초안이라 병합 규칙을 둘 필요가 없다.
        if (error.code === "23505") {
          row = await updateRevision(targetRevision);
        } else {
          throw new Error(`제출본 생성 실패: ${error.message}`);
        }
      } else {
        row = data as SubmissionRow;
      }
    }

    if (!row) {
      // 0행이 되는 경우는 둘이다 — 그 사이 다른 탭이 이 revision을 **확정**했거나
      // (`is_final=true`) **제출**했다(`is_draft=false`). 둘 다 「이 revision은 더 이상
      // 초안이 아니다」이고 사용자 조치도 같다(다시 저장하면 새 revision이 열린다).
      // 코드는 §8.6 계약에 있는 `SESSION_FINALIZED` 하나로 유지하고 문구만 두 경우를
      // 함께 말한다 — 코드를 새로 파면 클라이언트 분기(§5.20 code 기준)가 갈린다.
      return fail(
        res,
        409,
        "SESSION_FINALIZED",
        "이미 제출했거나 확정한 제출본은 수정할 수 없어요. 다시 저장하면 새 제출본으로 저장됩니다.",
        {
          revision: targetRevision,
        },
      );
    }

    // ── mode:'submit' — 게이트는 **저장 이후**에 본다.
    //    순서를 뒤집으면 100자에 못 미치는 원고가 저장조차 되지 않아 학생이 쓰던 글을
    //    잃는다. 여기서 400이 나가도 초안은 이미 남아 있고 응답의 `savedAt`이 그 사실을
    //    알려 준다(아래 「실패 경로별 잔여 상태」).
    if (mode === "submit") {
      const gate = checkSubmissionMinLength(schema, fields);

      if (gate.missingRequired.length) {
        return fail(
          res,
          400,
          "REQUIRED_FIELD_EMPTY",
          "필수 항목을 모두 작성해 주세요.",
          {
            field: gate.missingRequired[0],
            missingRequired: gate.missingRequired,
            ...toClientSubmission(row),
          },
        );
      }

      if (gate.total < gate.threshold) {
        // 문구는 원문 그대로다(`evaluate-text.js:39`). 원 예외 메시지는 싣지 않는다(§8.6).
        return fail(
          res,
          400,
          "SUBMISSION_TOO_SHORT",
          SUBMISSION_TOO_SHORT_MESSAGE,
          {
            total: gate.total,
            threshold: gate.threshold,
            ...toClientSubmission(row),
          },
        );
      }

      const { data: submitted, error: submitError } = await supabaseAdmin
        .from("performance_submissions")
        .update({
          is_draft: false,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("is_final", false)
        .select(SUBMISSION_COLUMNS)
        .maybeSingle();

      if (submitError)
        throw new Error(`제출 표시 실패: ${submitError.message}`);
      if (submitted) row = submitted as SubmissionRow;
    }

    res.status(200).json({
      ...toClientSubmission(row),
      mode,
      schema,
      charTotal: total,
      minChars: SUBMISSION_MIN_CHARS,
      maxRevisions: MAX_REVISIONS,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────
// 실패 경로별 잔여 상태 (전부 무차감 — 이 파일에는 차감 코드가 없다)
// ─────────────────────────────────────────────────────────────────────
//   인증/이용권/소유권/형식 오류/크기 초과/REEVALUATION_LIMIT → 아무것도 안 남음
//   SESSION_FINALIZED                                        → 아무것도 안 남음
//                                                              (update가 0행이었다)
//   mode:'submit'의 SUBMISSION_TOO_SHORT / REQUIRED_FIELD_EMPTY
//        → **초안은 저장된 상태로 남는다**(의도). 응답에 submissionId·savedAt·
//          charCounts가 함께 실려 화면 카운터를 그대로 갱신할 수 있다.
//   제출 표시 update 실패(500)                                → 필드는 저장됨, is_draft=true
//        → 재요청하면 같은 revision에 덮어쓰고 다시 제출 표시한다(멱등).
//
// 실행 시간: 모델을 부르지 않으므로 형제 라우트의 `maxDuration: 60`이 필요 없다.
// 기본값(Hobby 10초 / Pro 15초)으로 충분하고, 선언을 두면 "여기도 모델을 부르나"라는
// 오해를 만든다. `runtime`만 형제와 맞춘다.
export const config = { runtime: "nodejs" };
