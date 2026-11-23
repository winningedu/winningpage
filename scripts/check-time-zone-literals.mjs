// =====================================================================
// 시간대 하드코딩 검사 — 새로 들어오는 고정 시간대(Asia/Seoul, +09:00 등)를 막는다.
//
// 검사 대상: git 추적 파일 중 api/, src/, supabase/migrations/, scripts/ 아래의
// .ts .tsx .mjs .js .sql. 기존 적중 수는 scripts/time-zone-literals.baseline.json
// (파일 경로, 적중 수)에 고정하고, 그보다 늘면 실패한다.
//
// 사용:
//   node scripts/check-time-zone-literals.mjs            검사
//   node scripts/check-time-zone-literals.mjs --update   baseline 재생성
//   --root <dir>                                         다른 저장소 루트(테스트용)
// =====================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_PATH = "scripts/time-zone-literals.baseline.json";

const PATTERNS = [
  { name: "Asia/Seoul", test: (line) => /Asia\/Seoul/.test(line) },
];

export function scan(root) {
  const files = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /^(api|src|supabase\/migrations|scripts)\//.test(f))
    .filter((f) => /\.(ts|tsx|mjs|js|sql)$/.test(f));
  const hits = {};
  for (const file of files) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    lines.forEach((text, i) => {
      if (/tz-literal-ok:\s*\S/.test(text)) return;
      for (const p of PATTERNS) {
        if (p.test(text)) {
          hits[file] ??= [];
          hits[file].push({ line: i + 1, text: text.trim() });
        }
      }
    });
  }
  return hits;
}

function main() {
  const argv = process.argv.slice(2);
  const rootIdx = argv.indexOf("--root");
  const root =
    rootIdx >= 0
      ? resolve(argv[rootIdx + 1])
      : join(dirname(fileURLToPath(import.meta.url)), "..");
  const hits = scan(root);
  let failed = false;
  for (const [file, list] of Object.entries(hits)) {
    failed = true;
    console.error(`${file}: ${list.length} (baseline 0)`);
    for (const h of list) console.error(`  ${file}:${h.line}: ${h.text}`);
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
