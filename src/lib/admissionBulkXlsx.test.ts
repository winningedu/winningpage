// admissionBulkXlsx.ts(exportAdmissionRowsToXlsx/parseAdmissionRowsFromXlsx)
// 순수/합성 회귀 테스트.
//
// scripts/verify-admission-bulk-xlsx.mjs(원본, DB 조회 포함 1424줄)의
// 섹션 3·4·5·6(+6-1)·7·9만 이식한다 — 이 섹션들은 전부 DB에 손대지
// 않고 합성(가짜) 픽스처만으로 검증 가능하다:
//   3) 잘림 마커 → 카테고리 단위 스킵
//   4) 신규 연도/신규 대학 insert 분류
//   5) 필수값 누락 → 에러
//   6/6-1) raw 비교 1차 판정 + 정보량 감소 회귀 가드
//   7) formula injection 방어(셀 타입 강제)
//   9) NOT NULL 폐쇄 회귀 테스트
//
// 원본 스크립트의 섹션 1·2·8(DB에서 218행을 실제로 읽어 왕복 검증)은
// 이 파일의 범위가 아니다 — scripts/verify-admission-bulk-xlsx.mjs가
// dev DB 대상 감사 도구로 그대로 남아 그 역할을 계속 수행한다(삭제
// 금지, 이 파일과 별개로 계속 수동 실행됨).
//
// 섹션 4의 두 번째 케이스("이미 아는 연도 + 새 university_key")는
// 원본이 `dbRows[0]?.admission_year`로 실제 DB에서 "이미 아는 연도"를
// 얻어 왔지만, parseAdmissionRowsFromXlsx는 그 연도가 실재하는지가
// 아니라 existingRows Map의 키 집합에서만 knownYears를 뽑는다
// (admissionBulkXlsx.ts:knownYears) — 그래서 합성 existingRows에 임의
// 연도(2099) 항목 하나를 심는 것만으로 완전히 동일한 경로를 탄다. DB
// 조회 없이도 검증 대상이 정확히 같다.

import { expect, test } from "vitest";
import * as XLSX from "xlsx";
import {
  exportAdmissionRowsToXlsx,
  parseAdmissionRowsFromXlsx,
  TRUNCATION_MARKER,
} from "./admissionBulkXlsx.ts";
import type { AdmissionDoc } from "./admissionDoc.ts";
import { HWP_SECTION_JSON_KEYS } from "./admissionDoc.ts";

// admissionBulkXlsx.ts는 23컬럼 헤더 배열(ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS)을
// export하지 않는다(내부 상수) — 하드코딩으로 따로 베끼면 원본이 컬럼을
// 추가/변경할 때 이 테스트가 조용히 낡은 헤더로 낚일 수 있어, 빈 배열을
// 넣어 export 함수가 실제로 쓰는 헤더 행을 그대로 읽어 재사용한다.
function bulkXlsxHeader(): string[] {
  const { workbook } = exportAdmissionRowsToXlsx([]);
  const sheetName = workbook.SheetNames[0]!;
  const worksheet = workbook.Sheets[sheetName]!;
  const grid = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
  const header = grid[0];
  if (!header) throw new Error("헤더 행을 못 찾음(선행 조건 실패)");
  return header;
}
const BULK_XLSX_COLUMNS = bulkXlsxHeader();

function buildWorkbook(row: unknown[]) {
  const ws = XLSX.utils.aoa_to_sheet([BULK_XLSX_COLUMNS, row]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "모집요강");
  return wb;
}

// ---------------------------------------------------------------------
// 3) 잘림 마커 → 카테고리 단위 스킵(합성)
// ---------------------------------------------------------------------

