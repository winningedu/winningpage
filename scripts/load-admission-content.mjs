// =====================================================================
// admission_university_resources HWP 콘텐츠 적재 스크립트
//
// src/data/admissionHwpSections.json(218개교)을 university_name 기준으로
// dev DB admission_university_resources에 매칭해 raw 6종 + *_html 6종 +
// *_json 6종을 채운다. HTML은 페이지 모달(InfoButton, src/pages/
// AdmissionGuidelines.jsx)이 실제 쓰는 것과 동일한 빌드 경로(buildRawSectionHtml)로
// 생성하며, JSON에 이미 들어 있는 *_html 값은 그대로 보존(재생성하지 않음)한다.
//
// *_json 정책 — 3단 우선순위 + 정보량 감소 가드(2026-08-06 사고 이후 확정):
//   1) 기존 json이 있고 validateAdmissionDoc 통과 → 그대로 보존(아무것도
//      안 씀, 계산조차 안 함). --force-regenerate를 줘야 이 단계를
//      건너뛰고 2)/3)을 강제로 다시 계산한다.
//   2) 기존 json이 없거나(또는 무효/--force-regenerate) + html이 있으면
//      → import-legacy-admission-html.mjs의 파서 체인(importCell, Phase 5
//      백필과 동일 경로)으로 그 html에서 json을 재구성한다.
//   3) 2)도 안 되고 raw가 있으면 → buildHwpCategoryDoc으로 raw에서 직접
//      doc을 생성한다.
//   4) 셋 다 안 되면 그 컬럼은 payload에서 아예 뺀다(기존 DB 값 보존 —
//      Admin.jsx formToPayload와 동일한 "delete=무해" 패턴).
//
// 정보량 감소 가드: 2)/3)에서 만든 후보가 "기존에 이미 있던 doc"(1)에서
// 그냥 보존하지 않고 지나온 경우 — 즉 기존 json이 있었지만 무효했거나
// --force-regenerate로 강제 재계산한 경우)보다 blocks 수 또는 텍스트
// 총량이 줄어들면 덮어쓰지 않고 기존 값을 보존한다(jsonSource=
// 'regressionSkipped'로 집계). validateAdmissionDoc은 스키마 형태만
// 보고 "정보가 덜 풍부해졌는지"는 보지 않는다 — 그게 2026-08-06 사고가
// 조용히 지나갈 뻔한 이유였다.
//
// --force-regenerate와 --ignore-regression은 **분리된 플래그다**(의도
// 분리 — team-lead 지적: "재계산 강제"와 "품질 저하 허용"을 한 플래그로
// 묶으면 이번 사고와 같은 실패 모드를 다시 만든다):
//   --force-regenerate  1단(기존 보존) 단축만 건너뛴다. 가드는 그대로
//                        작동한다 — 재계산 결과가 나빠지면 여전히
//                        regressionSkipped로 보존한다.
//   --ignore-regression  가드 자체를 무시한다(단독으로도 의미 있다 —
//                        1단은 그대로 작동하되, 혹시 2)/3)이 실행되는
//                        경우에 한해 가드만 끈다). "무조건 덮어쓰기"를
//                        하려면 두 플래그를 함께 써야 한다. 사용 시
//                        콘솔에 큰 경고를 띄운다.
//
// 이 정책은 어드민 Admin.jsx의 buildPreviewPatch(raw 우선 — "관리자가
// 방금 원문을 고쳤으니 raw가 정본")와 **의도적으로 다르다.** 이 스크립트는
// "기존 데이터 유지·보강"이 목적이고, 저장 html이 raw보다 정확하다는 게
// 이 프로젝트에서 반복 확인된 사실이다(Phase 0 실측: raw 재생성만으로는
// 저장 html과 1253건 중 0건도 바이트 일치하지 않았다). 2026-08-06
// 사고에서 raw 우선으로 json을 만들었다가 curated/legacy html에만 있던
// 정보(예: minimum_requirements의 세분 과목 표기, recruitment_quota의
// 정규화된 표 구조)를 잃어 1253건 중 356건이 어긋난 걸 실측으로 확인—
// import-legacy-admission-html.mjs --apply 재실행으로 복구했다.
//
// **기본값은 dry-run이다.** 실제로 쓰려면 --apply를 명시해야 한다(저장소
// 관례 — normalize-admission-html.mjs/backfill-admission-doc.mjs/
// import-legacy-admission-html.mjs 전부 동일). 위 사고의 직접 원인이
// "인자 없이 실행 = 즉시 적용"이던 예전 기본값이었다. 구버전 호출 습관
// 보호를 위해 --dry-run 플래그는 남겨두되 이제 아무 효과가 없다(항상
// dry-run이 기본이므로) — 대신 경고를 띄운다.
//
// 실행 순서:
//   1) scripts/verify-admission-doc-equivalence.mjs로 회귀 검증(불일치 시 중단)
//   2) university_name 매칭(정확 일치 → normalizeName 폴백)
//   3) 카테고리별 payload 계산(html은 기존 보존 우선, json은 3단 우선순위 +
//      정보량 감소 가드)
//   4) --apply일 때만 upsert onConflict: 'admission_year,university_key'
//   5) 적재 후 행수 · html/json 채움률 확인 SQL 결과 출력
//
// 사용법:
//   node scripts/load-admission-content.mjs                    # dry-run(기본, 아무것도 안 씀)
//   node scripts/load-admission-content.mjs --apply             # 실제 적용
//   node scripts/load-admission-content.mjs --apply --admission-year 2027
//   node scripts/load-admission-content.mjs --apply --force-regenerate  # 기존 json도 재계산(가드는 유지)
//   node scripts/load-admission-content.mjs --apply --force-regenerate --ignore-regression  # 무조건 덮어쓰기(위험)
//
// 키 조회 순서(하드코딩 금지) — scripts/seed-admission-universities.mjs와 동일:
//   1) SEED_SUPABASE_URL / SEED_SECRET_KEY 환경변수
//   2) --keys-file <path>
//   3) 기본값: scratchpad의 dev-keys.json (SEED_KEYS_FILE 로 재지정 가능)
// =====================================================================

