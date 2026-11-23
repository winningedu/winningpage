// cutsBulkXlsx.ts 검증.
//
// **DB를 만지지 않는다 — 손으로 만든 픽스처만 쓴다.** 이 lib 은 순수
// 함수뿐이고, 유일한 외부 입력인 existingCutTypeById(Map)도 호출부가
// 주입하므로 DB 없이 전 경로를 덮을 수 있다.

import { expect, test } from "vitest";
import * as XLSX from "xlsx";

import {
  exportGoalUniversityCutRowsToXlsx,
  GOAL_CUT_RANGE,
  GOAL_CUTS_XLSX_HEADERS,
  parseGoalUniversityCutRowsFromXlsx,
  TRUNCATION_MARKER,
} from "./cutsBulkXlsx.ts";

// 헤더 행 + 본문 행(배열)로 workbook 을 만든다. 헤더는 항상 lib 이
// 내보내는 순서를 그대로 쓴다(컬럼 순서 무관 검증은 별도 케이스).
function makeWorkbook(
  bodyRows: unknown[][],
  headers: string[] = [...GOAL_CUTS_XLSX_HEADERS],
) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...bodyRows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "목표관리 대학 컷");
  return workbook;
}

// [id, 컷 종류, 대학명, 학과명, 컷 값, 출처, 기준 연도, 노출, 운영 메모]
function row(overrides: Record<string, unknown> = {}) {
  const base = {
    id: "",
    cutType: "수시 일반",
    university: "가천대",
    department: "간호학과",
    avgCut: 2.5,
    source: "입결정보 유도",
    sourceYear: 2026,
    isActive: "Y",
    note: "",
  };
  const r = { ...base, ...overrides };
  return [
    r.id,
    r.cutType,
    r.university,
    r.department,
    r.avgCut,
    r.source,
    r.sourceYear,
    r.isActive,
    r.note,
  ];
}

function errorTypes(result: { errors: { type: string }[] }) {
  return result.errors.map((e) => e.type);
}
function warningTypes(result: { warnings: { type: string }[] }) {
  return result.warnings.map((w) => w.type);
}

// ---------------------------------------------------------------------
// 1. 왕복(export → parse)
// ---------------------------------------------------------------------

test("왕복 — DB 행을 내보냈다가 그대로 읽으면 payload 가 보존된다", () => {
  const dbRows = [
    {
      id: 11,
      cut_type: "normal",
      university_name: "가천대",
      department_name: "간호학과",
      avg_cut: 2.35,
      source: "admission_results",
      source_year: 2026,
      is_active: true,
      note: "",
    },
    {
      id: 12,
      cut_type: "jungsi",
      university_name: "가천대",
      department_name: "간호학과",
      avg_cut: 87.5,
      source: "manual",
      source_year: 2026,
      is_active: false,
      note: "운영 메모",
    },
  ];
  const { workbook, truncatedCells } =
    exportGoalUniversityCutRowsToXlsx(dbRows);
  expect(truncatedCells.length).toBe(0);

  const result = parseGoalUniversityCutRowsFromXlsx(
    workbook,
    new Map([
      [11, "normal"],
      [12, "jungsi"],
    ]),
  );
  expect(result.errors.length).toBe(0);
  expect(
    result.summary.willUpdate === 2 && result.summary.willInsert === 0,
  ).toBe(true);
  const [a, b] = result.rows;
  if (!a || !b) throw new Error("2행이 보존돼야 한다");
  expect(a.id === 11 && a.cut_type === "normal" && a.avg_cut === 2.35).toBe(
    true,
  );
  expect(
    a.source === "admission_results" &&
      a.source_year === 2026 &&
      a.is_active === true,
  ).toBe(true);
  expect(b.id === 12 && b.cut_type === "jungsi" && b.avg_cut === 87.5).toBe(
    true,
  );
  expect(b.is_active === false && b.note === "운영 메모").toBe(true);
});

