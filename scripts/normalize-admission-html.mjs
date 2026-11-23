// =====================================================================
// admission_university_resources *_html 컬럼 문자열 정규화 스크립트
//
// 배경: DB 감사(2/2 작업 지시 참고) 결과 raw/html 파이프라인 자체는 218행
// 전 카테고리에서 누락 없이 채워져 있으나, 저장된 HTML 문자열 레벨에서
// CSS로 흡수할 수 없는 4가지 이상이 확인됐다.
//   (b-1) selection_method_html의 admission-minimum-badge("최저" 배지) 값이
//         가운뎃점(·)을 쓰는데, Figma 시안(1882:4934 "최저" 컬럼 sampleValues:
//         "의/약", "의/약/간")은 슬래시(/) 구분자를 쓴다. 배지 스코프에서만
//         ·를 /로 통일한다 — 배지 밖(학과명 등 고유명사, 서술형 문장 연결)은
//         건드리지 않는다(의미 변경 위험 회피, "순수 표기 정규화만" 원칙).
//   (b-2) 가운뎃점 앞/뒤 공백 비대칭(예: "의· 간", "미디어 ·휴먼라이프") 43건.
//         "X · X"(양쪽 공백, 33건 추정)는 감사에서 "정상" 별도 스타일로
//         분류돼 대상에서 제외했다 — 대상은 편측 공백(트레일링/리딩) 43건뿐.
//   (b-3) school_record_method_html에 예외적으로 leak된
//         admission-hwp-section-title div 2건(서울대/한국교원대) 제거.
//   (b-4) 이중 이스케이프 엔티티(&amp;amp; 등)/제어문자/연속 공백(3개 이상)
//         정리 — 감사에서 0건으로 나왔지만 향후 재발 방지 차원에서 파이프라인에
//         포함해둔다(현재 데이터에는 no-op).
//
// (c) 재파싱 필요 항목(예: recruitment_result_html의 legacy
// admission-recruit-table 5개교, 사관학교/경찰대/과학기술원 11개교 5개 카테고리
// 공백)은 이 스크립트의 범위 밖이다 — 절대 수정하지 않고 잔여 목록으로만
// 보고한다.
//
// 안전장치:
//   - 기본값은 dry-run(--apply 없이 실행하면 DB에 아무것도 쓰지 않는다).
//   - 실행 시마다(dry-run 포함) 대상 218행 전체를 고정 경로에 백업 JSON으로
//     기록한다(롤백용, 매 실행 최신값으로 덮어씀).
//   - 모든 변환 함수는 멱등(idempotent) — 이미 정규화된 값은 재실행해도
//     그대로 유지된다. 스크립트가 자체적으로 "정규화(x) 두 번 적용 == 한 번
//     적용" 여부를 검증하고, 위반 시 중단한다.
//   - raw_* 원문 컬럼은 절대 읽지도 쓰지도 않는다(select에도 포함하지 않음).
//
// 사용법:
//   node scripts/normalize-admission-html.mjs                # dry-run(기본)
//   node scripts/normalize-admission-html.mjs --apply         # 실제 UPDATE 적용
//   node scripts/normalize-admission-html.mjs --apply --category selection_method
//
// 키 조회 순서(하드코딩 금지) — scripts/load-admission-content.mjs와 동일 컨벤션:
//   1) SEED_SUPABASE_URL / SEED_SECRET_KEY 환경변수
//   2) --keys-file <path>
//   3) 기본값: scratchpad의 dev-keys.json (SEED_KEYS_FILE 로 재지정 가능)
// =====================================================================

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const DEFAULT_KEYS_FILE =
  "/private/tmp/claude-501/-Users-hyunsoo-uwellnow-winningpage/7d913b11-451e-4002-a293-f999f0a2dad9/scratchpad/dev-keys.json";
// BLOCK6: 이전엔 고정 파일명을 매 실행(dry-run 포함)마다 덮어써서, dry-run 한 번만 더
// 돌려도 직전 실행의 "진짜 UPDATE 이전" 백업이 사라졌다. 세션 scratchpad(휘발성)가 아닌
// 영속 디렉터리에 실행마다 새 타임스탬프 파일로 쓰고, 같은 이름이 이미 있으면(동일 밀리초
// 재실행 등) 무조건 거부한다 — 롤백 수단이 조용히 사라지는 사고를 원천 차단한다.
const DEFAULT_BACKUP_DIR = "/Users/hyunsoo/uwellnow/.admission-html-backups";
const TABLE = "admission_university_resources";

