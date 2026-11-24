// =====================================================================
// *_json 문서와 *_html 컬럼 드리프트 감지 스크립트 (읽기 전용)
//
// 배경: Admin.jsx의 "파싱 실행"(AdmissionParsingPreview/buildPreviewPatch)이
// htmlKey만 재생성하고 jsonKey는 그대로 두는 결함이 있었다(2026-08-06
// 확인, safehtml이 수정 중). 이 스크립트는 그 결함(또는 유사한 사고)이
// 실제로 데이터에 반영됐는지 감사한다 — 현재 저장된 *_json을
// renderDocToHtml로 재렌더한 결과와 현재 저장된 *_html을 비교해서 둘이
// 서로 다른 셀을 찾아낸다. 앞으로도 어드민 수정 후 정기적으로 돌려
// 어긋남을 조기에 잡는 안전망 용도다.
//
// 비교 기준은 백필 시점(scripts/import-legacy-admission-html.mjs)에 쓴 것과
// 동일한 compareStoredHtmlEquivalence(src/lib/admissionHtmlImport.js,
// 2026-08-06 이동)를 재사용한다(heading/
// table-wrap 유무, table class 접미어 허용 등 이미 알려진 "허용 diff"는
// 여기서도 동일하게 무시해야 "드리프트"가 그 이후의 진짜 변경만
// 가리킨다 — 기준이 다르면 백필 시점부터 있던 구조 차이까지 오탐으로
// 잡힌다).
//
// 한쪽만 존재(html은 있는데 json이 비어 있음, 또는 그 반대)도 드리프트로
// 집계한다 — 두 표현이 같은 콘텐츠를 나타내야 한다는 계약 자체가 깨진
// 상태이기 때문이다.
//
// **읽기 전용 — DB에 쓰지 않는다.**
//
// 사용법:
//   node scripts/verify-admission-doc-html-drift.mjs [--admission-year 2027] [--keys-file <path>]
//
// 키 조회 순서(하드코딩 금지) — scripts/load-admission-content.mjs와 동일:
//   1) SEED_SUPABASE_URL / SEED_SECRET_KEY 환경변수
//   2) --keys-file <path>
//   3) 기본값: 저장소 루트의 .dev-keys.json (gitignore 처리됨,
//      SEED_KEYS_FILE 로 재지정 가능)
// =====================================================================

import { readFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { HWP_SECTION_JSON_KEYS } from "../src/lib/admissionDoc.ts";
// compareStoredHtmlEquivalence는 2026-08-06 src/lib/admissionHtmlImport.js로
// 이동했다(위치만 이동, 동작 동일) — 원래 import-legacy-admission-html.mjs에
// 있었다.
import { compareStoredHtmlEquivalence } from "../src/lib/admissionHtmlImport.js";
import {
  clean,
  HWP_SECTION_HTML_KEYS,
  renderDocToHtml,
} from "../src/lib/admissionParsing.js";

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const DEFAULT_KEYS_FILE = fileURLToPath(
  new URL("../.dev-keys.json", import.meta.url),
);
const TABLE = "admission_university_resources";
const CATEGORY_KEYS = Object.keys(HWP_SECTION_HTML_KEYS);
const MAX_DIFF_SAMPLES = 30;

/**
 * admission_university_resources 조회 행. 동적 select(columns)라
 * supabase-js가 이 쿼리 결과를 GenericStringError로 추론한다. dot 접근하는
 * university_name만 선언하고, 카테고리별 html/json 컬럼은 전부 동적 키
 * (row[key])로만 접근하므로(noImplicitAny 꺼짐) 별도 선언 없이 암시적
 * any로 통과한다.
 */
/** @typedef {import("../src/types/database.types.ts").Tables<"admission_university_resources">} ResourceTableRow */
/** @typedef {Pick<ResourceTableRow, "university_name">} ResourceRow */

// CLI 인자는 직접 실행(isMainModule) 분기 안에서만 파싱해 함수 인자로
// 넘긴다 — runDriftVerification은 export된 함수라 다른 스크립트가
// import해서 재사용할 수 있는데, 예전엔 파일 최상위에서 parseArgs를
// 즉시 호출해서 그 호출자의 process.argv에 이 스크립트가 모르는 플래그가
// 있으면 import 시점에 그대로 throw했다(2026-08-06 build-admission-html-
// golden.mjs 사고와 동일 유형 — 내가 이 파일을 만들면서도 반복했다).
async function resolveCredentials(keysFileOverride) {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SECRET_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };

  const keysFile =
    keysFileOverride || process.env.SEED_KEYS_FILE || DEFAULT_KEYS_FILE;
  const raw = JSON.parse(await readFile(keysFile, "utf-8"));
  const serviceEntry = raw.find((entry) => entry.name === "service_role");
  if (!serviceEntry)
    throw new Error(`${keysFile}에서 service_role 키를 찾을 수 없습니다.`);
  return {
    url: `https://${DEV_PROJECT_REF}.supabase.co`,
    serviceKey: serviceEntry.api_key,
  };
}

