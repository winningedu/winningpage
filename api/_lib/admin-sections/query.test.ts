// 섹션 목록 쿼리 빌더 검증. 화면의 buildListQuery(Admin.tsx)와 같은 필터, 검색 이스케이프, 정렬이어야 한다.

import { describe, expect, test } from "vitest";
import { createKitState } from "../console/consoleTestKit.js";
import { buildListQuery, mapDbError, shiftSortOrder } from "./query.js";
import { SECTIONS } from "./registry.js";
import { createSectionAdmin, createSectionDb } from "./sectionTestKit.js";

function run(
  table: string,
  entry: Parameters<typeof buildListQuery>[1],
  options: Parameters<typeof buildListQuery>[2] = {},
) {
  const db = createSectionDb({ [table]: [] });
  const admin = createSectionAdmin(createKitState(), db);
  buildListQuery(admin as never, entry, options);
  return db.calls[0];
}

describe("buildListQuery", () => {
  test("서버 페이지 섹션의 검색어는 구문 문자를 공백으로 바꿔 or(ilike)로 건다", () => {
    const call = run("admission_results", SECTIONS.admissionResults, {
      q: " 서울,(대)%학_교\\*과 ",
    });
    expect(call?.or).toBe(
      "university_name.ilike.%서울  대  학 교  과%,department_name.ilike.%서울  대  학 교  과%,admission_track.ilike.%서울  대  학 교  과%",
    );
  });

  test("검색어가 구문 문자뿐이면 or 를 걸지 않는다", () => {
    const call = run("admission_results", SECTIONS.admissionResults, {
      q: ",()%_*",
    });
    expect(call?.or).toBeUndefined();
  });

  test("서버 페이지가 아닌 섹션은 검색어를 무시한다", () => {
    const call = run("notices", SECTIONS.notices, { q: "공지" });
    expect(call?.or).toBeUndefined();
  });

  test("고정 구분과 고정 값을 조건으로 건다", () => {
    const susi = run("admission_posts", SECTIONS.admissionSusiJungsi);
    expect(susi?.filters).toEqual([["category", "in", ["susi", "jungsi"]]]);
    const topic = run(
      "winning_assessment_knowledge_items",
      SECTIONS.winningSuhaengTopicDb,
    );
    expect(topic?.filters).toEqual([["knowledge_type", "eq", "topic_pattern"]]);
  });

  test("목록은 listTable 에서 읽는다", () => {
    const db = createSectionDb({ admin_enrollment_entries: [] });
    const admin = createSectionAdmin(createKitState(), db);
    buildListQuery(admin as never, SECTIONS.enrollments);
    expect(db.calls[0]?.table).toBe("admin_enrollment_entries");
  });

  test("정렬: orderBy 배열, 고정 구분 기본, order 컬럼 순", () => {
    expect(run("admission_results", SECTIONS.admissionResults)?.orders).toEqual(
      [
        ["result_year", false],
        ["id", false],
      ],
    );
    expect(
      run("admission_posts", SECTIONS.admissionSusiJungsi)?.orders,
    ).toEqual([
      ["is_pinned", false],
      ["sort_order", true],
      ["created_at", false],
    ]);
    // sort_order 만 오름차순, 그 밖의 order 는 내림차순
    expect(run("popups", SECTIONS.popups)?.orders).toEqual([
      ["sort_order", true],
    ]);
    expect(run("refunds", SECTIONS.refunds)?.orders).toEqual([
      ["requested_at", false],
    ]);
    // order 가 없으면 created_at 내림차순
    expect(run("refund_requests", SECTIONS.refundRequests)?.orders).toEqual([
      ["created_at", false],
    ]);
  });

  test("count 를 켜면 전체 건수를 센다", () => {
    expect(run("notices", SECTIONS.notices, { count: true })?.count).toBe(true);
    expect(run("notices", SECTIONS.notices)?.count).toBe(false);
  });
});

