// =====================================================================
// 위닝 수행 주제 DB, 위닝 수행 자료 DB(winning_assessment_knowledge_items) 엑셀 왕복.
// admissionResultsBulkXlsx.ts 의 형식을 따른다. 매칭 키는 id 하나이고, id 가 있으면
// 수정 후보, 비어 있으면 신규 후보다. 이 lib 은 DB 를 만지지 않는다.
//
// 선례와 다른 점
//   헤더가 컬럼 키가 아니라 어드민 폼 라벨이다. 고객사 담당자가 직접 채우는 파일이라
//   사람이 읽는 이름이 필요하다. id 열만 키 그대로 두고 숨긴다.
//   컬럼 목록을 상수로 두지 않고 메뉴 config 의 fields 에서 만든다. 두 메뉴가 라벨이
//   달라도 같은 함수를 쓴다.
// =====================================================================

import * as XLSX from "xlsx";

// 서버 정확 일치와 같은 정규화 규칙을 쓰려고 잎 모듈을 그대로 가져온다.
import { contentHash } from "../../api/_lib/knowledge/dedupe.js";

export const KNOWLEDGE_BULK_ID_HEADER = "id";
const SHEET_NAME = "지식DB";

export type KnowledgeBulkField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Array<string | { value: string; label: string }>;
};

function serializeExportCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean" || typeof value === "number") return value;
  return String(value);
}

// 수식 주입 방어. 문자열 셀을 t='s' 로 강제해 '=' 로 시작하는 텍스트가 수식으로
// 재해석되지 않게 한다(admissionResultsBulkXlsx.ts 와 같은 로직).
function forceStringCellTypes(worksheet: XLSX.WorkSheet): XLSX.WorkSheet {
  for (const address of Object.keys(worksheet)) {
    if (address.startsWith("!")) continue;
    const cell = worksheet[address];
    if (cell && typeof cell.v === "string") {
      cell.t = "s";
      delete cell.f;
    }
  }
  return worksheet;
}

