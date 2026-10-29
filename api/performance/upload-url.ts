// POST /api/performance/upload-url
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { sessionId, mimeType, byteSize }
//   → 200 { attachmentId, bucket, path, token, signedUrl, expiresAt }
//   → 403 { error:{code:'NOT_SESSION_OWNER'} }
//   → 409 { error:{code:'TOO_MANY_ATTACHMENTS'}, max:5 }
//   → 413 { error:{code:'FILE_TOO_LARGE'}, ... }
//   → 415 { error:{code:'UNSUPPORTED_MIME'}, allowed:[...] }
//
// ── 이 파일이 하는 일
//    안내문 이미지 1장분의 Storage 업로드 토큰을 발급하고, 그 자리를 예약하는
//    `performance_attachments` 행(`ocr_status='pending'`)을 만든다. 실제 바이트는
//    이 함수를 거치지 않고 클라이언트 → Storage로 직접 간다(Vercel 서버리스 본문
//    하드 리밋 4.5MB 회피 — `api/mentor-apply-upload-url.js` 상단 주석과 같은 이유).
//
// ── 경로는 서버가 조립한다 (§8.8 「버킷 / 경로」)
//        performance-guides/{profile_id}/{session_id}/{uuid}.{ext}
//    ① `profile_id`는 Bearer 토큰을 검증해 얻은 `auth.uid()`,
//    ② `session_id`는 **DB에서 읽어온 세션 행의 id**,
//    ③ 파일명은 서버가 만든 UUID + MIME 화이트리스트에서 파생한 확장자.
//    요청 본문에서 온 문자열이 경로에 그대로 들어가는 지점이 한 곳도 없다.
//    외부 앱의 `purpose` 세그먼트(`suhaengpyeong/api/storage-signed-upload-url.js:34-39`)는
//    제거한다 — 프론트가 절대 호출하지 않는 데드 분기였다(§8.3).
//
//    첫 세그먼트가 소유자 uid이므로 Storage 정책(`storage.foldername(name)[1] =
//    auth.uid()::text`, sql/54_performance_app.sql (6))이 그대로 맞물린다.
//
// ── 이 엔드포인트가 IDOR을 막는 방식 (§8.8 BLOCK)
//    외부 `analyze-assessment-storage.js`는 `image_path`를 본문 그대로 받아 검증 없이
//    download(:68)·remove(:120)하고 내용을 응답(:136)했다. 목적지에서는 **경로 문자열이
//    클라이언트 → 서버 방향으로 흐르는 API가 아예 없다.** 여기서 서버가 조립해 DB
//    (`performance_attachments.storage_path`)에 적어 두고, 후속 분석 API는
//    `attachmentIds[]`만 받아 그 행에서 경로를 읽는다.
//
// ── 서버 강제 검증 3종 (외부 앱에는 하나도 없던 것들, §8.8이 명시 요구)
//    ① MIME 화이트리스트 — png/jpeg/webp만. HEIC는 목록에 없으므로 415다.
//    ② 세션당 최대 5장 — 기존 `performance_attachments` 행 수로 판정.
//    ③ 파일당 10MB / 세션 합계 25MB — `byteSize`로 판정(외부는 수신조차 안 한다).
//    클라이언트도 같은 상한을 미리 검사하지만(불필요한 왕복 절감) **정본은 여기다.**
//
//    ⚠️ `byteSize`/`mimeType`은 클라이언트 **선언값**이다. 토큰을 받은 뒤 더 큰 파일을
//    올릴 수 있으므로 이 계층만으로는 실제 바이트가 보장되지 않는다 — `byteSize=1`로
//    5번 토큰을 받아 각 10MB를 올리면 합계 25MB 판정이 그대로 뚫린다(버킷
//    `file_size_limit = 10485760`(sql/54 (6))이 막는 것은 장당 10MB뿐이다).
//    그래서 **실측 재판정을 분석 직전에 한 번 더 한다**: `analyze-guide.js`가
//    `storage.from(BUCKET).info(path)`로 Storage가 실제로 들고 있는 size/contentType을
//    읽어 장당 10MB·세션 합계 25MB·MIME 화이트리스트를 다시 걸고, 실측값으로
//    `byte_size`/`mime_type`을 갱신하며, 위반 객체는 remove + `ocr_status='failed'`로
//    닫는다(`api/mentor-apply.js:536-575` `verifyUploadedProof`와 같은 절차).
//    즉 이 계층은 **왕복 절감용 1차 필터**이고 정본 판정은 분석 직전 실측이다.
//
// ── 회차는 차감하지 않는다 (§9.2 결정)
//    차감 지점은 주제 추천 최초 성공 1곳뿐이다. 외부 앱은 장당 1회씩 소모해
//    3장 업로드 = 3회가 사라졌다 — 이식 금지.
//
// ── 실패해도 남는 것: pending 고아 행
//    토큰만 받고 업로드하지 않으면 `ocr_status='pending'` 행이 남고 그 자리는
//    5장 상한에 포함된다. 이것이 §8.8이 90일 보관 cron과 **별개로** 24시간 TTL
//    스윕(`ocr_status='pending' and created_at < now()-interval '24 hours'`)을
//    유지하는 이유다. 그 스윕은 이 파일이 아니라 정리 잡의 몫이다.
//
//    다만 24시간 스윕만으로는 **그 세션의 사용자가 최대 하루 동안 막힌다** —
//    5장을 올리다 Storage PUT이 한 장이라도 실패해 다시 시도하면, 화면에는 사진이
//    4장뿐인데 상한 판정은 이미 5행을 세서 409 TOO_MANY_ATTACHMENTS가 뜬다.
//    그래서 즉시 자리를 비우는 회수 경로를 따로 뒀다:
//      `POST /api/performance/discard-attachment` — 소유권 확인 후 Storage 원본
//      remove + 행 삭제. **`ocr_status='pending'` 행만** 대상이라 분석이 끝난
//      첨부를 지워 5장 상한을 우회하는 데는 쓸 수 없다.
//    클라이언트는 업로드 실패 시 그 세션에서 이미 올린 첨부를 이 엔드포인트로
//    되돌린다(`src/lib/performance/guideUpload.js`).

