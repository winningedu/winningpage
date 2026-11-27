// =====================================================================
// src/lib/admissionBulkXlsx.js(exportAdmissionRowsToXlsx/
// parseAdmissionRowsFromXlsx) 검증 스크립트.
//
// **읽기 전용 — DB에 쓰지 않는다.** DB에서 218행을 읽어 왕복(내보내기→
// 가져오기)이 원본과 같은지 확인하고, 나머지는 전부 합성 데이터로
// 검증한다(잘림 마커 거부, 신규 연도/신규 대학 insert 분류, 회귀 가드,
// 필수값 누락 에러).
//
// 사용법: node scripts/verify-admission-bulk-xlsx.mjs [--keys-file <path>]
// 종료 코드: 전부 통과하면 0, 하나라도 실패하면 1.
//
// 키 조회 순서(하드코딩 금지) — scripts/load-admission-content.mjs와 동일:
//   1) SEED_SUPABASE_URL / SEED_SECRET_KEY 환경변수
//   2) --keys-file <path>
//   3) 기본값: 저장소 루트의 .dev-keys.json (gitignore 처리됨,
//      SEED_KEYS_FILE 로 재지정 가능)
// =====================================================================

import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

import {
  ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS,
  exportAdmissionRowsToXlsx,
  parseAdmissionRowsFromXlsx,
  TRUNCATION_MARKER,
} from "../src/lib/admissionBulkXlsx.js";
import { HWP_SECTION_JSON_KEYS } from "../src/lib/admissionDoc.ts";
import { clean } from "../src/lib/admissionParsing.js";

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const DEFAULT_KEYS_FILE = fileURLToPath(
  new URL("../.dev-keys.json", import.meta.url),
);
const MIGRATIONS_DIR = new URL("../supabase/migrations/", import.meta.url);
const TABLE = "admission_university_resources";
const JSON_COLUMNS = Object.values(HWP_SECTION_JSON_KEYS);
// admissionBulkXlsx.js는 CATEGORY_KEYS를 export하지 않는다 —
// HWP_SECTION_JSON_KEYS의 키가 곧 6개 raw 카테고리 컬럼명과 같다
// (admissionDoc.js 참고).
const CATEGORY_RAW_KEYS = Object.keys(HWP_SECTION_JSON_KEYS);

/**
 * admission_university_resources 조회 행. 동적 select(selectColumns)라
 * supabase-js가 이 쿼리 결과를 GenericStringError로 추론한다. 이 스크립트
 * 전역에서 dot 접근하는 컬럼을 명시하고, exportAdmissionRowsToXlsx /
 * buildExistingRowsMap이 요구하는 Record<string, unknown>도 인덱스
 * 시그니처로 그대로 만족시킨다(나머지 컬럼은 기존처럼 동적 키로 접근).
 * recruitment_quota_json은 생성 타입에서 Json | null이지만, 이 파일은
 * blocks 구조를 다루는 도메인 타입(AdmissionDoc)으로 다뤄야 해서 Pick 대신
 * 명시 override로 유지한다.
 */
/** @typedef {import("../src/types/database.types.ts").Tables<"admission_university_resources">} ResourceTableRow */
/**
 * @typedef {Pick<ResourceTableRow, "id" | "admission_year" | "university_name" | "university_key" | "region" | "recruitment_quota"> & {
 *   recruitment_quota_json: import("../src/lib/admissionDoc.ts").AdmissionDoc | null,
 * } & Record<string, unknown>} ResourceRow
 */

let failCount = 0;
let passCount = 0;

function check(name, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`PASS - ${name}`);
  } catch (err) {
    failCount += 1;
    console.log(`FAIL - ${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * noUncheckedIndexedAccess 하에서 `arr[i]`가 `T | undefined`가 되는 지점 중,
 * 직전 length 검사(예: `assert(rows.length === 1, ...)`)로 실존이 보장되는
 * 곳에서만 쓰는 도달 불가 가드. 실제로 undefined면 그 자체가 이 스크립트의
 * 전제가 깨진 것이므로 즉시 에러로 드러낸다(원래 로직은 절대 안 탄다).
 * @template T
 * @param {readonly T[]} arr
 * @param {number} index
 * @param {string} label
 * @returns {T}
 */
function at(arr, index, label) {
  const value = arr[index];
  if (value === undefined) {
    throw new Error(`${label}[${index}]이 undefined입니다(예상치 못한 상태)`);
  }
  return value;
}

function docHasBlocks(doc) {
  return Boolean(doc && Array.isArray(doc.blocks) && doc.blocks.length);
}

function hasChipsBlocks(doc) {
  if (!doc || !Array.isArray(doc.blocks)) return false;
  return doc.blocks.some(
    (block) =>
      block.kind === "table" &&
      Array.isArray(block.rows) &&
      block.rows.some((row) =>
        row.some(
          (cell) =>
            cell && typeof cell === "object" && Array.isArray(cell.chips),
        ),
      ),
  );
}

async function resolveCredentials(keysFile) {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SECRET_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };
  const raw = JSON.parse(await readFile(keysFile, "utf-8"));
  const serviceEntry = raw.find((entry) => entry.name === "service_role");
  if (!serviceEntry)
    throw new Error(`${keysFile}에서 service_role 키를 찾을 수 없습니다.`);
  return {
    url: `https://${DEV_PROJECT_REF}.supabase.co`,
    serviceKey: serviceEntry.api_key,
  };
}

function buildExistingRowsMap(dbRows) {
  const map = new Map();
  dbRows.forEach((row) => {
    const key = `${row.admission_year}::${row.university_key}`;
    const entry = { id: row.id };
    JSON_COLUMNS.forEach((col) => {
      entry[col] = row[col];
    });
    // "업로드 raw == 기존 DB raw" 1차 판정 비교에 쓴다(admissionBulkXlsx.js
    // 의 existingRows 계약 — raw 카테고리 컬럼도 포함해야 한다).
    // ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS에 이미 포함된 컬럼이라 dbRows select에는 추가
    // 컬럼이 필요 없다(1번 섹션의 selectColumns 참고).
    CATEGORY_RAW_KEYS.forEach((col) => {
      entry[col] = row[col];
    });
    map.set(key, entry);
  });
  return map;
}

