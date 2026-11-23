// =====================================================================
// admission_university_resources *_json(구조화 문서 AdmissionDoc) 백필 스크립트
//
// ⚠ 역할 변경(Phase 5 완료 후, team-lead 지시): 정본은 이제
// scripts/import-legacy-admission-html.mjs다. 그 스크립트가 저장 HTML을
// 진짜 구조화 doc으로 재구성하는 데 성공하고(실측: 1253/1253셀 100%),
// 이 스크립트는 raw만 있고 html은 없는 셀만 doc으로 만들 뿐 raw+html이
// 둘 다 있는 셀은 무조건 curated-html RawHtmlBlock으로 승격 없이 보존
// 한다(이 파일 원래 설계 그대로). 즉 이 스크립트 혼자서는 임포터가 만드는
// 구조화 결과에 못 미친다 — **임포터가 실패(needsReview)로 분류한 셀의
// rawHtml 폴백 전용**으로 역할을 좁힌다. 임포터 실패가 현재 0건이라
// 사실상 대기 상태지만, 운영 데이터나 신규 대학에서 임포터가 실패하는
// 셀이 나올 수 있어 폐기하지 않고 유지한다.
//
// 배경: sql/47_admission_section_json.sql(구 sql/43 — origin/dev와
// 번호 충돌해 2026-08-06 재번호)이 *_json 6종 jsonb 컬럼을
// 추가한다(실행은 사용자가 Supabase SQL Editor에서 수동). 이 스크립트는
// raw/html 기존 값으로부터 doc을 계산해 그 컬럼을 채운다. *_html은
// 절대 건드리지 않는다(무손상 미러 유지).
//
// 분류 규칙(실측 반영 — Phase 0 측정에서 저장 html 재생성 일치가 6개
// 카테고리 전부 0/1253이었다. 즉 DB html이 있는 셀은 사실상 전량이
// legacy-html로 떨어진다):
//   raw 있음 → doc = buildRawSectionDoc(raw, key, row, name)
//     ├ DB html 없음                       → doc 저장 (source:'parser')
//     └ DB html 있음
//         └ renderDocToHtml(doc, key) === dbHtml (문자열 완전 일치)
//             ├ 일치(드묾)   → doc 저장 (source:'parser')
//             └ 불일치(사실상 전량) →
//                 doc = { blocks:[RawHtmlBlock{html:dbHtml, reason:'curated-html'}],
//                         source:'legacy-html', warnings:['curated-html-preserved'] }
//   raw 없음 + DB html 있음                 → 위와 동일(legacy-html)
//   raw 없음 + DB html 없음                 → 컬럼 미기록(payload에서 제외, null로
//                                             덮어쓰지도 않는다 — 기존 상태 그대로)
// 이 규칙이 시각적 회귀 0을 보장한다. rawHtml 블록 잔량이 남은 부채의
// 정량 지표다(717셀 추정, Phase 5 legacy HTML 임포터 소관).
//
// 관례 정본: scripts/normalize-admission-html.mjs (dry-run 기본 / 매 실행
// 타임스탬프 백업 / 동명 백업 파일 존재 시 throw / 멱등 assert / 사후
// 재감사 / DEV_PROJECT_REF 가드). 죽은 scratchpad 절대경로 기본값은 쓰지
// 않는다 — 키는 env 또는 --keys-file 필수.
//
// 사용법:
//   node scripts/backfill-admission-doc.mjs                       # dry-run(기본)
//   node scripts/backfill-admission-doc.mjs --apply
//   node scripts/backfill-admission-doc.mjs --apply --category selection_method
//   node scripts/backfill-admission-doc.mjs --apply --university 가톨릭관동대학교
//   node scripts/backfill-admission-doc.mjs --limit 20             # 디버그용 표본
//   node scripts/backfill-admission-doc.mjs --restore <backup.json> --apply
// =====================================================================

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  HWP_SECTION_JSON_KEYS,
  stableStringifyDoc,
  validateAdmissionDoc,
} from "../src/lib/admissionDoc.ts";
import {
  buildRawSectionDoc,
  clean,
  HWP_SECTION_HTML_KEYS,
  renderDocToHtml,
} from "../src/lib/admissionParsing.js";

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const DEFAULT_BACKUP_DIR = "/Users/hyunsoo/uwellnow/.admission-doc-backups";
const TABLE = "admission_university_resources";
const BACKFILL_GENERATOR_TAG = "backfill-admission-doc@phase3";

