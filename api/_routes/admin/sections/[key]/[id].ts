// GET, PATCH, DELETE /api/admin/sections/:key/:id
//
// 한 행 읽기(목록용 뷰가 아니라 table), 수정, 삭제. 수정 규칙은 [key].ts 의 등록과 같다
// (id 의 구간 밀기에서는 자기 행을 뺀다). 스토리지 정리는 브라우저가 한다(B4).

import {
  buildPayload,
  failWrite,
  notAllowed,
  sectionOf,
  sectionPermissionKey,
  sendNotFound,
  sendRejectedPayload,
  shiftSortOrder,
  valuesOf,
} from "../../../../_lib/admin-sections/query.js";
import { defineHandler } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET", "PATCH", "DELETE"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: sectionPermissionKey },
  unhandledMessage: "섹션 데이터를 처리하지 못했습니다.",
  logLabel: "[admin/sections/id]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const entry = sectionOf(req);
    const admin = ctx.supabaseAdmin;
    const id = String(req.query.id ?? "");

    if (req.method === "GET") {
      const { data, error } = await admin
        .from(entry.table)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("section read failed");
      if (!data) {
        sendNotFound(res);
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (entry.readOnly) notAllowed("이 섹션은 읽기 전용입니다.");

    if (req.method === "DELETE") {
      // 서비스 롤은 RLS 를 건너뛰므로 예전 RLS 가 삭제를 막던 섹션은 서버가 막는다.
      if (!entry.allowDelete) notAllowed("이 섹션은 삭제할 수 없습니다.");
      const { data, error } = await admin
        .from(entry.table)
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw new Error("section delete failed");
      // 지운 행이 없으면 성공처럼 보이지 않게 404 로 알린다.
      if (!data || data.length === 0) {
        sendNotFound(res);
        return;
      }
      res.status(204).end();
      return;
    }

    if (!entry.allowUpdate) notAllowed("이 섹션은 수정할 수 없습니다.");

    const built = buildPayload(entry, valuesOf(req), { fixed: true });
    if (!built.ok) {
      sendRejectedPayload(res, built);
      return;
    }
    const { payload } = built;
    if (entry.shiftSortOrder && Number.isFinite(Number(payload.sort_order))) {
      await shiftSortOrder(admin, entry, Number(payload.sort_order), id);
    }
    const { data, error } = await admin
      .from(entry.table)
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      failWrite(res, error, "section update");
      return;
    }
    if (!data) {
      sendNotFound(res);
      return;
    }
    res.status(200).json(data);
  },
});