// 워크북을 XLSX.write로 버퍼화한 뒤 다시 XLSX.read로 읽어, "실제 파일을
// 내려받았다가 다시 올리는" 왕복과 최대한 가깝게 만든다(메모리상 workbook
// 객체를 그대로 재사용하면 셀 타입 변환 등 실제 파일 IO에서만 드러나는
// 문제를 놓칠 수 있다).
// doc 안의 chips 셀({chips:[{label,value}]}, recruit variant 값 셀)을
// block/row/cell 등장 순서 그대로 펼친다. stableStringifyDoc(deep 비교,
// generatedAt 제외)와 별개로, "chips 배열의 순서·개수·내용이 보존되는가"
// 라는 team-lead의 구체 요구를 doc 구조와 무관하게 직접 확인하기 위한
// 전용 비교용이다(예: 열/행이 통째로 하나 빠져도 stableStringifyDoc은
// 당연히 잡지만, 이 함수는 그 실패를 "몇 번째 칩이 다른가"까지 바로
// 보여준다).
function extractChipsSequence(doc) {
  const sequence = [];
  if (!doc || !Array.isArray(doc.blocks)) return sequence;
  doc.blocks.forEach((block, blockIdx) => {
    if (block.kind !== "table" || !Array.isArray(block.rows)) return;
    block.rows.forEach((row, rowIdx) => {
      row.forEach((cell, cellIdx) => {
        if (cell && typeof cell === "object" && Array.isArray(cell.chips)) {
          cell.chips.forEach((chip, chipIdx) => {
            sequence.push({
              blockIdx,
              rowIdx,
              cellIdx,
              chipIdx,
              label: chip.label ?? null,
              value: chip.value ?? null,
            });
          });
        }
      });
    });
  });
  return sequence;
}

function roundTripWorkbook(workbook) {
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  return XLSX.read(buffer, { type: "buffer" });
}

// admission_university_resources의 NOT NULL 컬럼 목록을 supabase/migrations/
// 에서 CREATE TABLE 정의를 가진 마이그레이션 파일(pg_dump 산출물)을 찾아
// 직접 읽는다. 마이그레이션 squash로 그 파일 이름이 바뀌므로 이름을
// 고정하지 않고, 파일명 오름차순으로 마커를 처음 포함하는 파일을 쓴다
// (하드코딩 회피 — team-lead 지시). information_schema 조회(실제 dev DB에
// 쿼리)가 더 권위 있는 소스이지만, 이 테이블은 baseline 이후 NOT NULL을
// 바꾼 마이그레이션이 없어(supabase/migrations 전체 grep 확인) CREATE TABLE
// 시점 정의가 곧 현재 제약과 같다. 파일 파싱이 DB 왕복 없이 더 빠르다.
//
// 2026-08-21 sql/ 디렉터리 폐기 → supabase CLI 마이그레이션 전환 이후
// 옛 경로(sql/00_base_schema.sql)를 읽던 이 함수가 ENOENT로 죽어 있었다
// (npm run verify가 CI에 없어 2026-09-01 첫 야간 감사에서 발견).
async function getNotNullColumnsFromSchema() {
  // 정확히 이 테이블만 잡는다(끝에 닫는 따옴표가 바로 오는지 확인) —
  // admission_university_resources_backup_* 같은 백업 테이블은 이름이 더
  // 길어 이 마커와 매칭되지 않는다. pg_dump는 식별자를 전부 따옴표로 감싼다.
  const startMarker =
    'CREATE TABLE IF NOT EXISTS "public"."admission_university_resources" (';
  const fileNames = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let sql = "";
  let startIdx = -1;
  for (const name of fileNames) {
    sql = await readFile(new URL(name, MIGRATIONS_DIR), "utf-8");
    startIdx = sql.indexOf(startMarker);
    if (startIdx !== -1) break;
  }
  if (startIdx === -1) {
    throw new Error(
      `${MIGRATIONS_DIR.pathname}에서 admission_university_resources 테이블 정의를 못 찾음`,
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
  const notNullColumns = [];
  body.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toLowerCase().startsWith("constraint")) return;
    if (/\bNOT NULL\b/i.test(trimmed)) {
      // pg_dump 형식: `"column_name" "type" ... NOT NULL,` — 따옴표를 벗긴다.
      // trimmed는 위에서 비어있지 않음을 확인했으므로 split(/\s+/)[0]은
      // 항상 존재한다(도달 불가 가드).
      const firstToken = trimmed.split(/\s+/)[0];
      if (firstToken === undefined) {
        throw new Error(`NOT NULL 컬럼 줄 파싱 실패(빈 토큰): "${trimmed}"`);
      }
      notNullColumns.push(firstToken.replace(/^"|"$/g, ""));
    }
  });
  return notNullColumns;
}

