// 관리자 임시 업로드 API 계약. 서버(api/_routes/admin/uploads.ts)는 요청 스키마로 검증하고, 브라우저(src/pages/admin/engine/api.ts)는 응답 스키마로 검증한다.

import { z } from "zod";

/** 업로드 라우트의 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const UPLOAD_ERROR = {
  /** 임시 파일이 사라졌다(2시간 URL 만료, 24시간 정리). 브라우저는 파일을 다시 올리게 한다. */
  UPLOAD_EXPIRED: "UPLOAD_EXPIRED",
} as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR)[keyof typeof UPLOAD_ERROR];

export const UPLOAD_FILE_NAME_MAX_LENGTH = 255;
/** 한 번에 지울 수 있는 경로 수. */
export const UPLOAD_REMOVE_MAX_PATHS = 100;

// ---------------------------------------------------------------------------
// 요청
// ---------------------------------------------------------------------------

/** POST /api/admin/uploads: 임시 업로드 URL 발급. 필드 규칙(형식, 크기)은 서버가 섹션 레지스트리로 판정한다. */
export const uploadIssueBody = z.object({
  section: z.string(),
  field: z.string().min(1),
  fileName: z.string().min(1).max(UPLOAD_FILE_NAME_MAX_LENGTH),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

/** DELETE /api/admin/uploads: banners 파일 삭제. 경로 하나라도 폴더 밖이면 전체 거절이다. */
export const uploadRemoveBody = z.object({
  section: z.string(),
  paths: z.array(z.string()).min(1).max(UPLOAD_REMOVE_MAX_PATHS),
});

/** POST /api/admin/uploads/preview: 임시 객체의 읽기용 서명 URL. */
export const uploadPreviewBody = z.object({
  section: z.string(),
  path: z.string(),
});

// ---------------------------------------------------------------------------
// 응답
// ---------------------------------------------------------------------------

/** 201: 임시 객체 이름과, 브라우저가 직접 PUT 할 서명 URL. */
export const issuedUploadSchema = z.object({
  path: z.string(),
  uploadUrl: z.string(),
});

export const uploadPreviewSchema = z.object({ url: z.string() });

export type UploadIssueBody = z.input<typeof uploadIssueBody>;
export type UploadRemoveBody = z.input<typeof uploadRemoveBody>;
export type UploadPreviewBody = z.input<typeof uploadPreviewBody>;
export type IssuedUpload = z.output<typeof issuedUploadSchema>;
export type UploadPreview = z.output<typeof uploadPreviewSchema>;
