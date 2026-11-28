// /api/admin/sections 아래 범용 엔진 섹션 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/sections", sections) 로 붙인다.
// 요청 검증과 응답 모양은 shared/sections/contract.ts 를 따르고, 섹션 규칙(허용 동작, 컬럼, 고정 값)은 서버 레지스트리(admin-sections/registry.ts)에 있다.
// 섹션 키는 레지스트리에 있는 것만 받고, 메뉴 권한은 섹션 키 그대로 본다(GET 은 view, 쓰기는 edit). 모르는 키는 권한 판정보다 먼저 400 이다.
// 경로마다 메서드 뒤에 .all(path, methodNotAllowed(...)) 를 단다. 글자 그대로인 /:key/export 는 /:key/:id 보다 먼저 등록한다.
// 임시 업로드는 저장 전에 banners 로 옮기고, 옛 파일 삭제는 DELETE /api/admin/uploads 다.

import {
  type SectionExport,
  type SectionList,
  type SectionRow,
  sectionExportQuery,
  sectionListQuery,
  sectionValuesBody,
} from "../../../shared/sections/contract.js";
import {
  buildListQuery,
  buildPayload,
  notAllowed,
  rejectedPayload,
  scopeToSection,
  sectionOf,
  sectionPermissionKey,
  shiftSortOrder,
  writeFailure,
} from "../../_lib/admin-sections/query.js";
import {
  SECTION_EXPORT_CHUNK,
  SECTION_PAGE_SIZE,
} from "../../_lib/admin-sections/registry.js";
import { promoteForSave } from "../../_lib/admin-uploads/promote.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import { methodNotAllowed, notFound } from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";

const UNHANDLED = "섹션 데이터를 처리하지 못했습니다.";
const SECTION_PERMISSION = { key: sectionPermissionKey };

const listGuard = admin({
  permission: SECTION_PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/sections]",
});
const exportGuard = admin({
  permission: SECTION_PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/sections/export]",
});
const rowGuard = admin({
  permission: SECTION_PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/sections/id]",
});
const metaGuard = admin({
  permission: SECTION_PERMISSION,
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/sections/meta]",
});
const reviewedGuard = admin({
  permission: SECTION_PERMISSION,
  // 기존 행의 검토 시각만 고치는 POST 라 수정으로 남긴다.
  audit: { action: "update" },
  unhandledMessage: UNHANDLED,
  logLabel: "[admin/sections/reviewed]",
});

const ROW_NOT_FOUND = "항목";

