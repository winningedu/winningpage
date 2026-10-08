// POST /api/performance/analyze-guide
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { sessionId, attachmentIds[] (1~5) }  또는  { sessionId, freetext }
//     — **storage path를 받지 않는다**
//   → 200 { guide, attachments[{attachmentId,deleted}], promptVersion, model, charged:false }
//   → 403 { error:{code:'NOT_ATTACHMENT_OWNER'} }
//   → 404 { error:{code:'ATTACHMENT_GONE'} }
//   → 413 { error:{code:'FILE_TOO_LARGE'} }        (실측 재검증 위반)
//   → 415 { error:{code:'UNSUPPORTED_MIME'} }      (실측 재검증 위반)
//   → 422 { error:{code:'GUIDE_PARSE_FAILED'} }   (무차감)
//   → 429 { error:{code:'ANALYSIS_LIMIT_REACHED'} }
//   → 502 { error:{code:'VISION_UPSTREAM_FAILED'} } (무차감)
//
// ── 이 파일이 하는 일 (STEP2 안내문 입력의 종착점)
//    두 분기가 한 엔드포인트로 들어온다 — §8.6 요청 칸이 그렇게 쓰여 있다.
//      ⓐ 업로드 분기: 이미 Storage에 올라간 첨부 N장을 **단일 vision 호출**로 분석해
//         `performance_sessions.guide_json`에 넣는다(`guide_input_mode='upload'`).
//      ⓑ 직접 입력 분기(§5.8): 모델을 호출하지 않는다. 자유서술 원문을 그대로
//         `guide_freetext`에 넣는다(`guide_input_mode='manual'`).
//    둘 다 STEP2 완료로 보고 `current_step`/`completed_steps`를 3/[…,2]로 올린다.
//
// ── IDOR을 막는 방식 (§8.8 BLOCK — 이식 금지 항목)
//    외부 `analyze-assessment-storage.js`는 `image_path`를 요청 본문 그대로 받아(`:41-51`)
//    검증 없이 download(`:68`)·remove(`:120`)하고 내용을 응답(`:136`)했다. 유효한 세션
//    하나만 있으면 버킷 내 임의 경로를 읽어 반출하고 삭제까지 시킬 수 있었다.
//
//    여기서는 **경로 문자열이 클라이언트 → 서버 방향으로 흐르는 통로 자체가 없다.**
//      ① 요청은 `attachmentIds[]`(uuid)만 받는다. `storage_path`/`path`/`mimeType` 같은
//         키가 본문에 섞여 와도 이 핸들러는 꺼내 쓰지 않는다.
//      ② 세션 소유권을 `profile_id = auth.uid()`로 먼저 확인하고,
//      ③ 첨부 조회를 `.eq('session_id', <확인된 세션 id>)`로 **묶어서** 한다. 남의 첨부
//         id를 넣으면 그 행은 애초에 결과에 안 들어오고, 요청 개수와 조회 개수가 어긋나
//         `403 NOT_ATTACHMENT_OWNER`로 떨어진다(존재 여부를 알려주지 않으려고 "없음"과
//         "남의 것"을 같은 코드로 합친다 — upload-url.js의 세션 403과 같은 관례).
//      ④ Storage 접근에 쓰는 경로는 **DB 행의 `storage_path`뿐이다.**
//
// ── 업로드 실측 재검증 (`.info()`) — 선언값을 믿지 않는다
//    `upload-url.js`가 보는 `byteSize`/`mimeType`은 **클라이언트 선언값**이다. 토큰을
//    받은 뒤 더 큰 파일을 올릴 수 있어서, `byteSize=1`로 5번 토큰을 받아 각 10MB를
//    올리면 세션 합계 25MB 판정이 그대로 뚫린다(버킷 `file_size_limit`이 막는 것은
//    장당 10MB뿐이라 실질 상한이 50MB가 된다).
//    그래서 다운로드 직전에 `storage.from(BUCKET).info(path)`로 **Storage가 실제로 들고
//    있는 size/contentType**을 읽어
//      ① 장당 10MB · 세션 합계 25MB · MIME 화이트리스트를 실측값으로 재판정하고,
//      ② `performance_attachments.byte_size`/`mime_type`을 실측값으로 갱신하고,
//      ③ 위반 객체는 remove + `ocr_status='failed'`로 닫는다.
//    같은 저장소의 `api/mentor-apply.js:536-575`(`verifyUploadedProof`)와 같은 절차다.
//    §8.3 「업로드 시점 값만 신뢰. 클라이언트가 분석 요청에 실어 보내는 값은 무시」는
//    그대로다 — 여기서 신뢰하는 것도 요청 본문이 아니라 **Storage 실측값**이다.
//
// ── 재분석은 멱등으로 막는다 (비용 증폭 차단)
//    이 엔드포인트는 §9.2에 따라 **무차감**이라(그건 명세대로다) 회차가 남용 억제
//    수단이 되지 못한다. 그대로 두면 이용권 보유 계정 하나로 5장짜리 vision 호출
//    (장당 2200 × 5 = 11k maxOutputTokens, 429/503 시 최대 3회 시도 + 매 호출마다
//    최대 25MB 다운로드)을 무제한 반복시킬 수 있다.
//      · 요청 첨부가 **전부 `ocr_status='done'`**이고 세션 `guide_json.mode === 'upload'`면
//        모델을 부르지 않고 저장된 guide를 그대로 돌려준다(`reused:true`).
//      · 정말 다시 돌려야 하면 `force:true`를 명시한다.
//      · `force`든 아니든 **실제 모델 호출은 세션당 `MAX_ANALYSIS_PER_SESSION`회까지**다
//        (`performance_sessions.guide_analysis_count`, sql/55). 넘으면 429다.
//    차감을 늘려 막지 않는다 — 그건 §9.2 위반이다.
//
// ── 다중 이미지 = 호출 1회 (§8.8 「다중 분석」 결정)
//    외부는 프론트가 장당 1회씩 호출해(`suhaengpyeong/index.html:1660-1681`) N장 = N회
//    차감이었고, 루프 중간에 실패하면 앞서 성공한 분석과 차감이 모두 유실됐다(`:1690-1694`).
//    여기서는 `contents` 배열에 `inlineData`를 장수만큼 실어 한 번에 보낸다. 실패해도
//    "일부만 분석된 상태"가 생기지 않는다(전부 done이거나 전부 failed).
//    `maxOutputTokens`는 장수 비례다 — 외부 기본 2200은 1장 기준이라 그대로 두면 2장부터
//    출력이 잘린다(§12.3 「비전 호출 파라미터」). 계산은 `api/_lib/performance/gemini.js`가
//    `VISION_MAX_OUTPUT_TOKENS_PER_IMAGE × 장수`로 한다.
//
// ── 실행 시간 (형제 라우트와 동일 + 자체 마감 시한)
//    최대 5장(합계 25MB)을 base64로 실어 단일 vision 호출을 하고, `generateWithRetry`가
//    700ms·1400ms 백오프로 최대 3회까지 시도한다. Fluid compute가 꺼진 프로젝트의 기본
//    실행시간(Hobby 10초 / Pro 15초)으로는 3~5장 분석이 **통상 경로에서** 끊긴다.
//    끊기면 ① 플랫폼이 본문 없는 504를 돌려줘 클라이언트의 `response.json().catch(()=>null)`이
//    null이 되어 원인이 사용자에게 전달되지 않고, ② `markAttachmentsFailed`가 실행되지
//    않아 첨부가 `pending`으로 남아 24시간 스윕까지 5장 상한과 25MB 예산을 계속 먹는다.
//    → 파일 끝에 `maxDuration: 60`을 선언하고(`admin-embed.js:319`/`cleanup-attachments.js:322`와
//      동일), 그 안에서 vision 호출에 **45초 AbortController**를 걸어 플랫폼이 함수를
//      죽이기 전에 반드시 실패 처리(첨부 failed + 502)를 마치게 한다.
//
// ── 원본 이미지를 지우지 않는다 (§8.8 ~~Q52~~ 부결)
//    외부의 `deleteImage`(`:23-32`, 호출 `:120`)는 **이식하지 않는다.** 보관 정본은 90일이고
//    삭제는 `api/performance/cleanup-attachments.js` + Vercel Cron 일 1회의 몫이다.
//    그래서 응답의 `attachments[].deleted`는 이 엔드포인트에서 항상 false다 — 그 값은
//    "이 API가 지웠는가"가 아니라 **행의 `deleted_at` 유무**를 그대로 비춘 것이고, 아직
//    살아 있지 않은 첨부는 아래에서 404로 먼저 걸러진다.
//    예외는 위 실측 재검증에서 **위반이 확인된 객체**뿐이다 — 상한을 넘긴 파일을 90일간
//    보관할 이유가 없고, mentor-apply.js가 같은 상황에서 remove한다.
//
// ── 회차는 차감하지 않는다 (§9.2 결정)
//    차감 지점은 주제 추천 최초 성공 1곳뿐이다. 외부는 장당 1회씩 소모해 3장 업로드 =
//    3회가 사라졌다. 응답의 `charged:false`는 그 사실을 계약으로 못박은 것이다.
//    모델 호출이 재시도로 3번 나가도 마찬가지다(재시도는 gemini.js 계층 안, 차감은 밖).

