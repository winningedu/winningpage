// /api/admin/premium-book 아래 프리미엄 책자 라우트. 관리자 앱(api/_routes/admin/app.ts)이 .route("/premium-book", premiumBook) 으로 붙인다.
// 요청 검증과 응답 모양은 shared/premium-book/contract.ts 를 따른다. 권한: 메뉴 premiumBookPages(GET view, 나머지 edit).
// POST /apply 는 maxDuration 60초라 vercel.json 이 그 경로만 /api/app-60 으로 보낸다.

import {
  applyBody,
  PREMIUM_BOOK_ERROR,
  type PremiumBookPage,
  type PremiumBookPageList,
  pageBody,
  pageIdParams,
} from "../../../shared/premium-book/contract.js";
import type { UploadField } from "../../_lib/admin-sections/registry.js";
import {
  PUBLIC_BUCKET,
  parseTempName,
  TMP_BUCKET,
  uploadExpired,
  validateUpload,
} from "../../_lib/admin-uploads/tmp.js";
import { RouteParamError } from "../../_lib/handler.js";
import { admin } from "../../_lib/hono/admin.js";
import { adminFactory } from "../../_lib/hono/factory.js";
import {
  methodNotAllowed,
  notFound,
  ProblemError,
} from "../../_lib/hono/problem.js";
import { validate } from "../../_lib/hono/validate.js";
import {
  premiumBookPathFromUrl,
  promotePageBody,
} from "../../_lib/premium-book/pages.js";
import {
  PREMIUM_BOOK_PAGE,
  PREMIUM_BOOK_PDF,
} from "../../_lib/premium-book/uploads.js";

const PAGE = "페이지";
const PAGES_UNHANDLED = "프리미엄 책자 페이지를 처리하지 못했어요.";

const DUPLICATE_MESSAGE = (sortOrder: number) =>
  `sort_order ${sortOrder} 중복. 어느 행에 실어야 할지 판정할 수 없어 적용을 중단합니다. 이미지는 업로드됐지만 DB는 변경되지 않았습니다. 아래 목록에서 중복 행을 먼저 정리하세요.`;

interface Plan {
  tmpName: string;
  dest: string;
  rule: UploadField;
  fileName: string;
}

// 이름이 임시 이름 형식이 아니거나 필드 키가 어긋나면 400.
function planFor(
  path: string,
  tmpName: string,
  field: "booklet_pdf" | "page_webp",
  dest: string,
): Plan {
  const parsed = parseTempName(tmpName);
  if (!parsed || parsed.fieldKey !== field) {
    throw new RouteParamError(path, "올바르지 않은 업로드 경로입니다.");
  }
  return {
    tmpName,
    dest,
    rule: field === "booklet_pdf" ? PREMIUM_BOOK_PDF : PREMIUM_BOOK_PAGE,
    fileName: `${parsed.safeName}.${parsed.ext}`,
  };
}

const pagesGuard = admin({
  permission: { key: "premiumBookPages" },
  unhandledMessage: PAGES_UNHANDLED,
  logLabel: "[admin/premium-book/pages]",
});
const pageByIdGuard = admin({
  permission: { key: "premiumBookPages" },
  unhandledMessage: PAGES_UNHANDLED,
  logLabel: "[admin/premium-book/pages/id]",
});
const applyGuard = admin({
  permission: { key: "premiumBookPages" },
  unhandledMessage: "책자를 적용하지 못했어요.",
  logLabel: "[admin/premium-book/apply]",
});

