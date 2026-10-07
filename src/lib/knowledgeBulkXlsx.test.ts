// knowledgeBulkXlsx.ts(위닝 수행 주제 DB, 자료 DB 엑셀 왕복)의 순수 함수 테스트.
// DB 는 쓰지 않는다. 메뉴 config 와 같은 모양의 최소 필드 목록을 픽스처로 쓴다.

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  exportKnowledgeRowsToXlsx,
  parseKnowledgeRowsFromXlsx,
} from "./knowledgeBulkXlsx.ts";

const FIELDS = [
  {
    key: "is_active",
    label: "사용 여부",
    type: "radioBoolean",
    required: true,
  },
  {
    key: "grade",
    label: "학년",
    type: "select",
    options: ["고1", "고2", "고3"],
    required: true,
  },
  { key: "subject", label: "교과군", type: "select", required: true },
  { key: "career_field", label: "진로분야", type: "text" },
  { key: "title", label: "주제 패턴명", type: "text", required: true },
  {
    key: "content",
    label: "주제 추천 패턴 내용",
    type: "textarea",
    required: true,
  },
  { key: "memo", label: "메모", type: "textarea" },
];

function workbookOf(grid: unknown[][]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(grid), "시트");
  return workbook;
}

const OPTIONS = {
  fields: FIELDS,
  fixedValues: { knowledge_type: "topic_pattern" },
  defaults: { is_active: true },
  existingIds: new Set(["k1"]),
};

function sheetGrid(workbook: XLSX.WorkBook): unknown[][] {
  const name = workbook.SheetNames[0] as string;
  return XLSX.utils.sheet_to_json<unknown[]>(
    workbook.Sheets[name] as XLSX.WorkSheet,
    { header: 1, defval: "" },
  );
}

describe("exportKnowledgeRowsToXlsx", () => {
  it("시트 하나에 숨은 id 열과 필드 라벨 헤더로 행을 내보낸다", () => {
    const workbook = exportKnowledgeRowsToXlsx(
      [
        {
          id: "k1",
          is_active: true,
          grade: "고1",
          subject: "과학",
          career_field: null,
          title: "=SUM(A1)",
          content: "내용",
          memo: "",
          knowledge_type: "topic_pattern",
        },
      ],
      FIELDS,
    );

    expect(workbook.SheetNames).toHaveLength(1);
    const grid = sheetGrid(workbook);
    expect(grid[0]).toEqual([
      "id",
      "사용 여부",
      "학년",
      "교과군",
      "진로분야",
      "주제 패턴명",
      "주제 추천 패턴 내용",
      "메모",
    ]);
    expect(grid[1]).toEqual([
      "k1",
      true,
      "고1",
      "과학",
      "",
      "=SUM(A1)",
      "내용",
      "",
    ]);

    const sheet = workbook.Sheets[workbook.SheetNames[0] as string];
    expect(sheet?.["!cols"]?.[0]?.hidden).toBe(true);
    expect(sheet?.F2?.t).toBe("s");
    expect(sheet?.F2?.f).toBeUndefined();
  });
});

