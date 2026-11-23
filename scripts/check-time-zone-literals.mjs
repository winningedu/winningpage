// =====================================================================
// 시간대 하드코딩 검사 — 새로 들어오는 고정 시간대(Asia/Seoul, +09:00 등)를 막는다.
//
// 검사 대상: git 추적 파일 중 api/, src/, supabase/migrations/, scripts/ 아래의
// .ts .tsx .mjs .js .sql. 이미 적용된 마이그레이션(아래 기준 시각 이하)은 제외한다. 기존 적중 수는 scripts/time-zone-literals.baseline.json
// (파일 경로, 적중 수)에 고정하고, 그보다 늘면 실패한다.
//
// 사용:
//   node scripts/check-time-zone-literals.mjs            검사
//   node scripts/check-time-zone-literals.mjs --update   baseline 재생성
//   --root <dir>                                         다른 저장소 루트(테스트용)
// =====================================================================

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_PATH = "scripts/time-zone-literals.baseline.json";

const PATTERNS = [
  { re: /Asia\/Seoul/ },
  { re: /\+09:00|\+0900/ },
  { re: /9\s*\*\s*60\s*\*\s*60|9\s*\*\s*3600|KST_OFFSET/ },
  // UTC 날짜를 로컬 날짜처럼 쓰는 관용구
  { re: /toISOString\(\)\.slice\(0,\s*10\)/ },
  { re: /toISOString\(\)\.split\((["'])T\1\)\[0\]/ },
  // 로컬 getter/setter: 서버와 공용 lib에서만 막는다(UI는 브라우저 시간대가 로컬이다)
  {
    re: /\.(get|set)(Hours|Minutes|Date|Day|Month|FullYear)\(/,
    only: /^(api|src\/lib)\//,
  },
];

const EXEMPT = [
  /^src\/lib\/time\//,
  /\.(test|spec)\.(ts|tsx|sql)$/,
  /^e2e\//,
  /^scripts\/check-time-zone-literals\.(mjs|test\.mjs)$/,
];

// dev와 운영에 이미 적용된 마이그레이션은 고칠 수 없는 기록이라 세지 않는다.
// 파일명 앞 14자리 시각이 이 값 이하면 건너뛰고, 이후 마이그레이션만 검사한다.
const APPLIED_MIGRATION_CUTOFF = "20261123111847";

function isAppliedMigration(file) {
  const m = /^supabase\/migrations\/(\d{14})/.exec(file);
  return m !== null && (m[1] ?? "") <= APPLIED_MIGRATION_CUTOFF;
}

export function scan(root) {
  const files = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /^(api|src|supabase\/migrations|scripts)\//.test(f))
    .filter((f) => /\.(ts|tsx|mjs|js|sql)$/.test(f))
    .filter((f) => !EXEMPT.some((re) => re.test(f)))
    .filter((f) => !isAppliedMigration(f));
  const hits = {};
  for (const file of files) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    lines.forEach((text, i) => {
      if (/tz-literal-ok:\s*\S/.test(text)) return;
      for (const p of PATTERNS) {
        if (p.re.test(text) && (!p.only || p.only.test(file))) {
          hits[file] ??= [];
          hits[file].push({ line: i + 1, text: text.trim() });
        }
      }
    });
  }
  return hits;
}

function readBaseline(root) {
  try {
    return JSON.parse(readFileSync(join(root, BASELINE_PATH), "utf8"));
  } catch {
    return {};
  }
}

function main() {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf("--root");
  const root =
    rootIdx >= 0
      ? resolve(argv[rootIdx + 1] ?? ".")
      : join(dirname(fileURLToPath(import.meta.url)), "..");
  const hits = scan(root);
  if (argv.includes("--update")) {
    const counts = Object.fromEntries(
      Object.keys(hits)
        .sort()
        .map((f) => [f, hits[f].length]),
    );
    mkdirSync(dirname(join(root, BASELINE_PATH)), { recursive: true });
    writeFileSync(
      join(root, BASELINE_PATH),
      `${JSON.stringify(counts, null, 2)}\n`,
    );
    console.log(`baseline 갱신: 파일 ${Object.keys(counts).length}개`);
    process.exit(0);
  }
  const baseline = readBaseline(root);
  let failed = false;
  let shrunk = false;
  for (const [file, list] of Object.entries(hits)) {
    const allowed = baseline[file] ?? 0;
    if (list.length > allowed) {
      failed = true;
      console.error(`${file}: ${list.length} (baseline ${allowed})`);
      for (const h of list) console.error(`  ${file}:${h.line}: ${h.text}`);
    } else if (list.length < allowed) shrunk = true;
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    if ((hits[file]?.length ?? 0) < allowed) shrunk = true;
  }
  if (shrunk && !failed) {
    console.log(
      "baseline보다 적중이 줄었다. node scripts/check-time-zone-literals.mjs --update 로 baseline을 갱신한다.",
    );
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
