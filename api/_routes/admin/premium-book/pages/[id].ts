// GET, PATCH, DELETE /api/admin/premium-book/pages/:id
//
// GET: 한 장. PATCH: 같은 본문으로 수정(임시 업로드는 저장 전에 banners 로 옮긴다, 만료면 409).
// DELETE: 행을 지운 뒤 그 행의 premium-book/ 이미지 파일을 best-effort 로 지운다(실패해도 204, 경고만).
// 없는 id 는 404 NOT_FOUND. 권한: 메뉴 premiumBookPages(GET view, 나머지 edit).

import { PUBLIC_BUCKET } from "../../../../_lib/admin-uploads/tmp.js";
import { defineHandler, parseOrReject } from "../../../../_lib/handler.js";
import {
  type PageBody,
  pageBodySchema,
  pageIdQuery,
  premiumBookPathFromUrl,
  promotePageBody,
  sendPageNotFound,
} from "../../../../_lib/premium-book/pages.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET", "PATCH", "DELETE"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "premiumBookPages" },
  unhandledMessage: "프리미엄 책자 페이지를 처리하지 못했어요.",
  logLabel: "[admin/premium-book/pages/id]",
  headers: { "Cache-Control": "no-store" },
  query: pageIdQuery,
  handler: async (req, res, ctx) => {
    const { id } = ctx.query;
    const admin = ctx.supabaseAdmin;

    if (req.method === "PATCH") {
      const parsed = parseOrReject(res, "problem", pageBodySchema, req.body);
      if (!parsed) return;
      const body = await promotePageBody(res, admin, parsed.value as PageBody);
      if (!body) return;
      const { data, error } = await admin
        .from("premium_book_pages")
        .update(body)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error("premium book page update failed");
      if (!data) {
        sendPageNotFound(res);
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (req.method === "DELETE") {
      const { data, error } = await admin
        .from("premium_book_pages")
        .delete()
        .eq("id", id)
        .select("*");
      if (error) throw new Error("premium book page delete failed");
      const row = data?.[0];
      if (!row) {
        sendPageNotFound(res);
        return;
      }
      // 행은 이미 지웠다. 파일 정리가 실패해도 삭제는 성공으로 본다(옛 화면과 같다).
      const path = premiumBookPathFromUrl(row.image_url);
      if (path) {
        const { error: removeError } = await admin.storage
          .from(PUBLIC_BUCKET)
          .remove([path]);
        if (removeError) {
          console.warn("[admin/premium-book/pages/id] 이미지 정리 실패:", path);
        }
      }
      res.status(204).end();
      return;
    }

    const { data, error } = await admin
      .from("premium_book_pages")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error("premium book page read failed");
    if (!data) {
      sendPageNotFound(res);
      return;
    }
    res.status(200).json(data);
  },
});
