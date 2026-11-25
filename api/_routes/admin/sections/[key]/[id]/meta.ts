// PATCH /api/admin/sections/:key/:id/meta
//
// 메타 편집 모달(saveAdmissionMeta) 저장 경로. 보호 컬럼 정리와 모르는 키 거절만 하고,
// 고정 값과 sort_order 밀기는 하지 않는다(화면의 saveAdmissionMeta 와 같다). meta 섹션만 쓴다.

import {
  buildPayload,
  failWrite,
  notAllowed,
  scopeToSection,
  sectionOf,
  sectionPermissionKey,
  sendNotFound,
  sendRejectedPayload,
  valuesOf,
} from "../../../../../_lib/admin-sections/query.js";
import { defineHandler } from "../../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["PATCH"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: sectionPermissionKey },
  unhandledMessage: "섹션 데이터를 처리하지 못했습니다.",
  logLabel: "[admin/sections/meta]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const entry = sectionOf(req);
    if (!entry.meta) notAllowed("이 섹션은 메타 편집을 쓰지 않습니다.");
    if (!entry.allowUpdate) notAllowed("이 섹션은 수정할 수 없습니다.");
    const built = buildPayload(entry, valuesOf(req));
    if (!built.ok) {
      sendRejectedPayload(res, built);
      return;
    }
    const { data, error } = await scopeToSection(
      ctx.supabaseAdmin
        .from(entry.table)
        .update(built.payload)
        .eq("id", String(req.query.id ?? "")),
      entry,
    )
      .select("*")
      .maybeSingle();
    if (error) {
      failWrite(res, error, "section meta update");
      return;
    }
    if (!data) {
      sendNotFound(res);
      return;
    }
    res.status(200).json(data);
  },
});