import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

import admissionHwpSections from "../src/data/admissionHwpSections.json" with {
  type: "json",
};
import {
  shouldSkipForRegression,
  validateAdmissionDoc,
} from "../src/lib/admissionDoc.ts";
// importCell은 2026-08-06 src/lib/admissionHtmlImport.js로 이동했다(위치만
// 이동, 동작 동일) — 원래 import-legacy-admission-html.mjs에서 가져왔지만,
// 이 스크립트가 그 파일을 import하면 Node 전용 코드까지 딸려 들어와서
// (해가 없긴 하지만) 어드민 일괄 엑셀 업로드가 브라우저에서 같은 함수를
// 재사용할 수 있게 lib으로 뺀 김에 여기 import 경로도 정본으로 맞췄다.
import { importCell } from "../src/lib/admissionHtmlImport.js";
import {
  buildHwpCategoryDoc,
  buildRawSectionHtml,
  clean,
  normalizeName,
} from "../src/lib/admissionParsing.js";
import { runDocEquivalenceVerification } from "./verify-admission-doc-equivalence.mjs";

/** @typedef {import("../src/lib/admissionDoc.ts").AdmissionDoc} AdmissionDoc */

/**
 * admission_university_resources 조회 행. 동적 select라 supabase-js가
 * 이 쿼리 결과를 GenericStringError로 추론한다. dot 접근하는 컬럼만 선언하고,
 * 카테고리별 raw/html/json 컬럼은 전부 동적 키(row[key])로만 접근하므로
 * (noImplicitAny 꺼짐) 별도 선언 없이 암시적 any로 통과한다.
 * region은 생성 타입에서 non-null(string)이라 기존 로컬 typedef(string | null)를
 * 정본에 맞춰 좁혔다 — 이 파일에서는 dbRow.region을 그대로 읽어 옮길 뿐이라
 * 문제 없다.
 */