test("잘린 셀이 1개뿐이면 그 카테고리만 스킵, 나머지 25컬럼/5카테고리는 정상 반영", () => {
  const bulletText = "- 항목 1\n- 항목 2";
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 2099;
    if (col === "university_key") return "synthetic-truncation-only-column";
    if (col === "university_name") return "합성테스트대학교";
    if (col === "region") return "서울";
    // 잘림 마커가 붙은 카테고리는 selection_method 하나뿐이다 — 이
    // 카테고리만 스킵되고 나머지는 전부 정상 처리돼야 한다.
    if (col === "selection_method") return `일반전형${TRUNCATION_MARKER}`;
    if (col === "previous_year_changes") return bulletText;
    if (col === "minimum_requirements") return bulletText;
    if (col === "exam_schedule") return bulletText;
    if (col === "school_record_method") return bulletText;
    if (col === "recruitment_quota") return bulletText;
    return "";
  });
  const wb = buildWorkbook(row);

  const { rows, errors, warnings, summary } = parseAdmissionRowsFromXlsx(
    wb,
    new Map(),
  );
  expect(errors.length).toBe(0);
  expect(rows.length).toBe(1);
  expect(summary.willSkip).toBe(0);
  expect(summary.truncatedCellSkipCount).toBe(1);

  const payload = rows[0];
  if (!payload) throw new Error("payload가 있어야 한다");
  expect(payload.university_name).toBe("합성테스트대학교");
  expect(payload.region).toBe("서울");
  expect(
    "selection_method_json" in payload || "selection_method_html" in payload,
  ).toBe(false);
  (
    [
      "previous_year_changes",
      "minimum_requirements",
      "exam_schedule",
      "school_record_method",
      "recruitment_quota",
    ] as const
  ).forEach((sectionKey) => {
    const jsonCol = HWP_SECTION_JSON_KEYS[sectionKey];
    expect(jsonCol in payload && Boolean(payload[jsonCol])).toBe(true);
  });
  const truncationWarning = warnings.find(
    (w) =>
      w.column === "selection_method" &&
      w.reason?.includes("잘림 마커가 있어 기존 값 보존"),
  );
  expect(Boolean(truncationWarning)).toBe(true);
});

// ---------------------------------------------------------------------
// 4) 신규 연도 / 신규 대학 insert 분류(합성)
// ---------------------------------------------------------------------

test("완전히 새 연도 → insert + newYears에 포함, 경고 없음", () => {
  // "이미 아는 연도" 하나(2026)를 existingRows에 심어 knownYears를
  // 채우고, 완전히 다른 연도(9999)로 업로드한다.
  const existingRows = new Map([
    ["2026::existing-university", { id: "existing-id" }],
  ]);
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 9999;
    if (col === "university_key") return "brand-new-university";
    if (col === "university_name") return "신규연도대학교";
    if (col === "region") return "서울";
    return "";
  });
  const wb = buildWorkbook(row);

  const { rows, warnings, summary } = parseAdmissionRowsFromXlsx(
    wb,
    existingRows,
  );
  expect(rows.length).toBe(1);
  expect(summary.willInsert).toBe(1);
  expect(summary.willUpdate).toBe(0);
  expect(summary.newYears.includes(9999)).toBe(true);
  expect(summary.newUniversityCount).toBe(0);
  const newUniWarnings = warnings.filter((w) =>
    w.reason?.includes("신규 대학 추가"),
  );
  expect(newUniWarnings.length).toBe(0);
});

test("이미 아는 연도 + 새 university_key → insert + 경고(오타 방어)", () => {
  const knownYear = 2026;
  const existingRows = new Map([
    [`${knownYear}::existing-university`, { id: "existing-id" }],
  ]);
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return knownYear;
    if (col === "university_key") return "brand-new-university-same-year";
    if (col === "university_name") return "같은연도신규대학교";
    if (col === "region") return "서울";
    return "";
  });
  const wb = buildWorkbook(row);

  const { warnings, summary } = parseAdmissionRowsFromXlsx(wb, existingRows);
  expect(summary.willInsert).toBe(1);
  expect(summary.newYears.includes(knownYear)).toBe(false);
  expect(summary.newUniversityCount).toBe(1);
  const newUniWarnings = warnings.filter((w) =>
    w.reason?.includes("신규 대학 추가"),
  );
  expect(newUniWarnings.length).toBe(1);
});

// ---------------------------------------------------------------------
// 5) 필수값 누락 → 에러(합성)
// ---------------------------------------------------------------------

