// =====================================================================
// 대입모집요강 구조화(JSON) 전환 범위 실측 스크립트 (읽기 전용)
//
// 목적: 구조화 JSON 전환 착수 가부를 가르는 사전 측정. 저장된 *_html이
// 현행 파서(buildRawSectionHtml)로 재현 가능한지, 클래스 인벤토리가
// 무엇인지, sanitizeAdmissionRenderedHtml이 가려온 결함 규모가 얼마인지를
// 카테고리 6종별로 측정한다. DB에 절대 쓰지 않는다(select만 수행).
//
// 측정 항목(카테고리 6종별):
//   1. raw 보유 셀 수 / 저장 html 보유 셀 수
//   2. looksLikeHtml(raw) 건수
//   3. 현행 파서 재생성 일치 건수 — buildRawSectionHtml(raw, key, row, name)
//      과 저장 html 문자열 비교
//   4. 저장 html의 CSS 클래스 인벤토리(클래스명별 등장 문서 수) 상위 20
//   5. undefined|NaN|[object Object]|null null 원본 매칭 건수 — 저장 html은
//      이미 sanitizeAdmissionRenderedHtml:47이 '-'로 치환한 뒤이므로 항상 0이다.
//      가려진 결함을 드러내기 위해 그 직전 단계(buildSmartRawHtml, 치환 전)의
//      출력을 기준으로 센다.
//   6. admission-table-wrap 이중 중첩 문서 수
//   7. 마스킹 정규식(/undefined|NaN|\[object Object\]|null\s*null/gi) 오탐
//      실측 — 항목 5의 매칭이 진짜 결함(정확히 undefined/NaN/[object Object]/
//      null null)인지, 대소문자만 우연히 일치한 오탐(예: "Finance"의 "nan")
//      인지 분류한다. sanitizeAdmissionRenderedHtml:47이 gi 플래그를 쓰고
//      있어 오탐이면 실제 서비스에서도 "Finance" → "Fi-ce" 식으로 데이터가
//      손상된다 — 이 스크립트는 규모만 드러내고 고치지 않는다.
//
// 사용법:
//   node scripts/measure-admission-json-scope.mjs                 # DB 실측(키 필요)
//   node scripts/measure-admission-json-scope.mjs --bundle-only    # 번들만 측정, DB 불필요
//   node scripts/measure-admission-json-scope.mjs --json out.json  # 결과를 JSON으로도 저장
//   node scripts/measure-admission-json-scope.mjs --admission-year 2027
//
// 키 조회 순서(하드코딩 금지) — scripts/normalize-admission-html.mjs와 동일 컨벤션:
//   1) SEED_SUPABASE_URL / SEED_SECRET_KEY 환경변수
//   2) --keys-file <path>
//   둘 다 없고 --bundle-only도 아니면, 죽은 scratchpad 절대경로로 폴백하지
//   않고 명확한 에러 메시지와 함께 즉시 종료한다.
// =====================================================================

import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

import admissionHwpSections from "../src/data/admissionHwpSections.json" with {
  type: "json",
};
import {
  buildRawSectionHtml,
  buildSmartRawHtml,
  clean,
  HWP_SECTION_HTML_KEYS,
  looksLikeHtml,
} from "../src/lib/admissionParsing.js";

/**
 * admission_university_resources 조회 행. 동적 select라 supabase-js가
 * 이 쿼리 결과를 GenericStringError로 추론한다. dot 접근하는 컬럼만 선언하고,
 * 카테고리별 raw/html 컬럼은 전부 동적 키(row[key])로만 접근하므로
 * (noImplicitAny 꺼짐) 별도 선언 없이 암시적 any로 통과한다.
 */
/** @typedef {import("../src/types/database.types.ts").Tables<"admission_university_resources">} ResourceTableRow */
/** @typedef {Pick<ResourceTableRow, "id" | "university_name" | "university_key" | "detail_status">} ResourceRow */

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const TABLE = "admission_university_resources";
const CATEGORY_KEYS = Object.keys(HWP_SECTION_HTML_KEYS);
const HTML_COLUMNS = Object.values(HWP_SECTION_HTML_KEYS);

const MASKED_TOKEN_RE = /undefined|NaN|\[object Object\]|null\s*null/gi;
// 항목 7: 대소문자까지 정확히 일치해야 "진짜 결함"이다. sanitizeAdmissionRenderedHtml
// 자체의 정규식(위 MASKED_TOKEN_RE와 동일 패턴, gi 플래그)은 대소문자를 가리지
// 않으므로, 이 판별과 실제 프로덕션 치환 동작은 별개다 — 판별은 "치환이 정당했는가"만
// 본다.
const REAL_DEFECT_RE = /^(undefined|NaN|\[object Object\]|null\s*null)$/;
const TABLE_WRAP_CLASS_RE = /\badmission-table-wrap\b/g;
const CLASS_ATTR_RE = /class="([^"]*)"/g;
const MASKED_TOKEN_CONTEXT = 40;
const MASKED_TOKEN_SAMPLE_LIMIT = 10;

