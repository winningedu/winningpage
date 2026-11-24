// =====================================================================
// goal_university_cuts 1회 백필 실행 스크립트
//
// admission_results 전체를 api/_lib/goal/cutBackfill.ts 로 읽어
// src/lib/goal/goalCutBackfill.ts 의 computeGoalCutBackfill 로 (대학, 학과) 쌍당 normal/special 평균 컷을
// 산출하고 goal_university_cuts 에 upsert 한다. Admin.jsx 의 H-2 백필
// 패널과 **같은 순수 계산 함수**를 쓴다 — 로직을 복제하지 않는다(복제
// 하면 어드민 미리보기와 이 스크립트의 산출이 갈라지는 드리프트가
// 생긴다).
//
// 🔴 dev DB 전용. SUPABASE_URL 이 dev 프로젝트 ref(gjowqdiopinhixfivnkx)
// 를 포함하지 않으면 즉시 중단한다(운영 오조작 방지).
//
// upsert 는 onConflict: 'cut_type,university_key,department_key'
// (goal_university_cuts_key UNIQUE 인덱스, sql/55_goal_management.sql)라
// 재실행해도 안전하다(idempotent). is_active/note 는 payload 에 싣지
// 않는다 — 신규 행은 DB DEFAULT, 기존 행은 관리자가 설정한 노출·메모가
// 그대로 남는다(Admin.jsx 의 computeGoalCutBackfill 머리말 주석과 같은
// 규약).
//
// 사용법:
//   node scripts/run-goal-cuts-backfill.mjs                  (normal/special, 기존 동작)
//   node scripts/run-goal-cuts-backfill.mjs --cut-type jungsi (정시, QA3 §9-5 결정3)
//
// 환경변수(.env.local 에서 로드):
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY
// =====================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import {
  fetchBackfillSourceRows,
  fetchJungsiBackfillSourceRows,
} from "../api/_lib/goal/cutBackfill.ts";
import {
  computeGoalCutBackfill,
  computeGoalJungsiCutBackfill,
} from "../src/lib/goal/goalCutBackfill.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ENV_LOCAL_FILE = path.join(REPO_ROOT, ".env.local");

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const GOAL_CUTS_TABLE = "goal_university_cuts";
const GOAL_CUTS_CONFLICT = "cut_type,university_key,department_key";
// upsert 배치 크기. Admin.jsx 의 GOAL_CUTS_APPLY_CHUNK 와 같은 값이다 —
// PostgREST 21000(ON CONFLICT ... 같은 행 재적용) 회피를 위해 payload
// 는 이미 dedupe 돼 있지만, 요청 본문 크기도 여유 있게 잡는다.
const APPLY_CHUNK = 500;

// 어드민 UI 기본값(Admin.jsx GoalCutsBackfillPanel 의 useState('prefer2026'))
// 과 맞춘다 — 2026 우선, 그 쌍에 2026 교과/종합 행이 없으면 2025 로 폴백.
const YEAR_MODE = "prefer2026";

