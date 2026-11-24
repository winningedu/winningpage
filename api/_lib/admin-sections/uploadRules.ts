// 업로드 규칙 조회. 범용 섹션은 레지스트리의 uploads 를 쓰고, 레지스트리에 없는 전용 화면은 자기 규칙을 여기에 둔다.

import {
  PREMIUM_BOOK_SECTION,
  PREMIUM_BOOK_UPLOADS,
} from "../premium-book/uploads.js";
import { getSection, type UploadField } from "./registry.js";

type UploadRules = Readonly<Record<string, UploadField>>;

const CUSTOM_UPLOADS: Readonly<Record<string, UploadRules>> = {
  [PREMIUM_BOOK_SECTION]: PREMIUM_BOOK_UPLOADS,
};

/** 업로드를 받는 화면 키면 규칙을, 모르는 키면 undefined. 프로토타입 키는 거른다. */
export function uploadRulesFor(key: string): UploadRules | undefined {
  if (Object.hasOwn(CUSTOM_UPLOADS, key)) return CUSTOM_UPLOADS[key];
  return getSection(key)?.uploads;
}
