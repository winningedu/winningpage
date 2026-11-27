// /api/admin/uploads/preview 관리자 업로드 미리보기 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/uploads", uploadsPreview) 로 붙인다.
// 발급과 삭제(/api/admin/uploads 루트)는 api/_routes/admin/uploads.ts 가 맡는다. 요청 검증과 응답 모양은 shared/uploads/preview.ts 를 따른다.
// 임시 버킷은 비공개라 폼 미리보기와 BlockNote 삽입에 쓸 읽기용 서명 URL 을 따로 준다(2시간).
// 저장 때 섹션 라우트가 이 URL 을 banners 공개 URL 로 바꾼다(promote.ts). 스토리지만 읽고 DB 는 건드리지 않는다.

import {
  type UploadPreview,
  uploadPreviewBody,
} from "../../../shared/uploads/preview.js";
import { uploadRulesFor } from "../../_lib/admin-sections/uploadRules.js";
import {
  parseTempName,
  SIGNED_URL_TTL_SECONDS,
  TMP_BUCKET,
  uploadExpired,
  uploadSectionKey,
} from "../../_lib/admin-uploads/tmp.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, validationFailed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

const guard = admin({
  permission: { key: uploadSectionKey },
  // 서명 주소만 만들고 데이터를 바꾸지 않아 조회로 남긴다.
  audit: { action: "view" },
  unhandledMessage: "미리보기 주소를 만들지 못했습니다.",
  logLabel: "[admin/uploads/preview]",
});

export const uploadsPreview = adminFactory
  .createApp()
  .post("/preview", guard, validate("json", uploadPreviewBody), async (c) => {
    const { section, path } = c.req.valid("json");
    const parsed = parseTempName(path);
    if (!parsed || !uploadRulesFor(section)?.[parsed.fieldKey]) {
      return validationFailed(c, [
        { path: "path", message: "올바르지 않은 업로드 경로입니다." },
      ]);
    }
    const bucket = c.var.supabaseAdmin.storage.from(TMP_BUCKET);
    const { data: found } = await bucket.exists(path);
    if (!found) throw uploadExpired();
    const { data, error } = await bucket.createSignedUrl(
      path,
      SIGNED_URL_TTL_SECONDS,
    );
    if (error) throw new Error("admin upload preview url failed");
    return c.json({ url: data.signedUrl } satisfies UploadPreview);
  })
  .all("/preview", methodNotAllowed("POST"));