// ---------------------------------------------------------------------
// .env.local 로드(dotenv 미설치 — 이 저장소 다른 스크립트도 쓰지 않는
// 패턴이라 새 의존성을 추가하지 않고 최소 파서로 직접 읽는다).
// ---------------------------------------------------------------------
async function loadEnvLocal() {
  const raw = await readFile(ENV_LOCAL_FILE, "utf-8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  }
  return env;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// --cut-type jungsi | --cut-type=jungsi 를 읽는다. 지정하지 않으면 기존
// 동작(normal/special 동시 백필) 그대로다 — 기본값을 바꾸면 이 스크립트를
// 손 안 대고 재실행해 온 팀장 습관이 조용히 다른 결과를 낸다.
function parseCutTypeArg(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--cut-type") return argv[i + 1] ?? null;
    if (arg.startsWith("--cut-type=")) return arg.slice("--cut-type=".length);
  }
  return null;
}

async function runNormalSpecialBackfill(supabase) {
  console.log(
    `[1/4] admission_results 소스 행 읽는 중(yearMode=${YEAR_MODE})...`,
  );
  const sourceRows = await fetchBackfillSourceRows(supabase, YEAR_MODE, (p) => {
    process.stdout.write(`\r  ${p.done}/${p.total}`);
  });
  process.stdout.write("\n");
  console.log(`  소스 행수: ${sourceRows.length}`);

  console.log("[2/4] payload 산출 중...");
  const { payloads, stats } = computeGoalCutBackfill(sourceRows, YEAR_MODE);
  console.log(
    `  산출 payload: ${payloads.length}행 (normal ${stats.normalCount} / special ${stats.specialCount}, ` +
      `대학 ${stats.universityCount}개, 쌍 ${stats.pairCount}개)`,
  );
  console.log(
    `  연도 분포: 2026 ${stats.year2026Pairs}쌍 / 2025 ${stats.year2025Pairs}쌍, ` +
      `제외: star ${stats.excludedStarPairs} / empty ${stats.excludedEmptyPairs} / noTrack ${stats.excludedNoTrackPairs}, ` +
      `dedupe 병합 ${stats.mergedCount}건`,
  );
  return payloads;
}

// jungsi(정시) 백필 — QA3 §9-5 결정3. percentile 기준, yearMode 없음(최신
// result_year 우선을 함수 안에서 자동 판정한다).
async function runJungsiBackfill(supabase) {
  console.log("[1/4] admission_results 소스 행 읽는 중(percentile 기준)...");
  const sourceRows = await fetchJungsiBackfillSourceRows(supabase, (p) => {
    process.stdout.write(`\r  ${p.done}/${p.total}`);
  });
  process.stdout.write("\n");
  console.log(`  소스 행수: ${sourceRows.length}`);

  console.log("[2/4] payload 산출 중...");
  const { payloads, stats } = computeGoalJungsiCutBackfill(sourceRows);
  console.log(
    `  산출 payload: ${payloads.length}행 (대학 ${stats.universityCount}개, 쌍 ${stats.pairCount}개)`,
  );
  console.log(
    `  제외: star ${stats.excludedStarPairs} / empty ${stats.excludedEmptyPairs}, ` +
      `dedupe 병합 ${stats.mergedCount}건`,
  );
  return payloads;
}

async function main() {
  const cutType = parseCutTypeArg(process.argv.slice(2));
  if (cutType && cutType !== "jungsi") {
    throw new Error(
      `--cut-type 값이 잘못됐습니다: '${cutType}' (지원값: 'jungsi', 또는 생략하면 normal/special).`,
    );
  }

  const env = await loadEnvLocal();
  const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      ".env.local 에서 SUPABASE_URL / SUPABASE_SECRET_KEY 를 찾을 수 없습니다.",
    );
  }
  // 🔴 운영 오조작 방지 가드. dev ref 가 아니면 무조건 중단한다.
  if (!supabaseUrl.includes(DEV_PROJECT_REF)) {
    throw new Error(
      `SUPABASE_URL 이 dev 프로젝트(${DEV_PROJECT_REF})가 아닙니다: ${supabaseUrl} — 중단합니다.`,
    );
  }

  const supabase = createClient(supabaseUrl, secretKey);

  const payloads =
    cutType === "jungsi"
      ? await runJungsiBackfill(supabase)
      : await runNormalSpecialBackfill(supabase);

  if (payloads.length === 0) {
    console.log("산출 payload 가 0행입니다 — upsert 를 건너뜁니다.");
    return;
  }

  console.log("[3/4] goal_university_cuts upsert 중...");
  const chunks = chunk(payloads, APPLY_CHUNK);
  let okChunks = 0;
  let errorCount = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const { error } = await supabase
      .from(GOAL_CUTS_TABLE)
      .upsert(chunks[i], { onConflict: GOAL_CUTS_CONFLICT });
    if (error) {
      errorCount += 1;
      console.error(`  청크 ${i + 1}/${chunks.length} 실패: ${error.message}`);
      continue;
    }
    okChunks += 1;
    console.log(
      `  청크 ${i + 1}/${chunks.length} 성공 (${chunks[i].length}행)`,
    );
  }

  console.log("[4/4] 완료");
  console.log(
    `요약 — payload ${payloads.length}행, ` +
      `청크 ${chunks.length}개 중 성공 ${okChunks}개 / 실패 ${errorCount}개`,
  );
  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("백필 실행 실패:", err.message);
  process.exitCode = 1;
});