test("왕복 — key 2컬럼은 엑셀에 없고 파서가 표시명에서 복사한다(§3-D5)", () => {
  const { workbook } = exportGoalUniversityCutRowsToXlsx([
    {
      id: 1,
      cut_type: "normal",
      university_name: "연세대",
      department_name: "경영학과",
      avg_cut: 1.5,
      source: "manual",
      source_year: 2026,
      is_active: true,
      note: "",
    },
  ]);
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
  const headerRow = grid[0];
  if (!headerRow) throw new Error("헤더 행이 있어야 한다");
  expect(headerRow.includes("university_key")).toBe(false);
  expect(headerRow.includes("department_key")).toBe(false);

  const result = parseGoalUniversityCutRowsFromXlsx(
    workbook,
    new Map([[1, "normal"]]),
  );
  const [payload] = result.rows;
  if (!payload) throw new Error("payload 행이 있어야 한다");
  expect(payload.university_key).toBe("연세대");
  expect(payload.department_key).toBe("경영학과");
});

test("왕복 — 컬럼 순서를 뒤섞어도 헤더 이름으로 매핑된다", () => {
  const headers = [
    "운영 메모",
    "컷 값",
    "대학명",
    "id",
    "학과명",
    "컷 종류",
    "노출",
    "출처",
    "기준 연도",
  ];
  const workbook = makeWorkbook(
    [
      [
        "메모",
        3.1,
        "고려대",
        "",
        "수학과",
        "수시 특목",
        "Y",
        "수기 입력",
        2025,
      ],
    ],
    headers,
  );
  const result = parseGoalUniversityCutRowsFromXlsx(workbook, new Map());
  expect(result.errors.length).toBe(0);
  const [payload] = result.rows;
  if (!payload) throw new Error("payload 행이 있어야 한다");
  expect(payload.cut_type === "special" && payload.avg_cut === 3.1).toBe(true);
  expect(
    payload.university_name === "고려대" &&
      payload.department_name === "수학과",
  ).toBe(true);
  expect(payload.source_year === 2025 && payload.note === "메모").toBe(true);
});

// ---------------------------------------------------------------------
// 2. 🔴 스케일 이원성 (이 도메인의 1순위 사고)
// ---------------------------------------------------------------------

test("cutScaleOutOfRange — 수시에 백분위(87.5)를 넣으면 거부한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: "수시 일반", avgCut: 87.5 })]),
    new Map(),
  );
  expect(errorTypes(result).includes("cutScaleOutOfRange")).toBe(true);
  expect(result.rows.length).toBe(0);
  expect(result.summary.willSkip).toBe(1);
});

test("cutScaleOutOfRange — 정시에 음수/100 초과를 넣으면 거부한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([
      row({ cutType: "정시", avgCut: 101 }),
      row({ cutType: "정시", university: "서울대", avgCut: -1 }),
    ]),
    new Map(),
  );
  expect(
    result.errors.length === 2 &&
      errorTypes(result).every((t) => t === "cutScaleOutOfRange"),
  ).toBe(true);
});

test("jungsiLooksLikeGrade — 정시 컷 3.2 는 거부가 아니라 경고다(백분위 3.2 도 합법)", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: "정시", avgCut: 3.2 })]),
    new Map(),
  );
  expect(result.errors.length).toBe(0);
  expect(warningTypes(result).includes("jungsiLooksLikeGrade")).toBe(true);
  expect(result.rows[0]!.avg_cut).toBe(3.2);
});

test("정시 백분위 0 은 합법 값이라 살아남는다(clean() 오판 회귀 가드)", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: "정시", avgCut: 0 })]),
    new Map(),
  );
  expect(result.errors.length).toBe(0);
  expect(result.rows[0]!.avg_cut).toBe(0);
  expect(warningTypes(result).includes("cutMissing")).toBe(false);
});

test("naesinCutTooHigh — 수시 8.5 등급은 경고, 9 초과는 거부", () => {
  const warnResult = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: 8.5 })]),
    new Map(),
  );
  expect(warningTypes(warnResult).includes("naesinCutTooHigh")).toBe(true);
  expect(warnResult.errors.length).toBe(0);

  const failResult = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: 9.5 })]),
    new Map(),
  );
  expect(errorTypes(failResult).includes("cutScaleOutOfRange")).toBe(true);
});