import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import { callVision, PERFORMANCE_MODEL } from "../_lib/performance/gemini.js";
import {
  GUIDE_FREETEXT_MAX_LENGTH,
  isGuideFreetextTooLong,
} from "../_lib/performance/guide-freetext.js";
import {
  buildGuideExtractionUserPrompt,
  GUIDE_EXTRACTION_SYSTEM,
  GUIDE_PROMPT_VERSION,
} from "../_lib/performance/prompts.js";
import {
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import {
  performanceTraceContext,
  validationOf,
} from "../_lib/telemetry/performanceContext.js";
import { createAiTrace } from "../_lib/telemetry/trace.js";
import {
  ALLOWED_MIME_EXT,
  BUCKET,
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
} from "./upload-url.js";

const SERVICE_KEY = "suhaeng";

/**
 * 세션당 **실제 모델 호출** 상한. 멱등 단축(저장분 반환)은 여기에 포함되지 않는다.
 * 사진을 다시 찍어 올리는 정상 재시도(보통 1~2회)를 넉넉히 덮으면서, 무차감
 * 엔드포인트가 무제한 vision 호출 통로가 되는 것은 막는 수치다.
 */
const MAX_ANALYSIS_PER_SESSION = 10;

/**
 * vision 호출 자체 마감 시한. `maxDuration: 60`보다 짧게 잡아, 플랫폼이 함수를 죽이기
 * 전에 `markAttachmentsFailed` + 502 응답을 반드시 돌려줄 여유(다운로드/마감 처리)를 남긴다.
 */
const VISION_TIMEOUT_MS = 45 * 1000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

type SessionRow = {
  id: string;
  status: string;
  current_step: number | null;
  completed_steps: unknown;
  guide_json: {
    mode?: string;
    promptVersion?: string;
    model?: string;
    [key: string]: unknown;
  } | null;
  guide_analysis_count: number | null;
};

type AttachmentRow = {
  id: string;
  storage_path: string | null;
  ocr_status: string;
  deleted_at: string | null;
};

type MeasuredItem = {
  id: string;
  path: string;
  size: number;
  mimeType: string;
};

type ReadAttachmentIdsResult =
  | { present: false }
  | { present: true; ok: false; message: string }
  | { present: true; ok: true; ids: string[] };

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

/** STEP2 완료 반영 패치. 이미 더 앞서 있는 세션을 되돌리지 않는다(session.js와 같은 규칙). */
function stepPatch(sessionRow: SessionRow) {
  const completed = new Set(
    Array.isArray(sessionRow.completed_steps) ? sessionRow.completed_steps : [],
  );
  completed.add(1);
  completed.add(2);

  return {
    status: sessionRow.status === "draft" ? "in_progress" : sessionRow.status,
    current_step: Math.max(sessionRow.current_step || 1, 3),
    completed_steps: Array.from(completed).sort((a, b) => a - b),
  };
}

/** 요청 본문에서 `attachmentIds`를 꺼내 형식 검증한다. 경로 문자열은 쳐다보지도 않는다. */
function readAttachmentIds(
  body: Record<string, unknown>,
): ReadAttachmentIdsResult {
  const raw = body.attachmentIds;
  if (raw === undefined || raw === null) return { present: false };
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      present: true,
      ok: false,
      message: "attachmentIds는 1개 이상의 배열이어야 합니다.",
    };
  }
  if (raw.length > MAX_ATTACHMENTS) {
    return {
      present: true,
      ok: false,
      message: `안내문 사진은 최대 ${MAX_ATTACHMENTS}장까지 분석할 수 있어요.`,
    };
  }

  const ids: string[] = [];
  for (const value of raw) {
    const id = typeof value === "string" ? value.trim() : "";
    if (!UUID_RE.test(id)) {
      return {
        present: true,
        ok: false,
        message: "attachmentIds 형식이 올바르지 않습니다.",
      };
    }
    if (!ids.includes(id)) ids.push(id);
  }

  return { present: true, ok: true, ids };
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "안내문 분석에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/analyze-guide",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);

    // 모델 호출이 터졌을 때 첨부를 failed로 되돌리기 위해 catch 바깥에서 들고 있는다.
    let analyzedIds: string[] | null = null;

    // 아래 본문 처리 중 던져지는 예외는 원래(마이그레이션 전)와 동일하게
    // analyzedIds가 잡혀 있으면 markAttachmentsFailed로 되돌린 뒤 500을 내야
    // 한다 — 공통 defineHandler 최상위 catch는 이 정리 로직을 모른다. 그래서
    // 로컬 try/catch로 감싸 기존 catch 블록의 동작을 그대로 재현한다
    // (배치-2 이슈로 별도 기록).
    try {
      // 이용권 재판정 — §8.6 공통 규약. 클라이언트 가드 통과 여부를 신뢰하지 않는다.
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
      const freetext =
        typeof body.freetext === "string" ? body.freetext.trim() : "";
      const force = body.force === true;
      const attachments = readAttachmentIds(body);

      if (!sessionId) {
        return fail(res, 400, "MISSING_FIELD", "sessionId는 필수입니다.", {
          field: "sessionId",
        });
      }

      if (attachments.present && attachments.ok === false) {
        return fail(res, 400, "INVALID_ATTACHMENT_IDS", attachments.message, {
          field: "attachmentIds",
        });
      }

      // 프론트 `maxLength`는 신뢰값이 아니다(요청 본문은 클라이언트가 직접 조립할 수
      // 있다) — 실제 저장 전 서버가 같은 상한(QA 행 194)을 재확인한다.
      if (isGuideFreetextTooLong(freetext)) {
        return fail(
          res,
          400,
          "FREETEXT_TOO_LONG",
          `freetext는 ${GUIDE_FREETEXT_MAX_LENGTH}자를 넘을 수 없습니다.`,
          { field: "freetext", maxLength: GUIDE_FREETEXT_MAX_LENGTH },
        );
      }

      // 두 분기는 배타다 — 한 요청이 둘 다 들고 오면 어느 쪽이 세션의 정본인지 계약이
      // 정하지 않으므로 서버가 임의로 고르지 않고 거절한다.
      if (attachments.present && freetext) {
        return fail(
          res,
          400,
          "AMBIGUOUS_INPUT",
          "attachmentIds와 freetext는 함께 보낼 수 없습니다.",
        );
      }

      if (!attachments.present && !freetext) {
        return fail(
          res,
          400,
          "MISSING_FIELD",
          "attachmentIds 또는 freetext가 필요합니다.",
        );
      }

      // ── 세션 소유권. service_role 클라이언트라 RLS가 통째로 우회되므로 이
      //    `.eq('profile_id', userId)` 조건이 유일한 방어선이다(upload-url.js와 같은 관례).
      //    세션이 없는 경우와 남의 세션인 경우를 같은 403으로 합친다(존재 오라클 방지).
      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from("performance_sessions")
        .select(
          "id,status,current_step,completed_steps,guide_json,guide_analysis_count",
        )
        .eq("id", sessionId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (sessionError)
        throw new Error(`세션 조회 실패: ${sessionError.message}`);

      if (!sessionData) {
        return fail(
          res,
          403,
          "NOT_SESSION_OWNER",
          "이 수행평가 세션에 접근할 수 없습니다.",
        );
      }

      const sessionRow = sessionData as SessionRow;

      // ─────────────────────────────────────────────────────────────
      // ⓑ 직접 입력 분기 (§5.8) — 모델을 호출하지 않는다
      // ─────────────────────────────────────────────────────────────
      // `guide_json`은 **null로 둔다.** §8.3이 그 컬럼에 준 정의는 "안내문 분석 구조화
      // 결과"이고 이 분기에는 분석이 없다. 자유서술 원문의 자리는 `guide_freetext`다.
      // 하류(P8 주제 추천)는 `guide_input_mode`를 보고 어느 컬럼을 읽을지 정한다.
      if (!attachments.present) {
        const { error: manualError } = await supabaseAdmin
          .from("performance_sessions")
          .update({
            guide_input_mode: "manual",
            guide_freetext: freetext,
            guide_json: null,
            ...stepPatch(sessionRow),
          })
          .eq("id", sessionRow.id);

        if (manualError)
          throw new Error(`세션 갱신 실패: ${manualError.message}`);

        res.status(200).json({
          guide: { mode: "manual", text: freetext },
          attachments: [],
          promptVersion: null, // 모델을 부르지 않았으므로 프롬프트 버전도 없다
          model: null,
          charged: false,
        });
        return;
      }

      // ─────────────────────────────────────────────────────────────
      // ⓐ 업로드 분기 — 단일 vision 호출
      // ─────────────────────────────────────────────────────────────

      // 위 검증에서 present:true·ok:true 외 분기는 전부 return했다. TS는 이 다단계
      // 판별 유니온을 여기까지 좁히지 못해(strict:false) `attachments.ids` 접근이
      // 타입 오류가 되므로, 이미 검증된 사실을 캐스트로 명시한다(런타임 동작 없음).
      const attachmentIds = (
        attachments as { present: true; ok: true; ids: string[] }
      ).ids;

      // 첨부 조회는 **세션에 묶어서** 한다. 이 `.eq('session_id', ...)`가 IDOR 차단의 핵심이다.
      // 정렬은 업로드 순서(`created_at`)로 고정한다 — 요청 배열 순서를 따르면 클라이언트가
      // 페이지 순서를 흔들 수 있고, 안내문은 장 순서가 곧 문서 순서다.
      const { data: attachmentRows, error: attachmentError } =
        await supabaseAdmin
          .from("performance_attachments")
          // `mime_type`/`byte_size`는 뜨지 않는다 — 이 라우트의 판정 근거는 저장된 선언값이
          // 아니라 아래 `verifyStoredObjects`가 읽는 Storage 실측값이다(파일 상단).
          .select("id,storage_path,ocr_status,deleted_at")
          .eq("session_id", sessionRow.id)
          .in("id", attachmentIds)
          .order("created_at", { ascending: true });

      if (attachmentError)
        throw new Error(`첨부 조회 실패: ${attachmentError.message}`);

      const rows: AttachmentRow[] = attachmentRows || [];

      if (rows.length !== attachmentIds.length) {
        // "없는 id"와 "남의 세션 id"를 구분해 알려주지 않는다(존재 오라클 방지).
        return fail(
          res,
          403,
          "NOT_ATTACHMENT_OWNER",
          "이 안내문 사진에 접근할 수 없습니다.",
        );
      }

      // 90일 cron이나 24시간 TTL 스윕이 이미 원본을 지운 행. 경로가 무효 포인터이므로
      // 분석할 대상이 없다(§8.3 `storage_path` nullable 사유).
      if (rows.some((row) => row.deleted_at || !row.storage_path)) {
        return fail(
          res,
          404,
          "ATTACHMENT_GONE",
          "안내문 사진 원본이 이미 삭제되었어요.",
        );
      }

      // ── 멱등 단축 (파일 상단 「재분석은 멱등으로 막는다」)
      //    같은 첨부 집합이 이미 분석돼 있고 세션에 그 결과가 그대로 남아 있으면
      //    모델을 부를 이유가 없다. `guide_analysis_count`도 올리지 않는다.
      const storedGuide = sessionRow.guide_json;
      const alreadyAnalyzed = rows.every((row) => row.ocr_status === "done");

      if (!force && alreadyAnalyzed && storedGuide?.mode === "upload") {
        res.status(200).json({
          guide: storedGuide,
          attachments: rows.map((row) => ({
            attachmentId: row.id,
            deleted: false,
          })),
          promptVersion: storedGuide.promptVersion || GUIDE_PROMPT_VERSION,
          model: storedGuide.model || PERFORMANCE_MODEL,
          charged: false,
          // 저장분을 그대로 돌려줬다는 표시. 호출부가 "다시 분석됐다"고 오해하지 않게 한다.
          reused: true,
        });
        return;
      }

      // ── 호출 상한 (무차감 엔드포인트의 비용 증폭 차단, sql/55 (3))
      const analysisCount = Number(sessionRow.guide_analysis_count) || 0;
      if (analysisCount >= MAX_ANALYSIS_PER_SESSION) {
        return fail(
          res,
          429,
          "ANALYSIS_LIMIT_REACHED",
          "이 수행평가에서 안내문 분석을 너무 여러 번 요청했어요. 직접 입력으로 진행하거나 새 수행평가를 시작해 주세요.",
          { maxAnalysis: MAX_ANALYSIS_PER_SESSION, charged: false },
        );
      }

      analyzedIds = rows.map((row) => row.id);

      // ── 실측 재검증 (`.info()`) — 파일 상단 「업로드 실측 재검증」
      const verified = await verifyStoredObjects(supabaseAdmin, rows);

      if (verified.missing.length) {
        // 행은 살아 있는데 객체가 없다 = 업로드 토큰만 받고 파일을 올리지 않았거나
        // 버킷 쪽에서 사라진 경우다. 되살릴 수 없으니 failed로 닫고 404로 알린다.
        await markAttachmentsFailed(supabaseAdmin, analyzedIds);
        return fail(
          res,
          404,
          "ATTACHMENT_GONE",
          "안내문 사진 원본을 찾을 수 없어요.",
        );
      }

      // 실측값을 장부에 반영한다 — 이후의 상한 판정(다음 업로드의 upload-url 합계
      // 계산 포함)이 선언값이 아니라 실제 바이트를 보게 만드는 지점이다.
      await syncMeasuredMetadata(supabaseAdmin, verified.measured);

      // ① MIME 화이트리스트 · ② 장당 10MB — 실측값으로 재판정.
      const badMime = verified.measured.filter(
        (item) => !ALLOWED_MIME_EXT[item.mimeType],
      );
      const tooLarge = verified.measured.filter(
        (item) => item.size > MAX_FILE_BYTES,
      );

      if (badMime.length || tooLarge.length) {
        // 위반 객체는 남겨 둘 이유가 없다(mentor-apply.js:565와 같은 처리).
        await removeObjects(supabaseAdmin, [...badMime, ...tooLarge]);
        await markAttachmentsFailed(supabaseAdmin, analyzedIds);

        return badMime.length
          ? fail(
              res,
              415,
              "UNSUPPORTED_MIME",
              "PNG, JPG, WEBP 이미지만 올릴 수 있어요.",
              {
                allowed: Object.keys(ALLOWED_MIME_EXT),
                charged: false,
              },
            )
          : fail(
              res,
              413,
              "FILE_TOO_LARGE",
              "사진 한 장은 10MB까지 올릴 수 있어요.",
              {
                maxBytes: MAX_FILE_BYTES,
                charged: false,
              },
            );
      }

      // ③ 세션 합계 25MB — 실측값 반영 후의 장부로 다시 센다. 여기서만 잡히는
      //    우회가 `byteSize=1`로 토큰 5장을 받아 각 10MB를 올리는 경우다.
      const totalBytes = await sumSessionBytes(supabaseAdmin, sessionRow.id);

      if (totalBytes > MAX_TOTAL_BYTES) {
        // 선언값이 거짓이었다는 뜻이므로 이번 묶음을 통째로 거절한다(정직한 선언은
        // upload-url.js에서 이미 걸러져 여기까지 오지 않는다).
        await removeObjects(supabaseAdmin, verified.measured);
        await markAttachmentsFailed(supabaseAdmin, analyzedIds);
        return fail(
          res,
          413,
          "FILE_TOO_LARGE",
          "사진 전체 용량은 25MB까지 올릴 수 있어요.",
          {
            maxTotalBytes: MAX_TOTAL_BYTES,
            usedBytes: totalBytes,
            charged: false,
          },
        );
      }

      // ── 다운로드. 경로는 오직 DB 행의 값이다(요청 본문에서 온 문자열이 아니다).
      const images: { data: Buffer; mimeType: string }[] = [];
      for (const item of verified.measured) {
        const { data: blob, error: downloadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .download(item.path);

        if (downloadError || !blob) {
          console.error(
            "performance/analyze-guide 원본 다운로드 실패:",
            downloadError,
          );
          await markAttachmentsFailed(supabaseAdmin, analyzedIds);
          return fail(
            res,
            404,
            "ATTACHMENT_GONE",
            "안내문 사진 원본을 찾을 수 없어요.",
          );
        }

        images.push({
          data: Buffer.from(await blob.arrayBuffer()),
          // 실측 contentType이다 — 요청 본문의 mime도, 이제는 선언값 사본도 아니다.
          mimeType: item.mimeType,
        });
      }

      // 모델을 실제로 부르기 **직전**에 카운터를 올린다. 성공/실패 어느 쪽이든 비용은
      // 이미 발생하므로 실패도 세어야 상한이 의미를 갖는다. (동시 요청 2건이 같은 값을
      // 읽어 한 번을 덜 셀 수 있으나, 이 값은 정밀 회계가 아니라 남용 상한이라 허용한다 —
      // 정밀 회계가 필요한 회차 차감은 `consume_performance_credit`이 `for update`로 한다.)
      const { error: counterError } = await supabaseAdmin
        .from("performance_sessions")
        .update({ guide_analysis_count: analysisCount + 1 })
        .eq("id", sessionRow.id);

      if (counterError)
        throw new Error(`분석 횟수 갱신 실패: ${counterError.message}`);

      // ── 단일 vision 호출. maxOutputTokens는 gemini.js가 장수 비례로 잡는다.
      //    45초 마감 시한을 걸어 플랫폼이 함수를 죽이기 전에 실패 처리를 마친다.
      let text: string;
      const abortController = new AbortController();
      const abortTimer = setTimeout(
        () => abortController.abort(),
        VISION_TIMEOUT_MS,
      );

      // 계기판 기록. 업로드 분기에서 모델을 부르기 직전에만 만든다.
      const trace = createAiTrace(
        performanceTraceContext({
          feature: "analyze_guide",
          sessionId: sessionRow.id,
          profileId: userId,
          promptVersion: GUIDE_PROMPT_VERSION,
          step: String(images.length),
        }),
      );

      try {
        text = await callVision(
          GUIDE_EXTRACTION_SYSTEM,
          images,
          buildGuideExtractionUserPrompt(images.length),
          { abortSignal: abortController.signal, telemetry: trace },
        );
        trace.annotateLastCall(
          String(text || "").trim()
            ? validationOf(true, "")
            : validationOf(false, "empty-guide"),
        );
      } catch (modelError) {
        console.error(
          "performance/analyze-guide vision 호출 실패:",
          modelError,
        );
        await markAttachmentsFailed(supabaseAdmin, analyzedIds);
        // 무차감이다(§9.2) — 애초에 이 엔드포인트는 차감하지 않는다.
        return fail(
          res,
          502,
          "VISION_UPSTREAM_FAILED",
          "안내문을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.",
          {
            charged: false,
          },
        );
      } finally {
        clearTimeout(abortTimer);
        await trace.flush(supabaseAdmin);
      }

      const guideText = String(text || "").trim();

      if (!guideText) {
        // 호출은 성공했는데 내용이 비었다 — 재시도로 풀릴 문제가 아니므로 422다.
        await markAttachmentsFailed(supabaseAdmin, analyzedIds);
        return fail(
          res,
          422,
          "GUIDE_PARSE_FAILED",
          "안내문에서 정보를 읽지 못했어요. 사진을 다시 확인해 주세요.",
          {
            charged: false,
          },
        );
      }

      // ── 저장. `guide_json`은 지금 단계에서 **평문을 담는 봉투**다.
      //    §8.4의 안내문 스키마(basicInfo/rubric/answerQuestions…)로 승격하는 것은 이후
      //    슬라이스의 구조화 출력 전환 몫이고(P7의 이식 계약은 원본 그대로의 평문이다),
      //    그때 `promptVersion`이 `guide-v1`에서 올라가므로 어느 봉투가 어느 계약으로
      //    만들어졌는지 이 필드 하나로 구분된다.
      const guide = {
        mode: "upload",
        text: guideText,
        pageCount: images.length,
        promptVersion: GUIDE_PROMPT_VERSION,
        model: PERFORMANCE_MODEL,
        analyzedAt: new Date().toISOString(),
      };

      const { error: sessionUpdateError } = await supabaseAdmin
        .from("performance_sessions")
        .update({
          guide_input_mode: "upload",
          guide_json: guide,
          ...stepPatch(sessionRow),
        })
        .eq("id", sessionRow.id);

      if (sessionUpdateError)
        throw new Error(`세션 갱신 실패: ${sessionUpdateError.message}`);

      // `ocr_text`는 §8.3이 "장별 원문"으로 정의했지만, 단일 호출 통합(§8.8)에서는 장별로
      // 쪼갠 원문이 존재하지 않는다 — 모델이 N장을 종합해 한 벌을 낸다. 분석에 참여한
      // 모든 행에 같은 통합 텍스트를 남겨(포렌식용) 행 단위 상태와 내용이 어긋나지 않게 한다.
      // 읽기 정본은 어차피 `performance_sessions.guide_json`이다.
      const { error: markError } = await supabaseAdmin
        .from("performance_attachments")
        .update({ ocr_status: "done", ocr_text: guideText })
        .in("id", analyzedIds);

      if (markError)
        throw new Error(`첨부 상태 갱신 실패: ${markError.message}`);

      res.status(200).json({
        guide,
        // `deleted`는 행의 `deleted_at`을 비춘 값이다. 위에서 원본 생존을 이미 확인했으므로
        // 여기서는 전부 false다 — **이 API는 원본을 지우지 않는다**(§8.8, 파일 상단 주석).
        attachments: analyzedIds.map((attachmentId) => ({
          attachmentId,
          deleted: false,
        })),
        promptVersion: GUIDE_PROMPT_VERSION,
        model: PERFORMANCE_MODEL,
        charged: false,
        reused: false,
      });
    } catch (error) {
      // 원 예외 메시지를 응답에 싣지 않는다(§8.6 공통 규약 「실패 응답」).
      console.error("performance/analyze-guide error:", error);
      if (analyzedIds) await markAttachmentsFailed(supabaseAdmin, analyzedIds);
      return fail(res, 500, "INTERNAL", "안내문 분석에 실패했습니다.");
    }
  },
});

