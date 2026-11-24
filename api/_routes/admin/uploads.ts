// POST, DELETE /api/admin/uploads
//
// POST: 임시 버킷(admin-uploads-tmp)에 올릴 서명 URL 발급. 브라우저가 그 URL 로 직접 PUT 하고,
//       저장할 때 섹션 라우트가 banners 로 옮긴다(promote.ts).
// DELETE: 섹션 업로드 폴더 아래 banners 파일 삭제(교체, 취소 때 옛 파일 정리). 폴더 밖 경로는 하나라도 있으면 전체 거절.
// 메뉴 권한은 본문 section 키로 edit 를 본다. 스토리지만 쓰고 DB 는 건드리지 않는다.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { uploadRulesFor } from "../../_lib/admin-sections/uploadRules.js";
import {
  buildTempName,
  isDeletablePath,
  PUBLIC_BUCKET,
  TMP_BUCKET,
  uploadSectionKey,
  validateUpload,
} from "../../_lib/admin-uploads/tmp.js";
import { defineHandler } from "../../_lib/handler.js";
import { sendError } from "../../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

const BAD_FIELD = "업로드할 수 없는 항목입니다.";
const BAD_PATH = "삭제할 수 없는 경로입니다.";

const issue = defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: uploadSectionKey },
  unhandledMessage: "업로드 주소를 만들지 못했습니다.",
  logLabel: "[admin/uploads]",
  headers: { "Cache-Control": "no-store" },
  body: z.object({
    section: z.string(),
    field: z.string().min(1),
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1),
    size: z.number().int().positive(),
  }),
  handler: async (_req, res, ctx) => {
    const { section, field, fileName, contentType, size } = ctx.body;
    // 권한 키 함수가 이미 섹션을 확인했다.
    const rule = uploadRulesFor(section)?.[field];
    if (!rule) {
      sendError(
        res,
        "problem",
        400,
        "요청 값이 올바르지 않아요.",
        "VALIDATION_FAILED",
        {
          errors: [{ path: "field", message: BAD_FIELD }],
        },
      );
      return;
    }
    const rejected = validateUpload(rule, { fileName, contentType, size });
    const path = buildTempName({
      uuid: randomUUID(),
      fieldKey: field,
      fileName,
    });
    if (rejected || !path) {
      sendError(
        res,
        "problem",
        400,
        "요청 값이 올바르지 않아요.",
        "VALIDATION_FAILED",
        {
          errors: [
            rejected ?? {
              path: "fileName",
              message: "올릴 수 없는 파일 형식입니다.",
            },
          ],
        },
      );
      return;
    }
    const { data, error } = await ctx.supabaseAdmin.storage
      .from(TMP_BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw new Error("admin upload url failed");
    res.status(201).json({ path, uploadUrl: data.signedUrl });
  },
});

const remove = defineHandler({
  methods: ["DELETE"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: uploadSectionKey },
  unhandledMessage: "파일을 지우지 못했습니다.",
  logLabel: "[admin/uploads]",
  headers: { "Cache-Control": "no-store" },
  body: z.object({
    section: z.string(),
    paths: z.array(z.string()).min(1).max(100),
  }),
  handler: async (_req, res, ctx) => {
    const { section, paths } = ctx.body;
    const folders = [
      ...new Set(
        Object.values(uploadRulesFor(section) ?? {}).map((f) => f.folder),
      ),
    ];
    const errors = paths.flatMap((path, index) =>
      isDeletablePath(path, folders)
        ? []
        : [{ path: `paths.${index}`, message: BAD_PATH }],
    );
    if (errors.length > 0) {
      sendError(
        res,
        "problem",
        400,
        "요청 값이 올바르지 않아요.",
        "VALIDATION_FAILED",
        {
          errors,
        },
      );
      return;
    }
    const { error } = await ctx.supabaseAdmin.storage
      .from(PUBLIC_BUCKET)
      .remove(paths);
    if (error) throw new Error("admin upload remove failed");
    res.status(204).end();
  },
});

// 본문 모양이 메서드마다 달라 핸들러를 둘로 나눠 메서드로 보낸다.
export default (...args: Parameters<typeof issue>): ReturnType<typeof issue> =>
  args[0].method === "DELETE" ? remove(...args) : issue(...args);
