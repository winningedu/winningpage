// 홈 섹션 제목 API 계약(GET, PUT /api/admin/home-section-copy/:sectionKey). 서버(api/_routes/admin/home-section-copy.ts)는
// 본문 스키마로 검증하고, 브라우저(src/pages/admin/landing/SectionCopyPanel.tsx)는 응답 스키마로 검증한다.

import { z } from "zod";

/** 섹션 키. 모르는 키는 권한 판정 전에 400 이다. */
export const SECTION_KEYS = ["services", "mentor", "acceptance"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

const invalid = { error: "입력값을 확인해 주세요." };

/** PUT 본문. 라벨(eyebrow)은 services, mentor 만 저장하고 acceptance 는 null 로 저장한다. */
export const sectionCopyBody = z.object(
  {
    eyebrow: z.string(invalid).nullable(),
    title_main: z.string(invalid).trim().min(1, invalid),
    title_sub: z.string(invalid).nullable(),
  },
  invalid,
);
export type SectionCopyInput = z.input<typeof sectionCopyBody>;

/** home_section_copy 한 행. GET 과 PUT 의 200 이 같은 모양이다. 행이 아직 없으면 GET 은 404 다. */
export const sectionCopy = z.object({
  section_key: z.enum(SECTION_KEYS),
  eyebrow: z.string().nullable(),
  title_main: z.string(),
  title_sub: z.string().nullable(),
});
export type SectionCopy = z.output<typeof sectionCopy>;