export const premiumBook = adminFactory
  .createApp()
  // GET /pages: 책자 페이지 전체를 sort_order 오름차순으로({ items }). POST /pages: 한 장 등록.
  //   image_url 의 임시 읽기 URL 은 저장 전에 banners 공개 URL 로 옮긴다(만료면 409 UPLOAD_EXPIRED, DB 는 건드리지 않는다).
  .get("/pages", pagesGuard, async (c) => {
    const { data, error } = await c.var.supabaseAdmin
      .from("premium_book_pages")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error("premium book pages read failed");
    return c.json({ items: data ?? [] } satisfies PremiumBookPageList);
  })
  .post("/pages", pagesGuard, validate("json", pageBody), async (c) => {
    const db = c.var.supabaseAdmin;
    const body = await promotePageBody(db, c.req.valid("json"));
    const { data, error } = await db
      .from("premium_book_pages")
      .insert(body)
      .select("*")
      .single();
    if (error) throw new Error("premium book page insert failed");
    return c.json(data satisfies PremiumBookPage, 201);
  })
  .all("/pages", methodNotAllowed("GET", "POST"))
  // GET /pages/:id: 한 장. PATCH: 같은 본문으로 수정(임시 업로드는 저장 전에 banners 로 옮긴다, 만료면 409).
  // DELETE: 행을 지운 뒤 그 행의 premium-book/ 이미지 파일을 best-effort 로 지운다(실패해도 204, 경고만). 없는 id 는 404.
  .get(
    "/pages/:id",
    pageByIdGuard,
    validate("param", pageIdParams),
    async (c) => {
      const { data, error } = await c.var.supabaseAdmin
        .from("premium_book_pages")
        .select("*")
        .eq("id", c.req.valid("param").id)
        .maybeSingle();
      if (error) throw new Error("premium book page read failed");
      if (!data) throw notFound(PAGE);
      return c.json(data satisfies PremiumBookPage);
    },
  )
  .patch(
    "/pages/:id",
    pageByIdGuard,
    validate("param", pageIdParams),
    validate("json", pageBody),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const body = await promotePageBody(db, c.req.valid("json"));
      const { data, error } = await db
        .from("premium_book_pages")
        .update(body)
        .eq("id", c.req.valid("param").id)
        .select("*")
        .maybeSingle();
      if (error) throw new Error("premium book page update failed");
      if (!data) throw notFound(PAGE);
      return c.json(data satisfies PremiumBookPage);
    },
  )
  .delete(
    "/pages/:id",
    pageByIdGuard,
    validate("param", pageIdParams),
    async (c) => {
      const db = c.var.supabaseAdmin;
      const { data, error } = await db
        .from("premium_book_pages")
        .delete()
        .eq("id", c.req.valid("param").id)
        .select("*");
      if (error) throw new Error("premium book page delete failed");
      const row = data?.[0];
      if (!row) throw notFound(PAGE);
      // 행은 이미 지웠다. 파일 정리가 실패해도 삭제는 성공으로 본다(옛 화면과 같다).
      const path = premiumBookPathFromUrl(row.image_url);
      if (path) {
        const { error: removeError } = await db.storage
          .from(PUBLIC_BUCKET)
          .remove([path]);
        if (removeError) {
          console.warn("[admin/premium-book/pages/id] 이미지 정리 실패:", path);
        }
      }
      return c.body(null, 204);
    },
  )
  .all("/pages/:id", methodNotAllowed("GET", "PATCH", "DELETE"))
  // POST /apply: 변환한 책자 PDF 1개와 페이지 이미지(최대 100장)를 한 번에 반영한다. 파일은 먼저 POST /api/admin/uploads 로
  //   임시 버킷에 올라가 있고, 본문은 그 임시 객체 이름이다.
  // 순서(옛 화면의 2단계 보장: 파일이 모두 자리에 놓이기 전에는 DB 를 바꾸지 않는다)
  //   1. 임시 객체를 모두 확인한다. 없으면 409 UPLOAD_EXPIRED, 저장된 크기와 형식이 규칙에 안 맞으면 400. 아직 아무것도 쓰지 않는다.
  //   2. 임시 파일을 내려받아 banners 의 고정 경로에 upsert 로 올린다(premium-book/booklet.pdf, premium-book/pNN.webp).
  //      스토리지 move 는 덮어쓰지 못해서 내려받아 올린다. 올리기가 실패하면 그 파일은 이전 것이 남고 500, DB 는 그대로다.
  //   3. DB: sort_order 1..N 행은 id 로 upsert, 없는 번호는 insert, N 보다 큰 행은 지운다. sort_order 중복은 409.
  //   4. 임시 파일을 best-effort 로 지운다.
  // 스토리지와 DB 는 한 트랜잭션이 될 수 없다(조사 위험 D9). 2번 뒤 3번에서 실패하면 새 파일과 옛 행이 섞일 수 있고,
  // 같은 요청을 다시 적용하면 이 순서가 그대로 다시 돌아 복구된다(고정 경로 upsert, id 기준 upsert 라 반복해도 같은 결과).
  .post("/apply", applyGuard, validate("json", applyBody), async (c) => {
    const { pdf, pages } = c.req.valid("json");
    const db = c.var.supabaseAdmin;
    const tmpBucket = db.storage.from(TMP_BUCKET);
    const bannersBucket = db.storage.from(PUBLIC_BUCKET);

    const plans: Plan[] = [
      planFor("pdf", pdf, "booklet_pdf", "premium-book/booklet.pdf"),
      ...pages.map((name, index) =>
        planFor(
          `pages.${index}`,
          name,
          "page_webp",
          `premium-book/p${String(index + 1).padStart(2, "0")}.webp`,
        ),
      ),
    ];

    // 1. 모두 확인한다(아직 쓰지 않는다). 업로드 URL 은 서명만 있으면 아무 본문이나 올릴 수 있어서 저장된 크기와 형식을 다시 본다.
    const types = new Map<string, string>();
    for (const plan of plans) {
      const { data: info } = await tmpBucket.info(plan.tmpName);
      if (!info) throw uploadExpired();
      const rejection = validateUpload(plan.rule, {
        fileName: plan.fileName,
        contentType: info.contentType ?? "",
        size: info.size ?? Number.POSITIVE_INFINITY,
      });
      if (rejection) throw new RouteParamError("values", rejection.message);
      types.set(plan.tmpName, info.contentType ?? "");
    }

    // 2. 고정 경로에 올린다.
    for (const plan of plans) {
      const { data: blob, error: downloadError } = await tmpBucket.download(
        plan.tmpName,
      );
      if (downloadError || !blob) {
        throw new Error("premium book download failed");
      }
      const { error: uploadError } = await bannersBucket.upload(
        plan.dest,
        blob,
        {
          upsert: true,
          cacheControl: "3600",
          contentType: types.get(plan.tmpName),
        },
      );
      if (uploadError) throw new Error("premium book upload failed");
    }

    // 3. DB. sort_order 에 UNIQUE 가 없어 기존 행을 읽어 번호별 id 를 잡는다.
    const { data: existing, error: existingError } = await db
      .from("premium_book_pages")
      .select("id, sort_order");
    if (existingError) throw new Error("premium book pages read failed");

    const idBySort = new Map<number, number>();
    for (const row of existing ?? []) {
      if (idBySort.has(row.sort_order)) {
        throw new ProblemError(
          409,
          DUPLICATE_MESSAGE(row.sort_order),
          PREMIUM_BOOK_ERROR.DUPLICATE_SORT_ORDER,
        );
      }
      idBySort.set(row.sort_order, row.id);
    }

    // id 가 있는 행과 없는 행을 한 배열로 보내면 id 없는 행이 id: null 이 돼 NOT NULL 위반이 난다. 나눠 보낸다.
    const upsertRows: { id: number; sort_order: number; image_url: string }[] =
      [];
    const insertRows: { sort_order: number; image_url: string }[] = [];
    for (const [index, plan] of plans.slice(1).entries()) {
      const sortOrder = index + 1;
      const imageUrl = bannersBucket.getPublicUrl(plan.dest).data.publicUrl;
      const id = idBySort.get(sortOrder);
      if (id === undefined) {
        insertRows.push({ sort_order: sortOrder, image_url: imageUrl });
      } else {
        upsertRows.push({ id, sort_order: sortOrder, image_url: imageUrl });
      }
    }

    if (upsertRows.length > 0) {
      const { error } = await db.from("premium_book_pages").upsert(upsertRows);
      if (error) throw new Error("premium book pages upsert failed");
    }
    if (insertRows.length > 0) {
      const { error } = await db.from("premium_book_pages").insert(insertRows);
      if (error) throw new Error("premium book pages insert failed");
    }
    const staleIds = (existing ?? [])
      .filter((row) => row.sort_order > pages.length)
      .map((row) => row.id);
    if (staleIds.length > 0) {
      const { error } = await db
        .from("premium_book_pages")
        .delete()
        .in("id", staleIds);
      if (error) throw new Error("premium book pages delete failed");
    }

    // 4. 임시 파일 정리는 실패해도 적용은 끝났다(24시간 정리가 거둔다).
    const { error: cleanupError } = await tmpBucket.remove(
      plans.map((plan) => plan.tmpName),
    );
    if (cleanupError) {
      console.warn("[admin/premium-book/apply] 임시 파일 정리 실패");
    }

    const { data: items, error: itemsError } = await db
      .from("premium_book_pages")
      .select("*")
      .order("sort_order", { ascending: true });
    if (itemsError) throw new Error("premium book pages read failed");
    return c.json({ items: items ?? [] } satisfies PremiumBookPageList);
  })
  .all("/apply", methodNotAllowed("POST"));