// CLI 인자는 main() 안에서만 파싱한다 — 이 모듈의 순수 측정 함수들을
// 재사용하려고 import만 하는 호출자가 여기 없는 플래그를 쓰면 import
// 시점에 그대로 throw하던 결함(2026-08-06 build-admission-html-golden.mjs
// 사고와 동일 유형)을 막는다.
let args = {};

// -----------------------------------------------------------------------
// 자격증명 — 키가 없고 --bundle-only도 아니면 명확한 에러로 종료한다.
// -----------------------------------------------------------------------
async function resolveCredentials() {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SECRET_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };

  const keysFile = args["keys-file"] || process.env.SEED_KEYS_FILE;
  if (!keysFile) {
    throw new Error(
      "DB 자격증명을 찾을 수 없습니다. SEED_SUPABASE_URL/SEED_SECRET_KEY 환경변수를 " +
        "설정하거나 --keys-file <path>를 지정하세요. DB 없이 번들만 측정하려면 " +
        "--bundle-only 플래그를 사용하세요.",
    );
  }
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
// 순수 측정 함수(테스트 가능, DB/DOM 의존 없음)
// -----------------------------------------------------------------------

// 항목 4: class="..." 속성 안의 클래스명을 문서 단위로 1회씩만 집계한다
// (같은 문서에 같은 클래스가 여러 번 나와도 문서 수는 1로 카운트).
function collectClassesInDoc(html) {
  const classes = new Set();
  const text = String(html || "");
  for (const m of text.matchAll(CLASS_ATTR_RE)) {
    (m[1] ?? "")
      .split(/\s+/)
      .map((c) => c.trim())
      .filter(Boolean)
      .forEach((c) => {
        classes.add(c);
      });
  }
  return classes;
}

// 항목 6: 저장 html 자체가 admission-table-wrap을 2회 이상 포함하면(모달이
// 씌우는 바깥 wrap과 별개로 문서 내부에서 이미 중첩) 이중 중첩으로 판정한다.
export function countTableWrapOccurrences(html) {
  const text = String(html || "");
  const matches = text.match(TABLE_WRAP_CLASS_RE);
  return matches ? matches.length : 0;
}

// 항목 5: 마스킹 패턴 원본 매칭 건수(치환 전 값 기준).
export function countMaskedTokenMatches(html) {
  const text = String(html || "");
  const matches = text.match(MASKED_TOKEN_RE);
  return matches ? matches.length : 0;
}

// 항목 7: 매칭된 문자열이 대소문자까지 정확히 진짜 결함 패턴인지 판별.
// 그 외(대소문자 변형 등)는 정규식이 gi 플래그를 쓰는 탓에 걸린 오탐이다.
export function classifyMaskedTokenMatch(matchedText) {
  return REAL_DEFECT_RE.test(String(matchedText || ""))
    ? "defect"
    : "false-positive";
}

// 항목 5·7(핵심): sanitizeAdmissionRenderedHtml은 buildRawSectionHtml/
// buildHwpCategoryHtml의 "마지막" 단계에서 마스킹 패턴을 '-'로 치환한다.
// 저장된(최종) html은 이미 치환이 끝난 상태라 여기서 세면 항상 0이다 —
// 가려진 결함을 드러내려면 그 직전 단계인 buildSmartRawHtml(raw, key,
// row, name)의 출력(치환 전)에서 매칭 지점을 전부 모아야 한다.
export function collectMaskedTokenFindings(raw, key, row, universityName) {
  let html;
  try {
    html = buildSmartRawHtml(raw, key, row, universityName);
  } catch {
    return [];
  }
  const text = String(html || "");
  const findings = [];
  // matchAll은 넘겨받은 정규식을 내부적으로 복제해 순회하므로, MASKED_TOKEN_RE가
  // 다른 함수(match만 쓰는 곳)와 lastIndex를 공유할 걱정이 없다.
  for (const m of text.matchAll(MASKED_TOKEN_RE)) {
    const matchedText = m[0];
    const start = Math.max(0, m.index - MASKED_TOKEN_CONTEXT);
    const end = Math.min(
      text.length,
      m.index + matchedText.length + MASKED_TOKEN_CONTEXT,
    );
    findings.push({
      universityName,
      category: key,
      matchedText,
      classification: classifyMaskedTokenMatch(matchedText),
      context: text.slice(start, end),
    });
  }
  return findings;
}

