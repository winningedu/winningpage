// /api/admin/uploads 루트 경로. 관리자 앱(api/_routes/admin/app.ts)이 .route("/uploads", uploads) 로 붙인다.
// 하위 경로(/preview)는 api/_routes/admin/uploads-preview.ts 가 맡는다.
//
// POST, DELETE /api/admin/uploads
//
// POST: 임시 버킷(admin-uploads-tmp)에 올릴 서명 URL 발급. 브라우저가 그 URL 로 직접 PUT 하고,
//       저장할 때 섹션 라우트가 banners 로 옮긴다(promote.ts).
// DELETE: 섹션 업로드 폴더 아래 banners 파일 삭제(교체, 취소 때 옛 파일 정리). 폴더 밖 경로는 하나라도 있으면 전체 거절.
// 메뉴 권한은 본문 section 키로 edit 를 본다. 스토리지만 쓰고 DB 는 건드리지 않는다.
// 요청 검증과 응답 모양은 shared/uploads/contract.ts 를 따른다.

import { randomUUID } from "node:crypto";
import {
  type IssuedUpload,
  issueUploadBody,
  removeUploadsBody,
} from "../../../shared/uploads/contract.js";
import { uploadRulesFor } from "../../_lib/admin-sections/uploadRules.js";
import {
  buildTempName,
  isDeletablePath,
  PUBLIC_BUCKET,
  TMP_BUCKET,
  uploadSectionKey,
  validateUpload,
} from "../../_lib/admin-uploads/tmp.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, validationFailed } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

const BAD_FIELD = "업로드할 수 없는 항목입니다.";
const BAD_PATH = "삭제할 수 없는 경로입니다.";

const issueGuard = admin({
  permission: { key: uploadSectionKey },
  unhandledMessage: "업로드 주소를 만들지 못했습니다.",
  logLabel: "[admin/uploads]",
});

const removeGuard = admin({
  permission: { key: uploadSectionKey },
  unhandledMessage: "파일을 지우지 못했습니다.",
  logLabel: "[admin/uploads]",
});

export const uploads = adminFactory
  .createApp()
  .post("/", issueGuard, validate("json", issueUploadBody), async (c) => {
    const { section, field, fileName, contentType, size } = c.req.valid("json");
    // 권한 키 함수가 이미 섹션을 확인했다.
    const rule = uploadRulesFor(section)?.[field];
    if (!rule) {
      return validationFailed(c, [{ path: "field", message: BAD_FIELD }]);
    }
    const rejected = validateUpload(rule, { fileName, contentType, size });
    const path = buildTempName({
      uuid: randomUUID(),
      fieldKey: field,
      fileName,
    });
    if (rejected || !path) {
      return validationFailed(c, [
        rejected ?? {
          path: "fileName",
          message: "올릴 수 없는 파일 형식입니다.",
        },
      ]);
    }
    const { data, error } = await c.var.supabaseAdmin.storage
      .from(TMP_BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw new Error("admin upload url failed");
    return c.json(
      { path, uploadUrl: data.signedUrl } satisfies IssuedUpload,
      201,
    );
  })
  .delete("/", removeGuard, validate("json", removeUploadsBody), async (c) => {
    const { section, paths } = c.req.valid("json");
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
    if (errors.length > 0) return validationFailed(c, errors);
    const { error } = await c.var.supabaseAdmin.storage
      .from(PUBLIC_BUCKET)
      .remove(paths);
    if (error) throw new Error("admin upload remove failed");
    return c.body(null, 204);
  })
  .all("/", methodNotAllowed("POST", "DELETE"));
