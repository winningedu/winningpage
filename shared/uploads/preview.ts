// 관리자 업로드 미리보기 API 계약(POST /api/admin/uploads/preview). 서버(api/_routes/admin/uploads-preview.ts)는 요청 스키마로 검증하고,
// 브라우저(src/pages/admin/engine/api.ts)는 응답 스키마로 검증한다. 업로드 발급과 삭제(/api/admin/uploads)의 계약은 shared/uploads/contract.ts 가 맡는다.

import { z } from "zod";

/** 업로드 도메인 problem code. 공통 코드는 shared/http/codes.ts 다. */
export const UPLOAD_ERROR = {
  /** 임시 파일이 사라졌다(2시간 URL 만료, 24시간 정리). 브라우저는 파일을 다시 올리게 한다. */
  UPLOAD_EXPIRED: "UPLOAD_EXPIRED",
} as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR)[keyof typeof UPLOAD_ERROR];

/** 요청: 임시 객체의 읽기용 서명 URL. */
export const uploadPreviewBody = z.object({
  section: z.string(),
  path: z.string(),
});

/** 응답 200. */
export const uploadPreviewSchema = z.object({ url: z.string() });

export type UploadPreviewBody = z.input<typeof uploadPreviewBody>;
export type UploadPreview = z.output<typeof uploadPreviewSchema>;
