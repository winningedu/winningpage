import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { fetchColumnCategories } from "@/pages/column/columnData";
import { ADMIN_SECTION_KEYS } from "../adminSectionKeys";
import { boardConfigs } from "./board";

type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: unknown;
  loadOptions?: unknown;
};
type Config = { title: string; table: string; order: string; fields: Field[] };

const configs = boardConfigs as unknown as Record<string, Config>;

describe("교육칼럼 어드민: 카테고리 선택", () => {
  test("galleries.category 선택지를 column_categories 에서 불러온다", () => {
    const field = configs.galleries?.fields.find((f) => f.key === "category");
    expect(field?.type).toBe("select");
    expect(field?.options).toBeUndefined();
    expect(field?.loadOptions).toBe(fetchColumnCategories);
  });
});

describe("칼럼 카테고리 어드민 섹션", () => {
  test("column_categories 를 sort_order 순으로 관리하는 config 가 있다", () => {
    const config = configs.columnCategories as Config;
    expect(config).toMatchObject({
      title: "칼럼 카테고리",
      table: "column_categories",
      order: "sort_order",
    });
    expect(config.fields.map((f) => [f.key, f.type, !!f.required])).toEqual([
      ["is_active", "radioBoolean", true],
      ["label", "text", true],
      ["sort_order", "number", false],
    ]);
  });

  test("섹션 키가 교육칼럼 바로 다음에 등록돼 있다", () => {
    const keys: readonly string[] = ADMIN_SECTION_KEYS;
    expect(keys.indexOf("columnCategories")).toBe(
      keys.indexOf("galleries") + 1,
    );
  });

  test("admin_resources 메뉴 행을 넣는 데이터 SQL 이 있다", () => {
    const dataDir = path.resolve(
      import.meta.dirname,
      "../../../../supabase/data",
    );
    const file = fs
      .readdirSync(dataDir)
      .find((name) => name.endsWith("_admin_resources_column_categories.sql"));
    expect(file).toBeDefined();
    const sql = fs.readFileSync(path.join(dataDir, file as string), "utf8");
    expect(sql).toMatch(
      /values \('columnCategories', '입시정보 관리', '칼럼 카테고리', \d+, true\)/,
    );
    expect(sql).toMatch(/on conflict \(key\) do nothing/i);
  });
});
