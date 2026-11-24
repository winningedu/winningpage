// GET, POST /api/admin/premium-book/pages
//
// GET: 책자 페이지 전체를 sort_order 오름차순으로({ items }). POST: 페이지 한 장 등록.
// image_url 의 임시 읽기 URL 은 저장 전에 banners 공개 URL 로 옮긴다(만료면 409 UPLOAD_EXPIRED, DB 는 건드리지 않는다).
// 권한: 메뉴 premiumBookPages(GET view, POST edit).

import { defineHandler, parseOrReject } from "../../../_lib/handler.js";
import {
  type PageBody,
  pageBodySchema,
  promotePageBody,
} from "../../../_lib/premium-book/pages.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "premiumBookPages" },
  unhandledMessage: "프리미엄 책자 페이지를 처리하지 못했어요.",
  logLabel: "[admin/premium-book/pages]",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const admin = ctx.supabaseAdmin;

    if (req.method === "POST") {
      const parsed = parseOrReject(res, "problem", pageBodySchema, req.body);
      if (!parsed) return;
      const body = await promotePageBody(res, admin, parsed.value as PageBody);
      if (!body) return;
      const { data, error } = await admin
        .from("premium_book_pages")
        .insert(body)
        .select("*")
        .single();
      if (error) throw new Error("premium book page insert failed");
      res.status(201).json(data);
      return;
    }

    const { data, error } = await admin
      .from("premium_book_pages")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error("premium book pages read failed");
    res.status(200).json({ items: data ?? [] });
  },
});
