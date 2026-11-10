// POST /api/mentor-apply-upload-url
//
// 멘토 지원서 증빙파일용 Supabase Storage **signed upload URL** 발급. 2단계
// 제출 흐름의 1단계다 — 요청/응답 필드, reason 목록, 클라이언트 예제 전체는
// api/_routes/mentor-apply.js 상단 "클라이언트 호출 규약" 주석 참고 (거기가 정본이다).
//
// 왜 이 라우트가 필요한가 — Vercel 서버리스 함수(Node.js 런타임)의 요청 본문에는
// 플랜과 무관하게 고정된 플랫폼 하드 리밋 4.5MB 가 있다. 시안 문구(원래 100MB
// 이하, 이후 50MB 로 재확정 — api/_routes/mentor-apply.js MAX_FILE_BYTES 주석 참고)를
// 지키려면 파일이 이 함수를 거치지 않고 Storage 로 직접 가야 하고, 그러려면
// 클라이언트가 쓸 수 있는 업로드 토큰을 서버가 먼저 발급해야 한다. 자세한
// 배경은 api/_routes/mentor-apply.js 상단 "왜 base64 방식(구)에서 ... 바꿨나" 참고.
//
// ⚠️ 이 라우트가 발급하는 토큰은 **그 경로 하나에만** 유효하다 — RLS insert
// 정책 없이도 업로드가 되는 이유다(mentor-applications 버킷은 비공개 유지,
// sql/52_mentor_applications.sql 참고). 그래서 이 라우트 자체가 "누가 업로드할
// 수 있는지"를 판정하는 유일한 관문이고, 그 판정의 핵심은 아래 1) 휴대폰 인증
// 확인이다 — 이걸 빼면 인증 없이 누구나 버킷에 무제한 업로드할 수 있게 된다.
//
// 검사 순서 — 값싼 것부터: rate limit(in-memory) → 휴대폰 인증 확인(DB 읽기,
// **소비하지 않음**) → 확장자·MIME 화이트리스트(메모리) → 선언된 size 상한
// (메모리) → 경로 생성 → createSignedUploadUrl(외부 API 호출).

import crypto from "node:crypto";
import type { VercelResponse } from "@vercel/node";
import { defineHandler } from "../_lib/handler.js";
import {
  getClientIp,
  isValidMobile,
  maskPhone,
  normalizePhone,
} from "../_lib/phoneCode.js";
import {
  ALLOWED_FILE_TYPES,
  BUCKET,
  clean,
  findValidPhoneVerification,
  MAX_FILE_BYTES,
  MAX_FILE_MB_LABEL,
  NEUTRAL_MIME_TYPES,
} from "./mentor-apply.js";

// api/_routes/mentor-apply.js 와 같은 이유로 nodejs 런타임을 쓴다(형제 파일과 일관성).
export const config = { runtime: "nodejs" };

function fail(
  res: VercelResponse,
  status: number,
  reason: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  return void res.status(status).json({ ok: false, reason, detail, ...extra });
}

// ---------------------------------------------------------------------------
// 발급 rate limit — in-memory, best-effort
//
// 이 엔드포인트 전용 시도 기록 테이블이 없다(이번 작업 범위가 api/_routes/mentor-apply.js
// 와 이 파일 두 개로 한정되어, 새 테이블·새 공유 모듈을 만들지 않았다 — 후속
// 과제로 리포트에 남긴다). 그래서 함수 인스턴스 메모리에 있는 카운터로 막는다.
// Vercel 서버리스는 콜드스타트마다, 그리고 동시 실행 인스턴스마다 메모리가
// 분리되므로 이 카운터는 **정확한 전역 상한이 아니라 완화 장치일 뿐**이다.
//
// 실질적인 남용 방어선은 이 카운터가 아니라 아래 1) 휴대폰 인증 확인이다 —
// 인증된 번호 자체가 이미 send-phone-code.js 의 발송 rate limit(번호·IP·전역
// 4중, phoneCode.js checkSendLimits)을 통과해야만 존재하므로, 인증되지 않은
// 요청은 이 카운터 이전에 이미 걸러진다. 이 카운터는 "인증은 됐지만 그 번호로
// 업로드 URL을 비정상적으로 반복 요청하는" 좁은 창을 완화한다.
const attemptLog = new Map<string, number[]>(); // key -> timestamp(ms)[]

