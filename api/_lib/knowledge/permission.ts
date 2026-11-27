// 지식 DB 라우트(bulk, dedupe, search)의 메뉴 권한 키. 두 메뉴는 knowledge_type 고정값만 다르므로
// 요청의 knowledgeType 으로 레지스트리의 섹션을 찾는다(키 표를 따로 두지 않는다).

import type { Context } from "hono";
import { SECTIONS } from "../admin-sections/registry.js";
import { RouteParamError } from "../handler.js";

const KNOWLEDGE_TABLE = "winning_assessment_knowledge_items";

/** 모르는 knowledgeType 은 권한 판정보다 먼저 400 VALIDATION_FAILED 로 막는다(403 으로 보이지 않게). body 는 요청 본문이다. */
export function knowledgeSectionKey(body: unknown): string {
  const type = (body as { knowledgeType?: unknown } | undefined | null)
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

/** admin() 의 permission.key 로 쓴다. 본문을 읽지 못하면 빈 본문으로 보아 400 이다(본문은 캐시되어 검증이 다시 읽는다). */
export async function knowledgePermissionKey(c: Context): Promise<string> {
  return knowledgeSectionKey(await c.req.json().catch(() => undefined));
}
