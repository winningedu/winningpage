// 서버 레지스트리와 브라우저 config(src/pages/admin/configs)가 어긋나면 여기서 깨진다.
// config 는 사이트(VITE_SITE)마다 다르게 만들어질 수 있어 사이트 키마다 새로 불러 비교한다.

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SITES } from "../../../src/config/sites.js";
import { PROTECTED_COLUMNS, SECTION_PAGE_SIZE, SECTIONS } from "./registry.js";

type Field = { key: string };
interface BrowserConfig {
  custom?: boolean;
  comingSoon?: boolean;
  table?: string;
  listTable?: string;
  fixedCategories?: string[];
  fixedValues?: Record<string, unknown>;
  searchColumns?: string[];
  order?: string;
  orderBy?: [string, boolean][];
  serverPaginate?: boolean;
  readOnly?: boolean;
  noCreate?: boolean;
  knowledgeReview?: boolean;
  showMetaEdit?: boolean;
  listOnlyColumns?: string[];
  fields?: Field[];
  defaults?: Record<string, unknown>;
  formToPayload?: (form: Record<string, unknown>) => Record<string, unknown>;
}

const CONFIG_FILES = [
  "adminSettings",
  "admission",
  "analytics",
  "board",
  "goal",
  "main",
  "member",
  "revenue",
  "winning",
];

// Admin.tsx 가 CONFIGS 로 합치는 것과 같은 아홉 파일을 합친다.
async function loadConfigs(): Promise<Record<string, BrowserConfig>> {
  const all: Record<string, BrowserConfig> = {};
  for (const name of CONFIG_FILES) {
    const mod = (await import(
      `../../../src/pages/admin/configs/${name}.ts`
    )) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (value && typeof value === "object") Object.assign(all, value);
    }
  }
  return all;
}

const isEngine = (config: BrowserConfig) =>
  !config.custom && !config.comingSoon && Boolean(config.table);

// saveRow 의 서버 쪽 규칙을 그대로 흉내 낸다(registry 의 "받는 키" 판단용).
function stripped(config: BrowserConfig) {
  const keys = new Set<string>([
    ...PROTECTED_COLUMNS,
    ...(config.listOnlyColumns ?? []),
  ]);
  if (!config.fields?.some((field) => field.key === "view_count")) {
    keys.add("view_count");
  }
  return keys;
}

// 편집 폼이 저장 때 만들어 내는 payload 를 saveRow 순서대로 만든다.
function browserPayload(
  key: string,
  config: BrowserConfig,
  form: Record<string, unknown>,
) {
  const payload = config.formToPayload
    ? config.formToPayload({ ...form })
    : { ...form };
  if (config.fixedValues) Object.assign(payload, config.fixedValues);
  if (key === "banners") {
    delete payload.category;
    payload.subtitle = null;
  }
  const images = payload.image_urls;
  if (Array.isArray(images) && images.length > 0 && !payload.image_url) {
    payload.image_url = images[0];
  }
  const files = payload.attachments as { url: string; name: string }[];
  if (Array.isArray(files) && files.length > 0) {
    payload.file_url ??= files[0]?.url;
    payload.file_name ??= files[0]?.name;
  }
  if (key === "winningDbInputs") payload.parsed_data = null;
  return payload;
}

// 새 등록 폼이 가진 값: 편집 필드와 기본값뿐이다(레지스트리가 허용하는 키를 섞지 않는다).
function sampleForm(config: BrowserConfig) {
  const form: Record<string, unknown> = { ...(config.defaults ?? {}) };
  const keys = new Set((config.fields ?? []).map((f) => f.key));
  for (const column of keys) form[column] ??= "x";
  if (keys.has("image_urls")) form.image_urls = ["https://example.com/a.png"];
  if (keys.has("attachments")) {
    form.attachments = [{ url: "https://example.com/a.pdf", name: "a.pdf" }];
  }
  return form;
}

