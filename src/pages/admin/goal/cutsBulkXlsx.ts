// =====================================================================
// 목표관리 대학 컷(goal_university_cuts) 일괄 엑셀 왕복.
//
// src/lib/admissionResultsBulkXlsx.js(입결정보 29컬럼 왕복)의 구조를
// 참고해 새로 작성했다 — 그 파일 머리말의 원칙("두 도메인은 스키마·
// 유일성 인덱스·규모가 전혀 달라 함수를 공유하지 않는다")을 그대로
// 따른다. 도메인 무관 유틸(clean)만 import 하고, 도메인 로직은 복사가
// 아니라 이 도메인 규칙으로 다시 썼다.
//
// 이 도메인에만 있는 두 가지 제약:
//
//  1) 🔴 avg_cut 의 스케일 이원성. cut_type 이 normal|special 이면
//     "내신 등급 1~9(작을수록 우세)", jungsi 면 "백분위 0~100(클수록
//     우세)"이다. 두 스케일은 1~9 구간에서 겹치므로 DB CHECK
//     (goal_university_cuts_avg_cut_check)가 혼입을 잡지 못한다 —
//     jungsi 행에 3.2(등급)를 넣어도 CHECK(0~100)를 통과하고, 그 값은
//     "백분위 3.2"로 읽혀 합격 확률의 우열이 통째로 뒤집힌다.
//     그래서 이 lib 의 GOAL_CUT_RANGE 기반 검증(cutScaleOutOfRange)과
//     Admin.jsx 폼의 config.validate 가 실질 방어선이다(명세 §3-D4).
//
//  2) 🔴 기존 행의 cut_type 변경 금지. id 로 기존 행을 갱신할 때
//     cut_type 을 바꾸면 1)과 똑같은 사고가 난다(등급 3.2 짜리 행을
//     jungsi 로 바꿔 저장). 폼 경로는 config.validate 규칙 0 이 막고,
//     엑셀 경로는 여기 cutTypeChanged 가 막는다. 판정에 필요한
//     "DB 의 현재 cut_type"은 호출부가 넘긴다(이 lib 은 DB 를 안 만진다).
//
// 유일성 인덱스는 두 축이다(sql/55):
//   goal_university_cuts_key       (cut_type, university_key, department_key)  전체
//   goal_university_cuts_name_key  (cut_type, university_name, department_name) where is_active
// 어드민은 key := name 을 항상 강제하므로(명세 §3-D5, 아래 payload) 두
// 축이 동치가 된다. 파일 내부 중복 선검출은 name 축으로 한다.
// =====================================================================

import * as XLSX from "xlsx";

import { clean } from "@/lib/admissionParsing.js";

type CutType = "normal" | "special" | "jungsi";

// sql/55_goal_management.sql 의 goal_university_cuts_avg_cut_check 를
// 클라이언트에 미러한 것이다. Admin.jsx 의 config.validate 와 이 lib 의
// 엑셀 파서가 같은 상수를 봐야 두 입력 경로의 판정이 갈라지지 않는다 —
// 그래서 Admin.jsx 에 따로 선언하지 않고 여기서 export 해 쓴다.
export const GOAL_CUT_RANGE: Record<
  CutType,
  { min: number; max: number; unit: string; label: string }
> = {
  normal: {
    min: 1,
    max: 9,
    unit: "등급",
    label: "내신 등급 1~9 (작을수록 우세)",
  },
  special: {
    min: 1,
    max: 9,
    unit: "등급",
    label: "내신 등급 1~9 (작을수록 우세)",
  },
  jungsi: {
    min: 0,
    max: 100,
    unit: "백분위",
    label: "정시 백분위 0~100 (클수록 우세)",
  },
};

// DB 컬럼 ↔ 엑셀 헤더. university_key / department_key 는 컬럼으로 두지
// 않는다 — 어드민은 항상 표시명과 동일하게 강제하고(명세 §3-D5) 파서가
// name 에서 복사한다. created_at / updated_at 은 DB 가 관리한다.
const GOAL_CUTS_XLSX_COLUMNS: { key: string; header: string }[] = [
  { key: "id", header: "id" },
  { key: "cut_type", header: "컷 종류" },
  { key: "university_name", header: "대학명" },
  { key: "department_name", header: "학과명" },
  { key: "avg_cut", header: "컷 값" },
  { key: "source", header: "출처" },
  { key: "source_year", header: "기준 연도" },
  { key: "is_active", header: "노출" },
  { key: "note", header: "운영 메모" },
];

