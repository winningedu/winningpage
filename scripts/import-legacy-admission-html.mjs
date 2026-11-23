// =====================================================================
// legacy 저장 HTML(*_html, curated-html) → 구조화 문서(AdmissionDoc) 임포터
//
// 배경: Phase 3 백필 dry-run 실측 결과 raw+html이 둘 다 있는 셀은 예외
// 없이 전량 legacy-html(RawHtmlBlock 무손실 보존)로 떨어졌다(parser
// 분류 0건). 이 스크립트는 그 RawHtmlBlock을 진짜 구조화 doc으로
// "승격"한다 — 저장 HTML을 파싱해 TableBlock을 복원한다.
//
// 유리한 조건(실측): 대상 HTML이 전부 기계 생성이라 방언이 균일하고,
// 바디 셀 병합이 0건이다(DB 717셀 전수 확인 — <td rowspan|colspan> 0건,
// 헤더 <th> 병합만 976건). parseHtmlTableGrid(admissionParsing.js)가
// 이 전제로 헤더 span은 보존하고 바디는 직사각형으로 추출한다.
//
// 대상 카테고리 6종 전부: previous_year_changes(change, 3컬럼) /
// selection_method(selection, 5컬럼 + 특수대학 11개교는 생성) /
// minimum_requirements·exam_schedule(표+emptyBox+plainList 3단 폴백) /
// school_record_method(recordInfo+score 혼합) / recruitment_quota
// (recruitExact 2단 헤더 + 구버전 recruit chips + plainList).
//
// detail_status='category' 11개교(경찰대학/사관학교4/과기원6)는 원본이
// 하드코딩 상수(SCIENCE_SPECIAL_DATA 등)라 역파싱하지 않는다 —
// buildSpecialCategoryDoc으로 생성한 뒤 동일하게 DOM 동형 검증만 한다.
//
// 검증: 바이트가 아니라 DOM 동형성이다. renderDocToHtml(importedDoc)와
// 원본 dbHtml을 정규화 DOM으로 비교한다(scripts/verify-admission-doc-
// equivalence.mjs의 Gate B 비교기와 동일 로직 — src/lib/admissionHtmlImport.js에
// 있다, 2026-08-06 이동). 실패하면 절대 강행하지 않는다 — doc은
// null로 두고 rawHtml(curated-html)을 그대로 유지, needsReview로 적재한다.
//
// 관례 정본: scripts/backfill-admission-doc.mjs(dry-run 기본 / 타임스탬프
// 백업 / 멱등 assert / DEV_PROJECT_REF 가드). **DB 쓰기 금지 — 이번
// 실행은 전부 dry-run이다. --apply는 구현만 하고 실행하지 않는다.**
//
// 사용법:
//   node scripts/import-legacy-admission-html.mjs                         # dry-run, 6개 카테고리 전체
//   node scripts/import-legacy-admission-html.mjs --category recruitment_quota
//   node scripts/import-legacy-admission-html.mjs --university 단국대학교(죽전)
//   node scripts/import-legacy-admission-html.mjs --limit 20
//   node scripts/import-legacy-admission-html.mjs --restore <backup.json> --apply
// =====================================================================

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  HWP_SECTION_JSON_KEYS,
  stableStringifyDoc,
} from "../src/lib/admissionDoc.ts";
// 오케스트레이션(importCell)과 DOM 동형성 비교기는 2026-08-06에
// src/lib/admissionHtmlImport.js로 옮겼다(위치만 이동, 동작 동일) —
// 어드민 일괄 엑셀 업로드(admissionBulkXlsx.js)가 브라우저에서 같은
// 로직을 재사용해야 하는데, 이 파일은 node:fs/promises·supabase client
// 생성이 있어 브라우저 번들에 못 들어간다. IMPORTER_CHAINS도 그 파일이
// 정본이다(여기서 재정의하지 않는다).
import {
  importCell,
  SUPPORTED_CATEGORY_KEYS,
} from "../src/lib/admissionHtmlImport.js";
import { HWP_SECTION_HTML_KEYS } from "../src/lib/admissionParsing.js";

/** @typedef {import("../src/lib/admissionDoc.ts").AdmissionDoc} AdmissionDoc */

/**
 * admission_university_resources 조회 행. 동적 select라 supabase-js가
 * 이 쿼리 결과를 GenericStringError로 추론한다. dot 접근하는 컬럼만
 * 선언하고, 카테고리별 html/json 컬럼은 전부 동적 키(row[key])로만
 * 접근하므로(noImplicitAny 꺼짐) 별도 선언 없이 암시적 any로 통과한다.
 */
/** @typedef {import("../src/types/database.types.ts").Tables<"admission_university_resources">} ResourceTableRow */
/** @typedef {Pick<ResourceTableRow, "id" | "university_name" | "detail_status" | "updated_at">} ResourceRow */

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
const DEFAULT_BACKUP_DIR = "/Users/hyunsoo/uwellnow/.admission-doc-backups";
const TABLE = "admission_university_resources";