// 항목 3: 현행 파서가 저장 html을 재생성하는지 여부.
export function regeneratesToStoredHtml(
  raw,
  key,
  row,
  universityName,
  storedHtml,
) {
  let regenerated;
  try {
    regenerated = buildRawSectionHtml(raw, key, row, universityName);
  } catch {
    return false;
  }
  return regenerated === storedHtml;
}

// -----------------------------------------------------------------------
// 카테고리 6종 × 문서 집합(코퍼스) 하나에 대해 6개 지표를 전부 계산한다.
// corpus: [{ raw, html, row, universityName }]  (카테고리별로 미리 걸러서 전달)
// -----------------------------------------------------------------------
function measureCategory(key, docs) {
  const stats = {
    key,
    rawCount: 0,
    htmlCount: 0,
    looksLikeHtmlCount: 0,
    regenMatchCount: 0,
    regenComparedCount: 0,
    maskedTokenMatches: 0,
    maskedTokenDefectCount: 0,
    maskedTokenFalsePositiveCount: 0,
    doubleNestedDocs: 0,
  };
  const classDocCount = new Map();
  const maskedTokenFindings = [];

  docs.forEach(({ raw, html, row, universityName }) => {
    const cleanRaw = clean(raw);
    const cleanHtml = clean(html);
    if (cleanRaw) {
      stats.rawCount += 1;
      if (looksLikeHtml(cleanRaw)) stats.looksLikeHtmlCount += 1;
    }
    if (cleanHtml) {
      stats.htmlCount += 1;

      collectClassesInDoc(cleanHtml).forEach((className) => {
        classDocCount.set(className, (classDocCount.get(className) || 0) + 1);
      });

      if (countTableWrapOccurrences(cleanHtml) >= 2)
        stats.doubleNestedDocs += 1;
    }
    if (cleanRaw) {
      const findings = collectMaskedTokenFindings(
        cleanRaw,
        key,
        row,
        universityName,
      );
      findings.forEach((finding) => {
        stats.maskedTokenMatches += 1;
        if (finding.classification === "defect")
          stats.maskedTokenDefectCount += 1;
        else stats.maskedTokenFalsePositiveCount += 1;
      });
      maskedTokenFindings.push(...findings);
    }
    if (cleanRaw && cleanHtml) {
      stats.regenComparedCount += 1;
      if (
        regeneratesToStoredHtml(cleanRaw, key, row, universityName, cleanHtml)
      ) {
        stats.regenMatchCount += 1;
      }
    }
  });

  const classInventory = [...classDocCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([className, docCount]) => ({ className, docCount }));

  return { ...stats, classInventory, maskedTokenFindings };
}

// -----------------------------------------------------------------------
// 코퍼스 빌드 — 번들(src/data/admissionHwpSections.json)
// -----------------------------------------------------------------------
/**
 * corpusByCategory(Object.fromEntries로 CATEGORY_KEYS의 키 전부를 채워
 * 만든 Record)처럼 "키 집합을 스스로 만들어놓고 그 키로만 접근"하는
 * 객체에 대한 도달 불가 가드. noUncheckedIndexedAccess 하에서 인덱스
 * 시그니처 접근은 항상 `T | undefined`가 되므로, 실제로는 항상 존재함을
 * 보장하는 지점에서만 쓴다.
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

/**
 * @typedef {{ raw: unknown, html: unknown, row: unknown, universityName: string }} CorpusEntry
 */

function buildBundleCorpus() {
  const universityNames = Object.keys(admissionHwpSections);
  /** @type {Record<string, CorpusEntry[]>} */
  const corpusByCategory = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [key, []]),
  );

  universityNames.forEach((universityName) => {
    const row = admissionHwpSections[universityName];
    CATEGORY_KEYS.forEach((key) => {
      const htmlKey = HWP_SECTION_HTML_KEYS[key];
      req(corpusByCategory, key).push({
        raw: row[key],
        html: row[htmlKey],
        row,
        universityName,
      });
    });
  });

  return corpusByCategory;
}

// -----------------------------------------------------------------------
// 코퍼스 빌드 — DB(admission_university_resources)
// -----------------------------------------------------------------------
async function buildDbCorpus(admissionYear) {
  const { url, serviceKey } = await resolveCredentials();
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      "dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.",
    );
  }
  const supabase = createClient(url, serviceKey);

  const selectColumns = [
    "id",
    "university_name",
    "university_key",
    "detail_status",
    ...CATEGORY_KEYS,
    ...HTML_COLUMNS,
  ].join(", ");

  const { data: rows, error } = await supabase
    .from(TABLE)
    .select(selectColumns)
    .eq("admission_year", admissionYear)
    .order("id");
  if (error) throw new Error(`행 조회 실패: ${error.message}`);
  const typedRows = /** @type {ResourceRow[]} */ (
    /** @type {unknown} */ (rows)
  );

  /** @type {Record<string, CorpusEntry[]>} */
  const corpusByCategory = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [key, []]),
  );
  (typedRows || []).forEach((row) => {
    CATEGORY_KEYS.forEach((key) => {
      const htmlKey = HWP_SECTION_HTML_KEYS[key];
      req(corpusByCategory, key).push({
        raw: row[key],
        html: row[htmlKey],
        row,
        universityName: row.university_name,
      });
    });
  });

  return { corpusByCategory, rowCount: rows?.length || 0 };
}

