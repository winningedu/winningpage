// GET, POST /api/admin/sections/:key
//
// 범용 엔진 섹션의 목록 조회와 등록. 섹션 키는 서버 레지스트리(admin-sections/registry.ts)에 있는 것만 받고,
// 메뉴 권한은 섹션 키 그대로 본다(GET 은 view, POST 는 edit). 규칙은 계약 b3-contract.md "Section engine routes".

import { z } from "zod";
import {
  buildListQuery,
  buildPayload,
  failWrite,
  notAllowed,
  sectionOf,
  sectionPermissionKey,
  sendRejectedPayload,
  shiftSortOrder,
  valuesOf,
} from "../../../_lib/admin-sections/query.js";
import { SECTION_PAGE_SIZE } from "../../../_lib/admin-sections/registry.js";
import { defineHandler } from "../../../_lib/handler.js";

export const config = { runtime: "nodejs" };

export default defineHandler({
  methods: ["GET", "POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: sectionPermissionKey },
  unhandledMessage: "섹션 데이터를 처리하지 못했습니다.",
  logLabel: "[admin/sections]",
  headers: { "Cache-Control": "no-store" },
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    q: z.string().optional(),
  }),
  handler: async (req, res, ctx) => {
    const entry = sectionOf(req);
    const admin = ctx.supabaseAdmin;

    if (req.method === "GET") {
      const { page, q } = ctx.query;
      const paginate = entry.serverPaginate;
      let query = buildListQuery(admin, entry, { q, count: paginate });
      if (paginate) {
        const from = (page - 1) * SECTION_PAGE_SIZE;
        query = query.range(from, from + SECTION_PAGE_SIZE - 1);
      }
      const { data, error, count } = await query;
      if (error) throw new Error("section list read failed");
      const items = (data ?? []) as unknown[];
      if (paginate && count === null) throw new Error("section count missing");
      res.status(200).json({ items, total: paginate ? count : items.length });
      return;
    }

    if (entry.readOnly || entry.noCreate || !entry.allowCreate) {
      notAllowed("이 섹션은 등록할 수 없습니다.");
    }
    const built = buildPayload(entry, valuesOf(req), { fixed: true });
    if (!built.ok) {
      sendRejectedPayload(res, built);
      return;
    }
    const { payload } = built;
    if (entry.shiftSortOrder && Number.isFinite(Number(payload.sort_order))) {
      await shiftSortOrder(admin, entry, Number(payload.sort_order));
    }
    const { data, error } = await admin
      .from(entry.table)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      failWrite(res, error, "section insert");
      return;
    }
    res.status(201).json(data);
  },
});