// CLI 인자는 main() 안에서만 파싱한다(모듈 스코프에는 빈 객체로 시작) —
// 예전엔 파일 최상위에서 parseArgs를 즉시 호출했는데, process.argv가
// 프로세스 전역이라 이 모듈을 import만 하는 호출자(예: load-admission-
// content.mjs가 importCell을 재사용)가 여기 없는 플래그(예: --admission-year)
// 를 쓰면 import 시점에 그대로 throw했다(2026-08-06 build-admission-html-
// golden.mjs와 동일한 사고 유형 — 그쪽을 고치며 발견해 여기도 함께 고친다).
// resolveCredentials/main/runRestore는 이 변수를 클로저로 참조하고,
// main()이 실행 시작 시 실제 값을 채워 넣는다.
let args = {};

// -----------------------------------------------------------------------
// 자격증명
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

async function buildTimestampedBackupPath() {
  await mkdir(DEFAULT_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${DEFAULT_BACKUP_DIR}/admission-doc-import-backup-${stamp}.json`;
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

// importCell/compareDomEquivalence/compareStoredHtmlEquivalence는
// src/lib/admissionHtmlImport.js로 이동했다(위 import 참고) — 여기서는
// 더 이상 정의하지 않는다.

// -----------------------------------------------------------------------
// 메인
// -----------------------------------------------------------------------
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

  const targetCategories = args.category
    ? [args.category]
    : SUPPORTED_CATEGORY_KEYS;
  targetCategories.forEach((key) => {
    if (!SUPPORTED_CATEGORY_KEYS.includes(key)) {
      throw new Error(
        `알 수 없는 --category: ${key} (지원: ${SUPPORTED_CATEGORY_KEYS.join(", ")})`,
      );
    }
  });
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

  const htmlColumns = targetCategories.map((key) => HWP_SECTION_HTML_KEYS[key]);
  const jsonColumns = targetCategories.map((key) => HWP_SECTION_JSON_KEYS[key]);
  const selectColumns = [
    "id",
    "university_name",
    "detail_status",
    "updated_at",
    ...htmlColumns,
  ].join(", ");

  let query = supabase.from(TABLE).select(selectColumns).order("id");
  if (args.university) query = query.eq("university_name", args.university);
  const { data: allRows, error: fetchError } = await query;
  if (fetchError) throw new Error(`행 조회 실패: ${fetchError.message}`);
  const typedAllRows = /** @type {ResourceRow[]} */ (
    /** @type {unknown} */ (allRows)
  );

  const rows = limit ? typedAllRows.slice(0, limit) : typedAllRows;
  await writeFile(backupFile, JSON.stringify(allRows, null, 2), "utf-8");
  console.log(`백업 완료: ${allRows.length}행 → ${backupFile}`);
  console.log(`처리 대상: ${rows.length}행`);

  console.log("\n=== 3) 계산/분류(임포트 시도 + DOM 동형성 검증) ===");
  const stats = Object.fromEntries(
    targetCategories.map((key) => [
      key,
      { imported: 0, needsReview: 0, skip: 0, byCandidate: {} },
    ]),
  );
  const needsReviewSamples = Object.fromEntries(
    targetCategories.map((key) => [key, []]),
  );
  const rowPatches = [];

  rows.forEach((row) => {
    const patch = {};
    let hasChange = false;

    targetCategories.forEach((key) => {
      const dbHtml = row[HWP_SECTION_HTML_KEYS[key]];
      const result = /** @type {ImportCellResult} */ (
        importCell(key, dbHtml, row)
      );
      stats[key][result.classification] += 1;
      if (
        result.classification === "needsReview" &&
        needsReviewSamples[key].length < 10
      ) {
        needsReviewSamples[key].push({
          university: row.university_name,
          kind: result.kind,
          reason: result.reason,
        });
      }
      if (result.classification === "imported") {
        patch[HWP_SECTION_JSON_KEYS[key]] = result.doc;
        hasChange = true;
        const s = stats[key];
        s.byCandidate[result.candidateName] =
          (s.byCandidate[result.candidateName] || 0) + 1;
      }
    });

    if (hasChange)
      rowPatches.push({
        id: row.id,
        universityName: row.university_name,
        updatedAt: row.updated_at,
        patch,
      });
  });

  console.log("\n=== 4) 집계 — 카테고리별 DOM 동형 성공률 ===");
  targetCategories.forEach((key) => {
    const s = stats[key];
    const denom = s.imported + s.needsReview;
    const rate = denom ? ((s.imported / denom) * 100).toFixed(2) : "100.00";
    console.log(
      `  - ${key}: imported ${s.imported} / needsReview ${s.needsReview} / skip(원본 없음) ${s.skip}  → 성공률 ${rate}%`,
    );
  });

  // table 클래스 접미어 부분집합 허용(admissionParsing.js의 tableClassCompatible
  // 근거 주석 참고)이 실제로 적용된 규모 — minimum_requirements/exam_schedule의
  // 저장 HTML은 <table class="admission-data-table">뿐이라(접미어 없음)
  // .admission-modal-body .admission-minimum-table 등의 nth-child 폭 CSS가
  // 지금 적용되지 않고 있다. 임포트된 doc을 렌더하면 접미어가 붙어 그 CSS가
  // 새로 적용된다 — "표면 포맷 차이"가 아니라 실제 표 레이아웃 변화다.
  const TABLE_CLASS_SUFFIX_IMPACT_CATEGORIES = [
    "minimum_requirements",
    "exam_schedule",
  ];
  const suffixImpact = TABLE_CLASS_SUFFIX_IMPACT_CATEGORIES.filter((key) =>
    targetCategories.includes(key),
  ).map((key) => ({ key, count: stats[key].byCandidate.table || 0 }));
  if (suffixImpact.length) {
    console.log(
      "\n=== 4-1) table class 접미어 복원 참고(화면 변화 없음, 사용자 결정 2026-08-06) ===",
    );
    suffixImpact.forEach(({ key, count }) => {
      console.log(
        `  - ${key}: ${count}건 — admission-data-table만 있던 <table>에 admission-${key === "minimum_requirements" ? "minimum" : "exam"}-table이 붙는다. 이 접미어에 걸려 있던 nth-child 폭 CSS는 제거됐으므로(safehtml 처리) 화면 변화는 없다.`,
      );
    });
  }

  console.log("\n=== 5) needsReview 샘플(카테고리별 최대 10건, 유형 포함) ===");
  targetCategories.forEach((key) => {
    const samples = needsReviewSamples[key];
    if (!samples.length) return;
    console.log(`  [${key}]`);
    samples.forEach((s) => {
      console.log(`    - ${s.university} (${s.kind}): ${s.reason}`);
    });
  });

  if (!args.apply) {
    console.log("\ndry-run 모드입니다. 실제 DB에는 아무것도 쓰지 않았습니다.");
    console.log(
      `(--apply로 재실행하면 imported 판정 ${rowPatches.length}행에 한해 *_json 컬럼을 갱신합니다. 이번 세션에서는 실행하지 않습니다.)`,
    );
    return;
  }

  console.log("\n=== 6) 적용 ===");
  let updated = 0;
  const failedUpdates = [];
  const skippedByConcurrentEdit = [];

  for (const { id, universityName, updatedAt, patch } of rowPatches) {
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
      skippedByConcurrentEdit.push({ id, universityName });
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
    if (!succeeded)
      failedUpdates.push({ id, universityName, message: lastError?.message });
  }
  console.log(
    `적용 완료: ${updated}행, 실패 ${failedUpdates.length}건, 동시편집 스킵 ${skippedByConcurrentEdit.length}건.`,
  );

  console.log("\n=== 7) 재감사 ===");
  const { data: verifyRows, error: verifyError } = await supabase
    .from(TABLE)
    .select(
      [
        "id",
        "university_name",
        "detail_status",
        ...htmlColumns,
        ...jsonColumns,
      ].join(", "),
    )
    .order("id");
  if (verifyError) throw new Error(`재감사 조회 실패: ${verifyError.message}`);
  const typedVerifyRows = /** @type {ResourceRow[]} */ (
    /** @type {unknown} */ (verifyRows)
  );

  let residual = 0;
  typedVerifyRows.forEach((row) => {
    if (args.university && row.university_name !== args.university) return;
    targetCategories.forEach((key) => {
      const dbHtml = row[HWP_SECTION_HTML_KEYS[key]];
      const expected = /** @type {ImportCellResult} */ (
        importCell(key, dbHtml, row)
      );
      if (expected.classification !== "imported") return;
      const actualDoc = row[HWP_SECTION_JSON_KEYS[key]];
      if (
        !actualDoc ||
        stableStringifyDoc(actualDoc) !== stableStringifyDoc(expected.doc)
      )
        residual += 1;
    });
  });
  console.log(`재감사 결과: 기대값과 다른 잔여 건수 = ${residual}`);
  if (residual !== 0 || failedUpdates.length) {
    console.error("경고: 잔여 건수 또는 실패 건수가 0이 아닙니다.");
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------
// --restore: 백업 파일(조회 시점 전체 스냅샷)에 기록된 *_json 값으로
// 되돌린다. 백업은 항상 조회 즉시(적용 이전) 찍히므로, 이 파일로 복원하면
// 이번 --apply가 쓰기 전 상태로 정확히 돌아간다.
// -----------------------------------------------------------------------
async function runRestore(supabase, backupPath) {
  console.log(`=== 백업 복원: ${backupPath} ===`);
  const backupRows = JSON.parse(await readFile(backupPath, "utf-8"));
  console.log(`백업 행 수: ${backupRows.length}`);

  if (!args.apply) {
    console.log("dry-run 모드입니다. --apply를 추가하면 실제로 복원합니다.");
    console.log(
      `복원 대상 컬럼: ${Object.values(HWP_SECTION_JSON_KEYS).join(", ")}`,
    );
    return;
  }

  let restored = 0;
  const failed = [];
  for (const row of backupRows) {
    const patch = {};
    Object.values(HWP_SECTION_JSON_KEYS).forEach((jsonCol) => {
      patch[jsonCol] = row[jsonCol] ?? null;
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
