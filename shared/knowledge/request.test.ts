import { describe, expect, test } from "vitest";
import { MAX_BULK_ROWS, MAX_DEDUPE_ITEMS } from "./contract.js";
import {
  knowledgeBulkBody,
  knowledgeDedupeBody,
  knowledgeSearchBody,
} from "./request.js";

const ROW = {
  is_active: true,
  grade: "고1",
  subject: "과학",
  career_field: "의학",
  title: "제목",
  content: "내용",
  source: "출처",
  source_link: "https://example.com",
  keywords: "키워드",
  memo: "메모",
};

const messages = (result: {
  success: boolean;
  error?: { issues: { message: string; path: PropertyKey[] }[] };
}) => result.error?.issues.map((issue) => issue.message) ?? [];

describe("knowledgeBulkBody", () => {
  test("신규 행에 메뉴 knowledge_type 과 pending 상태를 강제하고 허용 필드만 남긴다", () => {
    const parsed = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: [
        {
          ...ROW,
          knowledge_type: "verified_resource",
          embedding: "[1,2]",
          id: "x",
          created_at: "2020-01-01",
        },
      ],
      updates: [],
    });

    expect(parsed.data).toEqual({
      knowledgeType: "topic_pattern",
      inserts: [
        {
          ...ROW,
          knowledge_type: "topic_pattern",
          embedding_status: "pending",
          embedding_error: null,
        },
      ],
      updates: [],
    });
  });

  test("수정 행은 id 를 따로 떼고 같은 규칙으로 패치를 만든다", () => {
    const parsed = knowledgeBulkBody.safeParse({
      knowledgeType: "verified_resource",
      inserts: [],
      updates: [{ id: "u1", title: "새 제목", knowledge_type: "x" }],
    });
    expect(parsed.data?.updates).toEqual([
      {
        id: "u1",
        patch: {
          title: "새 제목",
          knowledge_type: "verified_resource",
          embedding_status: "pending",
          embedding_error: null,
        },
      },
    ]);
  });

  test("임베딩과 검색 텍스트 같은 실제 컬럼은 거부하지 않고 버린다", () => {
    const parsed = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [
        {
          id: "u1",
          title: "새 제목",
          embedding: "[1]",
          search_text: "x",
          embedding_error: "e",
          embedded_at: "2026-11-24T00:00:00Z",
        },
      ],
    });
    expect(Object.keys(parsed.data?.updates[0]?.patch ?? {}).sort()).toEqual([
      "embedding_error",
      "embedding_status",
      "knowledge_type",
      "title",
    ]);
  });

  test("모르는 knowledgeType 은 knowledgeType 경로에 사유를 단다", () => {
    const parsed = knowledgeBulkBody.safeParse({
      knowledgeType: "other",
      inserts: [ROW],
      updates: [],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({
      path: ["knowledgeType"],
      message: "knowledgeType 이 올바르지 않습니다.",
    });
  });

  test("반영할 행이 하나도 없으면 거부한다", () => {
    const parsed = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [],
    });
    expect(messages(parsed)).toEqual(["반영할 행이 없습니다."]);
  });

  test("신규와 수정을 합쳐 상한을 넘으면 거부한다", () => {
    expect(MAX_BULK_ROWS).toBe(500);
    const parsed = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: Array.from({ length: 300 }, () => ROW),
      updates: Array.from({ length: 201 }, (_, i) => ({
        ...ROW,
        id: `id-${i}`,
      })),
    });
    expect(messages(parsed)).toEqual([
      "신규와 수정을 합쳐 한 번에 500건까지 보낼 수 있습니다.",
    ]);
  });

  test("테이블 컬럼이 아닌 키는 행 경로에 키 이름을 담아 거부한다", () => {
    const inserts = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: [{ ...ROW, titel: "오타" }],
      updates: [],
    });
    expect(inserts.error?.issues[0]).toMatchObject({
      path: ["inserts", 0],
      message: "inserts[0] 에 알 수 없는 키가 있습니다: titel",
    });

    const updates = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [{ id: "u1", rowNo: 3 }],
    });
    expect(updates.error?.issues[0]).toMatchObject({
      path: ["updates", 0],
      message: "updates[0] 에 알 수 없는 키가 있습니다: rowNo",
    });
  });

  test("id 가 없는 수정 행은 거부한다", () => {
    const parsed = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [{ title: "제목" }],
    });
    expect(messages(parsed)).toEqual(["updates[0] 에 id 가 없습니다."]);
  });

  test("신규 행에 필수값이 비면 거부하고 수정 행은 보낸 값만 본다", () => {
    const insert = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: [{ ...ROW, content: "  " }],
      updates: [],
    });
    expect(messages(insert)).toEqual([
      "inserts[0] 에 필수값이 비었습니다: content",
    ]);

    const update = knowledgeBulkBody.safeParse({
      knowledgeType: "topic_pattern",
      inserts: [],
      updates: [{ id: "u1", memo: "메모만" }],
    });
    expect(update.success).toBe(true);
  });
});