const UPLOAD_URL_COOLDOWN_SECONDS = 3;
const MAX_UPLOAD_URLS_PER_PHONE_HOUR = 20;
const MAX_UPLOAD_URLS_PER_IP_HOUR = 40;

function recentAttempts(key: string, windowSeconds: number) {
  const cutoff = Date.now() - windowSeconds * 1000;
  const timestamps = (attemptLog.get(key) || []).filter((t) => t > cutoff);
  attemptLog.set(key, timestamps);
  return timestamps;
}

function recordAttempt(key: string) {
  const timestamps = attemptLog.get(key) || [];
  timestamps.push(Date.now());
  attemptLog.set(key, timestamps);
}

function checkLocalRateLimit({
  phone,
  ip,
}: {
  phone: string;
  ip: string | null;
}): {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
} {
  const phoneKey = `phone:${phone}`;
  const phoneHour = recentAttempts(phoneKey, 3600);

  if (phoneHour.length > 0) {
    const elapsed = (Date.now() - phoneHour[phoneHour.length - 1]!) / 1000;

    if (elapsed < UPLOAD_URL_COOLDOWN_SECONDS) {
      return {
        allowed: false,
        reason: "cooldown",
        retryAfter: Math.ceil(UPLOAD_URL_COOLDOWN_SECONDS - elapsed),
      };
    }
  }

  if (phoneHour.length >= MAX_UPLOAD_URLS_PER_PHONE_HOUR) {
    return { allowed: false, reason: "phone_hourly_limit", retryAfter: 3600 };
  }

  if (ip) {
    const ipHour = recentAttempts(`ip:${ip}`, 3600);

    if (ipHour.length >= MAX_UPLOAD_URLS_PER_IP_HOUR) {
      return { allowed: false, reason: "ip_hourly_limit", retryAfter: 3600 };
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// 핸들러
// ---------------------------------------------------------------------------

export default defineHandler({
  methods: ["POST"],
  auth: "none",
  errorShape: "okDetail",
  // dev 원본 405는 { ok:false, reason:"method_not_allowed", detail } 였다 —
  // methodNotAllowedExtra로 reason을 되살린다(batch-8, W7 해소).
  methodNotAllowedMessage: "Method not allowed",
  methodNotAllowedExtra: { reason: "method_not_allowed" },
  unhandledMessage:
    "업로드 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  logLabel: "mentor-apply-upload-url",
  handler: async (req, res, ctx) => {
    const contentType = String(req.headers["content-type"] || "");

    if (!contentType.includes("application/json")) {
      return fail(
        res,
        415,
        "invalid_content_type",
        "application/json 으로 보내 주세요.",
      );
    }

    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail(res, 400, "invalid_payload", "요청 본문을 읽을 수 없습니다.");
    }

    const phone = normalizePhone(body.phone);

    if (!isValidMobile(phone)) {
      return fail(
        res,
        400,
        "invalid_phone",
        "휴대폰 번호 형식이 올바르지 않습니다.",
        {
          field: "phone",
        },
      );
    }

    const ip = getClientIp(req);

    // 1) rate limit — 가장 값싼 검사부터. DB 를 열기 전에 반복 요청을 끊는다.
    const localLimit = checkLocalRateLimit({ phone, ip });

    if (!localLimit.allowed) {
      return fail(res, 429, localLimit.reason!, "잠시 후 다시 시도해 주세요.", {
        retry_after: localLimit.retryAfter,
      });
    }

    recordAttempt(`phone:${phone}`);
    if (ip) recordAttempt(`ip:${ip}`);

    const fileName = clean(body.fileName);
    const declaredType = clean(body.contentType).toLowerCase();
    const size = Number(body.size);

    try {
      const supabase = ctx.supabaseAdmin;

      // 2) 휴대폰 인증 확인 — 이게 이 엔드포인트의 유일한 실질 남용 방어선이다.
      // consumed_at 을 찍지 않는다(findValidPhoneVerification 함수 주석 참고) —
      // 실제 제출(api/_routes/mentor-apply.js)에서만 소비한다.
      const verification = await findValidPhoneVerification(supabase, phone);

      if (verification.error) {
        const { status, ...rest } = verification.error;
        return void res.status(status).json({ ok: false, ...rest });
      }

      // 3) 확장자·MIME 화이트리스트 — api/_routes/mentor-apply.js 와 같은 상수를 그대로 쓴다.
      if (!fileName) {
        return fail(
          res,
          400,
          "file_required",
          "재학 증빙 서류를 첨부해 주세요.",
          {
            field: "proof_file",
          },
        );
      }

      const extension = fileName.toLowerCase().split(".").pop();

      if (!fileName.includes(".") || !ALLOWED_FILE_TYPES[extension!]) {
        return fail(
          res,
          415,
          "file_type_not_allowed",
          "PDF · PNG · JPG · HWP 파일만 첨부할 수 있습니다.",
          {
            field: "proof_file",
          },
        );
      }

      const allowedMimes = ALLOWED_FILE_TYPES[extension!];

      if (
        !NEUTRAL_MIME_TYPES.includes(declaredType) &&
        !allowedMimes.includes(declaredType)
      ) {
        return fail(
          res,
          415,
          "file_type_not_allowed",
          "파일 형식이 확장자와 일치하지 않습니다.",
          {
            field: "proof_file",
          },
        );
      }

      // 4) 선언된 size 검증 — **1차 필터일 뿐이다.** 클라이언트가 실제 파일보다
      // 작게 선언하고 더 큰 파일을 PUT 할 수 있으므로, 실제 크기는
      // api/_routes/mentor-apply.js 의 verifyUploadedProof 가 제출 시 service_role 로
      // Storage 객체를 직접 읽어 재검증한다. 여기서는 명백히 잘못된 요청만 조기에
      // 걸러 불필요한 signed URL 발급·업로드 시도를 막는다.
      if (!Number.isFinite(size) || size <= 0) {
        return fail(
          res,
          400,
          "invalid_payload",
          "파일 크기 정보를 확인할 수 없습니다.",
          {
            field: "proof_file",
          },
        );
      }

      if (size > MAX_FILE_BYTES) {
        return fail(
          res,
          413,
          "file_too_large",
          `첨부파일은 ${MAX_FILE_MB_LABEL}MB 이하만 올릴 수 있습니다.`,
          {
            field: "proof_file",
          },
        );
      }

      // 5) 경로는 서버가 생성한다 — 클라이언트가 준 파일명을 경로에 쓰면 `../` 나
      // 제어문자로 다른 객체를 덮어쓰거나, 파일명 자체가 경로에 개인정보로 남는다.
      // 날짜 폴더는 어드민이 스토리지에서 눈으로 찾을 때와, 후속 과제인 고아 파일
      // 정리 배치가 보존기간을 판정할 때 쓰인다(api/_routes/mentor-apply.js 상단 "고아
      // 파일" 절 참고). 형식은 api/_routes/mentor-apply.js 의 PROOF_PATH_PATTERN 과
      // 정확히 맞아야 한다.
      const dateFolder = new Date().toISOString().slice(0, 10);
      const objectPath = `${dateFolder}/${crypto.randomUUID()}.${extension}`;

      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(objectPath);

      if (signError || !signed) {
        console.error(
          "[mentor-apply-upload-url] signed URL 발급 실패:",
          signError,
        );
        return fail(
          res,
          500,
          "upload_url_failed",
          "업로드 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }

      return void res.status(200).json({
        ok: true,
        path: signed.path,
        token: signed.token,
        signedUrl: signed.signedUrl,
      });
    } catch (error) {
      console.error(
        "[mentor-apply-upload-url] 발급 실패:",
        maskPhone(phone),
        error,
      );

      return fail(
        res,
        500,
        "unknown",
        "업로드 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  },
});