test("admission_year/university_key 누락 행 → 에러 집계, payload 미포함", () => {
  const row = BULK_XLSX_COLUMNS.map((col) =>
    col === "university_name" ? "이름만있음대학교" : "",
  );
  const wb = buildWorkbook(row);

  const { rows, errors, summary } = parseAdmissionRowsFromXlsx(wb, new Map());
  expect(rows.length).toBe(0);
  expect(errors.length).toBe(1);
  expect(errors[0]?.type).toBe("missingRequiredFields");
  expect(summary.willSkip).toBe(1);
  expect(summary.errorCounts.missingRequiredFields).toBe(1);
});

// ---------------------------------------------------------------------
// 6) 회귀 가드(합성)
// ---------------------------------------------------------------------

test("업로드 결과가 기존보다 정보량이 줄면 그 카테고리 통째로 보존", () => {
  const richExistingDoc: AdmissionDoc = {
    v: 1,
    section: "previous_year_changes",
    source: "manual",
    generator: "test",
    generatedAt: new Date().toISOString(),
    blocks: [
      {
        kind: "table",
        variant: "change",
        columns: [
          { role: "no", label: "번호" },
          { role: "title", label: "변경 항목" },
          { role: "content", label: "변경 내용" },
        ],
        rows: [
          ["1", "x".repeat(50), "y".repeat(200)],
          ["2", "x".repeat(50), "y".repeat(200)],
        ],
      },
    ],
  };
  const existing = new Map([
    [
      "2099::regression-test-university",
      { id: "fake-id", previous_year_changes_json: richExistingDoc },
    ],
  ]);

  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 2099;
    if (col === "university_key") return "regression-test-university";
    if (col === "university_name") return "회귀테스트대학교";
    if (col === "region") return "서울";
    if (col === "previous_year_changes") return "전년도와 동일";
    return "";
  });
  const wb = buildWorkbook(row);

  const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
  expect(rows.length).toBe(1);
  expect(rows[0]?.previous_year_changes_json).toBe(undefined);
  const regressionWarnings = warnings.filter((w) =>
    w.reason?.includes("정보량 감소"),
  );
  expect(regressionWarnings.length >= 1).toBe(true);
});

// ---------------------------------------------------------------------
// 6-1) raw 비교가 1차 판정 기준(합성, html 없는 포맷)
// ---------------------------------------------------------------------

test("raw 동일(관리자가 안 건드림) → 재생성 시도 없이 기존 값 보존, 경고 없음", () => {
  const sameRawText = "- 동일 원문 그대로(관리자가 안 건드림)";
  const existing = new Map([
    [
      "2099::raw-unchanged-test",
      {
        id: "fake-id-unchanged",
        minimum_requirements_json: {
          v: 1,
          section: "minimum_requirements",
          blocks: [
            {
              kind: "plainList",
              items: [{ type: "bullet", text: "기존 항목" }],
            },
          ],
        },
        minimum_requirements: sameRawText,
      },
    ],
  ]);
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 2099;
    if (col === "university_key") return "raw-unchanged-test";
    if (col === "university_name") return "raw동일테스트대학교";
    if (col === "region") return "서울";
    if (col === "minimum_requirements") return sameRawText;
    return "";
  });
  const wb = buildWorkbook(row);

  const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
  expect(rows.length).toBe(1);
  expect(
    rows[0]?.minimum_requirements_json === undefined &&
      rows[0]?.minimum_requirements_html === undefined,
  ).toBe(true);
  const relatedWarnings = warnings.filter(
    (w) => w.universityKey === "raw-unchanged-test",
  );
  expect(relatedWarnings.length).toBe(0);
});

