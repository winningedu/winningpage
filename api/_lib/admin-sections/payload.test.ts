// 쓰기 payload 규칙(계약 1~4번) 검증.

import { describe, expect, test } from "vitest";
import { buildPayload } from "./query.js";
import { SECTIONS } from "./registry.js";

describe("buildPayload", () => {
  test("id, created_at, updated_at 은 조용히 뗀다", () => {
    const result = buildPayload(SECTIONS.faqs, {
      id: "x",
      created_at: "t",
      updated_at: "t",
      question: "q",
    });
    expect(result).toEqual({ ok: true, payload: { question: "q" } });
  });

  test("목록 전용 컬럼은 뗀다", () => {
    // enrollments 는 읽기 전용이라 listOnly 만 검증하려고 같은 모양의 임시 항목을 쓴다.
    const entry = {
      ...SECTIONS.faqs,
      listOnlyColumns: ["extra"],
      columns: ["question", "extra"],
      writable: ["question", "extra"],
    };
    expect(buildPayload(entry, { question: "q", extra: 1 })).toEqual({
      ok: true,
      payload: { question: "q" },
    });
  });

  test("view_count 는 편집 필드가 없으면 떼고 있으면 남긴다", () => {
    expect(
      buildPayload(SECTIONS.notices, { title: "a", view_count: 5 }),
    ).toEqual({ ok: true, payload: { title: "a", view_count: 5 } });
    const entry = { ...SECTIONS.notices, viewCountEditable: false };
    expect(buildPayload(entry, { title: "a", view_count: 5 })).toEqual({
      ok: true,
      payload: { title: "a" },
    });
  });

  test("실제 컬럼이지만 폼이 만들지 않는 키는 조용히 버린다", () => {
    // 수정 폼은 행 전체 스냅샷을 보내므로 거절하지 않고 쓰지 않는다.
    expect(
      buildPayload(SECTIONS.refundRequests, {
        admin_memo: "메모",
        approval_status: "approved",
        gross_amount: 1,
      }),
    ).toEqual({ ok: true, payload: { admin_memo: "메모" } });
  });

  test("지식 DB 의 embedding, search_text 는 버리고 고정 값 키는 받는다", () => {
    expect(
      buildPayload(
        SECTIONS.winningSuhaengTopicDb,
        { title: "t", embedding: "[1]", search_text: "s" },
        { fixed: true },
      ),
    ).toEqual({
      ok: true,
      payload: { title: "t", knowledge_type: "topic_pattern" },
    });
  });

  test("테이블에 없는 키는 writable 에 적혀 있지 않으면 계속 거절한다", () => {
    expect(
      buildPayload(SECTIONS.refundRequests, { admin_memo: "m", nope: 1 }),
    ).toEqual({ ok: false, unknownKeys: ["nope"] });
  });

  test("알 수 없는 키는 거절하고 키 목록을 돌려준다", () => {
    expect(
      buildPayload(SECTIONS.faqs, { question: "q", typo: 1, __proto__x: 2 }),
    ).toEqual({
      ok: false,
      unknownKeys: ["typo", "__proto__x"],
    });
  });

  test("고정 값을 덮어쓴다", () => {
    const result = buildPayload(
      SECTIONS.winningSuhaengTopicDb,
      { knowledge_type: "verified_resource", title: "t" },
      { fixed: true },
    );
    expect(result).toMatchObject({
      ok: true,
      payload: { knowledge_type: "topic_pattern", title: "t" },
    });
  });

  test("고정 구분 섹션은 category 가 목록에 있어야 한다", () => {
    expect(
      buildPayload(
        SECTIONS.admissionSusiJungsi,
        { category: "etc" },
        { fixed: true },
      ),
    ).toEqual({ ok: false, unknownKeys: [], badCategory: true });
    expect(
      buildPayload(
        SECTIONS.admissionSusiJungsi,
        { category: "susi" },
        { fixed: true },
      ),
    ).toMatchObject({ ok: true });
  });
});