/**
 * 각 첨부의 **실제** Storage 메타데이터를 읽는다(`api/mentor-apply.js:536-575` 절차).
 *
 * 클라이언트가 upload-url에서 선언한 `byteSize`/`mimeType`이 아니라 Storage가 들고 있는
 * `size`/`contentType`을 돌려준다 — 선언값은 거짓말할 수 있어 믿지 않는다.
 */
async function verifyStoredObjects(
  supabaseAdmin: SupabaseAdmin,
  rows: AttachmentRow[],
) {
  const measured: MeasuredItem[] = [];
  const missing: string[] = [];

  for (const row of rows) {
    const { data: info, error: infoError } = await supabaseAdmin.storage
      .from(BUCKET)
      .info(row.storage_path as string);

    if (infoError || !info) {
      console.error(
        "performance/analyze-guide 원본 메타 조회 실패:",
        row.storage_path,
        infoError,
      );
      missing.push(row.id);
      continue;
    }

    // storage-js 버전에 따라 카멜/메타데이터 어느 쪽에 실릴지 갈려서 둘 다 본다
    // (mentor-apply.js와 같은 방어).
    const infoAny = info as unknown as {
      size?: number;
      contentType?: string;
      metadata?: { size?: number; mimetype?: string };
    };
    const size = Number(infoAny.size ?? infoAny.metadata?.size ?? 0);
    const mimeType = String(
      infoAny.contentType ?? infoAny.metadata?.mimetype ?? "",
    )
      .trim()
      .toLowerCase();

    if (!Number.isFinite(size) || size <= 0) {
      // 크기를 못 읽으면 상한 판정을 할 수 없다 = 통과시킬 수 없다(fail-closed).
      console.error(
        "performance/analyze-guide 원본 크기 판독 실패:",
        row.storage_path,
        info,
      );
      missing.push(row.id);
      continue;
    }

    measured.push({
      id: row.id,
      path: row.storage_path as string,
      size,
      mimeType,
    });
  }

  return { measured, missing };
}

