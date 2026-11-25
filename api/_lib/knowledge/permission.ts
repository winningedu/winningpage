// 지식 DB 라우트(bulk, dedupe, search)의 메뉴 권한 키. 두 메뉴는 knowledge_type 고정값만 다르므로
// 요청의 knowledgeType 으로 레지스트리의 섹션을 찾는다(키 표를 따로 두지 않는다).

import type { VercelRequest } from "@vercel/node";
import { SECTIONS } from "../admin-sections/registry.js";
import { RouteParamError } from "../handler.js";

const KNOWLEDGE_TABLE = "winning_assessment_knowledge_items";

/** 모르는 knowledgeType 은 권한 판정보다 먼저 400 VALIDATION_FAILED 로 막는다(403 으로 보이지 않게). */
export function knowledgeSectionKey(req: VercelRequest): string {
  const type = (req.body as { knowledgeType?: unknown } | undefined | null)
    ?.knowledgeType;
  const found =
    typeof type === "string"
      ? Object.entries(SECTIONS).find(
          ([, entry]) =>
            entry.table === KNOWLEDGE_TABLE &&
            entry.fixedValues?.knowledge_type === type,
        )
      : undefined;
  if (!found) {
    throw new RouteParamError(
      "knowledgeType",
      "knowledgeType 이 올바르지 않습니다.",
    );
  }
  return found[0];
}
