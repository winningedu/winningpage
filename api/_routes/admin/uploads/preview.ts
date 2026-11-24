// POST /api/admin/uploads/preview
//
// 임시 버킷은 비공개라 폼 미리보기와 BlockNote 삽입에 쓸 읽기용 서명 URL 을 따로 준다(2시간).
// 저장 때 섹션 라우트가 이 URL 을 banners 공개 URL 로 바꾼다(promote.ts).

import { z } from "zod";
import { getSection } from "../../../_lib/admin-sections/registry.js";
import {
  parseTempName,
  SIGNED_URL_TTL_SECONDS,
  sendUploadExpired,
  TMP_BUCKET,
  uploadSectionKey,
} from "../../../_lib/admin-uploads/tmp.js";
import { defineHandler } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: uploadSectionKey },
  // 서명 주소만 만들고 데이터를 바꾸지 않아 조회로 남긴다.
  audit: { action: "view" },
  unhandledMessage: "미리보기 주소를 만들지 못했습니다.",
  logLabel: "[admin/uploads/preview]",
  headers: { "Cache-Control": "no-store" },
  body: z.object({ section: z.string(), path: z.string() }),
  handler: async (_req, res, ctx) => {
    const { section, path } = ctx.body;
    const parsed = parseTempName(path);
    if (!parsed || !getSection(section)?.uploads[parsed.fieldKey]) {
      sendError(
        res,
        "problem",
        400,
        "요청 값이 올바르지 않아요.",
        "VALIDATION_FAILED",
        {
          errors: [
            { path: "path", message: "올바르지 않은 업로드 경로입니다." },
          ],
        },
      );
      return;
    }
    const bucket = ctx.supabaseAdmin.storage.from(TMP_BUCKET);
    const { data: found } = await bucket.exists(path);
    if (!found) {
      sendUploadExpired(res);
      return;
    }
    const { data, error } = await bucket.createSignedUrl(
      path,
      SIGNED_URL_TTL_SECONDS,
    );
    if (error) throw new Error("admin upload preview url failed");
    res.status(200).json({ url: data.signedUrl });
  },
});
