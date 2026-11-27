// STEP2 안내문 업로드·분석 호출 오케스트레이션 — docs/수행평가-상세-명세.md §5.6~§5.8 / §8.6 / §8.8.
//
// `GuideUploadCard`는 **전처리까지 끝난 File 배열**만 넘기고(그 파일 상단 「이 카드가
// 하지 않는 것」), 실제 왕복은 여기가 한다. 페이지에서 분리한 이유는 세 단계짜리
// 절차이고 그중 하나(롤백)가 실패 경로에만 있어 화면 코드에 섞이면 읽히지 않기 때문이다.
//
// ── 3단계 (§8.6 엔드포인트 표)
//   ① `POST /api/performance/upload-url` — 장당 1회. 서버가 경로를 조립하고
//      `performance_attachments` 행(`ocr_status='pending'`)과 서명 업로드 토큰을 만든다.
//   ② `uploadToSignedUrl(path, token, file)` — 바이트는 **서버리스를 거치지 않고**
//      클라이언트 → Storage로 직접 간다(Vercel 본문 4.5MB 하드 리밋 회피).
//   ③ `POST /api/performance/analyze-guide` — 모인 `attachmentId[]`로 단일 vision 호출.
//      **경로 문자열을 보내지 않는다**(§8.8 BLOCK — 외부 앱 `image_path` IDOR 이식 금지).
//
// ── 실패하면 자리를 되돌린다 (§8.8 상한과의 정합)
//   ①이 성공하는 순간 그 첨부는 세션의 5장 상한과 25MB 예산을 **이미 점유**한다
//   (`upload-url.js`가 토큰 발급 시점에 행을 만들고, 상한 판정은 그 행 수를 센다).
//   그래서 중간에 한 장이라도 실패하면 이미 만든 행을 그대로 두면 안 된다 — 사용자가
//   다시 시도할 때 화면에는 사진이 4장뿐인데 `409 TOO_MANY_ATTACHMENTS`가 뜬다.
//   실패 경로에서 `POST /api/performance/discard-attachment`로 이번 시도에 만든 첨부를
//   전부 회수한다(그 엔드포인트는 `ocr_status='pending'` 행만 지운다).
//   롤백 자체가 실패해도 사용자에게 다시 알리지 않는다 — 이미 보여줄 실패가 있고,
//   최후 수단으로 24시간 고아 스윕이 같은 자리를 치운다.

import { supabase } from "@/lib/supabase";
import {
  analyzeGuideResponse,
  discardAttachmentResponse,
  uploadUrlResponse,
} from "../../../shared/performance/contract.js";
import { api } from "../http/client";
import {
  AI_CALL_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  performanceRequest,
} from "./apiClient";

/** 서버 메시지가 없을 때만 쓰는 폴백. 서버가 준 문구가 있으면 항상 그쪽이 우선이다. */
const GENERIC_UPLOAD_ERROR =
  "사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.";
const GENERIC_ANALYZE_ERROR =
  "안내문을 분석하지 못했어요. 잠시 후 다시 시도해 주세요.";
const NETWORK_ERROR =
  "네트워크 오류가 발생했어요. 연결을 확인하고 다시 시도해 주세요.";

/** 화면에 그대로 띄울 수 있는 문구(`userMessage`)를 달고 던진다. */
function userError(message: string, cause?: unknown) {
  const error = new Error(message) as Error & { userMessage?: string };
  error.userMessage = message;
  if (cause) error.cause = cause;
  return error;
}

const RESPONSE_SCHEMA = {
  "performance/upload-url": uploadUrlResponse,
  "performance/analyze-guide": analyzeGuideResponse,
  "performance/discard-attachment": discardAttachmentResponse,
};

// 실패는 던지지 않고 돌려준다. 플랫폼이 함수를 죽인 경우(504 등) 서버 문구가 없어 message 가 null 이고,
// 그때도 화면에는 무언가 말해야 하므로 호출부가 폴백 문구를 쓴다.
async function postJson<Path extends keyof typeof RESPONSE_SCHEMA>(
  path: Path,
  accessToken: string,
  body: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
  try {
    return await performanceRequest(
      api
        .post(path, {
          json: body,
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: timeoutMs,
        })
        .json(RESPONSE_SCHEMA[path]),
    );
  } catch (error) {
    throw userError(NETWORK_ERROR, error);
  }
}

