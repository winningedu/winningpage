// 관리자 임시 업로드 API 계약(루트 경로 POST, DELETE /api/admin/uploads). 서버(api/_routes/admin/uploads.ts)가 요청 스키마로 검증하고, 브라우저(섹션 편집 화면)가 응답 스키마로 검증한다.

import { z } from "zod";

/** DELETE 한 번에 지울 수 있는 경로 수. */
export const UPLOAD_REMOVE_MAX_PATHS = 100;

/** POST 본문. 임시 버킷에 올릴 서명 URL 을 요청한다. 섹션과 필드의 허용 여부는 서버가 규칙으로 본다. */
export const issueUploadBody = z.object({
  section: z.string(),
  field: z.string().min(1),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

/** 브라우저가 보내는 모양. */
export type IssueUploadInput = z.input<typeof issueUploadBody>;

/** DELETE 본문. 섹션 업로드 폴더 아래 경로만 받는다(그 규칙은 서버가 본다). */
export const removeUploadsBody = z.object({
  section: z.string(),
  paths: z.array(z.string()).min(1).max(UPLOAD_REMOVE_MAX_PATHS),
});

export type RemoveUploadsInput = z.input<typeof removeUploadsBody>;

/** POST 201 응답. */
export const issuedUploadSchema = z.object({
  path: z.string(),
  uploadUrl: z.string(),
});

export type IssuedUpload = z.output<typeof issuedUploadSchema>;