/** @typedef {import("../src/types/database.types.ts").Tables<"admission_university_resources">} ResourceTableRow */
/**
 * @typedef {Pick<ResourceTableRow, "id" | "university_name" | "university_key" | "admission_year" | "region" | "is_active" | "detail_status">} ResourceRow
 */

/**
 * importCell(admissionHtmlImport.ts)의 반환 판별합집합을 로컬로 재선언한다.
 * 원본 함수에 반환 타입 주석이 없어 skip/needsReview 분기의 classification이
 * string으로 widen되며 판별 유니온이 깨진다(src/ 수정 금지 제약이라 원본은
 * 못 고친다) — 호출부에서 캐스트로 원래 의도한 판별 유니온을 복원한다.
 * @typedef {
 *   | { classification: "skip" }
 *   | { classification: "imported", doc: AdmissionDoc, candidateName: string }
 *   | { classification: "needsReview", reason: string, kind: string, doc?: AdmissionDoc }
 * } ImportCellResult
 */

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const DEFAULT_KEYS_FILE =
  "/private/tmp/claude-501/-Users-hyunsoo-uwellnow-winningpage/7d913b11-451e-4002-a293-f999f0a2dad9/scratchpad/dev-keys.json";
const TABLE = "admission_university_resources";

let args = {};

// 카테고리 key -> DB html 컬럼 매핑. 페이지의 INFO_SECTIONS(AdmissionGuidelines.jsx)
// 정의와 동일하다.
const CATEGORY_HTML_KEY = {
  previous_year_changes: "previous_year_changes_html",
  selection_method: "selection_method_html",
  minimum_requirements: "minimum_requirements_html",
  exam_schedule: "exam_schedule_html",
  school_record_method: "school_record_method_html",
  recruitment_quota: "recruitment_result_html",
};
const CATEGORY_KEYS = Object.keys(CATEGORY_HTML_KEY);

// *_json 컬럼 매핑 — recruitment_quota만 html 쪽이 recruitment_result_html로
// 어긋나 있을 뿐, json은 6개 전부 `<rawKey>_json` 접미어로 통일이다(sql/47 정본,
// 구 sql/43 — origin/dev와 번호 충돌해 2026-08-06 재번호).
const CATEGORY_JSON_KEY = {
  previous_year_changes: "previous_year_changes_json",
  selection_method: "selection_method_json",
  minimum_requirements: "minimum_requirements_json",
  exam_schedule: "exam_schedule_json",
  school_record_method: "school_record_method_json",
  recruitment_quota: "recruitment_quota_json",
};

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

// 정보량 감소 가드(docRichness/sumStringLength/shouldSkipForRegression)는
// 2026-08-06 src/lib/admissionDoc.js로 이동했다(위치만 이동, 동작 동일) —
// 어드민 일괄 엑셀 업로드(admissionBulkXlsx.js)가 브라우저에서 같은
// 가드를 재사용해야 하는데, 이 파일은 node:fs/promises·supabase client
// 생성이 있어 브라우저 번들에 못 들어간다. scripts/test-admission-doc-
// regression-guard.mjs의 import 경로도 함께 옮겼다.