describe("parseKnowledgeRowsFromXlsx", () => {
  it("라벨 헤더를 순서와 무관하게 매핑하고 id 유무로 신규와 수정을 가른다", async () => {
    const workbook = workbookOf([
      [
        "주제 추천 패턴 내용",
        "학년",
        "id",
        "주제 패턴명",
        "교과군",
        "사용 여부",
        "knowledge_type",
      ],
      ["내용1", "고1", "k1", "제목1", "과학", false, "verified_resource"],
      ["내용2", "고2", "", "제목2", "수학", "TRUE", ""],
    ]);

    const result = await parseKnowledgeRowsFromXlsx(workbook, OPTIONS);

    expect(result.errors).toEqual([]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toMatchObject({
      rowNo: 2,
      id: "k1",
      values: {
        is_active: false,
        grade: "고1",
        subject: "과학",
        title: "제목1",
        content: "내용1",
        knowledge_type: "topic_pattern",
      },
    });
    expect(result.inserts).toHaveLength(1);
    expect(result.inserts[0]).toMatchObject({
      rowNo: 3,
      id: null,
      values: {
        is_active: true,
        grade: "고2",
        knowledge_type: "topic_pattern",
      },
    });
    expect(result.inserts[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("필수값이 빈 행은 오류로 빼고 사유에 라벨을 적는다", async () => {
    const workbook = workbookOf([
      ["학년", "교과군", "주제 패턴명", "주제 추천 패턴 내용"],
      ["고1", "과학", "", "내용"],
      ["고1", "과학", "제목", "내용"],
    ]);

    const result = await parseKnowledgeRowsFromXlsx(workbook, OPTIONS);

    expect(result.errors).toEqual([
      { rowNo: 2, reason: "필수값이 비었습니다: 주제 패턴명" },
    ]);
    expect(result.inserts.map((row) => row.rowNo)).toEqual([3]);
  });

  it("필수 열 자체가 없으면 신규 행을 오류로 뺀다", async () => {
    const workbook = workbookOf([
      ["학년", "주제 패턴명", "주제 추천 패턴 내용"],
      ["고1", "제목", "내용"],
    ]);

    const result = await parseKnowledgeRowsFromXlsx(workbook, OPTIONS);

    expect(result.errors).toEqual([
      { rowNo: 2, reason: "필수값이 비었습니다: 교과군" },
    ]);
  });

  it("선택지 밖의 값은 오류로 뺀다", async () => {
    const workbook = workbookOf([
      ["학년", "교과군", "주제 패턴명", "주제 추천 패턴 내용"],
      ["중1", "과학", "제목", "내용"],
    ]);

    const result = await parseKnowledgeRowsFromXlsx(workbook, OPTIONS);

    expect(result.errors).toEqual([
      { rowNo: 2, reason: "학년 값이 선택지에 없습니다: 중1" },
    ]);
  });

  it("이 메뉴에 없는 id 는 수정 후보가 아니라 오류다", async () => {
    const workbook = workbookOf([
      ["id", "주제 패턴명"],
      ["other-menu-id", "제목"],
    ]);

    const result = await parseKnowledgeRowsFromXlsx(workbook, OPTIONS);

    expect(result.updates).toEqual([]);
    expect(result.errors).toEqual([
      {
        rowNo: 2,
        reason:
          "이 메뉴에 없는 id 입니다. 다른 메뉴의 행이거나 삭제된 행입니다: other-menu-id",
      },
    ]);
  });

  it("파일 안에서 정규화 해시가 같은 뒤 행은 중복 오류로 뺀다", async () => {
    const workbook = workbookOf([
      ["학년", "교과군", "주제 패턴명", "주제 추천 패턴 내용"],
      ["고1", "과학", "AI 윤리", "핵심 내용"],
      ["고2", "수학", "다른 주제", "다른 내용"],
      ["고3", "과학", "ＡＩ  윤리!", "핵심 내용"],
    ]);

    const result = await parseKnowledgeRowsFromXlsx(workbook, OPTIONS);

    expect(result.inserts.map((row) => row.rowNo)).toEqual([2, 3]);
    expect(result.errors).toEqual([
      { rowNo: 4, reason: "파일 안에서 2행과 제목, 내용이 중복됩니다." },
    ]);
  });

  it("내려받은 파일을 그대로 올리면 전부 수정 후보로 돌아온다", async () => {
    const exported = exportKnowledgeRowsToXlsx(
      [
        {
          id: "k1",
          is_active: true,
          grade: "고1",
          subject: "과학",
          career_field: "",
          title: "제목",
          content: "내용",
          memo: "",
        },
      ],
      FIELDS,
    );
    const buffer = XLSX.write(exported, { bookType: "xlsx", type: "array" });

    const result = await parseKnowledgeRowsFromXlsx(
      XLSX.read(buffer, { type: "array" }),
      OPTIONS,
    );

    expect(result.errors).toEqual([]);
    expect(result.inserts).toEqual([]);
    expect(result.updates[0]).toMatchObject({
      rowNo: 2,
      id: "k1",
      values: {
        is_active: true,
        title: "제목",
        knowledge_type: "topic_pattern",
      },
    });
  });
});