export const GOAL_CUTS_XLSX_HEADERS = GOAL_CUTS_XLSX_COLUMNS.map(
  (c) => c.header,
);
const GOAL_CUTS_XLSX_SHEET_NAME = "목표관리 대학 컷";

// 엑셀 셀의 한글 라벨 ↔ DB 값. 폼(GOAL_CUT_TYPE_OPTIONS)의 라벨과 일부러
// 다르게 짧게 뒀다 — 엑셀에서는 셀 폭이 좁고 관리자가 직접 타이핑한다.
const CUT_TYPE_LABEL_BY_VALUE: Record<CutType, string> = {
  normal: "수시 일반",
  special: "수시 특목",
  jungsi: "정시",
};
const CUT_TYPE_VALUE_BY_LABEL: Record<string, CutType> = {
  "수시 일반": "normal",
  "수시 특목": "special",
  정시: "jungsi",
};

const SOURCE_LABEL_BY_VALUE: Record<string, string> = {
  admission_results: "입결정보 유도",
  manual: "수기 입력",
};
const SOURCE_VALUE_BY_LABEL: Record<string, string> = {
  "입결정보 유도": "admission_results",
  "수기 입력": "manual",
};

// source_year 는 smallint 다. DB 에 CHECK 는 없지만 오타(20260 등)를
// 조용히 저장하면 백필 재실행 판정이 어긋나므로 업무 규칙으로 좁힌다.
const SOURCE_YEAR_MIN = 2000;
const SOURCE_YEAR_MAX = 2100;

// admissionResultsBulkXlsx.js 와 동일 값. 그쪽에서 import 해도 되지만
// (실제로 export 돼 있다) 그 파일 머리말이 "함수를 공유하지 않는다"고
// 못박은 도메인 lib 이라, 상수만 끌어와 결합을 만들지 않고 여기 둔다.
const MAX_XLSX_CELL_LENGTH = 32767;
export const TRUNCATION_MARKER =
  "…[셀 한도 초과로 잘림 — 이 셀을 그대로 업로드하면 데이터가 손상됩니다]";

function serializeExportCell(rawValue: unknown): string | number | boolean {
  if (rawValue === null || rawValue === undefined) return "";
  if (typeof rawValue === "boolean" || typeof rawValue === "number")
    return rawValue;
  return String(rawValue);
}

type TruncationLocation = { id: unknown; rowIndex: number; column: string };
type TruncatedCell = TruncationLocation & { originalLength: number };

function truncateIfNeeded(
  value: string | number | boolean,
  location: TruncationLocation,
  truncatedCells: TruncatedCell[],
): string | number | boolean {
  if (typeof value !== "string" || value.length <= MAX_XLSX_CELL_LENGTH)
    return value;
  const keep = MAX_XLSX_CELL_LENGTH - TRUNCATION_MARKER.length;
  truncatedCells.push({ ...location, originalLength: value.length });
  return value.slice(0, keep) + TRUNCATION_MARKER;
}

// formula injection(수식 주입) 방어 — 문자열 값 셀만 t='s'로 강제해
// Excel/Sheets 가 '='/'+'/'-'/'@' 선두 텍스트를 수식으로 재해석하지
// 못하게 한다. 숫자/불리언은 serializeExportCell 이 원시 타입으로
// 넘기므로 이 함수가 손대지 않는다(컷 값이 문자열로 오인되지 않는다).
function forceStringCellTypes(worksheet: XLSX.WorkSheet): XLSX.WorkSheet {
  Object.keys(worksheet).forEach((address) => {
    if (address.startsWith("!")) return;
    const cell = worksheet[address];
    if (cell && typeof cell.v === "string") {
      cell.t = "s";
      delete cell.f;
    }
  });
  return worksheet;
}

// clean() 은 텍스트용이라 `String(value || '').trim()` 로 falsy 를 전부
// 빈 문자열 취급한다 — 숫자 0 은 falsy 라 clean(0) 이 '' 이 돼 "빈 셀"로
// 오판된다. avg_cut 은 jungsi 스케일에서 0 이 합법(백분위 0)이므로 숫자
// 컬럼은 반드시 이 헬퍼를 쓴다.
function numericCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseBooleanCell(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = clean(value).toUpperCase();
  if (s === "Y" || s === "TRUE" || s === "1" || s === "O") return true;
  if (s === "N" || s === "FALSE" || s === "0" || s === "X") return false;
  return fallback;
}