// 카테고리 하나(html+json)를 함께 계산한다.
//
// html: 기존 값(JSON 소스 또는 DB) 우선 보존, 없으면 페이지 모달과 동일한
// buildRawSectionHtml 경로로 생성한다.
//
// json: 3단 우선순위 + 정보량 감소 가드(2026-08-06 사고 이후 확정, 파일
// 최상단 정책 설명 참고):
//   1) 기존 json이 있고 validateAdmissionDoc 통과 → 그대로 보존(계산 자체를
//      안 함). forceRegenerate가 true면 이 단계를 건너뛴다.
//   2) 기존 html이 있으면 importCell(import-legacy-admission-html.mjs,
//      Phase 5 백필과 동일 파서 체인)로 그 html에서 doc을 다시 뽑는다.
//   3) 2)도 안 되고 raw가 있으면 buildHwpCategoryDoc(어드민 buildPreviewPatch와
//      동일 빌더)으로 raw에서 직접 doc을 만든다.
//   4) 셋 다 안 되면 payload에서 그 컬럼을 아예 뺀다 — 기존 DB 값을
//      보존한다는 뜻이지 지운다는 뜻이 아니다(Admin.jsx formToPayload와
//      동일 패턴).
// 2)/3)에서 후보를 만들었는데(=1)에서 그냥 보존하지 못하고 지나온 경우 —
// 기존 json이 아예 없었거나, 있었지만 무효했거나, forceRegenerate로
// 강제 재계산한 경우) shouldSkipForRegression으로 기존 doc보다 정보량이
// 줄었는지 본다. 줄었으면 덮어쓰지 않고 기존 값을 보존한다
// (jsonSource='regressionSkipped'). ignoreRegression이 true면 이 검사를
// 건너뛴다(forceRegenerate와는 독립된 플래그 — 파일 최상단 정책 설명 참고).
function buildCategoryContent(
  sectionKey,
  hwpRow,
  dbRow,
  universityName,
  forceRegenerate,
  ignoreRegression,
) {
  const htmlKey = CATEGORY_HTML_KEY[sectionKey];
  const jsonKey = CATEGORY_JSON_KEY[sectionKey];
  const existingHtml = clean(hwpRow?.[htmlKey]) || clean(dbRow?.[htmlKey]);
  const rawText = clean(hwpRow?.[sectionKey]) || clean(dbRow?.[sectionKey]);
  const existingDoc = dbRow?.[jsonKey] || null;

  let html;
  let htmlSource;
  if (existingHtml) {
    html = existingHtml;
    htmlSource = "preserved";
  } else if (rawText) {
    html = buildRawSectionHtml(rawText, sectionKey, hwpRow, universityName);
    htmlSource = "generated";
  } else {
    html = "";
    htmlSource = "empty";
  }

  const existingDocValid =
    Boolean(existingDoc) && validateAdmissionDoc(existingDoc).ok;

  // 1단: 기존 json이 이미 유효하면 계산 자체를 하지 않는다.
  if (existingDocValid && !forceRegenerate) {
    return {
      html,
      htmlSource,
      doc: undefined,
      jsonSource: "preserved",
      jsonDetail: undefined,
    };
  }

  let candidate;
  let jsonSource;
  let jsonDetail;

  if (existingHtml) {
    // 2단: importCell은 row.university_name/row.detail_status를 참조한다
    // (특수대학 판정). dbRow가 매칭된 행 전체라 그대로 넘긴다.
    /** @type {ImportCellResult | null} */
    let result;
    try {
      result = /** @type {ImportCellResult} */ (
        importCell(sectionKey, existingHtml, dbRow)
      );
    } catch (err) {
      jsonSource = "exception";
      jsonDetail = err.message;
      result = null;
    }
    if (result) {
      if (result.classification === "imported") {
        candidate = result.doc;
        jsonSource = "imported-from-html";
      } else {
        jsonSource = result.classification === "skip" ? "skip" : "needsReview";
        jsonDetail = result.reason;
      }
    }
  } else if (rawText) {
    // 3단
    let generated;
    try {
      generated = buildHwpCategoryDoc(
        sectionKey,
        rawText,
        dbRow,
        universityName,
      );
    } catch (err) {
      jsonSource = "exception";
      jsonDetail = err.message;
    }
    if (generated) {
      const { ok, errors } = validateAdmissionDoc(generated);
      if (ok) {
        candidate = generated;
        jsonSource = "generated-from-raw";
      } else {
        jsonSource = "invalid";
        jsonDetail = errors.join("; ");
      }
    }
  } else {
    jsonSource = "empty";
  }

  // 정보량 감소 가드: 후보가 있고, 비교할 기존 doc이 있고(무효해도 상관
  // 없다 — 형태는 틀려도 정보 자체는 남아 있을 수 있다), ignoreRegression이
  // 아니면 적용한다. forceRegenerate와는 별개다 — force는 1단만 건너뛸 뿐,
  // 가드 자체는 ignoreRegression을 따로 줘야 꺼진다.
  let doc = candidate;
  if (candidate !== undefined && existingDoc && !ignoreRegression) {
    const guard = shouldSkipForRegression(existingDoc, candidate);
    if (guard.skip) {
      doc = undefined;
      jsonSource = "regressionSkipped";
      jsonDetail = guard.detail;
    }
  }

  // 도달 불가 가드: 위 if(existingHtml)/else if(rawText)/else 세 갈래가
  // 전부 jsonSource를 대입하므로 이 시점엔 항상 값이 있다 — try/catch가
  // 섞인 중첩 분기라 TS가 그 exhaustiveness를 정적으로 못 따라간다.
  if (jsonSource === undefined) {
    throw new Error(
      `jsonSource가 설정되지 않음(${sectionKey} / ${universityName}) — 로직 결함(예상치 못한 상태)`,
    );
  }
  return { html, htmlSource, doc, jsonSource, jsonDetail };
}