test("GOAL_CUT_RANGE 가 sql/55 CHECK 와 같은 값이다", () => {
  expect(
    GOAL_CUT_RANGE.normal.min === 1 && GOAL_CUT_RANGE.normal.max === 9,
  ).toBe(true);
  expect(
    GOAL_CUT_RANGE.special.min === 1 && GOAL_CUT_RANGE.special.max === 9,
  ).toBe(true);
  expect(
    GOAL_CUT_RANGE.jungsi.min === 0 && GOAL_CUT_RANGE.jungsi.max === 100,
  ).toBe(true);
});

// ---------------------------------------------------------------------
// 3. 🔴 cut_type 변경 차단
// ---------------------------------------------------------------------

test("cutTypeChanged — id 가 있는 행의 컷 종류를 바꾸면 거부한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: 7, cutType: "정시", avgCut: 80 })]),
    new Map([[7, "normal"]]),
  );
  expect(errorTypes(result).includes("cutTypeChanged")).toBe(true);
  expect(result.rows.length).toBe(0);
});

test("cutTypeChanged — 같은 컷 종류면 통과한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: 7, cutType: "수시 일반", avgCut: 3.3 })]),
    new Map([[7, "normal"]]),
  );
  expect(result.errors.length).toBe(0);
  expect(result.summary.willUpdate).toBe(1);
});

test("신규 등록(id 빈 칸)에는 cutTypeChanged 가 적용되지 않는다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: "", cutType: "정시", avgCut: 80 })]),
    new Map([[7, "normal"]]),
  );
  expect(result.errors.length).toBe(0);
  expect(result.summary.willInsert).toBe(1);
  expect("id" in result.rows[0]!).toBe(false);
});

// ---------------------------------------------------------------------
// 4. id / 필수값 / 도메인
// ---------------------------------------------------------------------

test("idNotFound — DB 에 없는 id 는 거부한다(캐시 없이 매번 조회하는 근거)", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ id: 999 })]),
    new Map([[7, "normal"]]),
  );
  expect(errorTypes(result).includes("idNotFound")).toBe(true);
});

test("invalidId — 정수가 아닌 id 는 거부한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([
      row({ id: "7.5" }),
      row({ id: "abc", university: "서울대" }),
    ]),
    new Map([[7, "normal"]]),
  );
  expect(
    result.errors.length === 2 &&
      errorTypes(result).every((t) => t === "invalidId"),
  ).toBe(true);
});

test("missingRequiredFields — 학과명이 비면 거부한다(빈 학과명은 매칭 불가)", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ department: "" })]),
    new Map(),
  );
  expect(errorTypes(result).includes("missingRequiredFields")).toBe(true);
  expect(result.errors[0]!.reason.includes("학과명")).toBe(true);
});

test("invalidCutType — 3종 밖 라벨은 거부한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ cutType: "수시" })]),
    new Map(),
  );
  expect(errorTypes(result).includes("invalidCutType")).toBe(true);
});

test("invalidNumber / invalidSourceYear", () => {
  const bad = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: "삼점오" })]),
    new Map(),
  );
  expect(errorTypes(bad).includes("invalidNumber")).toBe(true);

  const badYear = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ sourceYear: 20260 })]),
    new Map(),
  );
  expect(errorTypes(badYear).includes("invalidSourceYear")).toBe(true);

  const okYear = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ sourceYear: "" })]),
    new Map(),
  );
  expect(
    okYear.errors.length === 0 && okYear.rows[0]!.source_year === null,
  ).toBe(true);
});

test("duplicateNaturalKey — 파일 안에서 (컷 종류, 대학명, 학과명)이 겹치면 뒤 행을 거부한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: 2.5 }), row({ avgCut: 3.5 })]),
    new Map(),
  );
  expect(errorTypes(result).includes("duplicateNaturalKey")).toBe(true);
  expect(result.rows.length === 1 && result.rows[0]!.avg_cut === 2.5).toBe(
    true,
  );
});

test("컷 종류가 다르면 같은 (대학, 학과)라도 중복이 아니다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([
      row({ cutType: "수시 일반", avgCut: 2.5 }),
      row({ cutType: "수시 특목", avgCut: 2.1 }),
      row({ cutType: "정시", avgCut: 88 }),
    ]),
    new Map(),
  );
  expect(result.errors.length).toBe(0);
  expect(result.rows.length).toBe(3);
});

