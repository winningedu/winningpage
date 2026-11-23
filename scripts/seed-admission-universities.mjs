// =====================================================================
// admission_universities 대학 마스터 테이블 시드 스크립트
//
// src/pages/AdmissionGuidelines.jsx의 UNIVERSITY_DIRECTORY(일반 대학)와
// SPECIAL_UNIVERSITY_GROUPS(경찰대/과학기술원/사관학교 그룹)를 소스코드
// 텍스트에서 직접 파싱해 admission_universities에 upsert(name 기준)한다.
//
// 사용법:
//   node scripts/seed-admission-universities.mjs [--dry-run]
//
// 키 조회 순서 (하드코딩 금지):
//   1) SEED_SUPABASE_URL / SEED_SECRET_KEY 환경변수
//   2) --keys-file <path> 로 지정한 JSON (Supabase 대시보드 API keys export 형식,
//      name === 'service_role' 항목의 api_key 사용)
//   3) 기본값: scratchpad의 dev-keys.json (SEED_KEYS_FILE 로 재지정 가능)
//
// 안전장치:
//   - upsert onConflict: 'name' — 재실행해도 중복 insert 되지 않음(idempotent).
//   - --dry-run 이면 파싱 결과 개수·샘플만 출력하고 DB에 쓰지 않음.
// =====================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SOURCE_FILE = path.join(REPO_ROOT, "src/pages/AdmissionGuidelines.jsx");
const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const DEFAULT_KEYS_FILE =
  "/private/tmp/claude-501/-Users-hyunsoo-uwellnow-winningpage/7d913b11-451e-4002-a293-f999f0a2dad9/scratchpad/dev-keys.json";

// CLI 인자는 main() 안에서만 파싱한다(2026-08-06 build-admission-html-
// golden.mjs 사고와 동일 유형 결함 정리 — 이 파일은 원래 isMainModule
// 가드조차 없이 파일 하단에서 main()을 무조건 실행했다. import만 해도
// 실제 Supabase 호출을 시도할 뻔한 상태였다).
let args = {};

// ---------------------------------------------------------------------
// 1) 소스 파싱: UNIVERSITY_DIRECTORY + SPECIAL_UNIVERSITY_GROUPS
// ---------------------------------------------------------------------
async function parseUniversitySource() {
  const text = await readFile(SOURCE_FILE, "utf-8");

  const directoryMatch = text.match(
    /const UNIVERSITY_DIRECTORY = \[([\s\S]*?)\n\];/,
  );
  if (!directoryMatch) {
    throw new Error("UNIVERSITY_DIRECTORY 블록을 찾을 수 없습니다.");
  }
  // 캡처 그룹 ([\s\S]*?)이 필수(옵셔널 아님)라 directoryMatch가 존재하면
  // directoryMatch[1]도 항상 존재한다.
  const directoryBlock = directoryMatch[1];
  if (directoryBlock === undefined) {
    throw new Error("UNIVERSITY_DIRECTORY 블록 캡처 실패(예상치 못한 상태)");
  }
  const entryRe = /\{\s*region:\s*'([^']+)',\s*name:\s*'([^']+)'\s*\}/g;
  const generalRows = [];
  for (const m of directoryBlock.matchAll(entryRe)) {
    const region = m[1];
    const name = m[2];
    if (region === undefined || name === undefined) {
      throw new Error("UNIVERSITY_DIRECTORY 항목 파싱 실패(region/name 누락)");
    }
    generalRows.push({ region, name, special_group: null });
  }

  const groupsMatch = text.match(
    /const SPECIAL_UNIVERSITY_GROUPS = \[([\s\S]*?)\n\];/,
  );
  if (!groupsMatch) {
    throw new Error("SPECIAL_UNIVERSITY_GROUPS 블록을 찾을 수 없습니다.");
  }
  // 위와 동일한 이유로 groupsMatch[1]도 항상 존재한다.
  const groupsBlock = groupsMatch[1];
  if (groupsBlock === undefined) {
    throw new Error(
      "SPECIAL_UNIVERSITY_GROUPS 블록 캡처 실패(예상치 못한 상태)",
    );
  }
  const groupBlockRe =
    /\{\s*key:\s*'([^']+)'[\s\S]*?items:\s*\[([\s\S]*?)\]\s*\}/g;
  const specialRows = [];
  for (const g of groupsBlock.matchAll(groupBlockRe)) {
    const groupKey = g[1];
    const itemsBlock = g[2];
    if (groupKey === undefined || itemsBlock === undefined) {
      throw new Error(
        "SPECIAL_UNIVERSITY_GROUPS 항목 파싱 실패(key/items 누락)",
      );
    }
    const itemRe = /\{\s*region:\s*'([^']+)',\s*name:\s*'([^']+)'\s*\}/g;
    for (const im of itemsBlock.matchAll(itemRe)) {
      const region = im[1];
      const name = im[2];
      if (region === undefined || name === undefined) {
        throw new Error(
          `SPECIAL_UNIVERSITY_GROUPS(${groupKey}) 항목 파싱 실패(region/name 누락)`,
        );
      }
      specialRows.push({ region, name, special_group: groupKey });
    }
  }

  const rows = [...generalRows, ...specialRows].map((row, index) => ({
    ...row,
    sort_order: index,
  }));

  return rows;
}

