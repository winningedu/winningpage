// POST /api/admin/premium-book/apply
//
// 변환한 책자 PDF 1개와 페이지 이미지(최대 100장)를 한 번에 반영한다. 파일은 먼저 POST /api/admin/uploads 로
// 임시 버킷에 올라가 있고, 본문은 그 임시 객체 이름이다(pdf 는 booklet_pdf, pages 는 page_webp 필드).
//
// 순서(옛 화면의 2단계 보장: 파일이 모두 자리에 놓이기 전에는 DB 를 바꾸지 않는다)
//   1. 임시 객체를 모두 확인한다. 없으면 409 UPLOAD_EXPIRED, 저장된 크기와 형식이 규칙에 안 맞으면 400. 아직 아무것도 쓰지 않는다.
//   2. 임시 파일을 내려받아 banners 의 고정 경로에 upsert 로 올린다(premium-book/booklet.pdf, premium-book/pNN.webp).
//      스토리지 move 는 덮어쓰지 못해서 내려받아 올린다. 올리기가 실패하면 그 파일은 이전 것이 남고 500, DB 는 그대로다.
//   3. DB: sort_order 1..N 행은 id 로 upsert, 없는 번호는 insert, N 보다 큰 행은 지운다. sort_order 중복은 409.
//   4. 임시 파일을 best-effort 로 지운다.
// 스토리지와 DB 는 한 트랜잭션이 될 수 없다(조사 위험 D9). 2번 뒤 3번에서 실패하면 새 파일과 옛 행이 섞일 수 있고,
// 같은 요청을 다시 적용하면 이 순서가 그대로 다시 돌아 복구된다(고정 경로 upsert, id 기준 upsert 라 반복해도 같은 결과).
// 권한: 메뉴 premiumBookPages edit.

import { z } from "zod";
import type { UploadField } from "../../../_lib/admin-sections/registry.js";
import {
  parseTempName,
  PUBLIC_BUCKET,
  sendUploadExpired,
  TMP_BUCKET,
  validateUpload,
} from "../../../_lib/admin-uploads/tmp.js";
import { defineHandler, RouteParamError } from "../../../_lib/handler.js";
import { sendError } from "../../../_lib/httpResponse.js";
import {
  PREMIUM_BOOK_PAGE,
  PREMIUM_BOOK_PDF,
} from "../../../_lib/premium-book/uploads.js";

export const config = { runtime: "nodejs", maxDuration: 60 };

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

export default defineHandler({
  methods: ["POST"],
  auth: "admin",
  errorShape: "problem",
  permission: { key: "premiumBookPages" },
  unhandledMessage: "책자를 적용하지 못했어요.",
  logLabel: "[admin/premium-book/apply]",
  headers: { "Cache-Control": "no-store" },
  body: z
    .object({
      pdf: z.string(),
      pages: z.array(z.string()).min(1).max(100),
    })
    .strict(),
  handler: async (_req, res, ctx) => {
    const { pdf, pages } = ctx.body;
    const admin = ctx.supabaseAdmin;
    const tmpBucket = admin.storage.from(TMP_BUCKET);
    const bannersBucket = admin.storage.from(PUBLIC_BUCKET);

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
      if (!info) {
        sendUploadExpired(res);
        return;
      }
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
      if (downloadError || !blob)
        throw new Error("premium book download failed");
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
    const { data: existing, error: existingError } = await admin
      .from("premium_book_pages")
      .select("id, sort_order");
    if (existingError) throw new Error("premium book pages read failed");

    const idBySort = new Map<number, number>();
    for (const row of existing ?? []) {
      if (idBySort.has(row.sort_order)) {
        sendError(
          res,
          "problem",
          409,
          DUPLICATE_MESSAGE(row.sort_order),
          "DUPLICATE_SORT_ORDER",
        );
        return;
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
      const { error } = await admin
        .from("premium_book_pages")
        .upsert(upsertRows);
      if (error) throw new Error("premium book pages upsert failed");
    }
    if (insertRows.length > 0) {
      const { error } = await admin
        .from("premium_book_pages")
        .insert(insertRows);
      if (error) throw new Error("premium book pages insert failed");
    }
    const staleIds = (existing ?? [])
      .filter((row) => row.sort_order > pages.length)
      .map((row) => row.id);
    if (staleIds.length > 0) {
      const { error } = await admin
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

    const { data: items, error: itemsError } = await admin
      .from("premium_book_pages")
      .select("*")
      .order("sort_order", { ascending: true });
    if (itemsError) throw new Error("premium book pages read failed");
    res.status(200).json({ items: items ?? [] });
  },
});
