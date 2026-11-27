// 프리미엄 책자 페이지 라우트 공통: 임시 업로드 승격, 공개 URL 에서 파일 경로 뽑기. 본문과 id 규칙은 shared/premium-book/contract.ts 다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PageBody } from "../../../shared/premium-book/contract.js";
import { promoteForSave } from "../admin-uploads/promote.js";
import { isDeletablePath } from "../admin-uploads/tmp.js";
import { PREMIUM_BOOK_FOLDER, PREMIUM_BOOK_IMAGE } from "./uploads.js";

/**
 * 저장 전에 임시 업로드를 banners 로 옮기고 image_url 을 공개 URL 로 바꾼다.
 * 만료면 409 UPLOAD_EXPIRED 를 던진다(호출한 쪽은 DB 를 건드리지 않는다).
 */
export function promotePageBody(
  admin: SupabaseClient,
  body: PageBody,
): Promise<PageBody> {
  return promoteForSave(
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