/**
 * @param {{ verbose?: boolean, admissionYear?: number, keysFile?: string | undefined }} [options]
 */
export async function runDriftVerification({
  verbose = true,
  admissionYear = 2027,
  keysFile,
} = {}) {
  const { url, serviceKey } = await resolveCredentials(keysFile);
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      "dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.",
    );
  }
  const supabase = createClient(url, serviceKey);

  const columns = [
    "university_name",
    ...CATEGORY_KEYS.map((key) => HWP_SECTION_HTML_KEYS[key]),
    ...CATEGORY_KEYS.map((key) => HWP_SECTION_JSON_KEYS[key]),
  ].join(", ");

  const { data: rawRows, error } = await supabase
    .from(TABLE)
    .select(columns)
    .eq("admission_year", admissionYear);
  if (error) throw new Error(`행 조회 실패: ${error.message}`);
  const rows = /** @type {ResourceRow[]} */ (/** @type {unknown} */ (rawRows));

  let total = 0;
  let matched = 0;
  const mismatches = [];

  (rows || []).forEach((row) => {
    CATEGORY_KEYS.forEach((key) => {
      const htmlKey = HWP_SECTION_HTML_KEYS[key];
      const jsonKey = HWP_SECTION_JSON_KEYS[key];
      const storedHtml = clean(row[htmlKey]);
      const doc = row[jsonKey];
      const hasDoc = Boolean(
        doc && Array.isArray(doc.blocks) && doc.blocks.length,
      );

      if (!storedHtml && !hasDoc) return; // 원자료 없음 — 비교 대상 아님

      if (!storedHtml || !hasDoc) {
        total += 1;
        mismatches.push({
          university: row.university_name,
          key,
          reason: !storedHtml
            ? "html 없음(json만 존재)"
            : "json 없음 또는 빈 문서(html만 존재)",
        });
        return;
      }

      total += 1;
      let comparison;
      try {
        const rendered = renderDocToHtml(doc, key);
        comparison = compareStoredHtmlEquivalence(rendered, storedHtml);
      } catch (err) {
        comparison = { ok: false, reason: `예외: ${err.message}` };
      }

      if (comparison.ok) {
        matched += 1;
      } else {
        mismatches.push({
          university: row.university_name,
          key,
          reason: comparison.reason,
        });
      }
    });
  });

  const matchRate = total ? (matched / total) * 100 : 100;

  if (verbose) {
    console.log(
      `[doc-html-drift] 대상 행: ${rows?.length ?? 0}개교, 비교 대상: ${total}건(행 × 카테고리)`,
    );
    console.log(
      `[doc-html-drift] 일치: ${matched}건 (${matchRate.toFixed(2)}%)`,
    );
    if (mismatches.length) {
      console.error(`[doc-html-drift] 불일치 ${mismatches.length}건:`);
      mismatches.slice(0, MAX_DIFF_SAMPLES).forEach((m) => {
        console.error(`  - [${m.university}] ${m.key}: ${m.reason}`);
      });
      if (mismatches.length > MAX_DIFF_SAMPLES) {
        console.error(
          `  ... 외 ${mismatches.length - MAX_DIFF_SAMPLES}건 생략`,
        );
      }
    } else {
      console.log("[doc-html-drift] 드리프트 없음 — json/html 전 항목 일치.");
    }
  }

  return { total, matched, matchRate, mismatches };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const args = parseArgs({
    options: {
      "admission-year": { type: "string", default: "2027" },
      "keys-file": { type: "string" },
    },
  }).values;

  runDriftVerification({
    admissionYear: Number(args["admission-year"]),
    keysFile: args["keys-file"],
  })
    .then(({ mismatches }) => {
      process.exitCode = mismatches.length ? 1 : 0;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
