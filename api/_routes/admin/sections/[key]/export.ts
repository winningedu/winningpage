// GET /api/admin/sections/:key/export?from=&q=
//
// CSV 내보내기용 한 덩어리. 목록과 같은 조건, 검색, 정렬로 from 부터 1000행(EXPORT_CHUNK)만 범위 쿼리 한 번으로 읽는다.
// 브라우저가 next 가 null 일 때까지 이어 받는다(43,170행도 호출마다 1000행만 훑는다). 서버 페이지 섹션만 쓴다.

import { z } from "zod";
import {
  buildListQuery,
  notAllowed,
  sectionOf,
  sectionPermissionKey,
} from "../../../../_lib/admin-sections/query.js";
import { SECTION_EXPORT_CHUNK } from "../../../../_lib/admin-sections/registry.js";
import { defineHandler } from "../../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: sectionPermissionKey },
  unhandledMessage: "섹션 데이터를 처리하지 못했습니다.",
  logLabel: "[admin/sections/export]",
  headers: { "Cache-Control": "no-store" },
  query: z.object({
    from: z.coerce.number().int().min(0).default(0),
    q: z.string().optional(),
  }),
  handler: async (req, res, ctx) => {
    const entry = sectionOf(req);
    if (!entry.serverPaginate) {
      notAllowed("이 섹션은 서버 내보내기를 쓰지 않습니다.");
    }
    const { from, q } = ctx.query;
    const { data, error } = await buildListQuery(ctx.supabaseAdmin, entry, {
      q,
    }).range(from, from + SECTION_EXPORT_CHUNK - 1);
    if (error) throw new Error("section export read failed");
    const items = (data ?? []) as unknown[];
    res.status(200).json({
      items,
      next: items.length === SECTION_EXPORT_CHUNK ? from + items.length : null,
    });
  },
});