describe("shiftSortOrder", () => {
  function setup(rows: { id: string; sort_order: number }[]) {
    const db = createSectionDb({ faqs: rows });
    const admin = createSectionAdmin(createKitState(), db);
    return { db, admin };
  }
  const order = (db: ReturnType<typeof setup>["db"]) =>
    Object.fromEntries(
      (db.tables.faqs ?? []).map((row) => [row.id, row.sort_order]),
    );

  test("지정 값부터 이어지는 구간만 큰 값부터 하나씩 민다", async () => {
    const { db, admin } = setup([
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
      { id: "c", sort_order: 3 },
      { id: "d", sort_order: 5 },
    ]);
    await shiftSortOrder(admin as never, SECTIONS.faqs, 2);
    expect(order(db)).toEqual({ a: 1, b: 3, c: 4, d: 5 });
    const updates = db.calls.filter((call) => call.op === "update");
    expect(updates.map((call) => call.values)).toEqual([
      { sort_order: 4 },
      { sort_order: 3 },
    ]);
  });

  test("지정 값이 비어 있으면 아무것도 밀지 않는다", async () => {
    const { db, admin } = setup([
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 3 },
    ]);
    await shiftSortOrder(admin as never, SECTIONS.faqs, 2);
    expect(order(db)).toEqual({ a: 1, b: 3 });
  });

  test("수정 중인 행은 구간에서 뺀다", async () => {
    const { db, admin } = setup([
      { id: "a", sort_order: 2 },
      { id: "b", sort_order: 3 },
    ]);
    await shiftSortOrder(admin as never, SECTIONS.faqs, 2, "a");
    expect(order(db)).toEqual({ a: 2, b: 3 });
  });

  test("조회나 갱신이 실패하면 던진다", async () => {
    const { db, admin } = setup([{ id: "a", sort_order: 2 }]);
    db.errors.push({ table: "faqs", op: "update", error: { code: "x" } });
    await expect(
      shiftSortOrder(admin as never, SECTIONS.faqs, 2),
    ).rejects.toThrow();
  });
});

describe("mapDbError", () => {
  test("23505 는 409 와 겹친 컬럼 이름만 돌려주고 값은 싣지 않는다", () => {
    const mapped = mapDbError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "x_idx"',
      details:
        "Key (coalesce(title, ''::text), sort_order)=(비밀제목, 3) already exists.",
    });
    expect(mapped).toEqual({
      status: 409,
      code: "DB_UNIQUE_VIOLATION",
      detail: "이미 등록된 값입니다(중복).",
      columns: ["title", "sort_order"],
    });
    expect(JSON.stringify(mapped)).not.toContain("비밀제목");
  });

  test("23502 는 400 과 비어 있는 컬럼", () => {
    expect(
      mapDbError({
        code: "23502",
        message:
          'null value in column "school_name" of relation "t" violates not-null constraint',
        details: "Failing row contains (개인정보).",
      }),
    ).toEqual({
      status: 400,
      code: "DB_NOT_NULL_VIOLATION",
      detail: "필수 값이 비어 있습니다. 항목을 모두 입력해 주세요.",
      columns: ["school_name"],
    });
  });

  test("23514 는 400 과 제약 이름", () => {
    expect(
      mapDbError({
        code: "23514",
        message:
          'new row for relation "coupons" violates check constraint "coupons_rate_check"',
        details: "Failing row contains (secret).",
      }),
    ).toEqual({
      status: 400,
      code: "DB_CHECK_VIOLATION",
      detail: "입력값이 저장 조건을 벗어났습니다. 값을 다시 확인해 주세요.",
      columns: ["coupons_rate_check"],
    });
  });

  test("그 밖의 오류와 오류 없음은 null", () => {
    expect(mapDbError({ code: "42703", message: "x" })).toBeNull();
    expect(mapDbError(null)).toBeNull();
  });
});