// config 를 사이트마다 새로 불러오고 AdminEngine 까지 올려서 첫 import 가 느리다.
vi.setConfig({ testTimeout: 60_000 });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(Object.keys(SITES))(
  "레지스트리와 브라우저 config 드리프트 (site=%s)",
  (site) => {
    async function engineConfigs() {
      vi.stubEnv("VITE_SITE", site);
      vi.resetModules();
      const all = await loadConfigs();
      return Object.fromEntries(
        Object.entries(all).filter(([, config]) => isEngine(config)),
      );
    }

    test("범용 엔진 섹션 키 집합이 같다", async () => {
      const configs = await engineConfigs();
      expect(Object.keys(SECTIONS).sort()).toEqual(Object.keys(configs).sort());
    });

    test("섹션별 조회 설정이 같다", async () => {
      const configs = await engineConfigs();
      for (const [key, entry] of Object.entries(SECTIONS)) {
        const config = configs[key] as BrowserConfig;
        const actual = {
          table: entry.table,
          listTable: entry.listTable,
          fixedCategories: entry.fixedCategories,
          fixedValues: entry.fixedValues,
          searchColumns: entry.searchColumns,
          order: entry.order,
          orderBy: entry.orderBy,
          serverPaginate: entry.serverPaginate,
          readOnly: entry.readOnly,
          noCreate: entry.noCreate,
          knowledgeReview: entry.knowledgeReview,
          meta: entry.meta,
          listOnlyColumns: entry.listOnlyColumns,
          viewCountEditable: entry.viewCountEditable,
          shiftSortOrder: entry.shiftSortOrder,
        };
        const fieldKeys = (config.fields ?? []).map((field) => field.key);
        const expected = {
          table: config.table,
          listTable: config.listTable,
          fixedCategories: config.fixedCategories,
          fixedValues: config.fixedValues,
          searchColumns: config.searchColumns,
          order: config.order,
          orderBy: config.orderBy,
          serverPaginate: Boolean(config.serverPaginate),
          readOnly: Boolean(config.readOnly),
          noCreate: Boolean(config.noCreate),
          knowledgeReview: Boolean(config.knowledgeReview),
          meta: Boolean(config.showMetaEdit),
          listOnlyColumns: config.listOnlyColumns ?? [],
          viewCountEditable: fieldKeys.includes("view_count"),
          shiftSortOrder: fieldKeys.includes("sort_order"),
        };
        expect({ key, ...actual }).toEqual({ key, ...expected });
      }
    });

    test("writable 은 폼이 만들 수 있는 컬럼과 정확히 같다", async () => {
      const configs = await engineConfigs();
      const diffs: Record<string, { missing: string[]; extra: string[] }> = {};
      for (const [key, entry] of Object.entries(SECTIONS)) {
        const config = configs[key] as BrowserConfig;
        if (entry.readOnly) {
          expect({ key, writable: entry.writable }).toEqual({
            key,
            writable: [],
          });
          continue;
        }
        const form = sampleForm(config);
        // 폼이 만드는 키: formToPayload 가 내는 키, 고정 값, 저장 직전에 saveRow 가 붙이는 파생 키,
        // 그리고 실제 컬럼인 편집 필드 키. 서버가 떼는 키(보호, 목록 전용, 편집 필드 없는 view_count)는 뺀다.
        const produced = new Set<string>([
          ...Object.keys(config.fixedValues ?? {}),
          ...Object.keys(browserPayload(key, config, form)),
          ...(config.fields ?? [])
            .map((field) => field.key)
            .filter((column) => entry.columns.includes(column)),
        ]);
        for (const column of stripped(config)) produced.delete(column);
        const missing = [...produced].filter(
          (column) => !entry.writable.includes(column),
        );
        const extra = entry.writable.filter((column) => !produced.has(column));
        if (missing.length > 0 || extra.length > 0) {
          diffs[key] = { missing: missing.sort(), extra: extra.sort() };
        }
      }
      expect(diffs).toEqual({});
    });
  },
);

describe("화면 상수와 같은 값", () => {
  test("SECTION_PAGE_SIZE 는 AdminEngine 의 PAGE_SIZE 와 같다", () => {
    // AdminEngine 은 React 와 `@/` 별칭을 끌어와 api 타입 검사에 들어올 수 없어 소스 글자에서 읽는다.
    const source = readFileSync(
      new URL(
        "../../../src/pages/admin/shared/AdminEngine.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const match = /^export const PAGE_SIZE = (\d+);/m.exec(source);
    expect(Number(match?.[1])).toBe(SECTION_PAGE_SIZE);
  });
});