const CATEGORY_KEYS = Object.keys(HWP_SECTION_JSON_KEYS);
const HTML_COLUMNS_BY_KEY = HWP_SECTION_HTML_KEYS;
const JSON_COLUMNS_BY_KEY = HWP_SECTION_JSON_KEYS;

// CLI 인자는 main() 안에서만 파싱한다 — 예전엔 파일 최상위에서 parseArgs를
// 즉시 호출했는데, process.argv가 프로세스 전역이라 이 모듈의 순수 함수
// (classifyCell 등)를 재사용하려고 import만 하는 호출자가 여기 없는 플래그를
// 쓰면 import 시점에 그대로 throw했다(2026-08-06 build-admission-html-
// golden.mjs 사고와 동일 유형 — 잔여 5개 파일을 한 번에 정리하며 고친다).
let args = {};

// -----------------------------------------------------------------------
// 자격증명 — scripts/measure-admission-json-scope.mjs와 동일 컨벤션.
// -----------------------------------------------------------------------
async function resolveCredentials() {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SECRET_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };

  const keysFile = args["keys-file"] || process.env.SEED_KEYS_FILE;
  if (!keysFile) {
    throw new Error(
      "DB 자격증명을 찾을 수 없습니다. SEED_SUPABASE_URL/SEED_SECRET_KEY 환경변수를 " +
        "설정하거나 --keys-file <path>를 지정하세요.",
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
// 백업 파일 경로 (normalize-admission-html.mjs BLOCK6와 동일 원칙:
// 실행마다 새 타임스탬프 파일, 동명 파일 존재 시 무조건 거부)
// -----------------------------------------------------------------------
async function buildTimestampedBackupPath() {
  await mkdir(DEFAULT_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${DEFAULT_BACKUP_DIR}/admission-doc-backup-${stamp}.json`;
}

async function assertBackupFileDoesNotExist(path) {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(
    `백업 파일이 이미 존재합니다: ${path}\n` +
      "기존 백업(롤백 수단)을 덮어쓰지 않기 위해 중단합니다. --backup-file로 다른 경로를 지정하세요.",
  );
}

// -----------------------------------------------------------------------
// 순수 분류 로직(테스트 가능, DB/네트워크 의존 없음)
// -----------------------------------------------------------------------

/** @typedef {import("../src/lib/admissionDoc.ts").AdmissionDoc} AdmissionDoc */
/** @typedef {import("../src/lib/admissionDoc.ts").SectionKey} SectionKey */

/**
 * admission_university_resources 조회 행. 동적 select 컬럼 목록(baseColumns
 * + jsonColumns) 때문에 supabase-js가 이 쿼리의 결과 타입을 추론하지 못해
 * GenericStringError로 떨어진다. 실제로 dot 접근하는 컬럼만 명시하고, 카테고리별
 * raw/html/json 컬럼은 전부 동적 키(row[key] 형태)로만 접근하므로 별도 선언 없이도
 * (인덱스 시그니처가 없는 한) 암시적 any로 통과한다 — noImplicitAny가 꺼져 있다.
 */
/** @typedef {import("../src/types/database.types.ts").Tables<"admission_university_resources">} ResourceTableRow */
/**
 * @typedef {Pick<ResourceTableRow, "id" | "university_name" | "university_key" | "campus" | "detail_status" | "updated_at">} ResourceRow
 */

// legacy-html 분류 시 만드는 doc — RawHtmlBlock으로 저장 html을 무손실 보존한다.
/**
 * @param {SectionKey} sectionKey
 * @param {string} html
 * @returns {AdmissionDoc}
 */
export function buildCuratedHtmlDoc(sectionKey, html) {
  return {
    v: 1,
    section: sectionKey,
    source: "legacy-html",
    generator: BACKFILL_GENERATOR_TAG,
    generatedAt: new Date().toISOString(),
    blocks: [{ kind: "rawHtml", html, reason: "curated-html" }],
    warnings: [{ code: "curated-html-preserved" }],
  };
}

// 셀 하나(대학×카테고리) 분류. 반환: null(컬럼 미기록) | { doc, classification }
export function classifyCell(
  rawValue,
  htmlValue,
  sectionKey,
  row,
  universityName,
) {
  const rawText = clean(rawValue);
  const htmlText = clean(htmlValue);
  if (!rawText && !htmlText) return null;

  if (rawText) {
    const doc = buildRawSectionDoc(rawText, sectionKey, row, universityName);
    assertGenerationIdempotent(rawText, sectionKey, row, universityName);
    if (!htmlText) return { doc, classification: "parser" };

    const rendered = renderDocToHtml(doc, sectionKey);
    if (rendered === htmlText) return { doc, classification: "parser" };
    return {
      doc: buildCuratedHtmlDoc(sectionKey, htmlText),
      classification: "legacy-html",
    };
  }

  // rawText 없음 + htmlText 있음
  return {
    doc: buildCuratedHtmlDoc(sectionKey, htmlText),
    classification: "legacy-html",
  };
}

// 멱등 assert: 같은 입력으로 doc을 2회 생성해 stableStringifyDoc(generatedAt
// 제외 직렬화)이 동일해야 한다. 위반 시 즉시 throw — doc 생성이 비결정적
// 이면 이후 모든 안전장치(재감사 등)가 무의미해진다.
function assertGenerationIdempotent(rawText, sectionKey, row, universityName) {
  const once = stableStringifyDoc(
    buildRawSectionDoc(rawText, sectionKey, row, universityName),
  );
  const twice = stableStringifyDoc(
    buildRawSectionDoc(rawText, sectionKey, row, universityName),
  );
  if (once !== twice) {
    throw new Error(
      `멱등성 위반: ${universityName} / ${sectionKey} — buildRawSectionDoc을 2회 호출한 결과(generatedAt 제외)가 다릅니다.`,
    );
  }
}

// -----------------------------------------------------------------------
// 메인
// -----------------------------------------------------------------------
/**
 * stats/samples(Object.fromEntries로 CATEGORY_KEYS의 키 전부를 채워 만든
 * Record)처럼 "키 집합을 스스로 만들어놓고 그 키로만 접근"하는 객체에
 * 대한 도달 불가 가드. noUncheckedIndexedAccess 하에서 인덱스 시그니처
 * 접근은 항상 `T | undefined`가 되므로, 실제로는 항상 존재함을 보장하는
 * 지점에서만 쓴다.
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
      "keys-file": { type: "string" },
      category: { type: "string" },
      university: { type: "string" },
      limit: { type: "string" },
      "backup-file": { type: "string" },
      restore: { type: "string" },
    },
  }).values;

  if (args.category && !CATEGORY_KEYS.includes(args.category)) {
    throw new Error(
      `알 수 없는 --category: ${args.category} (허용: ${CATEGORY_KEYS.join(", ")})`,
    );
  }
  const targetCategories = args.category ? [args.category] : CATEGORY_KEYS;
  const limit = args.limit ? Number(args.limit) : null;

  const { url, serviceKey } = await resolveCredentials();
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      "dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.",
    );
  }
  const supabase = createClient(url, serviceKey);

  if (args.restore) {
    await runRestore(supabase, args.restore);
    return;
  }

  console.log(
    `=== 1) 자격 확인 (${args.apply ? "apply" : "dry-run"} 모드) ===`,
  );
  console.log(
    `대상 카테고리: ${targetCategories.join(", ")}${args.university ? ` / 대학: ${args.university}` : ""}${limit ? ` / limit: ${limit}` : ""}`,
  );

  console.log("\n=== 2) 조회 + 백업 ===");
  const backupFile =
    args["backup-file"] || (await buildTimestampedBackupPath());
  await assertBackupFileDoesNotExist(backupFile);

  const baseColumns = [
    "id",
    "university_name",
    "university_key",
    "campus",
    "detail_status",
    "updated_at",
    ...CATEGORY_KEYS,
    ...CATEGORY_KEYS.map((key) => HTML_COLUMNS_BY_KEY[key]),
  ];
  const jsonColumns = CATEGORY_KEYS.map((key) => JSON_COLUMNS_BY_KEY[key]);

  // sql/47_admission_section_json.sql(구 sql/43 — origin/dev와 번호
  // 충돌해 2026-08-06 재번호)이 아직 실행되지 않은 DB(신규 dev, 또는
  // 사용자가 아직 수동 적용 전인 운영)에서는 *_json 컬럼 자체가 없다.
  // dry-run(분류/집계)은 raw+html만 있으면 되므로, json 컬럼 select가
  // 42703(컬럼 없음)으로 실패하면 경고만 남기고 그 컬럼 없이 재시도한다
  // — --apply는 이 경우 sql/47 미실행을 스스로 감지해 아래서 막는다.
  let jsonColumnsExist = true;
  let query = supabase
    .from(TABLE)
    .select([...baseColumns, ...jsonColumns].join(", "))
    .order("id");
  if (args.university) query = query.eq("university_name", args.university);
  let { data: allRows, error: fetchError } = await query;
  if (fetchError && /does not exist/i.test(fetchError.message)) {
    console.warn(
      `[경고] *_json 컬럼이 아직 없습니다(sql/47_admission_section_json.sql 미실행으로 보입니다): ${fetchError.message}`,
    );
    console.warn(
      "[경고] json 컬럼 없이 raw/html만으로 재조회합니다(분류/집계는 가능, --apply는 차단됩니다).",
    );
    jsonColumnsExist = false;
    let retryQuery = supabase
      .from(TABLE)
      .select(baseColumns.join(", "))
      .order("id");
    if (args.university)
      retryQuery = retryQuery.eq("university_name", args.university);
    ({ data: allRows, error: fetchError } = await retryQuery);
  }
  if (fetchError) throw new Error(`행 조회 실패: ${fetchError.message}`);
  // supabase-js 계약상 error가 없으면 data는 null이 아니다.
  if (allRows === null) {
    throw new Error("행 조회 결과가 없습니다(data가 null) — 예상치 못한 상태");
  }
  if (args.apply && !jsonColumnsExist) {
    throw new Error(
      "*_json 컬럼이 없어 --apply를 실행할 수 없습니다. sql/47_admission_section_json.sql을 " +
        "Supabase SQL Editor에서 먼저 실행하세요.",
    );
  }

  // allRows는 동적 select라 GenericStringError[]로 추론된다(런타임은 정상 행
  // 배열). 위 두 쿼리(query/retryQuery)가 실제로 채우는 컬럼만 아는 로컬 타입으로
  // 캐스트한다 — 데이터 자체는 손대지 않는다.
  const typedAllRows = /** @type {ResourceRow[]} */ (
    /** @type {unknown} */ (allRows)
  );
  const rows = limit ? typedAllRows.slice(0, limit) : typedAllRows;
  await writeFile(backupFile, JSON.stringify(allRows, null, 2), "utf-8");
  console.log(`백업 완료: ${allRows.length}행(전체) → ${backupFile}`);
  console.log(`처리 대상: ${rows.length}행`);

  console.log("\n=== 3) 계산/분류 ===");
  const stats = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [key, { parser: 0, "legacy-html": 0, skip: 0 }]),
  );
  const samples = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [key, { parser: [], "legacy-html": [] }]),
  );
  const validationFailures = [];
  // 행별 payload — { id, updatedAt, patch:{ [jsonColumn]: doc } }
  const rowPatches = [];

  rows.forEach((row) => {
    const patch = {};
    let hasChange = false;

    targetCategories.forEach((key) => {
      const rawValue = row[key];
      const htmlValue = row[HTML_COLUMNS_BY_KEY[key]];
      const result = classifyCell(
        rawValue,
        htmlValue,
        key,
        row,
        row.university_name,
      );
      if (!result) {
        req(stats, key).skip += 1;
        return;
      }
      req(stats, key)[result.classification] += 1;
      if (req(samples, key)[result.classification].length < 3) {
        req(samples, key)[result.classification].push(row.university_name);
      }

      const validation = validateAdmissionDoc(result.doc);
      if (!validation.ok) {
        validationFailures.push({
          university: row.university_name,
          category: key,
          errors: validation.errors,
        });
        return; // 검증 실패 셀은 payload에 넣지 않는다(컬럼 미기록과 동일 취급, 실패는 별도 보고)
      }

      patch[JSON_COLUMNS_BY_KEY[key]] = result.doc;
      hasChange = true;
    });

    if (hasChange) {
      rowPatches.push({
        id: row.id,
        universityName: row.university_name,
        updatedAt: row.updated_at,
        patch,
      });
    }
  });

  console.log("\n=== 4) 집계 ===");
  console.log("카테고리별 분류(parser / legacy-html / 컬럼 미기록):");
  targetCategories.forEach((key) => {
    const s = req(stats, key);
    console.log(
      `  - ${key}: parser ${s.parser} / legacy-html ${s["legacy-html"]} / skip ${s.skip}`,
    );
  });
  console.log(`행 단위 변경 대상: ${rowPatches.length}/${rows.length}행`);
  if (validationFailures.length) {
    console.error(
      `validateAdmissionDoc 실패 ${validationFailures.length}건(payload 제외됨):`,
    );
    validationFailures.slice(0, 10).forEach((f) => {
      console.error(
        `  - ${f.university} / ${f.category}: ${f.errors.join("; ")}`,
      );
    });
  }

  console.log("\n=== 5) 샘플 ===");
  targetCategories.forEach((key) => {
    const s = req(samples, key);
    if (s.parser.length)
      console.log(`  - ${key} parser 샘플: ${s.parser.join(", ")}`);
    if (s["legacy-html"].length)
      console.log(
        `  - ${key} legacy-html 샘플: ${s["legacy-html"].join(", ")}`,
      );
  });

  if (!args.apply) {
    console.log(
      "\ndry-run 모드입니다. 실제 DB에는 아무것도 쓰지 않았습니다. --apply로 재실행하면 적용됩니다.",
    );
    return;
  }

  console.log("\n=== 6) 적용 ===");
  let updated = 0;
  const failedUpdates = [];
  const skippedByConcurrentEdit = [];

  for (const { id, universityName, updatedAt, patch } of rowPatches) {
    // 동시 편집 방어: UPDATE 직전 updated_at을 재조회해 백업 시점과
    // 다르면 건너뛴다(어드민에 낙관적 잠금이 없어 스크립트 결과가
    // 조용히 덮어써지는 사고를 막는다).
    const { data: freshRow, error: freshError } = await supabase
      .from(TABLE)
      .select("updated_at")
      .eq("id", id)
      .single();
    if (freshError) {
      failedUpdates.push({
        id,
        universityName,
        message: `재조회 실패: ${freshError.message}`,
      });
      continue;
    }
    if (freshRow.updated_at !== updatedAt) {
      skippedByConcurrentEdit.push({
        id,
        universityName,
        backedUpAt: updatedAt,
        currentAt: freshRow.updated_at,
      });
      continue;
    }

    let lastError = null;
    let succeeded = false;
    for (let attempt = 1; attempt <= 3 && !succeeded; attempt += 1) {
      const { error: updateError } = await supabase
        .from(TABLE)
        .update(patch)
        .eq("id", id);
      if (!updateError) {
        succeeded = true;
        updated += 1;
      } else {
        lastError = updateError;
      }
    }
    if (!succeeded) {
      failedUpdates.push({ id, universityName, message: lastError?.message });
      console.error(
        `  업데이트 실패(3회 재시도 후 포기): ${universityName} (id=${id}) — ${lastError?.message}`,
      );
    }
  }

  console.log(
    `적용 완료: ${updated}행 UPDATE, 실패 ${failedUpdates.length}건, 동시편집으로 스킵 ${skippedByConcurrentEdit.length}건.`,
  );
  if (skippedByConcurrentEdit.length) {
    console.error(
      "동시편집 스킵 목록(백업 시점 이후 다른 곳에서 수정됨 — 재실행 필요):",
    );
    skippedByConcurrentEdit.forEach((s) => {
      console.error(`  - ${s.universityName} (id=${s.id})`);
    });
  }
  if (failedUpdates.length) {
    console.error("실패 목록(재실행하면 재시도):");
    failedUpdates.forEach((f) => {
      console.error(`  - ${f.universityName} (id=${f.id}): ${f.message}`);
    });
  }

  console.log("\n=== 7) 재감사 ===");
  const { data: verifyRows, error: verifyError } = await supabase
    .from(TABLE)
    .select([...baseColumns, ...jsonColumns].join(", "))
    .order("id");
  if (verifyError) throw new Error(`재감사 조회 실패: ${verifyError.message}`);
  const typedVerifyRows = /** @type {ResourceRow[]} */ (
    /** @type {unknown} */ (verifyRows)
  );

  let residual = 0;
  typedVerifyRows.forEach((row) => {
    if (args.university && row.university_name !== args.university) return;
    targetCategories.forEach((key) => {
      const rawValue = row[key];
      const htmlValue = row[HTML_COLUMNS_BY_KEY[key]];
      const expected = classifyCell(
        rawValue,
        htmlValue,
        key,
        row,
        row.university_name,
      );
      const jsonCol = JSON_COLUMNS_BY_KEY[key];
      const actualDoc = row[jsonCol];

      if (!expected) return; // 컬럼 미기록 대상은 재감사하지 않는다(적용 단계에서 애초에 안 건드림)
      if (!actualDoc) return; // 검증 실패로 payload 제외된 셀 — validationFailures에서 이미 보고됨
      if (stableStringifyDoc(actualDoc) !== stableStringifyDoc(expected.doc))
        residual += 1;
    });
  });
  console.log(`재감사 결과: 기대값과 다른 잔여 건수 = ${residual}`);
  if (residual !== 0 || failedUpdates.length) {
    console.error(
      "경고: 잔여 건수 또는 실패 건수가 0이 아닙니다. 원인을 확인하세요.",
    );
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------
// --restore: 백업 파일에 기록된 *_json 값으로 되돌린다.
// -----------------------------------------------------------------------
async function runRestore(supabase, backupPath) {
  console.log(`=== 백업 복원: ${backupPath} ===`);
  const backupRows = JSON.parse(await readFile(backupPath, "utf-8"));
  console.log(`백업 행 수: ${backupRows.length}`);

  if (!args.apply) {
    console.log("dry-run 모드입니다. --apply를 추가하면 실제로 복원합니다.");
    console.log(
      `복원 대상 컬럼: ${CATEGORY_KEYS.map((key) => JSON_COLUMNS_BY_KEY[key]).join(", ")}`,
    );
    return;
  }

  let restored = 0;
  const failed = [];
  for (const row of backupRows) {
    const patch = {};
    CATEGORY_KEYS.forEach((key) => {
      patch[JSON_COLUMNS_BY_KEY[key]] = row[JSON_COLUMNS_BY_KEY[key]] ?? null;
    });
    const { error } = await supabase.from(TABLE).update(patch).eq("id", row.id);
    if (error)
      failed.push({
        id: row.id,
        universityName: row.university_name,
        message: error.message,
      });
    else restored += 1;
  }
  console.log(`복원 완료: ${restored}행, 실패 ${failed.length}건.`);
  if (failed.length) {
    failed.forEach((f) => {
      console.error(`  - ${f.universityName} (id=${f.id}): ${f.message}`);
    });
    process.exitCode = 1;
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