/**
 * admission_university_resources 조회 행. 동적 select라 supabase-js가
 * 이 쿼리 결과를 GenericStringError로 추론한다. dot 접근하는 컬럼만 선언하고,
 * html 컬럼들은 전부 동적 키(row[col])로만 접근하므로(noImplicitAny 꺼짐)
 * 별도 선언 없이 암시적 any로 통과한다.
 * region은 생성 타입에서 non-null(string)이라 기존 로컬 typedef(string | null)를
 * 정본에 맞춰 좁혔다 — 이 파일은 row.region을 dot 접근하지 않는다.
 */
/** @typedef {import("../src/types/database.types.ts").Tables<"admission_university_resources">} ResourceTableRow */
/** @typedef {Pick<ResourceTableRow, "id" | "university_name" | "campus" | "region">} ResourceRow */

// 카테고리 key -> DB html 컬럼 매핑. load-admission-content.mjs와 동일.
const CATEGORY_HTML_KEY = {
  previous_year_changes: "previous_year_changes_html",
  selection_method: "selection_method_html",
  minimum_requirements: "minimum_requirements_html",
  exam_schedule: "exam_schedule_html",
  school_record_method: "school_record_method_html",
  recruitment_quota: "recruitment_result_html",
};
const CATEGORY_KEYS = Object.keys(CATEGORY_HTML_KEY);
const HTML_COLUMNS = Object.values(CATEGORY_HTML_KEY);

// CLI 인자는 main() 안에서만 파싱한다 — 이 모듈의 순수 정규화 함수들을
// 재사용하려고 import만 하는 호출자가 여기 없는 플래그를 쓰면 import
// 시점에 그대로 throw하던 결함(2026-08-06 build-admission-html-golden.mjs
// 사고와 동일 유형)을 막는다.
let args = {};

// -----------------------------------------------------------------------
// 자격증명
// -----------------------------------------------------------------------
async function resolveCredentials() {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SECRET_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };

  const keysFile =
    args["keys-file"] || process.env.SEED_KEYS_FILE || DEFAULT_KEYS_FILE;
  const raw = JSON.parse(await readFile(keysFile, "utf-8"));
  const serviceEntry = raw.find((entry) => entry.name === "service_role");
  if (!serviceEntry)
    throw new Error(`${keysFile}에서 service_role 키를 찾을 수 없습니다.`);
  return {
    url: `https://${DEV_PROJECT_REF}.supabase.co`,
    serviceKey: serviceEntry.api_key,
  };
}