/** 실측 size/mime을 장부에 반영한다. 값이 그대로면 쓰지 않는다(불필요한 write 절감). */
async function syncMeasuredMetadata(
  supabaseAdmin: SupabaseAdmin,
  measured: MeasuredItem[],
) {
  for (const item of measured) {
    const { error } = await supabaseAdmin
      .from("performance_attachments")
      .update({ byte_size: item.size, mime_type: item.mimeType })
      .eq("id", item.id);

    if (error) {
      // 실측 반영에 실패해도 이번 요청의 판정(아래 상한 검사)은 measured 값으로 하므로
      // 결론이 바뀌지 않는다. 다음 요청의 합계 계산이 옛 값을 볼 뿐이라 로그만 남긴다.
      console.error(
        "performance/analyze-guide 실측 메타 반영 실패:",
        item.id,
        error,
      );
    }
  }
}

/** 세션 첨부의 `byte_size` 합. upload-url.js의 합계 판정과 같은 모집단(전 행)을 센다. */
async function sumSessionBytes(
  supabaseAdmin: SupabaseAdmin,
  sessionId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("performance_attachments")
    .select("byte_size")
    .eq("session_id", sessionId);

  if (error) throw new Error(`첨부 용량 합계 조회 실패: ${error.message}`);

  return (data || []).reduce(
    (sum, row) => sum + (Number(row.byte_size) || 0),
    0,
  );
}