/** 현재 메뉴 행을 xlsx workbook 으로 바꾼다. 첫 열은 숨은 id 열이다. */
export function exportKnowledgeRowsToXlsx(
  rows: Record<string, unknown>[],
  fields: KnowledgeBulkField[],
): XLSX.WorkBook {
  const header = [KNOWLEDGE_BULK_ID_HEADER, ...fields.map((f) => f.label)];
  const body = rows.map((row) => [
    serializeExportCell(row.id),
    ...fields.map((field) => serializeExportCell(row[field.key])),
  ]);
  const worksheet = forceStringCellTypes(
    XLSX.utils.aoa_to_sheet([header, ...body]),
  );
  worksheet["!cols"] = [{ hidden: true }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
  return workbook;
}

export type ParsedKnowledgeRow = {
  /** 엑셀 행 번호. 헤더가 1행이라 첫 데이터 행이 2다. */
  rowNo: number;
  id: string | null;
  /** 파일에 있던 열만 담는다. 없는 열은 수정 때 기존 값을 지우지 않게 뺀다. */
  values: Record<string, unknown>;
  /** 정규화한 제목과 내용의 SHA-256. 파일 안 중복과 서버 정확 일치에 쓴다. */
  hash: string;
};

export type KnowledgeParseError = { rowNo: number; reason: string };

export type KnowledgeParseResult = {
  inserts: ParsedKnowledgeRow[];
  updates: ParsedKnowledgeRow[];
  errors: KnowledgeParseError[];
};

export type KnowledgeParseOptions = {
  fields: KnowledgeBulkField[];
  /** config.fixedValues. 파일 값을 무시하고 이 값을 강제로 넣는다. */
  fixedValues: Record<string, unknown>;
  /** config.defaults. 빈 사용 여부 셀에만 쓴다. */
  defaults: Record<string, unknown>;
  /** 이 메뉴에 실제로 있는 행 id. 밖의 id 는 다른 메뉴 행이거나 삭제된 행이다. */
  existingIds: Set<string>;
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function booleanCell(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = cellText(value).toUpperCase();
  if (text === "TRUE" || text === "1") return true;
  if (text === "FALSE" || text === "0") return false;
  return null;
}

function optionValues(field: KnowledgeBulkField): string[] | null {
  if (!Array.isArray(field.options) || field.options.length === 0) return null;
  return field.options.map((option) =>
    typeof option === "string" ? option : option.value,
  );
}

// 행 하나의 값 검증. 신규는 필수 열이 전부 있어야 하고, 수정은 파일에 있는 필수 열만
// 비면 안 된다(없는 열은 기존 값을 그대로 둔다). 사용 여부는 빈 셀을 config 기본값으로
// 채우므로 필수 검사에서 뺀다.
function rowProblem(
  values: Record<string, unknown>,
  fields: KnowledgeBulkField[],
  mode: "insert" | "update",
): string | null {
  const missing = fields
    .filter((field) => field.required && field.type !== "radioBoolean")
    .filter((field) => {
      if (mode === "update" && !(field.key in values)) return false;
      return cellText(values[field.key]) === "";
    })
    .map((field) => field.label);
  if (missing.length > 0) return `필수값이 비었습니다: ${missing.join(", ")}`;

  for (const field of fields) {
    const allowed = optionValues(field);
    const value = cellText(values[field.key]);
    if (allowed && value !== "" && !allowed.includes(value)) {
      return `${field.label} 값이 선택지에 없습니다: ${value}`;
    }
  }
  return null;
}

/** xlsx workbook 을 신규, 수정 후보와 행별 오류로 나눈다. 해시 계산 때문에 비동기다. */
export async function parseKnowledgeRowsFromXlsx(
  workbook: XLSX.WorkBook,
  options: KnowledgeParseOptions,
): Promise<KnowledgeParseResult> {
  const result: KnowledgeParseResult = { inserts: [], updates: [], errors: [] };
  const sheetName = workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!worksheet) {
    result.errors.push({ rowNo: 0, reason: "시트를 찾을 수 없습니다." });
    return result;
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
  });
  const header = (grid[0] ?? []).map(cellText);
  const indexOfHeader = (name: string) => header.indexOf(name);
  const idIndex = indexOfHeader(KNOWLEDGE_BULK_ID_HEADER);
  // 라벨로 먼저 찾고, 없으면 컬럼 키로 찾는다(개발자가 만든 파일도 받는다).
  const mapped = options.fields
    .map((field) => {
      const byLabel = indexOfHeader(field.label);
      return {
        field,
        index: byLabel >= 0 ? byLabel : indexOfHeader(field.key),
      };
    })
    .filter((entry) => entry.index >= 0);

  // 해시별로 그 해시를 처음 쓴 행 번호를 둔다. 제목, 내용 열이 둘 다 있는 행만 비교한다.
  // 수정 파일에 두 열이 없으면 모든 행이 빈 문자열 해시로 겹쳐 버리기 때문이다.
  const firstRowByHash = new Map<string, number>();

  for (let i = 1; i < grid.length; i += 1) {
    const cells = grid[i] ?? [];
    if (cells.every((cell) => cellText(cell) === "")) continue;
    const rowNo = i + 1;
    const id = idIndex >= 0 ? cellText(cells[idIndex]) || null : null;
    if (id && !options.existingIds.has(id)) {
      result.errors.push({
        rowNo,
        reason: `이 메뉴에 없는 id 입니다. 다른 메뉴의 행이거나 삭제된 행입니다: ${id}`,
      });
      continue;
    }

    const values: Record<string, unknown> = {};
    for (const { field, index } of mapped) {
      const raw = cells[index];
      if (field.type === "radioBoolean") {
        const parsed = booleanCell(raw);
        values[field.key] = parsed ?? options.defaults[field.key];
      } else {
        values[field.key] = cellText(raw);
      }
    }
    Object.assign(values, options.fixedValues);

    const problem = rowProblem(
      values,
      options.fields,
      id ? "update" : "insert",
    );
    if (problem) {
      result.errors.push({ rowNo, reason: problem });
      continue;
    }

    const hash = await contentHash(
      String(values.title ?? ""),
      String(values.content ?? ""),
    );
    if ("title" in values && "content" in values) {
      const firstRow = firstRowByHash.get(hash);
      if (firstRow !== undefined) {
        result.errors.push({
          rowNo,
          reason: `파일 안에서 ${firstRow}행과 제목, 내용이 중복됩니다.`,
        });
        continue;
      }
      firstRowByHash.set(hash, rowNo);
    }

    const parsed: ParsedKnowledgeRow = { rowNo, id, values, hash };
    (id ? result.updates : result.inserts).push(parsed);
  }
  return result;
}