// ---------------------------------------------------------------------
// 2) 서비스 키 로드
// ---------------------------------------------------------------------
async function resolveCredentials() {
  const envUrl = process.env.SEED_SUPABASE_URL;
  const envKey = process.env.SEED_SECRET_KEY;
  if (envUrl && envKey) {
    return { url: envUrl, serviceKey: envKey };
  }

  const keysFile =
    args["keys-file"] || process.env.SEED_KEYS_FILE || DEFAULT_KEYS_FILE;
  const raw = JSON.parse(await readFile(keysFile, "utf-8"));
  const serviceEntry = raw.find((entry) => entry.name === "service_role");
  if (!serviceEntry) {
    throw new Error(`${keysFile}에서 service_role 키를 찾을 수 없습니다.`);
  }
  return {
    url: `https://${DEV_PROJECT_REF}.supabase.co`,
    serviceKey: serviceEntry.api_key,
  };
}

// ---------------------------------------------------------------------
// 3) 실행
// ---------------------------------------------------------------------
async function main() {
  args = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      "keys-file": { type: "string" },
    },
  }).values;

  const rows = await parseUniversitySource();

  const byRegion = rows.reduce((acc, r) => {
    acc[r.region] = (acc[r.region] || 0) + 1;
    return acc;
  }, {});
  const byGroup = rows.reduce((acc, r) => {
    const key = r.special_group || "none";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(`파싱 결과: 총 ${rows.length}행`);
  console.log("region별 분포:", byRegion);
  console.log("special_group별 분포:", byGroup);
  console.log("샘플(처음 3 / 마지막 3):", [
    ...rows.slice(0, 3),
    ...rows.slice(-3),
  ]);

  if (args["dry-run"]) {
    console.log("--dry-run: DB에 쓰지 않고 종료합니다.");
    return;
  }

  const { url, serviceKey } = await resolveCredentials();
  if (!url.includes(DEV_PROJECT_REF)) {
    throw new Error(
      "dev 프로젝트(gjowqdiopinhixfivnkx)가 아닌 URL입니다. 중단합니다.",
    );
  }
  const supabase = createClient(url, serviceKey);

  const { error, count } = await supabase
    .from("admission_universities")
    .upsert(rows, { onConflict: "name", count: "exact" });

  if (error) {
    throw new Error(`upsert 실패: ${error.message}`);
  }
  console.log(`upsert 완료: ${count ?? rows.length}행 처리`);
}

// isMainModule 가드 — 원래 없이 main()을 무조건 실행했다. import만 해도
// 실제 Supabase 호출을 시도할 뻔했다(이 파일이 export하는 함수는 없지만,
// 나머지 4개 파일과 통일하는 김에 이 파일도 같은 구조로 맞춘다).
const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
