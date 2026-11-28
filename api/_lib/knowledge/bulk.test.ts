import { describe, expectTypeOf, it } from "vitest";
import type { KNOWLEDGE_COLUMNS } from "../../../shared/knowledge/request.js";
import type { Database } from "../../../src/types/database.types.js";

type KnowledgeColumn =
  keyof Database["public"]["Tables"]["winning_assessment_knowledge_items"]["Row"];

describe("KNOWLEDGE_COLUMNS", () => {
  it("테이블 컬럼과 같다(컬럼이 늘면 여기서 컴파일이 깨진다)", () => {
    expectTypeOf<
      (typeof KNOWLEDGE_COLUMNS)[number]
    >().toEqualTypeOf<KnowledgeColumn>();
  });
});