test("raw 변경(의도적 수정, 정보량 증가) → raw에서 재생성 + rawChangedRegenerated 경고 필수(회귀 가드는 안 걸림)", () => {
  const oldRawText = "- 기존 원문";
  const newRawText = "- 새 원문 항목 1\n- 새 원문 항목 2\n- 새 원문 항목 3";
  const existing = new Map([
    [
      "2099::raw-changed-test",
      {
        id: "fake-id-changed",
        minimum_requirements_json: {
          v: 1,
          section: "minimum_requirements",
          blocks: [
            {
              kind: "plainList",
              items: [{ type: "bullet", text: "짧은 기존 항목" }],
            },
          ],
        },
        minimum_requirements: oldRawText,
      },
    ],
  ]);
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 2099;
    if (col === "university_key") return "raw-changed-test";
    if (col === "university_name") return "raw변경테스트대학교";
    if (col === "region") return "서울";
    if (col === "minimum_requirements") return newRawText;
    return "";
  });
  const wb = buildWorkbook(row);

  const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
  expect(rows.length).toBe(1);
  expect(rows[0]?.minimum_requirements_json).not.toBe(undefined);
  const regenWarning = warnings.find((x) => x.type === "rawChangedRegenerated");
  expect(Boolean(regenWarning)).toBe(true);
  const regressionWarning = warnings.find(
    (x) => x.type === "regressionSkipped",
  );
  expect(Boolean(regressionWarning)).toBe(false);
});

test("raw 변경인데 재생성 결과가 기존보다 정보량 감소 → 회귀 가드 우선 적용(rawChangedRegenerated와 중복 없음)", () => {
  const oldRawText = "- 기존 원문 A\n- 기존 원문 B\n- 기존 원문 C";
  const newRawText = "- 짧아진 새 원문";
  const richExistingDoc = {
    v: 1,
    section: "minimum_requirements",
    blocks: [
      {
        kind: "plainList",
        items: [
          { type: "bullet", text: "x".repeat(200) },
          { type: "bullet", text: "y".repeat(200) },
          { type: "bullet", text: "z".repeat(200) },
        ],
      },
    ],
  };
  const existing = new Map([
    [
      "2099::raw-changed-regression-priority-test",
      {
        id: "fake-id-regression-priority",
        minimum_requirements_json: richExistingDoc,
        minimum_requirements: oldRawText,
      },
    ],
  ]);
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 2099;
    if (col === "university_key") return "raw-changed-regression-priority-test";
    if (col === "university_name") return "raw변경회귀우선테스트대학교";
    if (col === "region") return "서울";
    if (col === "minimum_requirements") return newRawText;
    return "";
  });
  const wb = buildWorkbook(row);

  const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
  expect(rows.length).toBe(1);
  expect(rows[0]?.minimum_requirements_json).toBe(undefined);
  const regressionWarning = warnings.find(
    (x) => x.type === "regressionSkipped",
  );
  expect(Boolean(regressionWarning)).toBe(true);
  const regenWarning = warnings.find((x) => x.type === "rawChangedRegenerated");
  expect(Boolean(regenWarning)).toBe(false);
});

test("기존 doc 없음(신규 카테고리, 비교 대상 없음) → raw에서 그냥 생성, 경고 불필요", () => {
  const existing = new Map([
    ["2099::no-existing-doc-test", { id: "fake-id-no-doc" }],
  ]); // json/raw 둘 다 없음
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 2099;
    if (col === "university_key") return "no-existing-doc-test";
    if (col === "university_name") return "신규카테고리테스트대학교";
    if (col === "region") return "서울";
    if (col === "minimum_requirements") return "- 새로 채운 항목";
    return "";
  });
  const wb = buildWorkbook(row);

  const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
  expect(rows.length).toBe(1);
  expect(rows[0]?.minimum_requirements_json).not.toBe(undefined);
  const relatedWarnings = warnings.filter(
    (w) => w.universityKey === "no-existing-doc-test",
  );
  expect(relatedWarnings.length).toBe(0);
});

// ---------------------------------------------------------------------
// 7) formula injection 방어(셀 타입 강제)
// ---------------------------------------------------------------------