describe("knowledgeDedupeBody", () => {
  const item = { rowNo: 2, title: "제목", content: "내용", grade: "고1" };

  test("허용된 knowledgeType 과 항목 목록을 통과시키고 빠진 칸은 빈 문자열로 채운다", () => {
    const parsed = knowledgeDedupeBody.safeParse({
      knowledgeType: "verified_resource",
      items: [item],
    });
    expect(parsed.data?.knowledgeType).toBe("verified_resource");
    expect(parsed.data?.items[0]).toMatchObject({
      rowNo: 2,
      title: "제목",
      content: "내용",
      grade: "고1",
      subject: "",
    });
  });

  test("수정 행의 id 는 자기 자신 제외용으로 남긴다", () => {
    const parsed = knowledgeDedupeBody.safeParse({
      knowledgeType: "topic_pattern",
      items: [{ ...item, id: "k1" }, item],
    });
    expect(parsed.data?.items.map((i) => i.id)).toEqual(["k1", undefined]);
  });

  test("RAG 대상이 아닌 knowledgeType 은 거부한다", () => {
    const parsed = knowledgeDedupeBody.safeParse({
      knowledgeType: "student_record_pattern",
      items: [item],
    });
    expect(messages(parsed)).toEqual(["knowledgeType 이 올바르지 않습니다."]);
  });

  test("항목이 비었거나 상한을 넘으면 거부한다", () => {
    expect(
      messages(
        knowledgeDedupeBody.safeParse({
          knowledgeType: "topic_pattern",
          items: [],
        }),
      ),
    ).toEqual(["items 가 비어 있습니다."]);
    const many = Array.from({ length: MAX_DEDUPE_ITEMS + 1 }, (_, i) => ({
      ...item,
      rowNo: i + 2,
    }));
    expect(MAX_DEDUPE_ITEMS).toBe(200);
    expect(
      messages(
        knowledgeDedupeBody.safeParse({
          knowledgeType: "topic_pattern",
          items: many,
        }),
      ),
    ).toEqual(["items 는 한 번에 200건까지 보낼 수 있습니다."]);
  });

  test("rowNo 가 정수가 아니면 거부한다", () => {
    const parsed = knowledgeDedupeBody.safeParse({
      knowledgeType: "topic_pattern",
      items: [{ ...item, rowNo: "2" }],
    });
    expect(messages(parsed)).toEqual(["items[].rowNo 는 정수여야 합니다."]);
  });
});

describe("knowledgeSearchBody", () => {
  test("주제 DB 는 다른 과목을 포함하고 상한 기본값은 20이다", () => {
    const parsed = knowledgeSearchBody.safeParse({
      knowledgeType: "topic_pattern",
      grade: "고2",
      subject: "물리학",
      career: "기계공학",
    });
    expect(parsed.data).toEqual({
      knowledgeType: "topic_pattern",
      grade: "고2",
      subject: "물리학",
      career: "기계공학",
      selectedTopic: "",
      assessmentInfo: "",
      includeOtherSubjects: true,
      limit: 20,
      mode: "hybrid",
    });
  });

  test("검색 방식은 기본 hybrid 이고 vector 를 고를 수 있으며 다른 값은 거절한다", () => {
    expect(
      knowledgeSearchBody.safeParse({
        knowledgeType: "topic_pattern",
        mode: "vector",
      }).data?.mode,
    ).toBe("vector");
    expect(
      messages(
        knowledgeSearchBody.safeParse({
          knowledgeType: "topic_pattern",
          mode: "bm25",
        }),
      ),
    ).toEqual(["mode 는 vector 또는 hybrid 입니다."]);
  });

  test("자료 DB 는 기본으로 다른 과목을 빼고 지정값은 그대로 쓴다", () => {
    const parsed = knowledgeSearchBody.safeParse({
      knowledgeType: "verified_resource",
      grade: "",
      subject: "국어",
      career: "",
      limit: 5,
    });
    expect(parsed.data?.includeOtherSubjects).toBe(false);
    expect(parsed.data?.limit).toBe(5);

    const forced = knowledgeSearchBody.safeParse({
      knowledgeType: "verified_resource",
      subject: "국어",
      includeOtherSubjects: true,
    });
    expect(forced.data?.includeOtherSubjects).toBe(true);
  });

  test.each([
    ["본문이 객체가 아님", null, "요청 바디가 올바르지 않습니다."],
    [
      "허용하지 않는 유형",
      { knowledgeType: "student_record_pattern" },
      "knowledgeType 이 올바르지 않습니다.",
    ],
    [
      "상한이 0",
      { knowledgeType: "topic_pattern", limit: 0 },
      "limit 는 1부터 50 사이 정수여야 합니다.",
    ],
    [
      "상한이 51",
      { knowledgeType: "topic_pattern", limit: 51 },
      "limit 는 1부터 50 사이 정수여야 합니다.",
    ],
    [
      "상한이 정수가 아님",
      { knowledgeType: "topic_pattern", limit: 2.5 },
      "limit 는 1부터 50 사이 정수여야 합니다.",
    ],
    [
      "학년이 문자열이 아님",
      { knowledgeType: "topic_pattern", grade: 3 },
      "grade 는 문자열이어야 합니다.",
    ],
    [
      "다른 과목 포함 값이 참 거짓이 아님",
      { knowledgeType: "topic_pattern", includeOtherSubjects: "yes" },
      "includeOtherSubjects 는 참 거짓 값입니다.",
    ],
  ])("%s 이면 거절한다", (_label, body, message) => {
    expect(messages(knowledgeSearchBody.safeParse(body))).toEqual([message]);
  });
});