// -----------------------------------------------------------------------
// 백업 파일 경로(BLOCK6)
// -----------------------------------------------------------------------
async function buildTimestampedBackupPath() {
  await mkdir(DEFAULT_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${DEFAULT_BACKUP_DIR}/admission-html-backup-${stamp}.json`;
}

async function assertBackupFileDoesNotExist(path) {
  try {
    await access(path);
  } catch {
    return; // 없으면 정상 — 새로 쓴다.
  }
  throw new Error(
    `백업 파일이 이미 존재합니다: ${path}\n` +
      "기존 백업(롤백 수단)을 덮어쓰지 않기 위해 중단합니다. --backup-file로 다른 경로를 지정하세요.",
  );
}

// -----------------------------------------------------------------------
// 순수 정규화 함수들 (DOM/네트워크 의존 없음, 테스트 가능)
// -----------------------------------------------------------------------

const MIDDLE_DOT = "·"; // ·
const KOR_ALNUM = "[가-힣A-Za-z0-9]";

// (b-1) admission-minimum-badge 스코프에서만 · 변형 전체(공백 유무 무관)를 /로 통일.
// 이 배지("최저" 컬럼 값)는 Figma 1882:4934 sampleValues가 "의/약", "의/약/간" 슬래시
// 표기를 명시하는 유일한 위치라서, 여기서만 구분자 글자 자체를 바꾼다.
const BADGE_SPAN_RE =
  /(<span class="admission-minimum-badge[^"]*">)([\s\S]*?)(<\/span>)/g;
export function normalizeBadgeSeparators(html) {
  return String(html || "").replace(
    BADGE_SPAN_RE,
    (_match, open, inner, close) => {
      const normalizedInner = inner.replace(
        new RegExp(`\\s*${MIDDLE_DOT}\\s*`, "g"),
        "/",
      );
      return open + normalizedInner + close;
    },
  );
}

// (b-2) 배지 밖 · 편측 공백 비대칭만 교정(양쪽 공백 "X · X" 스타일은 감사에서 별도
// 정상 패턴으로 분류돼 대상에서 제외 — 건드리지 않는다). 구분자 글자는 그대로 ·
// 유지, 공백만 제거해 지배적 스타일("X·X", 559건)에 맞춘다.
// WARN18: 원래 뒤쪽 그룹을 캡처·소비했기 때문에 "가· 나· 다"처럼 패턴이 연속되면
// 첫 매치가 "나"까지 소비해버려 그다음 "· 다"는 같은 pass에서 매치되지 못했다(1회
// 적용 후 "가·나· 다", 2회째에야 "가·나·다") — assertIdempotent가 이를 그대로 위반으로
// 잡아낸다. 뒤쪽 글자를 폭 0 lookahead로 바꿔 소비하지 않게 하면 연속 패턴도 한 번의
// replace pass에서 전부 처리되어 멱등성이 보장된다.
const TRAIL_SPACE_RE = new RegExp(
  `(${KOR_ALNUM})${MIDDLE_DOT}\\s+(?=${KOR_ALNUM})`,
  "g",
);
const LEAD_SPACE_RE = new RegExp(
  `(${KOR_ALNUM})\\s+${MIDDLE_DOT}(?=${KOR_ALNUM})`,
  "g",
);
export function normalizeGeneralDotSpacing(html) {
  return String(html || "")
    .replace(TRAIL_SPACE_RE, `$1${MIDDLE_DOT}`)
    .replace(LEAD_SPACE_RE, `$1${MIDDLE_DOT}`);
}

// (b-4-a) 이중 이스케이프 엔티티 정리. 안정될 때까지 반복(&amp;amp;amp; 같은 3중도 처리).
export function normalizeDoubleEscapedEntities(html) {
  let prev;
  let current = String(html || "");
  do {
    prev = current;
    current = current.replace(/&amp;(amp|lt|gt|quot|#39);/g, "&$1;");
  } while (current !== prev);
  return current;
}

// (b-4-b) 제어문자(tab/lf/cr 제외) 제거.
export function stripControlChars(html) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 제어문자 자체를 걸러내는 정규식이라 의도된 사용이다.
  return String(html || "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

// (b-4-c) 연속 공백 3개 이상만 1개로 축소. 2개 공백은 Figma 실측 노트(1882:4934
// "전형방법" 컬럼 "서류 100(4배수)  1단계성적 70 + 면접 30"처럼 의도된 구간 표시일
// 수 있어 건드리지 않는다.
export function collapseExcessiveSpaces(html) {
  return String(html || "").replace(/ {3,}/g, " ");
}

// (b-3) school_record_method_html 전용: leak된 절 제목 div 제거. 이 컬럼은 원래
// admission-hwp-section-title을 쓰지 않는 카테고리라(감사 확인, 207건 중 205건
// 없음) 존재 자체가 파이프라인 일관성 누락이다 — 무조건 제거 대상.
const SCHOOL_RECORD_LEAK_RE =
  /^\s*<div class="admission-hwp-section-title">[^<]*<\/div>\s*/;
export function stripSchoolRecordMethodLeak(html) {
  return String(html || "").replace(SCHOOL_RECORD_LEAK_RE, "");
}

// PUA 탐지 범위. 기존 감사는 BMP PUA(U+E000~U+F8FF)만 확인해 "0건"으로
// 결론냈으나, 이 스크립트로 실측한 결과 selection_method_html의
// "전형방법" 서술(예: "① 서류100(3배수) ② 1단계성적60 + 면접40")에서 보조
// 평면 PUA-A(U+F0000~U+FFFFD) 문자 U+F02CE/U+F02CF가 총 308회(153+155)
// 발견됐다 — 항상 전자가 후자보다 앞에 오고, 91개교 selection_method_html
// 전형방법 셀에서 "1단계"(서류/면접 등) 앞뒤로 반복적으로 등장하는 패턴이
// HWP 원문의 원문자 ①②를 커스텀 폰트 PUA 코드로 내보낸 것과 정확히 일치한다
// (previous_year_changes_html 1건은 "before → after" 비교 셀에서 ②만 재사용된
// 케이스로, 매핑과 모순되지 않음). 판별 근거가 명확하므로 이 두 문자만
// 표준 원문자로 치환하고, 그 외 PUA는 여전히 판별 불가로 보고만 한다.
/** @type {Array<[number, number]>} */
const PUA_RANGES = [
  [0xe000, 0xf8ff], // BMP Private Use Area
  [0xf0000, 0xffffd], // Supplementary Private Use Area-A
  [0x100000, 0x10fffd], // Supplementary Private Use Area-B
];
function isPuaCodePoint(cp) {
  return PUA_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}
const KNOWN_PUA_MAP = {
  "\u{F02CE}": "①",
  "\u{F02CF}": "②",
};

// 판별 가능한(①②로 확인된) PUA 문자만 치환. 나머지는 손대지 않는다.
export function replaceKnownPuaChars(html) {
  let value = String(html || "");
  for (const [puaChar, replacement] of Object.entries(KNOWN_PUA_MAP)) {
    value = value.split(puaChar).join(replacement);
  }
  return value;
}

// 판별된(①②) PUA 문자가 몇 개 있었는지 카운트(치환 전 원본 기준).
export function countKnownPuaChars(html) {
  const text = String(html || "");
  let count = 0;
  for (const puaChar of Object.keys(KNOWN_PUA_MAP)) {
    count += text.split(puaChar).length - 1;
  }
  return count;
}

// 남은(판별 불가) PUA 문자 탐지 — 보고 전용, 절대 치환하지 않는다.
export function detectUnresolvedPuaChars(html) {
  const text = String(html || "");
  let count = 0;
  for (const ch of text) {
    if (isPuaCodePoint(ch.codePointAt(0))) count += 1;
  }
  return count;
}

// 빈 껍데기 표 탐지(표는 있으나 tbody 데이터 행 0개, 또는 전 셀이 '-'/공백뿐).
// 감사 결과 현재 0건 — 발견되면 자동 변형하지 않고 보고만 한다. 이유: 프로젝트의
// "데이터 없음" 표준 표현은 이미 admission-empty-box placeholder div이지 빈
// 문자열이 아니다(예: "수능 최저학력기준 없음"). 진짜 빈 껍데기가 나온다면 그것은
// "정상적인 데이터 없음" 케이스가 아니라 파싱 결손을 의미할 가능성이 높아, 자동으로
// html을 비워 "-" 표시로 만드는 것보다 수동 확인이 더 안전하다.
export function detectEmptyShellTables(html) {
  const text = String(html || "");
  const tableMatches = [...text.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
  const shells = [];
  tableMatches.forEach((m) => {
    const tableInner = m[1] ?? "";
    const rows = [...tableInner.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];
    const tbody = rows[0]?.[1] || "";
    const trCount = (tbody.match(/<tr>/g) || []).length;
    if (trCount === 0) {
      shells.push("tbody 데이터 행 0개");
      return;
    }
    const cellTexts = [...tbody.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      (cm) => (cm[1] ?? "").replace(/<[^>]+>/g, "").trim(),
    );
    const allEmpty =
      cellTexts.length > 0 && cellTexts.every((t) => t === "" || t === "-");
    if (allEmpty) shells.push('전 셀 공백 또는 "-"');
  });
  return shells;
}

// (c) 재파싱 필요 legacy 구조 탐지(수정 대상 아님, 보고 전용).
const LEGACY_RECRUIT_TABLE_RE = /\badmission-recruit-table\b/;
const NORMALIZED_RECRUIT_TABLE_RE = /\badmission-normalized-recruit-table\b/;
export function isLegacyRecruitTable(html) {
  const text = String(html || "");
  return (
    LEGACY_RECRUIT_TABLE_RE.test(text) &&
    !NORMALIZED_RECRUIT_TABLE_RE.test(text)
  );
}

// -----------------------------------------------------------------------
// 컬럼 하나에 적용하는 전체 파이프라인(순서 중요: 배지 슬래시 변환을 먼저 해야
// 배지 안의 ·가 일반 간격 정규화 대상에서 자연히 제외된다).
// -----------------------------------------------------------------------
export function normalizeHtmlValue(html, htmlColumn) {
  let value = String(html || "");
  if (!value) return value;

  value = replaceKnownPuaChars(value);
  value = normalizeBadgeSeparators(value);
  value = normalizeGeneralDotSpacing(value);
  value = normalizeDoubleEscapedEntities(value);
  value = stripControlChars(value);
  value = collapseExcessiveSpaces(value);
  if (htmlColumn === "school_record_method_html") {
    value = stripSchoolRecordMethodLeak(value);
  }
  return value;
}

function assertIdempotent(_original, once, htmlColumn, context) {
  const twice = normalizeHtmlValue(once, htmlColumn);
  if (twice !== once) {
    throw new Error(
      `멱등성 위반: ${context} / ${htmlColumn} — 정규화를 두 번 적용한 결과가 한 번 적용한 결과와 다릅니다.\n` +
        `1회차: ${once.slice(0, 200)}\n2회차: ${twice.slice(0, 200)}`,
    );
  }
}

/**
 * changesByColumn(Record<string, ChangeEntry[]>)처럼 "키 집합을 스스로
 * 만들어놓고 그 키로만 접근"하는 객체에 대한 도달 불가 가드.
 * noUncheckedIndexedAccess 하에서 인덱스 시그니처 접근은 항상
 * `T | undefined`가 되므로, 실제로는 항상 존재함을 보장하는 지점에서만 쓴다.
 * @template T
 * @param {Record<string, T>} record
 * @param {string} key
 * @returns {T}
 */
function req(record, key) {
  const value = record[key];
  if (value === undefined) {
    throw new Error(`"${key}" 키가 없습니다(예상치 못한 상태)`);
  }
  return value;
}

// -----------------------------------------------------------------------
// 메인
// -----------------------------------------------------------------------
async function main() {
  args = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "keys-file": { type: "string" },
      category: { type: "string" }, // 디버그용: 특정 카테고리(raw key)만 처리
      "sample-count": { type: "string", default: "5" },
      "backup-file": { type: "string" },
    },
  }).values;

  const { url, serviceKey } = await resolveCredentials();
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      "dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.",
    );
  }
  const supabase = createClient(url, serviceKey);
  // BLOCK6: --backup-file로 명시 경로를 주면 그 경로를 쓰되(존재 시 거부는 동일 적용),
  // 기본값은 영속 디렉터리 아래 실행마다 고유한 타임스탬프 파일명이다.
  const backupFile =
    args["backup-file"] || (await buildTimestampedBackupPath());
  await assertBackupFileDoesNotExist(backupFile);
  const sampleCount = Number(args["sample-count"]) || 5;
  const targetCategory = args.category;
  if (targetCategory && !CATEGORY_KEYS.includes(targetCategory)) {
    throw new Error(
      `알 수 없는 --category: ${targetCategory} (허용: ${CATEGORY_KEYS.join(", ")})`,
    );
  }
  const targetColumns = targetCategory
    ? [CATEGORY_HTML_KEY[targetCategory]]
    : HTML_COLUMNS;

  console.log(
    `=== 1) 대상 조회 + 백업 (${args.apply ? "apply" : "dry-run"} 모드) ===`,
  );
  const selectColumns = [
    "id",
    "university_name",
    "campus",
    "region",
    ...HTML_COLUMNS,
  ].join(", ");
  const { data: rows, error: fetchError } = await supabase
    .from(TABLE)
    .select(selectColumns)
    .order("id");
  if (fetchError) throw new Error(`행 조회 실패: ${fetchError.message}`);
  const typedRows = /** @type {ResourceRow[]} */ (
    /** @type {unknown} */ (rows)
  );

  await writeFile(backupFile, JSON.stringify(rows, null, 2), "utf-8");
  console.log(`백업 완료: ${typedRows.length}행 → ${backupFile}`);

  console.log("\n=== 2) 정규화 계산 ===");
  /**
   * @typedef {{ id: string, label: string, before: string, after: string }} ChangeEntry
   */
  /** @type {Record<string, ChangeEntry[]>} */
  const changesByColumn = Object.fromEntries(HTML_COLUMNS.map((c) => [c, []]));
  let puaResolvedCount = 0;
  const puaUnresolvedFindings = [];
  const emptyShellFindings = [];
  const legacyRecruitFindings = [];

  typedRows.forEach((row) => {
    const label = `${row.university_name}${row.campus ? `(${row.campus})` : ""}`;

    HTML_COLUMNS.forEach((col) => {
      const original = row[col] || "";
      if (!original) return;

      // 보고 전용 진단 (전 컬럼). PUA는 판별된(①②) 것과 미해결인 것을 분리해 집계한다.
      puaResolvedCount += countKnownPuaChars(original);
      const afterKnownPua = replaceKnownPuaChars(original);
      const unresolvedPuaCount = detectUnresolvedPuaChars(afterKnownPua);
      if (unresolvedPuaCount > 0) {
        puaUnresolvedFindings.push({
          id: row.id,
          label,
          column: col,
          count: unresolvedPuaCount,
        });
      }
      const shells = detectEmptyShellTables(original);
      if (shells.length) {
        emptyShellFindings.push({
          id: row.id,
          label,
          column: col,
          reasons: shells,
        });
      }
      if (col === "recruitment_result_html" && isLegacyRecruitTable(original)) {
        legacyRecruitFindings.push({ id: row.id, label, column: col });
      }

      if (targetCategory && col !== targetColumns[0]) return;

      const normalized = normalizeHtmlValue(original, col);
      if (normalized !== original) {
        assertIdempotent(original, normalized, col, label);
        req(changesByColumn, col).push({
          id: row.id,
          label,
          before: original,
          after: normalized,
        });
      }
    });
  });

  console.log("\n=== 3) 집계 ===");
  let totalChanges = 0;
  HTML_COLUMNS.forEach((col) => {
    const list = req(changesByColumn, col);
    totalChanges += list.length;
    console.log(`- ${col}: 변경 ${list.length}건`);
  });
  console.log(`합계: ${totalChanges}건`);

  console.log("\n=== 4) 샘플 diff ===");
  HTML_COLUMNS.forEach((col) => {
    const list = req(changesByColumn, col);
    if (!list.length) return;
    console.log(
      `\n[${col}] 샘플 ${Math.min(sampleCount, list.length)}/${list.length}`,
    );
    list.slice(0, sampleCount).forEach((c) => {
      console.log(`  - ${c.label} (${c.id})`);
      const beforeSnippet = diffSnippet(c.before, c.after).before;
      const afterSnippet = diffSnippet(c.before, c.after).after;
      console.log(`      전: ...${beforeSnippet}...`);
      console.log(`      후: ...${afterSnippet}...`);
    });
  });

  console.log("\n=== 5) 진단 전용 항목(수정 대상 아님) ===");
  console.log(
    `PUA 문자: 판별되어 치환 대상(①/②)에 포함된 문자 ${puaResolvedCount}개, 판별 불가(미치환) ${puaUnresolvedFindings.length}건`,
  );
  puaUnresolvedFindings.forEach((f) => {
    console.log(`  - ${f.label} / ${f.column}: ${f.count}개`);
  });
  console.log(`빈 껍데기 표 발견: ${emptyShellFindings.length}건`);
  emptyShellFindings.forEach((f) => {
    console.log(`  - ${f.label} / ${f.column}: ${f.reasons.join(", ")}`);
  });
  console.log(
    `(c) 재파싱 필요 legacy recruit-table 구조: ${legacyRecruitFindings.length}건`,
  );
  legacyRecruitFindings.forEach((f) => {
    console.log(`  - ${f.label} / ${f.column}`);
  });

  if (!args.apply) {
    console.log(
      "\ndry-run 모드입니다. 실제 DB에는 아무것도 쓰지 않았습니다. --apply로 재실행하면 적용됩니다.",
    );
    return;
  }

  console.log("\n=== 6) 적용 ===");
  // WARN22: 트랜잭션이 없으므로(PostgREST 단건 UPDATE 반복) 한 행 실패로 전체를 즉시
  // throw하면 "어디까지 적용됐는지" 파악이 어렵다. 대신 행별 최대 3회 재시도 후에도
  // 실패하면 목록에 쌓아두고 나머지는 계속 진행 — 마지막에 성공/실패를 한 번에 보고해
  // 재시도(동일 --category로 재실행) 판단을 쉽게 한다.
  let updated = 0;
  const failedUpdates = [];
  for (const col of HTML_COLUMNS) {
    for (const change of req(changesByColumn, col)) {
      let lastError = null;
      let succeeded = false;
      for (let attempt = 1; attempt <= 3 && !succeeded; attempt += 1) {
        const { error: updateError } = await supabase
          .from(TABLE)
          .update({ [col]: change.after })
          .eq("id", change.id);
        if (!updateError) {
          succeeded = true;
          updated += 1;
        } else {
          lastError = updateError;
        }
      }
      if (!succeeded) {
        failedUpdates.push({
          id: change.id,
          label: change.label,
          column: col,
          message: lastError?.message,
        });
        console.error(
          `  업데이트 실패(3회 재시도 후 포기): ${change.label} / ${col} — ${lastError?.message}`,
        );
      }
    }
  }
  console.log(
    `적용 완료: ${updated}건 UPDATE, 실패 ${failedUpdates.length}건.`,
  );
  if (failedUpdates.length) {
    console.error("실패 목록(동일 --category로 재실행해 재시도하세요):");
    failedUpdates.forEach((f) => {
      console.error(`  - ${f.label} / ${f.column} (id=${f.id}): ${f.message}`);
    });
  }

  console.log("\n=== 7) 재감사(잔여 0 확인) ===");
  // WARN22: --category로 한 컬럼만 처리했는데 전 컬럼을 재감사하면, 애초에 이 스크립트의
  // 범위 밖인 다른 컬럼의 미정규화 값(예: 아직 정규화 대상이 아닌 값) 때문에 residual이
  // 항상 0보다 커져 --category 실행이 매번 exit 1로 실패한다. 이번 실행에서 실제로 건드린
  // targetColumns만 재감사 대상으로 좁힌다.
  const { data: verifyRows, error: verifyError } = await supabase
    .from(TABLE)
    .select(selectColumns)
    .order("id");
  if (verifyError) throw new Error(`재감사 조회 실패: ${verifyError.message}`);

  let residual = 0;
  verifyRows.forEach((row) => {
    targetColumns.forEach((col) => {
      const original = row[col] || "";
      if (!original) return;
      const normalized = normalizeHtmlValue(original, col);
      if (normalized !== original) residual += 1;
    });
  });
  console.log(
    `재감사 결과: 정규화 후에도 변경이 필요한 잔여 건수 = ${residual} (대상 컬럼: ${targetColumns.join(", ")})`,
  );
  if (residual !== 0 || failedUpdates.length) {
    console.error(
      "경고: 잔여 건수 또는 실패 건수가 0이 아닙니다. 원인을 확인하세요.",
    );
    process.exitCode = 1;
  }
}

// 삽입/삭제(길이 변화)가 섞이면 "뒤쪽 공통 접미사"를 찾으려는 순진한 접근이
// 오프셋 한 칸 밀림으로 인해 문자열 끝까지 전부 "다름"으로 보고 거대한 diff를
// 뱉는다(예: 공백 1개 제거). 그래서 끝쪽은 맞추려 하지 않고, 변경 시작점 기준
// 고정 폭 윈도우만 보여준다 — 정확한 diff가 아니라 "어디가 왜 바뀌었는지 눈으로
// 확인"하기 위한 용도이므로 충분하다.
function diffSnippet(before, after, context = 30) {
  let start = 0;
  const minLen = Math.min(before.length, after.length);
  while (start < minLen && before[start] === after[start]) start += 1;

  const windowStart = Math.max(start - context, 0);
  const beforeSnippet = before.slice(windowStart, start + context);
  const afterSnippet = after.slice(windowStart, start + context);
  return { before: beforeSnippet, after: afterSnippet };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