// -----------------------------------------------------------------------
// 출력
// -----------------------------------------------------------------------
function printReport(source, results) {
  console.log(`=== 대입모집요강 구조화 전환 범위 실측 (${source}) ===\n`);

  console.log("--- 1~3, 5~6) 카테고리별 요약 ---");
  console.table(
    results.map((r) => ({
      카테고리: r.key,
      "raw 보유": r.rawCount,
      "저장html 보유": r.htmlCount,
      "raw가 HTML": r.looksLikeHtmlCount,
      "재생성 비교대상": r.regenComparedCount,
      "재생성 일치": r.regenMatchCount,
      "마스킹토큰(치환전)": r.maskedTokenMatches,
      "이중중첩 문서수": r.doubleNestedDocs,
    })),
  );

  console.log(
    "\n--- 4) 클래스 인벤토리(상위 20, 카테고리 합산 아님 — 카테고리별) ---",
  );
  results.forEach((r) => {
    if (!r.classInventory.length) return;
    console.log(`\n[${r.key}]`);
    r.classInventory.forEach(({ className, docCount }) => {
      console.log(`  ${String(docCount).padStart(4)}  ${className}`);
    });
  });

  console.log(
    "\n--- 7) 마스킹 정규식(/undefined|NaN|[object Object]|null null/gi) 오탐 실측 ---",
  );
  const allFindings = results.flatMap((r) => r.maskedTokenFindings);
  const defectFindings = allFindings.filter(
    (f) => f.classification === "defect",
  );
  const falsePositiveFindings = allFindings.filter(
    (f) => f.classification === "false-positive",
  );
  console.log(
    `전체 매칭 ${allFindings.length}건 = 진짜 결함 ${defectFindings.length}건 + 오탐 ${falsePositiveFindings.length}건`,
  );
  if (falsePositiveFindings.length) {
    console.log(
      `오탐 샘플(최대 ${MASKED_TOKEN_SAMPLE_LIMIT}건, 영향받은 대학/카테고리/원본 문자열):`,
    );
    falsePositiveFindings.slice(0, MASKED_TOKEN_SAMPLE_LIMIT).forEach((f) => {
      console.log(
        `  - ${f.universityName} / ${f.category} / "${f.matchedText}" — ...${f.context}...`,
      );
    });
    if (falsePositiveFindings.length > MASKED_TOKEN_SAMPLE_LIMIT) {
      console.log(
        `  ... 외 ${falsePositiveFindings.length - MASKED_TOKEN_SAMPLE_LIMIT}건 생략`,
      );
    }
  }
  if (defectFindings.length) {
    console.log(`진짜 결함 샘플(최대 ${MASKED_TOKEN_SAMPLE_LIMIT}건):`);
    defectFindings.slice(0, MASKED_TOKEN_SAMPLE_LIMIT).forEach((f) => {
      console.log(
        `  - ${f.universityName} / ${f.category} / "${f.matchedText}" — ...${f.context}...`,
      );
    });
  }
}

async function main() {
  args = parseArgs({
    options: {
      "bundle-only": { type: "boolean", default: false },
      "keys-file": { type: "string" },
      "admission-year": { type: "string", default: "2027" },
      json: { type: "string" },
    },
  }).values;

  const admissionYear = Number(args["admission-year"]);
  let source;
  let results;

  if (args["bundle-only"]) {
    source = "번들 src/data/admissionHwpSections.json";
    const corpusByCategory = buildBundleCorpus();
    results = CATEGORY_KEYS.map((key) =>
      measureCategory(key, corpusByCategory[key]),
    );
  } else {
    const { corpusByCategory, rowCount } = await buildDbCorpus(admissionYear);
    source = `DB admission_university_resources (admission_year=${admissionYear}, ${rowCount}행)`;
    results = CATEGORY_KEYS.map((key) =>
      measureCategory(key, corpusByCategory[key]),
    );
  }

  printReport(source, results);

  if (args.json) {
    await writeFile(
      args.json,
      JSON.stringify({ source, results }, null, 2),
      "utf-8",
    );
    console.log(`\nJSON 저장 완료: ${args.json}`);
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
