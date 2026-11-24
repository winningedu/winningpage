// 프리미엄 책자 화면의 업로드 규칙. 범용 섹션 레지스트리(SECTIONS)에 넣으면 /api/admin/sections 의
// 범용 CRUD 가 열려서, 업로드 규칙만 따로 둔다. 키는 화면 폼 필드 키와 같다(image_url) 또는 PDF 적용용이다.

import type { UploadField } from "../admin-sections/registry.js";

export const PREMIUM_BOOK_SECTION = "premiumBookPages";

/** 책자 파일이 놓이는 banners 폴더(옛 화면과 같다). */
export const PREMIUM_BOOK_FOLDER = "premium-book";

export const PREMIUM_BOOK_UPLOADS: Readonly<Record<string, UploadField>> = {
  // config imageSpec.maxMB 2 와 같다.
  image_url: {
    kind: "image",
    folder: PREMIUM_BOOK_FOLDER,
    maxBytes: 2 * 1024 * 1024,
  },
  booklet_pdf: { kind: "file", folder: PREMIUM_BOOK_FOLDER, accept: ["pdf"] },
  page_webp: { kind: "image", folder: PREMIUM_BOOK_FOLDER },
};