test("합성: 위험 접두사 셀 전부 t='s'로 강제되고 수식(f) 없음, 값도 원본 그대로", () => {
  const DANGEROUS_PREFIXES = [
    "=1+1",
    "+41 1234 5678",
    "-학교장추천자, 학교생활우수자, 논술",
    "@SUM(A1)",
    "\t탭 선두",
    "\r캐리지리턴 선두",
  ];
  const syntheticRows = DANGEROUS_PREFIXES.map((value, idx) => ({
    id: `synthetic-${idx}`,
    admission_year: 2027,
    university_key: `formula-test-${idx}`,
    university_name: `수식테스트대학교${idx}`,
    memo: value,
    selection_method: value,
  }));
  const { workbook } = exportAdmissionRowsToXlsx(syntheticRows);
  const sheetName = workbook.SheetNames[0]!;
  const ws = workbook.Sheets[sheetName]!;

  let formulaCellCount = 0;
  let nonStringTypedCount = 0;
  Object.keys(ws).forEach((addr) => {
    if (addr.startsWith("!")) return;
    const cellEntry = ws[addr] as XLSX.CellObject;
    if (cellEntry.f !== undefined) formulaCellCount += 1;
    if (typeof cellEntry.v === "string" && cellEntry.t !== "s")
      nonStringTypedCount += 1;
  });
  expect(formulaCellCount).toBe(0);
  expect(nonStringTypedCount).toBe(0);

  // 값 자체가 원본과 정확히 동일한지(접두사 미삽입) 확인
  const memoCol = BULK_XLSX_COLUMNS.indexOf("memo");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  DANGEROUS_PREFIXES.forEach((value, idx) => {
    const dataRow = grid[idx + 1];
    if (!dataRow) throw new Error("데이터 행이 있어야 한다");
    expect(dataRow[memoCol]).toBe(value);
  });
});

// ---------------------------------------------------------------------
// 9) NOT NULL 폐쇄 회귀 테스트(합성, 2026-08-10 결함 수정)
// ---------------------------------------------------------------------
//
// 원본은 sql/00_base_schema.sql을 파싱해 admission_university_resources의
// NOT NULL 컬럼 목록을 얻는다(getNotNullColumnsFromSchema, 하드코딩
// 회피가 team-lead 지시). sql/은 2026-08-21 baseline.sql로 스쿼시됐으므로
// (수동 넘버링 폐기, supabase/README.md) 같은 CREATE TABLE 정의를
// baseline에서 파싱한다. baseline은 pg_dump 산출물이라 구문이 다르다
// (대문자 키워드 + 스키마·컬럼명 전부 큰따옴표: `CREATE TABLE IF NOT EXISTS
// "public"."admission_university_resources" (` / `"id" "uuid" ... NOT NULL,`)
// — 그 두 지점만 파서를 조정했다. 그 헬퍼를 그대로 로컬로 복사한다 — 소스에
// 새 export를 추가하지 않는다.

async function getNotNullColumnsFromSchema(): Promise<string[]> {
  const { readFile, readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const sql = (
    await Promise.all(
      files.map((file) => readFile(join(migrationsDir, file), "utf-8")),
    )
  ).join("\n");
  const startMarker =
    'CREATE TABLE IF NOT EXISTS "public"."admission_university_resources" (';
  const startIdx = sql.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(
      "supabase/migrations에서 admission_university_resources 테이블 정의를 못 찾음",
    );
  }
  const afterStart = sql.slice(startIdx + startMarker.length);
  const endIdx = afterStart.indexOf("\n);");
  if (endIdx === -1) {
    throw new Error(
      'admission_university_resources 테이블 정의의 닫는 괄호(");")를 못 찾음',
    );
  }
  const body = afterStart.slice(0, endIdx);
  const notNullColumns: string[] = [];
  body.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.toLowerCase().startsWith("constraint"))
      return;
    if (/\bNOT NULL\b/i.test(trimmedLine)) {
      const firstToken = trimmedLine.split(/\s+/)[0];
      // baseline 컬럼명은 큰따옴표로 감싸여 있다("source_name") — row 키와
      // 비교하려면 따옴표를 벗겨야 한다.
      const columnName = firstToken?.replace(/^"|"$/g, "");
      if (columnName) notNullColumns.push(columnName);
    }
  });
  return notNullColumns;
}

