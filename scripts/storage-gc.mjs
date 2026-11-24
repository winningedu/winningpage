#!/usr/bin/env node

// Supabase Storage 고아 파일 GC — "DB 참조 URL 집합 vs 스토리지 실파일" 대조.
//
// 사용법:
//   node scripts/storage-gc.mjs --env .env.local                  (드라이런, banners만)
//   node scripts/storage-gc.mjs --env .env.local --grace-days 14
//   node scripts/storage-gc.mjs --env .env.local --buckets banners,performance-guides
//   node scripts/storage-gc.mjs --env .env.local --delete         (실삭제 — 아래 안전장치 참조)
//
// 동작:
//   1. 대상 버킷을 재귀 리스팅해 실파일 목록을 만든다.
//   2. 전 public 테이블에서 스토리지 참조를 수집한다 — 절대 URL
//      (…/storage/v1/object/public/<bucket>/<path>)과 버킷 상대경로
//      (performance_attachments.storage_path 같은 bare path) 둘 다.
//   3. 미참조이면서 updated_at이 유예기간(--grace-days, 기본 7일)보다 오래된
//      파일만 삭제 후보로 잡는다. 방금 업로드됐지만 DB 반영 전인 파일 보호.
//
// 삭제는 반드시 Storage API(remove)로만 한다. SQL로 storage.objects 행을
// 지우면 S3 실파일이 고아가 되므로 절대 금지.
// https://supabase.com/docs/guides/storage/management/delete-objects
//
// 안전장치:
//   - --delete 없으면 드라이런: 후보 목록·합계만 출력, 아무것도 안 지운다.
//   - mentor-applications(유저 지원서)·performance-guides(유저 첨부)는 기본
//     제외 — --buckets로 명시해야만 대상이 된다.
//   - 참조 수집이 비정상이면(참조 0건, 테이블 스캔 실패 존재) 삭제 거부.
//   - 버킷 전체가 미참조로 나오면(참조 0건 버킷) 해당 버킷 삭제 거부.

import { readFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// CLI 인자
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

const ENV_FILE = argValue("--env");
const GRACE_DAYS = Number(argValue("--grace-days") ?? 7);
const DELETE = args.includes("--delete");

// 유저 업로드 버킷은 기본 제외 — --buckets로 명시해야만 포함된다.
const ALL_BUCKETS = ["banners", "performance-guides", "mentor-applications"];

// 코드 소유 영구 보관 파일 — DB에 참조가 없어도 절대 삭제하지 않는다.
// premium-book/booklet.pdf: 프리미엄 북 원본 PDF. 어드민이 고정 경로에
// upsert하고 DB엔 WebP 페이지 URL만 저장된다 (PremiumBookAdmin, 명세 §D3b).
const KEEP = new Set(["banners/premium-book/booklet.pdf"]);
const DEFAULT_BUCKETS = ["banners"];
const BUCKETS =
  argValue("--buckets")
    ?.split(",")
    .map((s) => s.trim()) ?? DEFAULT_BUCKETS;

if (!ENV_FILE) {
  console.error(
    "사용법: node scripts/storage-gc.mjs --env <envfile> [--grace-days N] [--buckets a,b] [--delete]",
  );
  process.exit(1);
}
if (!Number.isFinite(GRACE_DAYS) || GRACE_DAYS < 0) {
  console.error(`--grace-days 값이 잘못됨: ${argValue("--grace-days")}`);
  process.exit(1);
}
for (const b of BUCKETS) {
  if (!ALL_BUCKETS.includes(b)) {
    console.error(`알 수 없는 버킷: ${b} (가능: ${ALL_BUCKETS.join(", ")})`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// env 로딩 (seed-from-dev.mjs와 동일 방식)
// ---------------------------------------------------------------------------

function readEnvFile(file) {
  const env = {};
  const raw = readFileSync(path.resolve(file), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error(`${file}에 SUPABASE_URL / SUPABASE_SECRET_KEY 필요`);
  return { url: url.replace(/\/$/, ""), key };
}

const { url: SUPABASE_URL, key: SERVICE_KEY } = readEnvFile(ENV_FILE);
const HEADERS = { apikey: SERVICE_KEY };
const JSON_HEADERS = { ...HEADERS, "Content-Type": "application/json" };

// ---------------------------------------------------------------------------
// 1. 버킷 재귀 리스팅
// ---------------------------------------------------------------------------

const LIST_PAGE = 1000;

async function listBucket(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/${bucket}`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          prefix,
          limit: LIST_PAGE,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
      },
    );
    if (!res.ok)
      throw new Error(
        `${bucket} 리스팅 실패(${prefix || "/"}): HTTP ${res.status}`,
      );
    const objs = await res.json();
    if (!Array.isArray(objs))
      throw new Error(`${bucket} 리스팅 응답이 배열이 아님(${prefix || "/"})`);
    for (const o of objs) {
      const p = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null)
        out.push(...(await listBucket(bucket, p))); // 폴더
      else if (!p.endsWith(".emptyFolderPlaceholder"))
        out.push({
          path: p,
          size: o.metadata?.size ?? 0,
          updatedAt: o.updated_at ?? o.created_at ?? null,
        });
    }
    if (objs.length < LIST_PAGE) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. 전 public 테이블에서 참조 수집
// ---------------------------------------------------------------------------

// 절대 URL: …/storage/v1/{object|render}/{public|sign|authenticated}/<bucket>/<path>
const ABS_URL_RE =
  /storage\/v1\/(?:object|render)\/(?:public|sign|authenticated)\/([a-z0-9_-]+)\/([^"'\\\s?]+)/g;

// OpenAPI 스펙에서 테이블·컬럼 타입을 읽어 문자열/JSON/배열 컬럼만 스캔한다.
// 숫자·불리언뿐인 테이블은 참조를 담을 수 없으므로 스킵 — 샘플링 휴리스틱과
// 달리 스키마 기반이라 놓칠 수 없다.
async function fetchTableSpecs() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: HEADERS });
  if (!res.ok) throw new Error(`OpenAPI 스펙 조회 실패: HTTP ${res.status}`);
  const spec = await res.json();
  const tables = [];
  for (const [name, def] of Object.entries(spec.definitions ?? {})) {
    const cols = Object.entries(def.properties ?? {})
      .filter(([, p]) => {
        if (p.type === "string" || p.type === "array") return true;
        return /json/i.test(p.format ?? "");
      })
      .map(([col]) => col);
    tables.push({ name, cols });
  }
  return tables;
}

// row 값(중첩 JSON 포함)에서 문자열을 전부 뽑아 참조 후보로 넘긴다.
function collectStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) collectStrings(v, out);
}

// pathIndex: 실파일 경로 → 그 경로를 가진 버킷 목록. bare path(버킷 상대경로)
// 참조는 정규식 추측 대신 실파일 목록과의 정확 대조로 인정한다 —
// performance_attachments.storage_path 같은 컬럼이 여기에 걸린다.
function scanString(str, refs, pathIndex) {
  for (const m of str.matchAll(ABS_URL_RE)) {
    let p = m[2];
    try {
      p = decodeURIComponent(p);
    } catch {}
    refs.add(`${m[1]}/${p}`);
  }
  // 문자열 전체가 곧 상대경로인 경우 (storage_path 컬럼 등)
  const bare = str.trim().replace(/^\//, "");
  const hit = pathIndex.get(bare);
  if (hit) for (const bucket of hit) refs.add(`${bucket}/${bare}`);
  // 긴 텍스트(HTML/마크다운) 안에 상대경로가 박힌 경우 — 확장자 있는 토큰만 추출
  if (str.length > bare.length || !hit) {
    for (const m of str.matchAll(
      /[\w\-./]+\.(?:png|jpe?g|webp|gif|svg|pdf|mp4|webm)/gi,
    )) {
      const token = m[0].replace(/^\//, "");
      const tokenHit = pathIndex.get(token);
      if (tokenHit)
        for (const bucket of tokenHit) refs.add(`${bucket}/${token}`);
    }
  }
}

const SCAN_PAGE = 1000;

async function collectRefs(pathIndex) {
  const refs = new Set();
  const failedTables = [];
  const tables = await fetchTableSpecs();
  for (const { name, cols } of tables) {
    if (cols.length === 0) continue; // 문자열 컬럼 없음 — 참조 담을 수 없음
    try {
      for (let offset = 0; ; offset += SCAN_PAGE) {
        const select = cols.map(encodeURIComponent).join(",");
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/${name}?select=${select}&limit=${SCAN_PAGE}&offset=${offset}`,
          { headers: HEADERS },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        const strings = [];
        collectStrings(rows, strings);
        for (const s of strings) scanString(s, refs, pathIndex);
        if (rows.length < SCAN_PAGE) break;
      }
    } catch (e) {
      console.error(`✗ ${name} 스캔 실패: ${e.message}`);
      failedTables.push(name);
    }
  }
  return { refs, failedTables, tableCount: tables.length };
}

// ---------------------------------------------------------------------------
// 3. diff + 유예기간 필터 (+ --delete 시 Storage API 삭제)
// ---------------------------------------------------------------------------

const REMOVE_BATCH = 1000; // Storage API remove 배치 상한

async function removeObjects(bucket, paths) {
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: JSON_HEADERS,
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!res.ok)
      throw new Error(
        `${bucket} 삭제 실패(배치 ${i}~): HTTP ${res.status} ${await res.text()}`,
      );
    for (const p of batch) console.log(`  삭제됨: ${bucket}/${p}`);
  }
}

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