export const sections = adminFactory
  .createApp()
  // GET /:key?page=&q=: 목록. 서버 페이지 섹션은 한 쪽(SECTION_PAGE_SIZE)과 전체 건수를, 나머지는 전량을 준다.
  // POST /:key { values }: 등록. 임시 업로드를 먼저 옮겨 파일이 없으면 409 로 끝나 DB 는 건드리지 않는다.
  .get("/:key", listGuard, validate("query", sectionListQuery), async (c) => {
    const entry = sectionOf(c);
    const { page, q } = c.req.valid("query");
    const paginate = entry.serverPaginate;
    let query = buildListQuery(c.var.supabaseAdmin, entry, {
      q,
      count: paginate,
    });
    if (paginate) {
      const from = (page - 1) * SECTION_PAGE_SIZE;
      query = query.range(from, from + SECTION_PAGE_SIZE - 1);
    }
    const { data, error, count } = await query;
    if (error) throw new Error("section list read failed");
    const items = (data ?? []) as SectionRow[];
    const total = paginate ? count : items.length;
    if (total === null) throw new Error("section count missing");
    return c.json({ items, total } satisfies SectionList);
  })
  .post("/:key", listGuard, validate("json", sectionValuesBody), async (c) => {
    const entry = sectionOf(c);
    const db = c.var.supabaseAdmin;
    if (entry.readOnly || entry.noCreate || !entry.allowCreate) {
      notAllowed("이 섹션은 등록할 수 없습니다.");
    }
    const built = buildPayload(entry, c.req.valid("json").values, {
      fixed: true,
    });
    if (!built.ok) throw rejectedPayload(built);
    const payload = await promoteForSave(db, entry, built.payload);
    if (entry.shiftSortOrder && Number.isFinite(Number(payload.sort_order))) {
      await shiftSortOrder(db, entry, Number(payload.sort_order));
    }
    const { data, error } = await db
      .from(entry.table)
      .insert(payload)
      .select("*")
      .single();
    if (error) throw writeFailure(error, "section insert");
    return c.json(data satisfies SectionRow, 201);
  })
  .all("/:key", methodNotAllowed("GET", "POST"))
  // GET /:key/export?from=&q=: CSV 내보내기용 한 덩어리. 목록과 같은 조건, 검색, 정렬로 from 부터 SECTION_EXPORT_CHUNK 행만
  //   범위 쿼리 한 번으로 읽는다. 브라우저가 next 가 null 일 때까지 이어 받는다. 서버 페이지 섹션만 쓴다.
  .get(
    "/:key/export",
    exportGuard,
    validate("query", sectionExportQuery),
    async (c) => {
      const entry = sectionOf(c);
      if (!entry.serverPaginate) {
        notAllowed("이 섹션은 서버 내보내기를 쓰지 않습니다.");
      }
      const { from, q } = c.req.valid("query");
      const { data, error } = await buildListQuery(c.var.supabaseAdmin, entry, {
        q,
      }).range(from, from + SECTION_EXPORT_CHUNK - 1);
      if (error) throw new Error("section export read failed");
      const items = (data ?? []) as SectionRow[];
      return c.json({
        items,
        next:
          items.length === SECTION_EXPORT_CHUNK ? from + items.length : null,
      } satisfies SectionExport);
    },
  )
  .all("/:key/export", methodNotAllowed("GET"))
  // GET /:key/:id: 한 행 읽기(목록용 뷰가 아니라 table). PATCH: 수정(id 의 구간 밀기에서는 자기 행을 뺀다). DELETE: 삭제.
  .get("/:key/:id", rowGuard, async (c) => {
    const entry = sectionOf(c);
    const { data, error } = await scopeToSection(
      c.var.supabaseAdmin
        .from(entry.table)
        .select("*")
        .eq("id", c.req.param("id")),
      entry,
    ).maybeSingle();
    if (error) throw new Error("section read failed");
    if (!data) throw notFound(ROW_NOT_FOUND);
    return c.json(data satisfies SectionRow);
  })
  .patch(
    "/:key/:id",
    rowGuard,
    validate("json", sectionValuesBody),
    async (c) => {
      const entry = sectionOf(c);
      const db = c.var.supabaseAdmin;
      const id = c.req.param("id");
      if (entry.readOnly) notAllowed("이 섹션은 읽기 전용입니다.");
      if (!entry.allowUpdate) notAllowed("이 섹션은 수정할 수 없습니다.");
      const built = buildPayload(entry, c.req.valid("json").values, {
        fixed: true,
      });
      if (!built.ok) throw rejectedPayload(built);
      const payload = await promoteForSave(db, entry, built.payload);
      if (entry.shiftSortOrder && Number.isFinite(Number(payload.sort_order))) {
        await shiftSortOrder(db, entry, Number(payload.sort_order), id);
      }
      const { data, error } = await scopeToSection(
        db.from(entry.table).update(payload).eq("id", id),
        entry,
      )
        .select("*")
        .maybeSingle();
      if (error) throw writeFailure(error, "section update");
      if (!data) throw notFound(ROW_NOT_FOUND);
      return c.json(data satisfies SectionRow);
    },
  )
  .delete("/:key/:id", rowGuard, async (c) => {
    const entry = sectionOf(c);
    if (entry.readOnly) notAllowed("이 섹션은 읽기 전용입니다.");
    // 서비스 롤은 RLS 를 건너뛰므로 예전 RLS 가 삭제를 막던 섹션은 서버가 막는다.
    if (!entry.allowDelete) notAllowed("이 섹션은 삭제할 수 없습니다.");
    const { data, error } = await scopeToSection(
      c.var.supabaseAdmin
        .from(entry.table)
        .delete()
        .eq("id", c.req.param("id")),
      entry,
    ).select("id");
    if (error) throw new Error("section delete failed");
    // 지운 행이 없으면 성공처럼 보이지 않게 404 로 알린다.
    if (!data || data.length === 0) throw notFound(ROW_NOT_FOUND);
    return c.body(null, 204);
  })
  .all("/:key/:id", methodNotAllowed("GET", "PATCH", "DELETE"))
  // PATCH /:key/:id/meta: 메타 편집 모달(saveAdmissionMeta) 저장 경로. 보호 컬럼 정리와 모르는 키 거절만 하고,
  //   고정 값과 sort_order 밀기는 하지 않는다. meta 섹션만 쓴다.
  .patch(
    "/:key/:id/meta",
    metaGuard,
    validate("json", sectionValuesBody),
    async (c) => {
      const entry = sectionOf(c);
      if (!entry.meta) notAllowed("이 섹션은 메타 편집을 쓰지 않습니다.");
      if (!entry.allowUpdate) notAllowed("이 섹션은 수정할 수 없습니다.");
      const built = buildPayload(entry, c.req.valid("json").values);
      if (!built.ok) throw rejectedPayload(built);
      const { data, error } = await scopeToSection(
        c.var.supabaseAdmin
          .from(entry.table)
          .update(built.payload)
          .eq("id", c.req.param("id")),
        entry,
      )
        .select("*")
        .maybeSingle();
      if (error) throw writeFailure(error, "section meta update");
      if (!data) throw notFound(ROW_NOT_FOUND);
      return c.json(data satisfies SectionRow);
    },
  )
  .all("/:key/:id/meta", methodNotAllowed("PATCH"))
  // POST /:key/:id/reviewed: 지식 DB 행의 「검토 완료」. last_reviewed_at 한 컬럼만 지금 시각으로 고치므로 임베딩은 다시 만들지 않는다.
  .post("/:key/:id/reviewed", reviewedGuard, async (c) => {
    const entry = sectionOf(c);
    if (!entry.knowledgeReview) {
      notAllowed("이 섹션은 검토 완료를 쓰지 않습니다.");
    }
    if (!entry.allowUpdate) notAllowed("이 섹션은 수정할 수 없습니다.");
    const { data, error } = await scopeToSection(
      c.var.supabaseAdmin
        .from(entry.table)
        .update({ last_reviewed_at: new Date().toISOString() })
        .eq("id", c.req.param("id")),
      entry,
    )
      .select("*")
      .maybeSingle();
    if (error) throw writeFailure(error, "section reviewed update");
    if (!data) throw notFound(ROW_NOT_FOUND);
    return c.json(data satisfies SectionRow);
  })
  .all("/:key/:id/reviewed", methodNotAllowed("POST"));