/**
 * 사진 N장을 업로드하고 `attachmentId[]`를 돌려준다. 한 장이라도 실패하면 이번 시도에
 * 만든 첨부를 전부 회수한 뒤 던진다(부분 성공 상태를 남기지 않는다).
 *
 * @param {{accessToken: string, sessionId: string, files: File[]}} params
 * @returns {Promise<string[]>} 업로드 순서대로의 attachmentId
 */
export async function uploadGuidePhotos({
  accessToken,
  sessionId,
  files,
}: {
  accessToken: string;
  sessionId: string;
  files: File[];
}) {
  const uploaded: string[] = [];

  try {
    for (const file of files) {
      // ① 토큰 발급 — 이 시점에 `pending` 행이 생긴다(= 자리 점유 시작).
      const result = await postJson("performance/upload-url", accessToken, {
        sessionId,
        mimeType: file.type,
        byteSize: file.size,
      });

      if (!result.ok) {
        throw userError(result.message || GENERIC_UPLOAD_ERROR);
      }
      const data = result.data;

      // 행은 이미 만들어졌으므로, 아래 PUT이 실패해도 회수 대상에 들어가야 한다.
      uploaded.push(data.attachmentId);

      // ② 바이트 직접 업로드. `contentType`을 명시하지 않으면 Storage가 기본값
      //    (`text/plain`)을 붙여 버킷의 `allowed_mime_types`에 걸린다.
      const { error: uploadError } = await supabase.storage
        .from(data.bucket)
        .uploadToSignedUrl(data.path, data.token, file, {
          contentType: file.type,
        });

      if (uploadError) {
        throw userError(GENERIC_UPLOAD_ERROR, uploadError);
      }
    }

    return uploaded;
  } catch (error) {
    await discardAttachments({
      accessToken,
      sessionId,
      attachmentIds: uploaded,
    });
    throw error;
  }
}

/**
 * 업로드 분기 분석. 서버가 `attachmentIds[]`만 받는다는 계약을 여기서도 지킨다 —
 * 경로·MIME·크기를 실어 보내지 않는다(§8.8 BLOCK).
 */
export async function analyzeGuideUpload({
  accessToken,
  sessionId,
  attachmentIds,
}: {
  accessToken: string;
  sessionId: string;
  attachmentIds: string[];
}) {
  const result = await postJson(
    "performance/analyze-guide",
    accessToken,
    { sessionId, attachmentIds },
    AI_CALL_TIMEOUT_MS,
  );

  if (!result.ok) {
    throw userError(result.message || GENERIC_ANALYZE_ERROR);
  }

  return result.data;
}

/**
 * 직접 입력 분기(§5.8). **별도 엔드포인트도, `session.js` PATCH도 아니다** — 같은
 * `analyze-guide`의 `{ sessionId, freetext }` 분기다(§8.6 엔드포인트 표).
 * 서버가 모델을 부르지 않고 `guide_input_mode='manual'` + `guide_freetext`를 채운다.
 */
export async function submitManualGuide({
  accessToken,
  sessionId,
  freetext,
}: {
  accessToken: string;
  sessionId: string;
  freetext: string;
}) {
  const result = await postJson("performance/analyze-guide", accessToken, {
    sessionId,
    freetext,
  });

  if (!result.ok) {
    throw userError(result.message || GENERIC_ANALYZE_ERROR);
  }

  return result.data;
}

/**
 * 업로드 실패분 회수. **조용히 실패한다** — 이 호출은 이미 발생한 실패의 뒷정리이고,
 * 여기서 또 에러를 띄우면 사용자에게 원인이 아닌 메시지가 겹쳐 보인다.
 * 회수에 실패한 자리는 24시간 고아 스윕(`cleanup-attachments.js`)이 결국 치운다.
 */
async function discardAttachments({
  accessToken,
  sessionId,
  attachmentIds,
}: {
  accessToken: string;
  sessionId: string;
  attachmentIds: string[];
}) {
  for (const attachmentId of attachmentIds) {
    try {
      await postJson("performance/discard-attachment", accessToken, {
        sessionId,
        attachmentId,
      });
    } catch (error) {
      console.error("[performance] 첨부 회수 실패:", attachmentId, error);
    }
  }
}