/**
 * 상한·형식을 위반한 객체를 지우고 **장부도 함께 닫는다**(`deleted_at` + `storage_path=null`).
 *
 * 객체만 지우고 행을 그대로 두면 90일 cron이 없는 객체를 계속 다시 집고,
 * `analyze-guide`도 그 행을 "원본이 살아 있다"고 읽어 다운로드에서 다시 실패한다 —
 * sql/54가 경고한 "기록과 실제 상태가 어긋난" 상태다. remove가 실패하면 장부를 닫지
 * 않는다(cleanup 잡이 다시 집게 둔다, `cleanup-attachments.js`와 같은 규율).
 * 이 정리가 실패해도 응답은 바꾸지 않는다 — 이미 결정된 거절이다.
 */
async function removeObjects(
  supabaseAdmin: SupabaseAdmin,
  items: { id: string; path?: string | null }[],
) {
  const targets = items.filter((item) => item.path);
  if (!targets.length) return;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .remove([...new Set(targets.map((item) => item.path as string))]);

  if (error) {
    console.error("performance/analyze-guide 위반 첨부 정리 실패:", error);
    return;
  }

  const { error: closeError } = await supabaseAdmin
    .from("performance_attachments")
    .update({ deleted_at: new Date().toISOString(), storage_path: null })
    .in(
      "id",
      targets.map((item) => item.id),
    );

  if (closeError) {
    console.error(
      "performance/analyze-guide 위반 첨부 장부 마감 실패:",
      closeError,
    );
  }
}