function buildTypeCounts(items: { type?: string }[]): Record<string, number> {
  return items.reduce(
    (acc: Record<string, number>, item) => {
      const key = item.type || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/**
 * DB 행 배열 → xlsx workbook. id 컬럼을 포함한다(업로드 시 insert/update
 * 분기의 유일한 근거). id 가 없는 행(정시 템플릿)은 빈 셀로 나가고,
 * 업로드하면 신규 등록으로 처리된다.
 */
export function exportGoalUniversityCutRowsToXlsx(
  rows: Record<string, unknown>[],
): { workbook: XLSX.WorkBook; truncatedCells: TruncatedCell[] } {
  const truncatedCells: TruncatedCell[] = [];
  const dataRows = (rows || []).map((row, rowIndex) =>
    GOAL_CUTS_XLSX_COLUMNS.map((column) => {
      let raw: unknown = row?.[column.key];
      if (column.key === "cut_type")
        raw = CUT_TYPE_LABEL_BY_VALUE[raw as CutType] ?? raw;
      else if (column.key === "source")
        raw = SOURCE_LABEL_BY_VALUE[raw as string] ?? raw;
      else if (column.key === "is_active") raw = raw === false ? "N" : "Y";
      const serialized = serializeExportCell(raw);
      return truncateIfNeeded(
        serialized,
        { id: row?.id, rowIndex, column: column.header },
        truncatedCells,
      );
    }),
  );

  const worksheet = forceStringCellTypes(
    XLSX.utils.aoa_to_sheet([GOAL_CUTS_XLSX_HEADERS, ...dataRows]),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, GOAL_CUTS_XLSX_SHEET_NAME);

  return { workbook, truncatedCells };
}

function naturalKeyOf(
  cutType: string,
  universityName: string,
  departmentName: string,
): string {
  return [cutType, universityName, departmentName].join("::");
}

type ErrorType =
  | "sheetNotFound"
  | "truncatedColumn"
  | "missingRequiredFields"
  | "invalidCutType"
  | "invalidNumber"
  | "cutScaleOutOfRange"
  | "cutTypeChanged"
  | "invalidSourceYear"
  | "invalidId"
  | "idNotFound"
  | "duplicateNaturalKey";

// 원본 JSDoc에는 없었지만 실제 코드가 만드는 경고 종류다("unknownSource",
// 아래 (9) 이후 출처 셀 분기) — 코드가 정본이라 JSDoc이 놓친 값도 여기
// 포함한다.
type WarningType =
  | "jungsiLooksLikeGrade"
  | "naesinCutTooHigh"
  | "cutMissing"
  | "inactiveRow"
  | "unknownSource";

type RowContext = {
  rowIndex: number;
  cutType: unknown;
  universityName: unknown;
  departmentName: unknown;
  column?: string;
};

type ErrorEntry = {
  row: number;
  cutType: unknown;
  universityName: unknown;
  departmentName: unknown;
  // RowContext.column도 optional(string | undefined)이라 fail()이 그대로
  // 전달한다 — exactOptionalPropertyTypes 하에서 undefined 명시 대입을
  // 허용해야 한다(키 생략과 동일하게 취급, 값 자체는 원래도 optional).
  column?: string | undefined;
  type: ErrorType;
  reason: string;
};

type WarningEntry = {
  row: number;
  cutType: unknown;
  universityName: unknown;
  departmentName: unknown;
  // ErrorEntry.column과 같은 사유.
  column?: string | undefined;
  type: WarningType;
  reason: string;
};

type CutPayload = {
  cut_type: CutType;
  university_key: string;
  university_name: string;
  department_key: string;
  department_name: string;
  avg_cut: number | null;
  source: string;
  source_year: number | null;
  is_active: boolean;
  note: string | null;
  id?: number;
};

/**
 * xlsx workbook → payload 행 배열 + errors/warnings + 미리보기용 summary.
 *
 * @param existingCutTypeById DB 에 실제로 존재하는 id → 그 행의 현재
 *   cut_type. id 가 비어 있으면 신규(insert), id 가 있고 이 Map 에 있으면
 *   수정(update), id 가 있는데 없으면 거부한다. 같은 Map 이 cutTypeChanged
 *   판정에도 쓰인다 — 두 검사가 같은 조회 결과를 보므로 호출부가
 *   select('id, cut_type') 한 번만 하면 된다.
 *
 * errors/warnings 는 둘 다 `type` 으로 종류를 구분한다 — UI 는 `reason`
 * 문자열을 파싱하지 말고 `type` 으로 분기·집계해야 한다.
 */
export function parseGoalUniversityCutRowsFromXlsx(
  workbook: XLSX.WorkBook,
  existingCutTypeById: Map<number, string>,
): {
  rows: CutPayload[];
  errors: ErrorEntry[];
  warnings: WarningEntry[];
  summary: {
    willInsert: number;
    willUpdate: number;
    willSkip: number;
    warningCounts: Record<string, number>;
    errorCounts: Record<string, number>;
  };
} {
  const idMap =
    existingCutTypeById instanceof Map
      ? existingCutTypeById
      : new Map<number, string>();
  const sheetName = workbook?.SheetNames?.[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  const errors: ErrorEntry[] = [];
  const warnings: WarningEntry[] = [];
  const rows: CutPayload[] = [];
  let willInsert = 0;
  let willUpdate = 0;
  let willSkip = 0;
  const seenNaturalKeys = new Map<string, number>(); // naturalKey -> 최초로 그 키를 쓴 행 번호(0-based)

  function summarize() {
    return {
      rows,
      errors,
      warnings,
      summary: {
        willInsert,
        willUpdate,
        willSkip,
        warningCounts: buildTypeCounts(warnings),
        errorCounts: buildTypeCounts(errors),
      },
    };
  }

  function fail(type: ErrorType, reason: string, ctx: RowContext) {
    errors.push({
      row: ctx.rowIndex,
      cutType: ctx.cutType,
      universityName: ctx.universityName,
      departmentName: ctx.departmentName,
      column: ctx.column,
      type,
      reason,
    });
    willSkip += 1;
  }

  function warn(type: WarningType, reason: string, ctx: RowContext) {
    warnings.push({
      row: ctx.rowIndex,
      cutType: ctx.cutType,
      universityName: ctx.universityName,
      departmentName: ctx.departmentName,
      column: ctx.column,
      type,
      reason,
    });
  }

  if (!worksheet) {
    errors.push({
      row: -1,
      cutType: null,
      universityName: null,
      departmentName: null,
      type: "sheetNotFound",
      reason: "시트를 찾을 수 없습니다.",
    });
    return summarize();
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
  // 컬럼은 위치가 아니라 헤더 이름으로 찾는다 — 컬럼 순서가 바뀌거나
  // 일부 컬럼이 빠진 파일이 와도 안전하다.
  const headerRow = Array.isArray(grid[0]) ? grid[0] : [];
  const columnIndexByHeader = new Map<unknown, number>();
  headerRow.forEach((name, idx) => {
    const key = typeof name === "string" ? name.trim() : name;
    if (
      key !== undefined &&
      key !== null &&
      key !== "" &&
      !columnIndexByHeader.has(key)
    ) {
      columnIndexByHeader.set(key, idx);
    }
  });
  const bodyRows = grid.slice(1);

  bodyRows.forEach((rawRow, rowIndex) => {
    const cells = Array.isArray(rawRow) ? rawRow : [];
    // 완전히 빈 행(엑셀 트레일링 공백 등)은 조용히 건너뛴다.
    if (
      !cells.some(
        (cell) =>
          cell !== undefined && cell !== null && String(cell).trim() !== "",
      )
    ) {
      return;
    }

    const rowObj: Record<string, unknown> = {};
    GOAL_CUTS_XLSX_COLUMNS.forEach((column) => {
      const idx = columnIndexByHeader.get(column.header);
      rowObj[column.key] = idx === undefined ? undefined : cells[idx];
    });

    const ctx: RowContext = {
      rowIndex,
      cutType: clean(rowObj.cut_type),
      universityName: clean(rowObj.university_name),
      departmentName: clean(rowObj.department_name),
    };

    // (1) 잘림 마커 — 어느 컬럼에서 발견되든 행 전체를 거부한다.
    const truncatedHeaders = GOAL_CUTS_XLSX_COLUMNS.filter(
      (column) =>
        typeof rowObj[column.key] === "string" &&
        (rowObj[column.key] as string).includes(TRUNCATION_MARKER),
    ).map((column) => column.header);
    if (truncatedHeaders.length) {
      fail(
        "truncatedColumn",
        `잘림 마커가 있는 컬럼(${truncatedHeaders.join(", ")})이 있어 행을 거부합니다.`,
        ctx,
      );
      return;
    }

    // (2) id — 비어 있으면 신규, 값이 있으면 수정.
    const idText = numericCellText(rowObj.id);
    let existingId: number | null = null;
    if (idText) {
      const parsed = Number(idText);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        fail("invalidId", `id "${rowObj.id}" 가 정수가 아닙니다.`, {
          ...ctx,
          column: "id",
        });
        return;
      }
      if (!idMap.has(parsed)) {
        fail(
          "idNotFound",
          `id ${parsed} 인 행이 DB 에 없습니다(다른 관리자가 삭제했을 수 있습니다). 신규 등록하려면 id 를 비워 주세요.`,
          { ...ctx, column: "id" },
        );
        return;
      }
      existingId = parsed;
    }
    const isInsert = existingId === null;

    // (3) 필수값. is_active 는 parseBooleanCell 이 항상 true/false 를
    // 돌려주므로(fallback true) 필수값 검사 대상이 아니다.
    const missing: string[] = [];
    if (!ctx.cutType) missing.push("컷 종류");
    if (!ctx.universityName) missing.push("대학명");
    // 학과명은 필수다 — 빈 학과명 행은 어떤 학생에게도 매칭되지 않는다.
    // 온보딩이 학과를 필수로 요구하고(Step2/3UpperUniversity), 확률 조회가
    // 학과명 완전일치라(goalRepo.fetchUniversityCut) 도달 경로가 없다.
    if (!ctx.departmentName) missing.push("학과명");
    if (missing.length) {
      fail(
        "missingRequiredFields",
        `${missing.join(", ")}가 비어 있습니다.`,
        ctx,
      );
      return;
    }

    // (4) cut_type 도메인.
    const cutType = CUT_TYPE_VALUE_BY_LABEL[ctx.cutType as string];
    if (!cutType) {
      fail(
        "invalidCutType",
        `컷 종류 "${ctx.cutType}" 은(는) 허용 값(${Object.keys(CUT_TYPE_VALUE_BY_LABEL).join("|")})이 아닙니다.`,
        { ...ctx, column: "컷 종류" },
      );
      return;
    }

    // (5) 🔴 기존 행의 cut_type 변경 금지 — 폼 경로 validate 규칙 0 과
    // 같은 금지를 엑셀 경로에 건다(명세 §3-D4). 등급 3.2 짜리 행을
    // jungsi 로 바꿔 저장하면 "백분위 3.2" 가 되어 우열이 반전된다.
    if (!isInsert) {
      const dbCutType = idMap.get(existingId as number);
      if (dbCutType && dbCutType !== cutType) {
        fail(
          "cutTypeChanged",
          `id ${existingId} 행의 컷 종류를 ${CUT_TYPE_LABEL_BY_VALUE[dbCutType as CutType] || dbCutType} → ${ctx.cutType} 로 바꿀 수 없습니다. 이 행을 삭제한 뒤 새로 등록해 주세요.`,
          { ...ctx, column: "컷 종류" },
        );
        return;
      }
    }

    // (6) avg_cut — 빈 값은 "컷 미확보"로 허용(null 저장). 0 은 jungsi
    // 스케일에서 합법이므로 numericCellText 로 살려 둔다.
    const range = GOAL_CUT_RANGE[cutType];
    const avgCutText = numericCellText(rowObj.avg_cut);
    let avgCut: number | null = null;
    if (avgCutText) {
      const num = Number(avgCutText);
      if (!Number.isFinite(num)) {
        fail(
          "invalidNumber",
          `컷 값 "${rowObj.avg_cut}" 이(가) 숫자가 아닙니다.`,
          {
            ...ctx,
            column: "컷 값",
          },
        );
        return;
      }
      if (num < range.min || num > range.max) {
        fail(
          "cutScaleOutOfRange",
          `컷 값 ${num} 이(가) 선택한 컷 종류(${range.label})의 범위를 벗어났습니다 — ${range.min} ~ ${range.max} 사이여야 합니다.`,
          { ...ctx, column: "컷 값" },
        );
        return;
      }
      avgCut = num;
    }

    // (7) source_year.
    const sourceYearText = numericCellText(rowObj.source_year);
    let sourceYear: number | null = null;
    if (sourceYearText) {
      const num = Number(sourceYearText);
      if (
        !Number.isInteger(num) ||
        num < SOURCE_YEAR_MIN ||
        num > SOURCE_YEAR_MAX
      ) {
        fail(
          "invalidSourceYear",
          `기준 연도 "${rowObj.source_year}" 는 ${SOURCE_YEAR_MIN}~${SOURCE_YEAR_MAX} 사이 정수여야 합니다.`,
          { ...ctx, column: "기준 연도" },
        );
        return;
      }
      sourceYear = num;
    }

    // (8) 파일 내부 자연키 중복 — goal_university_cuts_name_key 와 동일
    // 축이다. 어드민은 key := name 을 강제하므로 key 축과도 동치다.
    // DB 유일성 위반으로 청크 전체가 롤백되는 것보다 미리보기에서
    // 거부하는 게 낫다.
    const naturalKey = naturalKeyOf(
      cutType,
      ctx.universityName as string,
      ctx.departmentName as string,
    );
    if (seenNaturalKeys.has(naturalKey)) {
      const firstRow = seenNaturalKeys.get(naturalKey) as number;
      fail(
        "duplicateNaturalKey",
        `행 ${firstRow + 1} 과(와) 컷 종류·대학명·학과명이 동일합니다.`,
        ctx,
      );
      return;
    }
    seenNaturalKeys.set(naturalKey, rowIndex);

    const isActive = parseBooleanCell(rowObj.is_active, true);

    // (9) 경고 4종 — 거부는 아니지만 관리자가 확인해야 하는 값.
    if (cutType === "jungsi" && avgCut !== null && avgCut <= 9) {
      warn(
        "jungsiLooksLikeGrade",
        "정시 컷에 9 이하 값이 들어 있습니다. 내신 등급을 잘못 넣은 것은 아닌지 확인해 주세요.",
        { ...ctx, column: "컷 값" },
      );
    }
    if (
      (cutType === "normal" || cutType === "special") &&
      avgCut !== null &&
      avgCut >= 8
    ) {
      warn(
        "naesinCutTooHigh",
        "수시 컷이 8등급 이상입니다 — 값이 맞는지 확인해 주세요.",
        {
          ...ctx,
          column: "컷 값",
        },
      );
    }
    if (avgCut === null) {
      warn(
        "cutMissing",
        "컷 값이 비어 있어 이 조합은 온보딩에서 422로 막힙니다.",
        {
          ...ctx,
          column: "컷 값",
        },
      );
    }
    if (!isActive) {
      warn("inactiveRow", "노출을 끄면 학생 온보딩 목록에서 사라집니다.", {
        ...ctx,
        column: "노출",
      });
    }
    // 출처 셀은 알려진 라벨 2종이 아니면 아래 payload 에서 조용히 'manual'
    // 로 떨어진다. 그 강등은 비가역적이다 — 백필 보존 술어의 첫 항이
    // source='manual' 이라, 오타 하나로 유도 행이 "관리자가 손댄 행"이 되어
    // 이후 백필 재실행에서 영원히 갱신되지 않는다. 거부까지 하지는 않되
    // (명세 §4-2-H-3 의 거부 타입 목록에 없다) 반드시 눈에 띄게 만든다.
    const rawSource = clean(rowObj.source);
    if (rawSource && !SOURCE_VALUE_BY_LABEL[rawSource]) {
      warn(
        "unknownSource",
        `출처 "${rawSource}" 를 알 수 없어 '수기 입력'으로 저장됩니다 — 이 행은 이후 백필 재실행에서 갱신되지 않습니다.`,
        { ...ctx, column: "출처" },
      );
    }

    if (isInsert) willInsert += 1;
    else willUpdate += 1;

    // 🔴 university_key / department_key 는 엑셀 컬럼이 아니라 여기서
    // 표시명을 그대로 복사한다(명세 §3-D5). 두 유일성 인덱스를 동치로
    // 유지해야 upsert 가 안전하다.
    //
    // ⚠ 엑셀 경로는 백필과 달리 is_active / note 를 payload 에 싣는다 —
    // 엑셀은 관리자가 그 값을 명시적으로 편집한 결과이기 때문이다.
    const payload: CutPayload = {
      cut_type: cutType,
      university_key: ctx.universityName as string,
      university_name: ctx.universityName as string,
      department_key: ctx.departmentName as string,
      department_name: ctx.departmentName as string,
      avg_cut: avgCut,
      source: SOURCE_VALUE_BY_LABEL[rawSource] || "manual",
      source_year: sourceYear,
      is_active: isActive,
      note: clean(rowObj.note) || null,
    };
    if (!isInsert) payload.id = existingId as number;
    rows.push(payload);
  });

  return summarize();
}
