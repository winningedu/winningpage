// 서버 섹션 레지스트리 단위 검증. 컬럼 목록은 생성된 DB 타입 파일의 Update 키와 맞춘다.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  getSection,
  SECTION_EXPORT_CHUNK,
  SECTION_PAGE_SIZE,
  SECTIONS,
  type SectionKey,
} from "./registry.js";

const TYPES = readFileSync(
  new URL("../../../src/types/database.types.ts", import.meta.url),
  "utf8",
);

// Tables 안의 `<table>: { Row: ... Update: { ... } }` 블록에서 Update 키만 읽는다.
function updateKeys(table: string): string[] {
  const start = TYPES.indexOf(`\n      ${table}: {\n        Row: {`);
  if (start < 0) throw new Error(`타입 파일에 ${table} 테이블이 없다`);
  const update = TYPES.indexOf("Update: {", start);
  const end = TYPES.indexOf("\n        }", update);
  return TYPES.slice(update, end)
    .split("\n")
    .slice(1)
    .map((line) => line.trim().replace(/\??:.*$/, ""))
    .filter(Boolean);
}

const PROTECTED = ["id", "created_at", "updated_at"];

describe("섹션 레지스트리", () => {
  test("범용 엔진 섹션은 35개다", () => {
    expect(Object.keys(SECTIONS)).toHaveLength(35);
  });

  test("목록 크기와 내보내기 청크 상수", () => {
    expect(SECTION_PAGE_SIZE).toBe(10);
    expect(SECTION_EXPORT_CHUNK).toBe(1000);
  });

  test("getSection 은 등록된 키만 돌려주고 프로토타입 키는 거른다", () => {
    expect(getSection("notices")?.table).toBe("notices");
    for (const key of ["nope", "constructor", "__proto__", "toString", ""]) {
      expect(getSection(key)).toBeUndefined();
    }
  });

  test.each(
    Object.entries(SECTIONS) as [SectionKey, (typeof SECTIONS)[SectionKey]][],
  )(
    "%s columns 는 테이블 Update 키에서 보호 컬럼과 목록 전용 컬럼을 뺀 것과 같고 writable 은 그 부분집합이다",
    (_key, entry) => {
      if (entry.readOnly) {
        expect(entry.columns).toEqual([]);
        expect(entry.writable).toEqual([]);
        return;
      }
      expect(entry.columns).toEqual(
        expect.arrayContaining([...entry.writable]),
      );
      const expected = updateKeys(entry.table).filter(
        (column) =>
          !PROTECTED.includes(column) &&
          !(entry.listOnlyColumns ?? []).includes(column),
      );
      expect([...entry.columns].sort()).toEqual(expected.sort());
    },
  );

  test("premiumConsults writable 은 폼 필드(운영 메모, 상태, 읽기 전용 신청 정보)와 같다", () => {
    expect([...SECTIONS.premiumConsults.writable].sort()).toEqual([
      "admin_note",
      "email",
      "message",
      "name",
      "phone",
      "service",
      "status",
    ]);
  });

  test("refundRequests 는 승인 여부와 처리 결과 컬럼을 쓸 수 없다(상태, 금액은 폼 필드)", () => {
    const { writable } = SECTIONS.refundRequests;
    for (const column of [
      "approval_status",
      "completed_at",
      "processed_by",
      "toss_cancel",
      "gross_amount",
    ]) {
      expect(writable).not.toContain(column);
    }
    expect(writable).toContain("status");
    expect(writable).toContain("admin_memo");
  });

  test("지식 DB 두 섹션은 embedding, search_text 를 쓸 수 없다", () => {
    for (const key of [
      "winningSuhaengTopicDb",
      "winningSuhaengResourceDb",
    ] as const) {
      expect(SECTIONS[key].writable).not.toContain("embedding");
      expect(SECTIONS[key].writable).not.toContain("search_text");
      expect(SECTIONS[key].columns).toContain("embedding");
    }
  });

  test("섹션별 특수 설정", () => {
    expect(SECTIONS.admissionSusiJungsi.fixedCategories).toEqual([
      "susi",
      "jungsi",
    ]);
    expect(SECTIONS.winningSuhaengTopicDb.fixedValues).toEqual({
      knowledge_type: "topic_pattern",
    });
    expect(SECTIONS.admissionResults.serverPaginate).toBe(true);
    expect(SECTIONS.enrollments.listTable).toBe("admin_enrollment_entries");
    expect(SECTIONS.enrollments.listOnlyColumns).toEqual([
      "payment_method",
      "approval_no",
      "source",
    ]);
    const metaKeys = Object.entries(SECTIONS)
      .filter(([, entry]) => entry.meta)
      .map(([key]) => key);
    expect(metaKeys).toEqual(["admissionGuidelines"]);
    const viewCountKeys = Object.entries(SECTIONS)
      .filter(([, entry]) => entry.viewCountEditable)
      .map(([key]) => key);
    expect(viewCountKeys).toEqual(["notices", "companyNews", "galleries"]);
    expect(SECTIONS.notices.shiftSortOrder).toBe(true);
    expect(SECTIONS.galleries.shiftSortOrder).toBe(false);
  });
});