/**
 * 분석에 실패한 첨부를 `ocr_status='failed'`로 닫는다.
 *
 * **정상 경로에서는 원본 파일을 건드리지 않는다** — 실패는 재시도 여지가 있고, 보관
 * 정책상 삭제 권한은 90일 cron에만 있다(§8.8). 상한 위반 객체만 예외적으로 위
 * `removeObjects`가 지운다(mentor-apply.js와 같은 처리). 이 갱신이 또 실패해도
 * 사용자에게 돌려줄 응답을 바꾸지 않는다(이미 결정된 실패다). 로그만 남긴다.
 */
async function markAttachmentsFailed(
  supabaseAdmin: SupabaseAdmin,
  ids: string[] | null,
) {
  if (!ids?.length) return;

  try {
    const { error } = await supabaseAdmin
      .from("performance_attachments")
      .update({ ocr_status: "failed" })
      .in("id", ids);

    if (error) throw error;
  } catch (error) {
    console.error("performance/analyze-guide 첨부 failed 마킹 실패:", error);
  }
}

// 최대 5장(합계 25MB)을 base64로 실어 단일 vision 호출을 하고, gemini.js가 700ms·1400ms
// 백오프로 최대 3회까지 시도한다. 기본 실행시간(Hobby 10초 / Pro 15초)으로는 3~5장이
// 통상 경로에서 끊기고, 끊기면 본문 없는 504라 클라이언트가 원인을 못 받는 데다
// `markAttachmentsFailed`가 실행되지 않아 첨부가 pending으로 남아 5장 상한과 25MB
// 예산을 24시간 동안 계속 점유한다. 형제 라우트(`admin-embed.js` / `cleanup-attachments.js`)와
// 같은 60초를 쓴다 — 그 안에서 vision 호출 자체는 VISION_TIMEOUT_MS(45초)로 먼저 끊긴다.
export const config = { runtime: "nodejs", maxDuration: 60 };