async function main() {
  console.log(
    `대상 버킷: ${BUCKETS.join(", ")} | 유예기간: ${GRACE_DAYS}일 | 모드: ${DELETE ? "삭제" : "드라이런"}`,
  );

  // 리스팅은 참조 대조용으로 3개 버킷 전부 — 삭제 후보는 BUCKETS만.
  const filesByBucket = new Map();
  const pathIndex = new Map();
  for (const bucket of ALL_BUCKETS) {
    const files = await listBucket(bucket);
    filesByBucket.set(bucket, files);
    for (const f of files) {
      if (!pathIndex.has(f.path)) pathIndex.set(f.path, []);
      pathIndex.get(f.path).push(bucket);
    }
  }

  const { refs, failedTables, tableCount } = await collectRefs(pathIndex);
  console.log(
    `\n참조 수집: ${refs.size}건 (테이블 ${tableCount}개 스캔${failedTables.length ? `, 실패 ${failedTables.length}개` : ""})`,
  );

  if (DELETE) {
    if (refs.size === 0)
      throw new Error("참조가 0건 — 수집 비정상으로 판단, 삭제 거부");
    if (failedTables.length > 0)
      throw new Error(
        `테이블 스캔 실패 존재(${failedTables.join(", ")}) — 참조 누락 가능, 삭제 거부`,
      );
  }

  const cutoff = Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000;
  let totalOrphans = 0,
    totalOrphanSize = 0,
    totalDeletable = 0,
    totalDeletableSize = 0;

  for (const bucket of BUCKETS) {
    const files = filesByBucket.get(bucket);
    const orphans = files.filter(
      (f) =>
        !refs.has(`${bucket}/${f.path}`) && !KEEP.has(`${bucket}/${f.path}`),
    );
    const referenced = files.length - orphans.length;
    const deletable = orphans.filter(
      (f) => f.updatedAt && new Date(f.updatedAt).getTime() < cutoff,
    );
    const inGrace = orphans.length - deletable.length;
    const orphanSize = orphans.reduce((a, f) => a + f.size, 0);
    const deletableSize = deletable.reduce((a, f) => a + f.size, 0);
    totalOrphans += orphans.length;
    totalOrphanSize += orphanSize;
    totalDeletable += deletable.length;
    totalDeletableSize += deletableSize;

    console.log(
      `\n== ${bucket}: 전체 ${files.length} | 참조 ${referenced} | 고아 ${orphans.length}(${fmtMB(orphanSize)}) | 유예 보류 ${inGrace} | 삭제 대상 ${deletable.length}(${fmtMB(deletableSize)})`,
    );
    for (const f of deletable)
      console.log(
        `  ${f.path}  ${(f.size / 1024).toFixed(0)}KB  ${f.updatedAt?.slice(0, 10)}`,
      );

    if (DELETE && deletable.length > 0) {
      if (referenced === 0)
        throw new Error(
          `${bucket}: 참조된 파일이 0개 — 수집 비정상으로 판단, 삭제 거부`,
        );
      await removeObjects(
        bucket,
        deletable.map((f) => f.path),
      );
      console.log(`  → ${bucket}: ${deletable.length}개 삭제 완료`);
    }
  }

  console.log(
    `\n합계: 고아 ${totalOrphans}개(${fmtMB(totalOrphanSize)}) / 삭제 대상 ${totalDeletable}개(${fmtMB(totalDeletableSize)})${DELETE ? "" : " — 드라이런, 아무것도 지우지 않음"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
