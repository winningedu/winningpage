// 프리미엄 책자 페이지 라우트 공통: 본문 규칙, id 규칙, 404, 임시 업로드 승격.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import { z } from "zod";
import { promoteForWrite } from "../admin-uploads/promote.js";
import { isDeletablePath } from "../admin-uploads/tmp.js";
import { sendError } from "../httpResponse.js";
import { PREMIUM_BOOK_FOLDER, PREMIUM_BOOK_IMAGE } from "./uploads.js";

const INT4_MIN = -2147483648;
const INT4_MAX = 2147483647;

/** 화면 폼이 만드는 두 컬럼만 받는다(옛 화면과 같다). 모르는 키는 400. */
export const pageBodySchema = z
  .object({
    sort_order: z.number().int().min(INT4_MIN).max(INT4_MAX),
    image_url: z.string().max(2048),
  })
  .strict();

export type PageBody = z.output<typeof pageBodySchema>;

/** 경로 구간 id(bigint identity). 양의 정수가 아니면 400. */
export const pageIdQuery = z.object({
  id: z.coerce.number().int().positive(),
});

export function sendPageNotFound(res: VercelResponse): void {
  sendError(res, "problem", 404, "페이지를 찾을 수 없어요.", "NOT_FOUND");
}

/**
 * 저장 전에 임시 업로드를 banners 로 옮기고 image_url 을 공개 URL 로 바꾼다.
 * 만료면 409 를 이미 보냈고 null 이다(호출한 쪽은 DB 를 건드리지 않는다).
 */
export function promotePageBody(
  res: VercelResponse,
  admin: SupabaseClient,
  body: PageBody,
): Promise<PageBody | null> {
  return promoteForWrite(
    res,
    admin,
    { uploads: { image_url: PREMIUM_BOOK_IMAGE } },
    body,
  );
}

const PUBLIC_URL_MARKER = "/storage/v1/object/public/banners/";

/**
 * banners 공개 URL 에서 스토리지 경로를 뽑는다. premium-book/ 아래의 안전한 경로만 돌려주고
 * 그 밖(다른 버킷, 외부 URL, 폴더 밖, 빈 값)은 null 이다(행 삭제 때 남의 파일을 지우지 않게).
 */
export function premiumBookPathFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const at = url.indexOf(PUBLIC_URL_MARKER);
  if (at < 0) return null;
  let path: string;
  try {
    path = decodeURIComponent(
      url.slice(at + PUBLIC_URL_MARKER.length).split(/[?#]/)[0] ?? "",
    );
  } catch {
    return null;
  }
  return isDeletablePath(path, [PREMIUM_BOOK_FOLDER]) ? path : null;
}