test("truncatedColumn — 잘림 마커가 있으면 행 전체를 거부한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ note: `긴 메모${TRUNCATION_MARKER}` })]),
    new Map(),
  );
  expect(errorTypes(result).includes("truncatedColumn")).toBe(true);
});

test("sheetNotFound — 시트가 없으면 즉시 반환한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    { SheetNames: [], Sheets: {} },
    new Map(),
  );
  expect(errorTypes(result).includes("sheetNotFound")).toBe(true);
  expect(result.rows.length).toBe(0);
});

// ---------------------------------------------------------------------
// 5. 경고 / 빈 값 / 요약
// ---------------------------------------------------------------------

test("unknownSource — 알 수 없는 출처는 경고를 남기고 manual 로 저장된다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ source: "입결정보유도" })]), // 공백 하나 빠진 오타
    new Map(),
  );
  expect(result.errors.length).toBe(0);
  expect(warningTypes(result).includes("unknownSource")).toBe(true);
  expect(result.rows[0]!.source).toBe("manual");
});

test("알려진 출처 라벨과 빈 출처는 unknownSource 경고를 내지 않는다", () => {
  const known = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([
      row({ source: "입결정보 유도" }),
      row({ university: "서울대", source: "수기 입력" }),
    ]),
    new Map(),
  );
  expect(warningTypes(known).includes("unknownSource")).toBe(false);
  expect(
    known.rows[0]!.source === "admission_results" &&
      known.rows[1]!.source === "manual",
  ).toBe(true);

  const blank = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ source: "" })]),
    new Map(),
  );
  expect(warningTypes(blank).includes("unknownSource")).toBe(false);
  expect(blank.rows[0]!.source).toBe("manual");
});

test("cutMissing / inactiveRow 경고", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row({ avgCut: "", isActive: "N" })]),
    new Map(),
  );
  expect(result.errors.length).toBe(0);
  expect(warningTypes(result).includes("cutMissing")).toBe(true);
  expect(warningTypes(result).includes("inactiveRow")).toBe(true);
  expect(result.rows[0]!.avg_cut).toBe(null);
  expect(result.rows[0]!.is_active).toBe(false);
});

test("완전히 빈 행은 조용히 건너뛴다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([row(), ["", "", "", "", "", "", "", "", ""], []]),
    new Map(),
  );
  expect(result.errors.length).toBe(0);
  expect(result.rows.length).toBe(1);
});

test("summary 집계가 rows/errors/warnings 와 일치한다", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([
      row({ id: 7, avgCut: 3.3 }), // update
      row({ university: "서울대", avgCut: 1.2 }), // insert
      row({ university: "고려대", avgCut: 99 }), // 거부(범위 밖)
      row({ university: "한양대", cutType: "정시", avgCut: 5 }), // insert + 경고
    ]),
    new Map([[7, "normal"]]),
  );
  expect(result.summary.willUpdate).toBe(1);
  expect(result.summary.willInsert).toBe(2);
  expect(result.summary.willSkip).toBe(1);
  expect(result.rows.length).toBe(3);
  expect(result.summary.errorCounts.cutScaleOutOfRange).toBe(1);
  expect(result.summary.warningCounts.jungsiLooksLikeGrade).toBe(1);
});

test("insert 배치와 update 배치의 키 집합이 각각 균일하다(PostgREST 키집합 해석 방어)", () => {
  const result = parseGoalUniversityCutRowsFromXlsx(
    makeWorkbook([
      row({ id: 7, avgCut: 3.3 }),
      row({ id: 8, university: "서울대", avgCut: 1.2 }),
      row({ university: "고려대", avgCut: 2.2 }),
      row({ university: "한양대", avgCut: 2.4 }),
    ]),
    new Map([
      [7, "normal"],
      [8, "normal"],
    ]),
  );
  const inserts = result.rows.filter((r) => !("id" in r));
  const updates = result.rows.filter((r) => "id" in r);
  expect(inserts.length === 2 && updates.length === 2).toBe(true);
  const keysOf = (r: Record<string, unknown>) =>
    Object.keys(r).sort().join(",");
  expect(new Set(inserts.map(keysOf)).size).toBe(1);
  expect(new Set(updates.map(keysOf)).size).toBe(1);
});