import crypto from "node:crypto";
import type { VercelResponse } from "@vercel/node";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  hasPaidServiceAccess,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";

const SERVICE_KEY = "suhaeng";

export const BUCKET = "performance-guides";

// §8.8 「허용 형식」 — PNG / JPG·JPEG / WEBP / PDF. 버킷의 allowed_mime_types와 같은 집합이다
// (sql/54_performance_app.sql (6)). HEIC/HEIF는 여기에 없으므로 415로 떨어진다.
export const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const UNSUPPORTED_MIME_MESSAGE =
  "PNG, JPG, WEBP 이미지 또는 PDF만 올릴 수 있어요.";

export const MAX_ATTACHMENTS = 5; // §8.8 「최대 장수 5장 — 서버에서 강제」
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB (세션 누적)

// ── 업로드 토큰 TTL (§8.8 「사용 중인 supabase-js 버전에서 실측해 별도 행으로 기록할 것」)
//
// 실측 결과 — **2시간.** 확인 경로는 설치본 소스다:
//   node_modules/@supabase/supabase-js  2.112.2
//   node_modules/@supabase/storage-js   2.110.0
//     dist/index.d.cts:951 / dist/index.cjs:782
//       "Signed upload URLs ... They are valid for 2 hours."
//     dist/index.cjs:816-831 `createSignedUploadUrl(path, options)` 본문 —
//       옵션은 `upsert` 하나뿐이고, 만료를 담은 파라미터·쿼리·헤더를 **전혀 보내지
//       않는다**(`POST {url}/object/upload/sign/{path}`, 본문 `{}`).
//
// 따라서 이 값은 클라이언트가 조정할 수 없고(`createSignedUploadUrl`에 expiresIn류
// 인자가 없다) 실제 만료는 storage-api 서버가 발급하는 JWT의 `exp`가 정한다.
// 아래 상수는 그 서버 기본값을 **클라이언트에 안내하기 위한 사본**이지 강제값이
// 아니다 — storage-api 쪽 기본값이 바뀌면 이 숫자가 아니라 토큰이 정답이다.
// (배포 환경의 실제 `exp`를 토큰 디코드로 재확인하는 것은 service_role 키가 있는
//  환경에서만 가능해 이 작업 환경에서는 수행하지 못했다. 라이브러리 계약 수준의
//  실측까지가 여기서 확인 가능한 전부다.)
const UPLOAD_TOKEN_TTL_SECONDS = 2 * 60 * 60;

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
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "업로드 준비에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/upload-url",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);

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
    const mimeType =
      typeof body.mimeType === "string"
        ? body.mimeType.trim().toLowerCase()
        : "";
    const byteSize = Number(body.byteSize);

    if (!sessionId) {
      return fail(res, 400, "MISSING_FIELD", "sessionId는 필수입니다.", {
        field: "sessionId",
      });
    }

    // ① MIME 화이트리스트. HEIC를 고른 사용자는 여기까지 오기 전에 클라이언트가
    //    §8.8 지정 문구로 막지만, 파일 선택기 필터를 우회한 경우 이 검사가 정본이다.
    const ext = ALLOWED_MIME_EXT[mimeType];
    if (!ext) {
      return fail(res, 415, "UNSUPPORTED_MIME", UNSUPPORTED_MIME_MESSAGE, {
        allowed: Object.keys(ALLOWED_MIME_EXT),
      });
    }

    if (
      !Number.isFinite(byteSize) ||
      !Number.isInteger(byteSize) ||
      byteSize <= 0
    ) {
      return fail(
        res,
        400,
        "INVALID_BYTE_SIZE",
        "파일 크기 정보를 확인할 수 없습니다.",
        {
          field: "byteSize",
        },
      );
    }

    if (byteSize > MAX_FILE_BYTES) {
      return fail(
        res,
        413,
        "FILE_TOO_LARGE",
        "사진 한 장은 10MB까지 올릴 수 있어요.",
        {
          maxBytes: MAX_FILE_BYTES,
        },
      );
    }

    // ── 소유권 확인. service_role 클라이언트라 RLS가 통째로 우회되므로 이
    //    `.eq('profile_id', userId)` 조건이 유일한 방어선이다(bootstrap.js와 같은 관례).
    //    세션이 없는 경우와 남의 세션인 경우를 **같은 403으로 합친다** — 404로 갈라
    //    주면 "그 UUID가 존재하는가"를 알려주는 존재 오라클이 된다.
    const { data: sessionRow, error: sessionError } = await supabaseAdmin
      .from("performance_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("profile_id", userId)
      .maybeSingle();

    if (sessionError)
      throw new Error(`세션 조회 실패: ${sessionError.message}`);

    if (!sessionRow) {
      return fail(
        res,
        403,
        "NOT_SESSION_OWNER",
        "이 수행평가 세션에 접근할 수 없습니다.",
      );
    }

    // ② 장수 · ③ 합계 용량 — 같은 조회 한 번으로 함께 판정한다.
    //
    // `deleted_at`이 찍힌 행(원본이 이미 지워진 첨부)도 **센다.** 그 행은 분석 텍스트가
    // 남아 있는 정상 첨부이고(§8.8 90일 cron), 카운트에서 빼면 세션 하나에 5장을 넘겨
    // 올릴 수 있는 우회로가 생긴다. pending 고아 행이 자리를 먹는 문제는 24시간 TTL
    // 스윕이 해결한다(파일 상단 주석).
    const { data: attachmentRows, error: attachmentError } = await supabaseAdmin
      .from("performance_attachments")
      .select("id,byte_size")
      .eq("session_id", sessionRow.id);

    if (attachmentError)
      throw new Error(`첨부 조회 실패: ${attachmentError.message}`);

    const existing = attachmentRows || [];

    if (existing.length >= MAX_ATTACHMENTS) {
      return fail(
        res,
        409,
        "TOO_MANY_ATTACHMENTS",
        "안내문 사진은 최대 5장까지 올릴 수 있어요.",
        {
          max: MAX_ATTACHMENTS,
        },
      );
    }

    const usedBytes = existing.reduce(
      (sum, row) => sum + (Number(row.byte_size) || 0),
      0,
    );

    if (usedBytes + byteSize > MAX_TOTAL_BYTES) {
      return fail(
        res,
        413,
        "FILE_TOO_LARGE",
        "사진 전체 용량은 25MB까지 올릴 수 있어요.",
        {
          maxTotalBytes: MAX_TOTAL_BYTES,
          usedBytes,
        },
      );
    }

    // ── 경로 조립. 클라이언트 입력이 섞이는 지점이 없다(파일 상단 주석).
    const objectPath = `${userId}/${sessionRow.id}/${crypto.randomUUID()}.${ext}`;

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(objectPath);

    if (signError || !signed) {
      console.error("performance/upload-url signed URL 발급 실패:", signError);
      return fail(res, 500, "INTERNAL", "업로드 준비 중 오류가 발생했습니다.");
    }

    // 토큰 발급 → 행 생성 순서다. 반대로 하면 서명 실패 시 아무 파일도 가리키지 않는
    // 행이 남는다. 이 순서에서 남을 수 있는 것은 "업로드되지 않을 토큰"뿐이고 그건
    // 아무 객체도 만들지 않는다.
    const { data: attachment, error: insertError } = await supabaseAdmin
      .from("performance_attachments")
      .insert({
        session_id: sessionRow.id,
        storage_path: signed.path || objectPath,
        mime_type: mimeType,
        byte_size: byteSize,
        ocr_status: "pending",
      })
      .select("id")
      .single();

    if (insertError)
      throw new Error(`첨부 행 생성 실패: ${insertError.message}`);

    res.status(200).json({
      attachmentId: attachment.id,
      bucket: BUCKET,
      path: signed.path || objectPath,
      token: signed.token,
      signedUrl: signed.signedUrl,
      expiresAt: new Date(
        Date.now() + UPLOAD_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
    });
  },
});

// 실행 시간: 모델을 부르지 않으므로 형제 라우트의 `maxDuration: 60`이 필요 없다.
export const config = { runtime: "nodejs" };