// payload 행 배열이 NOT NULL 컬럼을 위반하지 않는지 검사한다. 이
// 라이브러리가 아예 안 건드리는 컬럼(예: created_at/updated_at, insert
// 시의 id — 코드 주석상 "DB가 관리")은 payload에 키 자체가 없으므로
// 검사 대상에서 자연히 빠진다(hasOwnProperty로 존재하는 키만 검사) —
// 이게 실제 upsert 동작과 같다: 키가 없으면 DB 기본값/기존 값에
// 위임되고, 키가 있는데 값이 null이면 그 즉시 upsert가 제약 위반으로
// 실패한다(2026-08-10 결함이 정확히 이 케이스였다).
function assertNotNullColumnsSatisfied(rows, notNullColumns) {
  const violations = [];
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

async function main() {
  const { values: args } = parseArgs({
    options: { "keys-file": { type: "string" } },
  });
  const keysFile =
    args["keys-file"] || process.env.SEED_KEYS_FILE || DEFAULT_KEYS_FILE;
  const { url, serviceKey } = await resolveCredentials(keysFile);
  if (!url.includes(DEV_PROJECT_REF))
    throw new Error("dev 프로젝트가 아닙니다. 중단합니다.");
  const supabase = createClient(url, serviceKey);

  const notNullColumns = await getNotNullColumnsFromSchema();
  console.log(
    `admission_university_resources NOT NULL 컬럼(baseline 마이그레이션 실측): ${notNullColumns.join(", ")}`,
  );

  console.log("=== 1) DB 조회(읽기 전용) ===");
  const selectColumns = [
    ...ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS,
    ...JSON_COLUMNS,
  ].join(", ");
  const { data: rawDbRows, error } = await supabase
    .from(TABLE)
    .select(selectColumns)
    .order("id");
  if (error) throw new Error(`DB 조회 실패: ${error.message}`);
  const dbRows = /** @type {ResourceRow[]} */ (
    /** @type {unknown} */ (rawDbRows)
  );
  console.log(`대상: ${dbRows.length}행`);

  const existingRows = buildExistingRowsMap(dbRows);

  // === 2) 왕복(내보내기→파일 IO 왕복→가져오기) — 핵심 불변식: raw가 안
  // 바뀌면 카테고리 전부 안 바뀐다(2026-08-07 재설계, html 3종 제외 +
  // raw 비교 1차 판정). 이 왕복은 raw 텍스트를 조금도 바꾸지 않으므로
  // (내보내기→파일 IO→가져오기는 문자열을 그대로 실어 나른다), 기존
  // doc이 있는 카테고리는 전부 'rawUnchangedPreserved'로 보존돼야 하고
  // warnings는 0건이어야 한다. 이게 team-lead가 지정한 "제일 중요한
  // 테스트"다.
  console.log(
    "\n=== 2) 왕복 검증(불변식: raw 안 바뀌면 카테고리 전부 안 바뀜) ===",
  );
  const { workbook, truncatedCells } = exportAdmissionRowsToXlsx(dbRows);
  console.log(
    `내보내기 완료: 잘린 셀 ${truncatedCells.length}건(html 3종 제외 후 실측상 0건이어야 함)`,
  );
  if (truncatedCells.length) {
    console.log("  잘린 셀 샘플(최대 5건):");
    truncatedCells.slice(0, 5).forEach((c) => {
      console.log(
        `    - id=${c.id} row=${c.rowIndex} col=${c.column} 원래길이=${c.originalLength}`,
      );
    });
  }

  const roundTripped = roundTripWorkbook(workbook);
  const {
    rows: parsedRows,
    errors: parseErrors,
    warnings: parseWarnings,
    summary,
  } = parseAdmissionRowsFromXlsx(roundTripped, existingRows);

  check(
    "왕복: 잘림 0건(html 3종을 포맷에서 뺀 뒤 가장 긴 콘텐츠 컬럼도 32,767자 근처도 안 감)",
    () => {
      assert(
        truncatedCells.length === 0,
        `내보내기 시점에 잘린 셀이 있음(${truncatedCells.length}건)`,
      );
      assert(
        summary.truncatedCellSkipCount === 0,
        `summary.truncatedCellSkipCount가 0이 아님(${summary.truncatedCellSkipCount})`,
      );
    },
  );

  check(
    "왕복: 행 전체 거부 0건, 218행 전부 update로 분류, 신규 연도/대학 0건",
    () => {
      assert(
        parseErrors.length === 0,
        `에러 ${parseErrors.length}건: ${JSON.stringify(parseErrors.slice(0, 3))}`,
      );
      assert(
        summary.willInsert === 0,
        `willInsert가 0이 아님: ${summary.willInsert}`,
      );
      assert(
        summary.willUpdate === dbRows.length,
        `willUpdate(${summary.willUpdate}) !== 기대치(${dbRows.length})`,
      );
      assert(
        summary.willSkip === 0,
        `willSkip이 0이 아님: ${summary.willSkip}`,
      );
      assert(
        summary.newYears.length === 0,
        `newYears가 비어 있어야 함: ${summary.newYears}`,
      );
      assert(
        parsedRows.length === dbRows.length,
        `parsedRows(${parsedRows.length}) !== 원본(${dbRows.length})`,
      );
    },
  );

  check(
    "왕복(핵심 불변식): warnings 0건 — raw가 하나도 안 바뀐 왕복이라 어떤 카테고리도 재생성되면 안 됨",
    () => {
      assert(
        parseWarnings.length === 0,
        `raw가 안 바뀐 왕복인데 경고가 ${parseWarnings.length}건 남음(유형별: ${JSON.stringify(summary.warningCounts)})`,
      );
      const parsedByKey = new Map(
        parsedRows.map((r) => [`${r.admission_year}::${r.university_key}`, r]),
      );
      let regeneratedCount = 0;
      const regeneratedDetails = [];
      dbRows.forEach((original) => {
        const key = `${original.admission_year}::${original.university_key}`;
        const parsed = parsedByKey.get(key);
        if (!parsed) return; // 다음 check가 별도로 잡는다.
        JSON_COLUMNS.forEach((jsonCol) => {
          const hadOriginal = docHasBlocks(original[jsonCol]);
          const hasParsed = jsonCol in parsed;
          // hadOriginal이면 raw 불변이니 무조건 보존(hasParsed===false)
          // 이어야 한다. !hadOriginal인데 hasParsed면(빈 카테고리에 값이
          // 생김) 그것도 왕복에서 나오면 안 된다 — raw 자체가 안 바뀌었기
          // 때문이다.
          if (hadOriginal === hasParsed) return; // 둘 다 true거나 둘 다 false면 정상(전자는 사실 아래서 걸러짐)
          if (hadOriginal && hasParsed) {
            regeneratedCount += 1;
            if (regeneratedDetails.length < 5)
              regeneratedDetails.push(`${key}/${jsonCol}`);
          }
          if (!hadOriginal && hasParsed) {
            regeneratedCount += 1;
            if (regeneratedDetails.length < 5)
              regeneratedDetails.push(`${key}/${jsonCol}(신규 생성)`);
          }
        });
      });
      assert(
        regeneratedCount === 0,
        `raw가 안 바뀌었는데 doc 유무가 바뀐 카테고리: ${regeneratedCount}건(샘플: ${regeneratedDetails.join(", ")})`,
      );
    },
  );

  const parsedByKey = new Map(
    parsedRows.map((r) => [`${r.admission_year}::${r.university_key}`, r]),
  );
  let mismatchCount = 0;
  let checkedRows = 0;
  dbRows.forEach((original) => {
    const key = `${original.admission_year}::${original.university_key}`;
    const parsed = parsedByKey.get(key);
    if (!parsed) {
      mismatchCount += 1;
      return;
    }
    checkedRows += 1;
    if (
      parsed.university_name !== original.university_name ||
      parsed.region !== (original.region || null) ||
      Number(parsed.admission_year) !== original.admission_year
    ) {
      mismatchCount += 1;
    }
  });

  check(
    "왕복: 메타 필드(university_name/region/admission_year) 불일치 0건",
    () => {
      assert(
        mismatchCount === 0,
        `${mismatchCount}건 불일치(검사 대상 ${checkedRows}행 중)`,
      );
    },
  );

  // 2026-08-10 결함 재현 테스트: team-lead 실측(우리가 내보낸 파일을
  // 그대로 재업로드해도 실패)이 정확히 이 218행 왕복이었다 — 실제 DB의
  // source_name/source_version이 218/218 빈 문자열이라 이 왕복이 그
  // 케이스를 자연히 포함한다. "null이 아니다" 수준이 아니라 sql/에서
  // 읽은 실제 NOT NULL 컬럼 목록 전체를 기준으로 검사한다(나중에
  // 컬럼이 늘어도 하드코딩 없이 잡힌다).
  check(
    "왕복(핵심 불변식): NOT NULL 컬럼 위반 0건 — 실제 218행을 그대로 재업로드해도 upsert가 죽지 않음",
    () => {
      const violations = assertNotNullColumnsSatisfied(
        parsedRows,
        notNullColumns,
      );
      assert(
        violations.length === 0,
        `NOT NULL 컬럼 위반 ${violations.length}건(샘플: ${violations.slice(0, 5).join(", ")}) — upsert가 "null value in column ... violates not-null constraint"로 죽는다`,
      );
    },
  );

  if (parseWarnings.length) {
    console.log(
      `\n왕복 경고 ${parseWarnings.length}건(최대 10건, 위 불변식 실패 시에만 나타나야 함):`,
    );
    parseWarnings.slice(0, 10).forEach((w) => {
      console.log(
        `  - [${w.universityKey}/${w.admissionYear}] ${w.column || ""}: ${w.reason}`,
      );
    });
  }

  // === 3) 잘림 마커 → 카테고리 단위 스킵(합성, team-lead 지정 케이스 (a)) ===
  console.log("\n=== 3) 잘림 마커 → 카테고리 단위 스킵(합성) ===");
  check(
    "잘린 셀이 1개뿐이면 그 카테고리만 스킵, 나머지 25컬럼/5카테고리는 정상 반영",
    () => {
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const bulletText = "- 항목 1\n- 항목 2";
      const row = header.map((col) => {
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
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const {
        rows,
        errors,
        warnings,
        summary: s,
      } = parseAdmissionRowsFromXlsx(wb, new Map());
      assert(
        errors.length === 0,
        `잘림이 카테고리 하나뿐인데 행 자체가 거부됨(에러 ${errors.length}건)`,
      );
      assert(rows.length === 1, `행이 1개 생성돼야 함(실제 ${rows.length})`);
      assert(
        s.willSkip === 0,
        `willSkip이 0이어야 함(잘림은 willSkip 사유가 아님, 실제 ${s.willSkip})`,
      );
      assert(
        s.truncatedCellSkipCount === 1,
        `truncatedCellSkipCount가 1이어야 함(실제 ${s.truncatedCellSkipCount})`,
      );

      const payload = at(rows, 0, "rows");
      assert(
        payload.university_name === "합성테스트대학교",
        "university_name(메타데이터)이 정상 반영 안 됨",
      );
      assert(payload.region === "서울", "region(메타데이터)이 정상 반영 안 됨");
      assert(
        !("selection_method_json" in payload) &&
          !("selection_method_html" in payload),
        "잘린 카테고리(selection_method)의 json/html이 payload에 그대로 남음",
      );
      [
        "previous_year_changes",
        "minimum_requirements",
        "exam_schedule",
        "school_record_method",
        "recruitment_quota",
      ].forEach((sectionKey) => {
        const jsonCol = HWP_SECTION_JSON_KEYS[sectionKey];
        assert(
          jsonCol in payload && payload[jsonCol],
          `잘리지 않은 카테고리(${sectionKey})가 payload에서 빠짐`,
        );
      });
      const truncationWarning = warnings.find(
        (w) =>
          w.column === "selection_method" &&
          w.reason?.includes("잘림 마커가 있어 기존 값 보존"),
      );
      assert(
        Boolean(truncationWarning),
        "selection_method에 대한 잘림 경고가 없음",
      );
    },
  );

  // === 4) 신규 연도 / 신규 대학 insert 분류 ===
  console.log("\n=== 4) 신규 연도/신규 대학 분류(합성) ===");
  check("완전히 새 연도 → insert + newYears에 포함, 경고 없음", () => {
    const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === "admission_year") return 9999;
      if (col === "university_key") return "brand-new-university";
      if (col === "university_name") return "신규연도대학교";
      if (col === "region") return "서울";
      return "";
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "모집요강");

    const {
      rows,
      warnings,
      summary: s,
    } = parseAdmissionRowsFromXlsx(wb, existingRows);
    assert(rows.length === 1, `행이 1개 생성돼야 함(실제 ${rows.length})`);
    assert(
      s.willInsert === 1 && s.willUpdate === 0,
      `willInsert=1,willUpdate=0이어야 함(실제 ${JSON.stringify(s)})`,
    );
    assert(s.newYears.includes(9999), `newYears에 9999가 없음: ${s.newYears}`);
    assert(
      s.newUniversityCount === 0,
      `완전히 새 연도인데 newUniversityCount가 0이 아님(실제 ${s.newUniversityCount})`,
    );
    const newUniWarnings = warnings.filter((w) =>
      w.reason?.includes("신규 대학 추가"),
    );
    assert(
      newUniWarnings.length === 0,
      '완전히 새 연도인데 "신규 대학 추가" 경고가 나면 안 됨',
    );
  });

  check("이미 아는 연도 + 새 university_key → insert + 경고(오타 방어)", () => {
    const knownYear = dbRows[0]?.admission_year;
    if (knownYear === undefined) {
      throw new Error("DB에서 admission_year 샘플을 못 찾음(선행 조건 실패)");
    }
    const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === "admission_year") return knownYear;
      if (col === "university_key") return "brand-new-university-same-year";
      if (col === "university_name") return "같은연도신규대학교";
      if (col === "region") return "서울";
      return "";
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "모집요강");

    const { warnings, summary: s } = parseAdmissionRowsFromXlsx(
      wb,
      existingRows,
    );
    assert(s.willInsert === 1, `willInsert=1이어야 함(실제 ${s.willInsert})`);
    assert(
      !s.newYears.includes(knownYear),
      `이미 아는 연도가 newYears에 잘못 들어감: ${s.newYears}`,
    );
    assert(
      s.newUniversityCount === 1,
      `summary.newUniversityCount가 1이어야 함(실제 ${s.newUniversityCount})`,
    );
    const newUniWarnings = warnings.filter((w) =>
      w.reason?.includes("신규 대학 추가"),
    );
    assert(
      newUniWarnings.length === 1,
      `"신규 대학 추가" 경고가 정확히 1건이어야 함(실제 ${newUniWarnings.length})`,
    );
  });

  // === 5) 필수값 누락 → 에러 ===
  console.log("\n=== 5) 필수값 누락 → 에러(합성) ===");
  check(
    "admission_year/university_key 누락 행 → 에러 집계, payload 미포함",
    () => {
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const row = header.map((col) =>
        col === "university_name" ? "이름만있음대학교" : "",
      );
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const {
        rows,
        errors,
        summary: s,
      } = parseAdmissionRowsFromXlsx(wb, new Map());
      assert(
        rows.length === 0,
        `payload가 비어 있어야 함(실제 ${rows.length}건)`,
      );
      assert(errors.length === 1, `에러가 1건이어야 함(실제 ${errors.length})`);
      const error0 = at(errors, 0, "errors");
      assert(
        error0.type === "missingRequiredFields",
        `에러 type이 missingRequiredFields여야 함(실제 ${error0.type})`,
      );
      assert(s.willSkip === 1, `willSkip=1이어야 함(실제 ${s.willSkip})`);
      assert(
        s.errorCounts.missingRequiredFields === 1,
        `errorCounts.missingRequiredFields가 1이어야 함(실제 ${s.errorCounts.missingRequiredFields})`,
      );
    },
  );

  // === 6) 회귀 가드 ===
  console.log("\n=== 6) 회귀 가드(합성) ===");
  check("업로드 결과가 기존보다 정보량이 줄면 그 카테고리 통째로 보존", () => {
    const richExistingDoc = {
      v: 1,
      section: "previous_year_changes",
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

    const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
    const row = header.map((col) => {
      if (col === "admission_year") return 2099;
      if (col === "university_key") return "regression-test-university";
      if (col === "university_name") return "회귀테스트대학교";
      if (col === "region") return "서울";
      if (col === "previous_year_changes") return "전년도와 동일";
      return "";
    });
    const ws = XLSX.utils.aoa_to_sheet([header, row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "모집요강");

    const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
    assert(
      rows.length === 1,
      "행 자체는 생성돼야 함(다른 카테고리는 영향 없음)",
    );
    assert(
      at(rows, 0, "rows").previous_year_changes_json === undefined,
      "previous_year_changes_json이 payload에 없어야 함(회귀 가드가 막아야 함)",
    );
    const regressionWarnings = warnings.filter((w) =>
      w.reason?.includes("정보량 감소"),
    );
    assert(regressionWarnings.length >= 1, "정보량 감소 경고가 있어야 함");
  });

  // === 6-1) raw 비교가 1차 판정 기준(합성, 2026-08-07 재설계 — html이
  // 포맷에서 아예 빠졌으므로 아래 4개 테스트는 html을 전혀 쓰지 않는다) ===
  console.log("\n=== 6-1) raw 비교가 1차 판정 기준(합성, html 없는 포맷) ===");

  check(
    "raw 동일(관리자가 안 건드림) → 재생성 시도 없이 기존 값 보존, 경고 없음",
    () => {
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
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const row = header.map((col) => {
        if (col === "admission_year") return 2099;
        if (col === "university_key") return "raw-unchanged-test";
        if (col === "university_name") return "raw동일테스트대학교";
        if (col === "region") return "서울";
        if (col === "minimum_requirements") return sameRawText;
        return "";
      });
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
      assert(rows.length === 1, "행 자체는 생성돼야 함");
      assert(
        at(rows, 0, "rows").minimum_requirements_json === undefined &&
          at(rows, 0, "rows").minimum_requirements_html === undefined,
        "raw가 안 바뀌었는데 재생성돼 payload에 들어감(기존 값 보존이 안 됨)",
      );
      const relatedWarnings = warnings.filter(
        (w) => w.universityKey === "raw-unchanged-test",
      );
      assert(
        relatedWarnings.length === 0,
        `raw 동일인데 경고가 남음(${relatedWarnings.length}건) — "경고 불필요"가 team-lead 명시 요구다`,
      );
    },
  );

  check(
    "raw 변경(의도적 수정, 정보량 증가) → raw에서 재생성 + rawChangedRegenerated 경고 필수(회귀 가드는 안 걸림)",
    () => {
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
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const row = header.map((col) => {
        if (col === "admission_year") return 2099;
        if (col === "university_key") return "raw-changed-test";
        if (col === "university_name") return "raw변경테스트대학교";
        if (col === "region") return "서울";
        if (col === "minimum_requirements") return newRawText;
        return "";
      });
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
      assert(rows.length === 1, "행 자체는 생성돼야 함");
      assert(
        at(rows, 0, "rows").minimum_requirements_json !== undefined,
        "raw를 의도적으로 고쳤는데(정보량도 늘었는데) 재생성이 안 됨",
      );
      const regenWarning = warnings.find(
        (x) => x.type === "rawChangedRegenerated",
      );
      assert(Boolean(regenWarning), "rawChangedRegenerated 타입 경고가 없음");
      const regressionWarning = warnings.find(
        (x) => x.type === "regressionSkipped",
      );
      assert(
        !regressionWarning,
        "회귀 가드가 개입하면 안 되는 케이스인데(정보량이 늘었음) regressionSkipped 경고가 남음",
      );
    },
  );

  check(
    "raw 변경인데 재생성 결과가 기존보다 정보량 감소 → 회귀 가드 우선 적용(rawChangedRegenerated와 중복 없음)",
    () => {
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
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const row = header.map((col) => {
        if (col === "admission_year") return 2099;
        if (col === "university_key")
          return "raw-changed-regression-priority-test";
        if (col === "university_name") return "raw변경회귀우선테스트대학교";
        if (col === "region") return "서울";
        if (col === "minimum_requirements") return newRawText;
        return "";
      });
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
      assert(rows.length === 1, "행 자체는 생성돼야 함");
      assert(
        at(rows, 0, "rows").minimum_requirements_json === undefined,
        "정보량이 줄었는데 회귀 가드가 안 막음",
      );
      const regressionWarning = warnings.find(
        (x) => x.type === "regressionSkipped",
      );
      assert(Boolean(regressionWarning), "regressionSkipped 경고가 있어야 함");
      const regenWarning = warnings.find(
        (x) => x.type === "rawChangedRegenerated",
      );
      assert(
        !regenWarning,
        "회귀 가드와 rawChangedRegenerated 경고가 같은 셀에 중복으로 남음",
      );
    },
  );

  check(
    "기존 doc 없음(신규 카테고리, 비교 대상 없음) → raw에서 그냥 생성, 경고 불필요",
    () => {
      const existing = new Map([
        ["2099::no-existing-doc-test", { id: "fake-id-no-doc" }],
      ]); // json/raw 둘 다 없음
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const row = header.map((col) => {
        if (col === "admission_year") return 2099;
        if (col === "university_key") return "no-existing-doc-test";
        if (col === "university_name") return "신규카테고리테스트대학교";
        if (col === "region") return "서울";
        if (col === "minimum_requirements") return "- 새로 채운 항목";
        return "";
      });
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
      assert(rows.length === 1, "행 자체는 생성돼야 함");
      assert(
        at(rows, 0, "rows").minimum_requirements_json !== undefined,
        "기존 doc이 없고 raw가 있으면 생성돼야 함",
      );
      const relatedWarnings = warnings.filter(
        (w) => w.universityKey === "no-existing-doc-test",
      );
      assert(
        relatedWarnings.length === 0,
        `비교 대상이 없어 경고가 필요 없는데 경고가 남음(${relatedWarnings.length}건)`,
      );
    },
  );

  // === 7) formula injection 방어 — 셀 타입 강제(t:'s')가 값을 하나도
  // 안 바꾸면서 수식으로 해석될 여지를 없애는지 확인한다. dev의
  // csvEscape(선행 작은따옴표 접두사)와 달리 접두사를 안 붙이므로,
  // "붙였다가 못 걷어내서 왕복이 깨지는" 실패 모드 자체가 없다.
  console.log("\n=== 7) formula injection 방어(셀 타입 강제) ===");

  const DANGEROUS_PREFIXES = [
    "=1+1",
    "+41 1234 5678",
    "-학교장추천자, 학교생활우수자, 논술",
    "@SUM(A1)",
    "\t탭 선두",
    "\r캐리지리턴 선두",
  ];

  check(
    "합성: 위험 접두사 셀 전부 t='s'로 강제되고 수식(f) 없음, 값도 원본 그대로",
    () => {
      const syntheticRows = DANGEROUS_PREFIXES.map((value, idx) => ({
        id: `synthetic-${idx}`,
        admission_year: 2027,
        university_key: `formula-test-${idx}`,
        university_name: `수식테스트대학교${idx}`,
        memo: value,
        selection_method: value,
      }));
      const { workbook } = exportAdmissionRowsToXlsx(syntheticRows);
      const sheetName = at(workbook.SheetNames, 0, "workbook.SheetNames");
      const ws = workbook.Sheets[sheetName];
      if (ws === undefined) {
        throw new Error(`workbook.Sheets["${sheetName}"]이 undefined입니다`);
      }

      let formulaCellCount = 0;
      let nonStringTypedCount = 0;
      Object.keys(ws).forEach((addr) => {
        if (addr.startsWith("!")) return;
        const cell = ws[addr];
        if (cell.f !== undefined) formulaCellCount += 1;
        if (typeof cell.v === "string" && cell.t !== "s")
          nonStringTypedCount += 1;
      });
      assert(
        formulaCellCount === 0,
        `수식(f) 프로퍼티를 가진 셀이 있으면 안 됨(실제 ${formulaCellCount}건)`,
      );
      assert(
        nonStringTypedCount === 0,
        `문자열 값인데 t='s'가 아닌 셀이 있으면 안 됨(실제 ${nonStringTypedCount}건)`,
      );

      // 값 자체가 원본과 정확히 동일한지(접두사 미삽입) 확인
      const memoCol = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS.indexOf("memo");
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1 });
      DANGEROUS_PREFIXES.forEach((value, idx) => {
        const cellValue = grid[idx + 1][memoCol];
        assert(
          cellValue === value,
          `memo 셀 값이 원본과 다름(idx=${idx}): 기대="${value}" 실제="${cellValue}"`,
        );
      });
    },
  );

  // === 8) chips 셀(recruit variant) 실데이터 검증 — html 제외 포맷
  // 재설계 후 재검증. dbRows(1번 섹션에서 이미 조회)에서
  // recruitment_quota_json에 chips 셀이 있는 행만 골라 확인한다.
  console.log(
    "\n=== 8) chips 셀(recruit variant) 실데이터 검증(html 제외 포맷) ===",
  );

  const chipsRows = dbRows.filter((row) =>
    hasChipsBlocks(row.recruitment_quota_json),
  );
  console.log(
    `dev DB에서 chips 셀이 있는 행: ${chipsRows.length}건(사전 실측 7건과 비교)`,
  );
  chipsRows.forEach((row) => {
    const seq = extractChipsSequence(row.recruitment_quota_json);
    console.log(
      `  - [${row.university_name}/${row.admission_year}] chips 총 ${seq.length}개, recruitment_quota raw 길이=${(row.recruitment_quota || "").length}`,
    );
  });

  check(
    `chips 셀 실데이터 ${chipsRows.length}건: raw 안 바뀌는 왕복에서 전부 보존됨(재생성 0건, 경고 0건)`,
    () => {
      assert(
        chipsRows.length > 0,
        "chips 셀이 있는 행을 하나도 못 찾음(사전 실측 7건과 다름 — dev DB가 바뀌었을 수 있음)",
      );

      const { workbook: chipsWorkbook, truncatedCells: chipsTruncatedCells } =
        exportAdmissionRowsToXlsx(chipsRows);
      assert(
        chipsTruncatedCells.length === 0,
        `chips 행의 raw 컬럼이 잘림(${chipsTruncatedCells.length}건) — html 제외 전제와 다름`,
      );
      const chipsRoundTripped = roundTripWorkbook(chipsWorkbook);
      const chipsExistingRows = buildExistingRowsMap(chipsRows);
      const { warnings, rows: parsedChipsRows } = parseAdmissionRowsFromXlsx(
        chipsRoundTripped,
        chipsExistingRows,
      );

      const relatedWarnings = warnings.filter((w) =>
        chipsRows.some((r) => r.university_key === w.universityKey),
      );
      assert(
        relatedWarnings.length === 0,
        `raw 안 바뀐 왕복인데 chips 행에 경고가 남음(${relatedWarnings.length}건)`,
      );

      const parsedByKey = new Map(
        parsedChipsRows.map((r) => [
          `${r.admission_year}::${r.university_key}`,
          r,
        ]),
      );
      let regeneratedCount = 0;
      chipsRows.forEach((row) => {
        const key = `${row.admission_year}::${row.university_key}`;
        const parsed = parsedByKey.get(key);
        if (parsed && "recruitment_quota_json" in parsed) regeneratedCount += 1;
      });
      assert(
        regeneratedCount === 0,
        `raw 안 바뀐 chips 행인데 재생성됨(${regeneratedCount}건) — 기존 rich doc이 덮일 위험`,
      );
    },
  );

  // 안전망 확인: chips가 풍부한 카테고리(raw는 429~6,279자인데 doc은
  // 55~1,215개 칩)를 관리자가 raw를 살짝 고치면(=재생성 트리거), plain
  // raw 텍스트에서 admission-recruit-table 구조(칩)를 되살릴 수 없다 —
  // 회귀 가드가 반드시 막아야 한다(정보량이 훨씬 줄 수밖에 없다). 이
  // 안전망이 실제 chips 데이터로도 작동하는지 확인한다. 만에 하나
  // 회귀 가드를 통과하더라도(재생성 결과가 우연히 안 줄었더라도) 최소
  // 조건은 "chips가 보존되거나, 경고 없이 조용히 바뀌지는 않는다"다.
  check(
    "chips 안전망: 실제 chips 행 raw를 살짝 고치면 회귀 가드가 막아 chips가 보존되거나, 반드시 경고가 남음(조용한 손실 없음)",
    () => {
      const sample =
        chipsRows.find((r) => r.university_key === "서경대학교") ||
        chipsRows[0];
      if (sample === undefined) {
        throw new Error("chips 표본을 못 찾음");
      }
      const editedRawText = `${sample.recruitment_quota}\n(관리자가 오타를 고침)`;
      const existing = new Map([
        [
          `${sample.admission_year}::${sample.university_key}`,
          {
            id: sample.id,
            recruitment_quota_json: sample.recruitment_quota_json,
            recruitment_quota: sample.recruitment_quota,
          },
        ],
      ]);
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const row = header.map((col) => {
        if (col === "admission_year") return sample.admission_year;
        if (col === "university_key") return sample.university_key;
        if (col === "university_name") return sample.university_name;
        if (col === "region") return sample.region;
        if (col === "recruitment_quota") return editedRawText;
        return "";
      });
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const { rows, warnings } = parseAdmissionRowsFromXlsx(wb, existing);
      assert(rows.length === 1, "행 자체는 생성돼야 함");
      const beforeChips = extractChipsSequence(sample.recruitment_quota_json);
      console.log(
        `  표본: [${sample.university_name}] 기존 chips ${beforeChips.length}개 → raw 살짝 수정 후 재생성 시도`,
      );

      const rowsAfterEdit0 = at(rows, 0, "rows");
      if (rowsAfterEdit0.recruitment_quota_json !== undefined) {
        // 회귀 가드를 통과했다면(예상 밖 경로) 최소한 chips는 보존돼야
        // 하고, 반드시 경고가 남아야 한다(조용한 교체는 절대 안 됨).
        const afterChips = extractChipsSequence(
          rowsAfterEdit0.recruitment_quota_json,
        );
        const regenWarning = warnings.find(
          (w) => w.type === "rawChangedRegenerated",
        );
        assert(
          Boolean(regenWarning),
          "재생성됐는데 rawChangedRegenerated 경고가 없음(조용한 교체)",
        );
        assert(
          JSON.stringify(beforeChips) === JSON.stringify(afterChips),
          `재생성 후 chips가 달라짐(전 ${beforeChips.length}개 → 후 ${afterChips.length}개) — 경고는 있었지만 손실이 실제로 발생함`,
        );
      } else {
        // 예상 경로: 회귀 가드가 막아 chips가 그대로 보존됨.
        const regressionWarning = warnings.find(
          (w) => w.type === "regressionSkipped",
        );
        assert(
          Boolean(regressionWarning),
          "chips는 보존됐는데 이유(regressionSkipped) 경고가 없음",
        );
      }
    },
  );

  // === 9) NOT NULL 폐쇄 회귀 테스트(합성, 2026-08-10 결함 수정) ===
  // 섹션 2가 실제 218행으로 이미 이 결함을 잡지만, dev DB 데이터가
  // 나중에 정리되면(예: source_name/source_version이 실제 값으로
  // 채워지면) 그 회귀 커버리지가 조용히 사라진다. 아래는 실제 DB
  // 데이터 상태와 무관하게 "NOT NULL 컬럼이 빈 문자열인 행" 형태를
  // 합성으로 고정해 항상 이 결함을 재현·검증한다.
  console.log(
    "\n=== 9) NOT NULL 폐쇄 회귀 테스트(합성, 2026-08-10 결함 수정) ===",
  );

  check(
    "실제 DB 형태(NOT NULL 컬럼이 빈 문자열인 행 포함)를 export→재import해도 NOT NULL 위반 없음(왕복 폐쇄)",
    () => {
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
      const { workbook, truncatedCells } = exportAdmissionRowsToXlsx([
        dbShapedRow,
      ]);
      assert(
        truncatedCells.length === 0,
        "합성 행인데 잘림이 발생함(선행 조건 실패)",
      );
      const roundTripped = roundTripWorkbook(workbook);
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
      const { rows, errors } = parseAdmissionRowsFromXlsx(
        roundTripped,
        existing,
      );
      assert(
        errors.length === 0,
        `합성 행이 거부됨(에러 ${errors.length}건): ${JSON.stringify(errors)}`,
      );
      assert(rows.length === 1, `행이 1개 생성돼야 함(실제 ${rows.length})`);
      const violations = assertNotNullColumnsSatisfied(rows, notNullColumns);
      assert(
        violations.length === 0,
        `NOT NULL 컬럼 위반: ${violations.join(", ")} — 이게 team-lead가 실측한 결함이다(안 고친 행을 그대로 재업로드해도 upsert가 실패)`,
      );
      assert(
        at(rows, 0, "rows").source_name === "",
        `source_name이 ''로 보존돼야 함(실제 ${JSON.stringify(at(rows, 0, "rows").source_name)})`,
      );
      assert(
        at(rows, 0, "rows").source_version === "",
        `source_version이 ''로 보존돼야 함(실제 ${JSON.stringify(at(rows, 0, "rows").source_version)})`,
      );
    },
  );

  check(
    "region이 빈 셀이면 신규/기존 무관하게 행 거부(NOT NULL이고 DB 기본값이 없는 필드 — 조용한 null 삽입 방지)",
    () => {
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const row = header.map((col) => {
        if (col === "admission_year") return 2099;
        if (col === "university_key") return "region-missing-test";
        if (col === "university_name") return "region누락테스트대학교";
        return ""; // region도 비워둠
      });
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const { rows, errors } = parseAdmissionRowsFromXlsx(wb, new Map());
      assert(
        rows.length === 0,
        `region이 비었는데 payload가 생성됨(실제 ${rows.length}건) — NOT NULL 위반 위험`,
      );
      assert(
        errors.length === 1 &&
          at(errors, 0, "errors").type === "missingRequiredFields",
        `region 누락이 missingRequiredFields로 거부돼야 함(실제 ${JSON.stringify(errors[0])})`,
      );
      assert(
        at(errors, 0, "errors").reason.includes("region"),
        `에러 이유에 region이 명시돼야 함(실제 "${at(errors, 0, "errors").reason}")`,
      );
    },
  );

  check(
    "raw 카테고리 컬럼이 기존 DB에서 이미 빈 문자열이면, 안 고친 채 재업로드해도 raw가 ''로 보존됨(null로 바뀌지 않음)",
    () => {
      // 2026-08-10 실측(모집요강_수정본.xlsx 검증 중 발견): 이 6개 raw
      // 컬럼은 nullable이라 upsert가 죽지는 않지만, source_name/
      // source_version과 같은 `|| null` 패턴이 여기도 있어 안 고친 행의
      // raw가 조용히 ''→null로 바뀌었다. dev DB 실측상 11개 행이 이
      // 상태였다(previous_year_changes 등).
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
      const header = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS;
      const row = header.map((col) => {
        if (col === "admission_year") return 2099;
        if (col === "university_key") return "raw-empty-preserved-test";
        if (col === "university_name") return "raw빈값보존테스트대학교";
        if (col === "region") return "서울";
        // minimum_requirements 셀은 비워둔다(기존 DB도 '').
        return "";
      });
      const ws = XLSX.utils.aoa_to_sheet([header, row]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "모집요강");

      const { rows, errors } = parseAdmissionRowsFromXlsx(wb, existing);
      assert(errors.length === 0, `합성 행이 거부됨(에러 ${errors.length}건)`);
      assert(rows.length === 1, `행이 1개 생성돼야 함(실제 ${rows.length})`);
      assert(
        at(rows, 0, "rows").minimum_requirements === "",
        `minimum_requirements가 ''로 보존돼야 함(실제 ${JSON.stringify(at(rows, 0, "rows").minimum_requirements)}) — null로 바뀌면 "안 고친 행은 안 바뀐다" 불변식 위반`,
      );
    },
  );

  await checkFormulaRoundTrip();
  await checkRealFileBackwardCompatibility();

  console.log(
    `\n총 ${passCount + failCount}건 중 ${passCount}건 통과, ${failCount}건 실패.`,
  );
  process.exitCode = failCount ? 1 : 0;

  // 실데이터에서 위험 접두사로 시작하는 셀을 찾아 왕복 검증한다(team-lead
  // 실측 사례 "- 학교장추천자, 학교생활우수자, 논술 …"와 같은 종류가
  // 실제로 존재하는지, 있다면 export→파일 IO 왕복→import 후에도 완전히
  // 동일한지 증명한다).
  async function checkFormulaRoundTrip() {
    const DANGEROUS_PREFIX_RE = /^[=+\-@\t\r]/;
    const textColumns = [
      "previous_year_changes",
      "selection_method",
      "minimum_requirements",
      "exam_schedule",
      "school_record_method",
      "recruitment_quota",
      "memo",
    ];
    let sample = null;
    for (const row of dbRows) {
      for (const col of textColumns) {
        const v = row[col];
        if (typeof v === "string" && DANGEROUS_PREFIX_RE.test(v)) {
          sample = {
            universityKey: row.university_key,
            admissionYear: row.admission_year,
            column: col,
            value: v,
          };
          break;
        }
      }
      if (sample) break;
    }

    if (!sample) {
      console.log(
        "PASS - 실데이터: 위험 접두사(=+-@탭/CR)로 시작하는 셀 없음(합성 테스트로 커버됨)",
      );
      passCount += 1;
      return;
    }

    check(
      `실데이터: [${sample.universityKey}] ${sample.column} 위험 접두사 셀("${sample.value.slice(0, 30)}...") 왕복 무손실`,
      () => {
        const { workbook: singleWb } = exportAdmissionRowsToXlsx([
          {
            id: "x",
            admission_year: sample.admissionYear,
            university_key: sample.universityKey,
            university_name: "x",
            [sample.column]: sample.value,
          },
        ]);
        const buf = XLSX.write(singleWb, { bookType: "xlsx", type: "buffer" });
        const reread = XLSX.read(buf, { type: "buffer" });
        const ws2Name = at(reread.SheetNames, 0, "reread.SheetNames");
        const ws2 = reread.Sheets[ws2Name];
        if (ws2 === undefined) {
          throw new Error(`reread.Sheets["${ws2Name}"]이 undefined입니다`);
        }
        const grid2 = XLSX.utils.sheet_to_json(ws2, { header: 1 });
        const colIdx = ADMISSION_GUIDELINE_BULK_XLSX_COLUMNS.indexOf(
          sample.column,
        );
        assert(
          grid2[1][colIdx] === sample.value,
          `왕복 후 값이 원본과 다름: 기대="${sample.value}" 실제="${grid2[1][colIdx]}"`,
        );
      },
    );
  }

  // team-lead 지정 케이스 (하위호환, 2026-08-07): 사용자 원본 옛 26컬럼
  // 파일(`~/Downloads/모집요강.xlsx`, html 3종 포함)을 새 23컬럼 파서에
  // 그대로 먹여서 (a) 거부 없이 파싱되는지(컬럼이 이름 기반으로 읽혀
  // 옛 html 컬럼은 자연히 무시돼야 한다), (b) raw가 DB와 같은 카테고리는
  // 재생성되지 않고, 다른 곳은 전부 경고를 남기는지(조용한 변경 없음)
  // 확인한다. **원본 파일은 읽기 전용으로만 연다(readFile) — 절대
  // 쓰지 않는다.**
  async function checkRealFileBackwardCompatibility() {
    const originalFilePath = join(homedir(), "Downloads", "모집요강.xlsx");
    let buffer;
    try {
      buffer = await readFile(originalFilePath);
    } catch {
      console.log(
        `PASS - 실파일: ${originalFilePath}가 없어 이 검증은 건너뜀(선택 검증)`,
      );
      passCount += 1;
      return;
    }

    const realWorkbook = XLSX.read(buffer, { type: "buffer" });
    const realSheetName = at(
      realWorkbook.SheetNames,
      0,
      "realWorkbook.SheetNames",
    );
    const realSheet = realWorkbook.Sheets[realSheetName];
    if (realSheet === undefined) {
      throw new Error(
        `realWorkbook.Sheets["${realSheetName}"]이 undefined입니다`,
      );
    }
    const realGrid = XLSX.utils.sheet_to_json(realSheet, { header: 1 });
    const realHeaderCols = Array.isArray(realGrid[0]) ? realGrid[0] : [];
    console.log(
      `실파일 헤더 컬럼 수: ${realHeaderCols.length}(옛 26컬럼 포맷 예상, html 3종 포함 — 새 파서는 23개만 이름으로 찾아 읽는다)`,
    );

    const {
      rows: realParsedRows,
      errors: realErrors,
      warnings: realWarnings,
      summary: realSummary,
    } = parseAdmissionRowsFromXlsx(realWorkbook, existingRows);

    check(
      "실파일(옛 26컬럼, html 포함, 읽기 전용): 거부 없이 파싱됨 — 컬럼 이름 기반이라 html 3종은 자연히 무시됨",
      () => {
        assert(
          realErrors.length === 0,
          `실파일 업로드가 거부됨(에러 ${realErrors.length}건): ${JSON.stringify(realErrors.slice(0, 3))}`,
        );
        assert(
          realParsedRows.length === dbRows.length,
          `파싱된 행 수(${realParsedRows.length}) !== DB 행 수(${dbRows.length})`,
        );
        assert(
          realSummary.truncatedCellSkipCount === 0,
          `실파일 업로드에서 잘림이 발생함(${realSummary.truncatedCellSkipCount}건) — html 제외 포맷에서는 없어야 함`,
        );
      },
    );

    check(
      "실파일: raw가 DB와 동일한 카테고리는 재생성되지 않고(경고 없음), 다른 곳은 전부 경고를 남김(조용한 변경 없음)",
      () => {
        const realParsedByKey = new Map(
          realParsedRows.map((r) => [
            `${r.admission_year}::${r.university_key}`,
            r,
          ]),
        );
        let unchangedButRegeneratedCount = 0;
        let silentRegenCount = 0;
        let changedCount = 0;
        dbRows.forEach((original) => {
          const key = `${original.admission_year}::${original.university_key}`;
          const parsed = realParsedByKey.get(key);
          if (!parsed) return;
          CATEGORY_RAW_KEYS.forEach((sectionKey) => {
            const jsonCol = HWP_SECTION_JSON_KEYS[sectionKey];
            const hadOriginal = docHasBlocks(original[jsonCol]);
            if (!hadOriginal) return; // 비교 대상 없음(정책상 경고 불필요 케이스)
            const dbRawText = clean(original[sectionKey] ?? "");
            // parsed[sectionKey]는 라이브러리가 헤더 이름으로 찾아 이미
            // clean()한 값이다 — 그 값을 그대로 재사용해 실파일의 실제
            // 셀 값과 DB 값을 비교한다.
            const fileRawText = clean(parsed[sectionKey] ?? "");
            const hasParsed = jsonCol in parsed;
            if (fileRawText === dbRawText) {
              if (hasParsed) unchangedButRegeneratedCount += 1;
              return;
            }
            changedCount += 1;
            const hasWarning = realWarnings.some(
              (w) =>
                w.admissionYear === original.admission_year &&
                w.universityKey === original.university_key &&
                w.column === sectionKey,
            );
            if (!hasWarning) silentRegenCount += 1;
          });
        });
        console.log(
          `  실파일 vs DB: raw 값이 다른 카테고리 ${changedCount}건(전부 경고 동반 여부 확인)`,
        );
        assert(
          unchangedButRegeneratedCount === 0,
          `raw가 DB와 동일한데 재생성된 카테고리: ${unchangedButRegeneratedCount}건`,
        );
        assert(
          silentRegenCount === 0,
          `raw가 다른데 경고 없이 처리된 카테고리: ${silentRegenCount}건(조용한 변경)`,
        );
      },
    );
  }
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