function assertNotNullColumnsSatisfied(
  rows: Record<string, unknown>[],
  notNullColumns: string[],
): string[] {
  const violations: string[] = [];
  rows.forEach((row, idx) => {
    notNullColumns.forEach((col) => {
      if (!Object.hasOwn(row, col)) return;
      if (row[col] === null || row[col] === undefined) {
        violations.push(`row[${idx}](${row.university_key || "?"}).${col}`);
      }
    });
  });
  return violations;
}

test("실제 DB 형태(NOT NULL 컬럼이 빈 문자열인 행 포함)를 export→재import해도 NOT NULL 위반 없음(왕복 폐쇄)", async () => {
  const notNullColumns = await getNotNullColumnsFromSchema();
  // dev DB 실측(218/218 행)과 동일한 형태: source_name/source_version이
  // 빈 문자열('') — team-lead가 실측한 "우리가 내보낸 파일을 그대로
  // 재업로드해도 실패" 시나리오를 dev DB 상태와 무관하게 고정 재현한다.
  const dbShapedRow = {
    id: "not-null-closure-test-id",
    admission_year: 2099,
    university_key: "not-null-closure-test",
    university_name: "폐쇄테스트대학교",
    region: "서울",
    source_name: "",
    source_version: "",
    campus: null,
    jungsi_guideline_url: null,
    official_source_url: null,
    memo: null,
    is_active: true,
  };
  const { workbook, truncatedCells } = exportAdmissionRowsToXlsx([dbShapedRow]);
  expect(truncatedCells.length).toBe(0);
  const existing = new Map([
    [
      `${dbShapedRow.admission_year}::${dbShapedRow.university_key}`,
      {
        id: dbShapedRow.id,
        region: dbShapedRow.region,
        source_name: dbShapedRow.source_name,
        source_version: dbShapedRow.source_version,
      },
    ],
  ]);
  const { rows, errors } = parseAdmissionRowsFromXlsx(workbook, existing);
  expect(errors.length).toBe(0);
  expect(rows.length).toBe(1);
  const violations = assertNotNullColumnsSatisfied(rows, notNullColumns);
  expect(violations.length).toBe(0);
  expect(rows[0]?.source_name).toBe("");
  expect(rows[0]?.source_version).toBe("");
});

test("region이 빈 셀이면 신규/기존 무관하게 행 거부(NOT NULL이고 DB 기본값이 없는 필드 — 조용한 null 삽입 방지)", () => {
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 2099;
    if (col === "university_key") return "region-missing-test";
    if (col === "university_name") return "region누락테스트대학교";
    return ""; // region도 비워둠
  });
  const wb = buildWorkbook(row);

  const { rows, errors } = parseAdmissionRowsFromXlsx(wb, new Map());
  expect(rows.length).toBe(0);
  expect(
    errors.length === 1 && errors[0]?.type === "missingRequiredFields",
  ).toBe(true);
  expect(errors[0]?.reason?.includes("region")).toBe(true);
});

test("raw 카테고리 컬럼이 기존 DB에서 이미 빈 문자열이면, 안 고친 채 재업로드해도 raw가 ''로 보존됨(null로 바뀌지 않음)", () => {
  const existing = new Map([
    [
      "2099::raw-empty-preserved-test",
      {
        id: "fake-id-raw-empty",
        minimum_requirements_json: undefined,
        minimum_requirements: "",
      },
    ],
  ]);
  const row = BULK_XLSX_COLUMNS.map((col) => {
    if (col === "admission_year") return 2099;
    if (col === "university_key") return "raw-empty-preserved-test";
    if (col === "university_name") return "raw빈값보존테스트대학교";
    if (col === "region") return "서울";
    // minimum_requirements 셀은 비워둔다(기존 DB도 '').
    return "";
  });
  const wb = buildWorkbook(row);

  const { rows, errors } = parseAdmissionRowsFromXlsx(wb, existing);
  expect(errors.length).toBe(0);
  expect(rows.length).toBe(1);
  expect(rows[0]?.minimum_requirements).toBe("");
});