/**
 * categoryStats/jsonStats(Object.fromEntries로 CATEGORY_KEYS의 키 전부를
 * 채워 만든 Record)처럼 "키 집합을 스스로 만들어놓고 그 키로만 접근"하는
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

async function main() {
  args = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "force-regenerate": { type: "boolean", default: false },
      "ignore-regression": { type: "boolean", default: false },
      "keys-file": { type: "string" },
      "admission-year": { type: "string", default: "2027" },
      "skip-equivalence-check": { type: "boolean", default: false },
    },
  }).values;

  if (args["dry-run"]) {
    console.warn(
      "--dry-run 플래그는 더 이상 의미가 없습니다(기본이 이미 dry-run입니다). " +
        "실제로 적용하려면 --apply를 쓰세요.",
    );
  }
  if (args["force-regenerate"]) {
    console.warn(
      "--force-regenerate: 기존 json이 유효해도 다시 계산합니다(가드는 그대로 작동 — " +
        "재계산 결과가 나빠지면 regressionSkipped로 보존됩니다).",
    );
  }
  if (args["ignore-regression"]) {
    console.warn(
      "\n" +
        "########################################################\n" +
        "# 경고: --ignore-regression — 품질 회귀 검사를 끕니다. #\n" +
        "# 이번 사고(2026-08-06)의 재발 경로입니다.             #\n" +
        "# 정말로 의도한 것이 맞는지 다시 확인하세요.           #\n" +
        "########################################################\n",
    );
  }

  console.log("=== 1) 골든 대조 회귀 검증(Gate A) ===");
  if (args["skip-equivalence-check"]) {
    console.warn("--skip-equivalence-check: 검증을 건너뜁니다(권장하지 않음).");
  } else {
    const { total, matched, matchRate, mismatches } =
      await runDocEquivalenceVerification();
    if (mismatches.length) {
      console.error(
        `골든 대조 검증 실패: ${total}건 중 ${matched}건만 일치(${matchRate.toFixed(2)}%). 적재를 중단합니다.`,
      );
      process.exit(1);
    }
  }

  console.log("\n=== 2) university_name 매칭 + payload 계산 ===");
  const admissionYear = Number(args["admission-year"]);
  const universityNames = Object.keys(admissionHwpSections);

  const { url, serviceKey } = await resolveCredentials();
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      "dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.",
    );
  }
  const supabase = createClient(url, serviceKey);

  // is_active/detail_status/raw 6종/html 6종/json 6종도 함께 가져온다 — 재실행 시
  // 이미 DB에 있는(어드민이 손으로 편집했을 수 있는) 값을 보존하기 위한 COALESCE
  // 기준값이다. json은 buildCategoryContent가 importCell(detail_status로
  // 특수대학 판정)에 dbRow를 그대로 넘기므로 필요하다.
  const existingColumns = [
    "id",
    "university_name",
    "university_key",
    "admission_year",
    "region",
    "is_active",
    "detail_status",
    ...CATEGORY_KEYS,
    ...CATEGORY_KEYS.map((key) => CATEGORY_HTML_KEY[key]),
    ...CATEGORY_KEYS.map((key) => CATEGORY_JSON_KEY[key]),
  ].join(", ");

  const { data: existingRows, error: fetchError } = await supabase
    .from(TABLE)
    .select(existingColumns)
    .eq("admission_year", admissionYear);
  if (fetchError) throw new Error(`기존 행 조회 실패: ${fetchError.message}`);
  const typedExistingRows = /** @type {ResourceRow[]} */ (
    /** @type {unknown} */ (existingRows)
  );

  const exactMap = new Map();
  const normalizedMap = new Map();
  (typedExistingRows || []).forEach((row) => {
    exactMap.set(row.university_name, row);
    const key = normalizeName(row.university_name);
    if (!normalizedMap.has(key)) normalizedMap.set(key, row);
  });

  const matchFailures = [];
  const categoryStats = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [key, { preserved: 0, generated: 0, empty: 0 }]),
  );
  const jsonStats = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [
      key,
      {
        preserved: 0,
        "imported-from-html": 0,
        "generated-from-raw": 0,
        regressionSkipped: 0,
        empty: 0,
        skip: 0,
        needsReview: 0,
        invalid: 0,
        exception: 0,
      },
    ]),
  );
  const jsonFailures = [];
  const payloads = [];

  universityNames.forEach((universityName) => {
    const hwpRow = admissionHwpSections[universityName];
    const dbRow =
      exactMap.get(universityName) ||
      normalizedMap.get(normalizeName(universityName));
    if (!dbRow) {
      matchFailures.push(universityName);
      return;
    }

    const payload = {
      admission_year: admissionYear,
      university_name: dbRow.university_name,
      university_key: dbRow.university_key,
      region: dbRow.region,
      // 신규 행에만 기본값을 채우고 기존 행은 어드민이 지정한 값을 보존한다:
      // JSON에 값이 있으면 그것을 우선하되, 없으면 DB 현재 값 → 최종 기본값 순으로 폴백.
      detail_status:
        clean(hwpRow.detail_status) || clean(dbRow.detail_status) || "normal",
      matched_hwp_name: clean(hwpRow.hwp_source_name) || universityName,
      is_active: typeof dbRow.is_active === "boolean" ? dbRow.is_active : true,
    };

    CATEGORY_KEYS.forEach((key) => {
      const { html, htmlSource, doc, jsonSource, jsonDetail } =
        buildCategoryContent(
          key,
          hwpRow,
          dbRow,
          universityName,
          args["force-regenerate"],
          args["ignore-regression"],
        );

      payload[key] = clean(hwpRow[key]) || clean(dbRow[key]);
      payload[CATEGORY_HTML_KEY[key]] = html;
      req(categoryStats, key)[htmlSource] += 1;

      const jsonKey = CATEGORY_JSON_KEY[key];
      req(jsonStats, key)[jsonSource] += 1;
      if (
        jsonSource === "needsReview" ||
        jsonSource === "invalid" ||
        jsonSource === "exception" ||
        jsonSource === "regressionSkipped"
      ) {
        jsonFailures.push({
          universityName,
          key,
          source: jsonSource,
          detail: jsonDetail,
        });
      }
      // doc이 undefined면 payload에서 이 컬럼을 아예 뺀다 — upsert가 기존
      // DB 값을 건드리지 않는다는 뜻이다(Admin.jsx formToPayload와 동일 패턴).
      if (doc !== undefined) payload[jsonKey] = doc;
    });

    payloads.push(payload);
  });

  console.log(`매칭 성공: ${payloads.length}/${universityNames.length}개교`);
  if (matchFailures.length) {
    console.error(
      `매칭 실패 ${matchFailures.length}개교:`,
      matchFailures.join(", "),
    );
  } else {
    console.log("매칭 실패 없음(218개교 전원 매칭).");
  }

  console.log("\n카테고리별 HTML 소스(보존/생성/원자료없음):");
  CATEGORY_KEYS.forEach((key) => {
    const s = req(categoryStats, key);
    console.log(
      `  - ${key} (${CATEGORY_HTML_KEY[key]}): 보존 ${s.preserved} / 생성 ${s.generated} / 원자료없음 ${s.empty}`,
    );
  });

  console.log(
    "\n카테고리별 JSON 생성 결과(기존보존/html임포트/raw생성/원자료없음/실패류-기존보존):",
  );
  CATEGORY_KEYS.forEach((key) => {
    const s = req(jsonStats, key);
    console.log(
      `  - ${key} (${CATEGORY_JSON_KEY[key]}): 기존보존(1단) ${s.preserved} / html임포트(2단) ${s["imported-from-html"]} / ` +
        `raw생성(3단) ${s["generated-from-raw"]} / 원자료없음 ${s.empty} / skip ${s.skip} / ` +
        `정보량감소로보존 ${s.regressionSkipped} / needsReview(기존보존) ${s.needsReview} / 검증실패(기존보존) ${s.invalid} / 예외(기존보존) ${s.exception}`,
    );
  });
  if (jsonFailures.length) {
    console.log(
      `\nJSON 실패/보존 상세(${jsonFailures.length}건 중 최대 20건, regressionSkipped 포함):`,
    );
    jsonFailures.slice(0, 20).forEach((f) => {
      console.log(
        `  - [${f.universityName}] ${f.key} (${f.source}): ${f.detail}`,
      );
    });
  } else {
    console.log("\nJSON 생성 실패 없음.");
  }

  if (!args.apply) {
    console.log(
      "\ndry-run(기본값): DB에 쓰지 않고 종료합니다. 실제로 적용하려면 --apply를 쓰세요.",
    );
    return;
  }

  console.log("\n=== 3) upsert 적재 ===");
  const { error: upsertError, count } = await supabase
    .from(TABLE)
    .upsert(payloads, {
      onConflict: "admission_year,university_key",
      count: "exact",
    });
  if (upsertError) throw new Error(`upsert 실패: ${upsertError.message}`);
  console.log(`upsert 완료: ${count ?? payloads.length}행 처리`);

  console.log("\n=== 4) 적재 결과 확인 SQL ===");
  console.log(
    `select count(*) as total,\n` +
      CATEGORY_KEYS.map(
        (key) =>
          `  count(*) filter (where ${CATEGORY_HTML_KEY[key]} is not null and ${CATEGORY_HTML_KEY[key]} <> '') as ${CATEGORY_HTML_KEY[key]}_filled`,
      ).join(",\n") +
      ",\n" +
      CATEGORY_KEYS.map(
        (key) =>
          `  count(*) filter (where ${CATEGORY_JSON_KEY[key]} is not null) as ${CATEGORY_JSON_KEY[key]}_filled`,
      ).join(",\n") +
      `\nfrom ${TABLE} where admission_year = ${admissionYear};`,
  );
}

// isMainModule 가드 — 이 파일은 현재 아무것도 export하지 않지만(순수
// 함수는 전부 admissionDoc.js/admissionHtmlImport.js로 옮겨졌다), 다른
// 스크립트가 나중에 여기서 뭔가를 재사용하려고 import할 가능성을 막는
// 안전망으로 계속 둔다 — main()이 import 시점에 곧바로 실행돼 실제
// Supabase 호출을 시도하는 사고를 이미 한 번 겪었다(2026-08-06).
const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
