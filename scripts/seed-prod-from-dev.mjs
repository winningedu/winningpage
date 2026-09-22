#!/usr/bin/env node

// main(prod) 릴리스 시점 1회 실행용 — dev cloud Supabase의 콘텐츠·마스터
// 데이터 전체를 prod Supabase로 복사한다. 로컬 스택용 scripts/seed-from-dev.mjs
// 와는 별개 파일이며 그 파일은 건드리지 않는다.
//
// 사용법 (기본은 드라이런 — 아무것도 쓰지 않는다):
//   node scripts/seed-prod-from-dev.mjs
//   node scripts/seed-prod-from-dev.mjs --apply
//   node scripts/seed-prod-from-dev.mjs --verify   # 시딩 후 검증(읽기만)
//   node scripts/seed-prod-from-dev.mjs --apply --admin-only
//     테이블 upsert·storage 미러를 전부 건너뛰고 관리자 계정 생성만 실행한다
//     (--apply·SEED_CONFIRM 게이트는 그대로 요구, --verify와는 함께 못 쓴다).
//   node scripts/seed-prod-from-dev.mjs --apply --admin-only --site=schoolmentor
//     위 --admin-only에 더해 app_settings에 그 사이트 전용 오버라이드(아래
//     SITE_APP_SETTINGS)를 upsert한다 — "빈 S DB에 설정+관리자만" 초기화용.
//     --site는 winning|schoolmentor 둘 중 하나만 허용(다른 값은 즉시 에러).
//     --site=schoolmentor는 이어서 terms도 SITE_TERMS_DIR 원문(scripts/site-terms/)
//     으로 오버라이드한다(아래 applySiteTerms) — dev 약관 복사(handleTerms) 뒤,
//     app_settings 오버라이드와 같은 자리에서 실행된다.
//   products/coupons의 tenant_id는 dev·타깃 tenants.name 기준으로 자동 재매핑된다
//   (scripts/lib/tenantRemap.mjs) — 타깃 DB에 없는 테넌트면 즉시 에러로 중단.
//
// 접속 정보:
//   dev(소스)  — .env.seed.local (없으면 .env.local, 로컬 URL이면 중단)
//   prod(타깃) — env SEED_TARGET_URL / SEED_TARGET_SERVICE_ROLE_KEY,
//                없으면 .env.seed.prod.local 파일(gitignore됨, 이 저장소엔 없음 — 직접 생성)
//   관리자 계정 — env SEED_ADMIN_EMAIL (없으면 계정 생성 단계 스킵). 비밀번호는
//   랜덤으로 채워 아무도 모르게 두고, 관리자가 로그인 화면의 비밀번호 재설정으로
//   직접 설정한다 — 시드 env·터미널에 실사용 비밀번호를 남기지 않기 위해서다.
//
// 안전장치:
//   - 기본 드라이런. 실제 반영은 --apply + SEED_CONFIRM=<타깃 프로젝트 ref> 일치 시에만.
//   - 타깃이 dev 프로젝트(gjowqdiopinhixfivnkx)와 같으면 즉시 중단(자기 자신 시딩 방지).
//   - 서비스 롤 키는 어떤 경우에도 stdout에 출력하지 않는다.
//
// 브리프 대비 편차 (브리프의 화이트리스트 중 아래 4개는 넣지 않음 — 스키마 실측 근거):
//   - admission_result_department_index / admission_result_university_index /
//     admission_university_resource_index / goal_university_options
//     → 전부 VIEW(baseline.sql, security_invoker=true)다. 기반 테이블
//       (admission_results / admission_university_resources / goal_university_cuts)을
//       시딩하면 자동으로 값이 나온다 — upsert 대상이 아니다.
//   - goal_workbooks
//     → goal_workbooks.profile_id가 goal_students(profile_id) FK(on delete cascade)다.
//       "사용자당 다건"(baseline.sql 코멘트)인 유저 데이터라 마스터가 아니다.
//       그대로 복사하면 dev 유저의 문제집을 prod로 유출하게 된다 — 이 스크립트의
//       목표("user 연관 데이터는 복사하지 않는다")와 정면으로 충돌해 제외한다.
//   - performance_topics
//     → performance_topics.session_id가 performance_sessions FK(not null)다.
//       기존 scripts/seed-from-dev.mjs가 2026-08-21에 이미 같은 이유로 화이트리스트에서
//       뺐다(주석 참고) — 세션당 생성되는 유저 데이터이지 마스터가 아니다.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadSiteTerms, planSiteTermsRows } from "./lib/siteTerms.mjs";
import { buildTenantIdMap, remapTenantIds } from "./lib/tenantRemap.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const PAGE = 1000;

// --site=<key> 오버라이드(2026-09-22, S 가입 차단용) — 마이그레이션이 심는
// app_settings 기본값은 W(위닝에듀) 기준이라, 그와 다른 값만 사이트별로
// 여기 명시한다. winning은 빈 객체(마이그레이션 기본값 그대로 둔다는 뜻).
// applySiteAppSettings()가 --apply 시에만 이 맵을 읽어 upsert한다.
const SITE_APP_SETTINGS = {
  winning: {},
  schoolmentor: { signup_enabled: false, require_tenant_on_signup: true },
};

// --site=<key> 약관 오버라이드 — dev에서 복사된 W(위닝에듀) 약관 중 일부를
// 그 사이트 소유 회사(고객사) 명의 원문으로 교체한다. 디렉터리는
// scripts/lib/siteTerms.mjs의 manifest.json 형식(code/title/file)을 따른다.
// null이면 오버라이드 없음(핸들terms가 복사한 dev 약관을 그대로 둔다).
const SITE_TERMS_DIR = {
  winning: null,
  schoolmentor: path.join(repoRoot, "scripts", "site-terms", "schoolmentor"),
};

// FK 의존 순서 고려: 참조되는 쪽을 먼저.
// special 필드는 단순 upsert로 안 되는 테이블(아래 handleXxx 함수 참고).
const TABLES = [
  // 약관
  { name: "terms", pk: "code,version", special: "terms" },
  // 결제 카탈로그
  // programs: 마이그레이션이 만든 행의 id가 환경마다 다르다(스쿨멘토 신규 DB에서 실측). FK는 전부
  // program_key(text)를 참조하므로 자연키로 upsert해 기존 id를 보존한다(2026-09-22).
  { name: "programs", pk: "program_key" },
  // products는 slug 기준 — prod 기존 행 id를 order_items/program_access_grants가
  // 참조 중이라 id를 dev값으로 못 바꾼다(과거 수동 시딩 시대에 id가 갈라짐).
  { name: "products", special: "products", remapTenant: true },
  { name: "coupons", remapTenant: true },
  // 학습진단 카피
  { name: "learning_diagnosis_v2_survey_copy" },
  // 랜딩/메뉴
  { name: "page_contents" },
  // mirror: 과거 수동 시딩으로 id가 갈라진 prod 전용 행이 남아 있는 테이블.
  // upsert 전에 dev에 없는 id를 지워 콘텐츠 중복/잔재를 막는다(2026-09-01 실측).
  { name: "program_categories", mirror: true },
  { name: "banners" },
  { name: "home_mentor_strategies" },
  { name: "home_side_banners" },
  { name: "popups" },
  { name: "app_settings", pk: "key" },
  { name: "university_acceptances", mirror: true },
  // 콘텐츠 게시판
  { name: "faqs" },
  { name: "galleries" },
  { name: "notices" },
  { name: "company_news" },
  { name: "admission_posts" },
  { name: "admission_acceptance_rates" },
  { name: "admission_case_logos" },
  { name: "special_highschool_acceptance_rates" },
  { name: "special_highschool_cases" },
  // 멘토 지원
  { name: "mentor_apply_copy" },
  { name: "mentor_apply_faqs", mirror: true },
  // 목표관리 정시 컷
  { name: "goal_university_cuts" },
  // 프리미엄 북
  { name: "premium_book_pages" },

  // --- 이하 이 스크립트에서 추가하는 대상(브리프) ---

  // 관리자 권한 체계. admin_roles/admin_role_permissions는 dev·prod가 각자
  // 마이그레이션으로 gen_random_uuid() id를 이미 발급받았으므로 id를 그대로
  // 복사할 수 없다(role_id FK가 prod의 기존 id를 참조 중 — 바꾸면 23503).
  // name 기준으로 매핑해 role_id를 리라이트한다. handleAdminRoles 참고.
  { name: "admin_resources", pk: "key" },
  { name: "admin_roles", special: "admin_roles" },
  {
    name: "admin_role_permissions",
    pk: "role_id,resource_key",
    special: "admin_role_permissions",
  },

  // 대입 모집요강 마스터 (FK 없음 — university_key/department_key는 text)
  { name: "admission_universities" },
  { name: "admission_results", mirror: true }, // 43,170행 — id는 identity(BY DEFAULT)라 명시값 upsert 가능
  { name: "admission_university_resources" },

  // 콘텐츠 마스터
  { name: "trending_departments", mirror: true },
  { name: "winning_assessment_knowledge_items" }, // RAG 지식베이스 (embedding vector 포함)
];

// ---------------------------------------------------------------------------
// env 로딩
// ---------------------------------------------------------------------------

function readEnvFile(name) {
  const env = {};
  let raw;
  try {
    raw = readFileSync(path.join(repoRoot, name), "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return env;
}

function loadDevEnv() {
  const fromSeedLocal = readEnvFile(".env.seed.local");
  const fromEnvLocal = readEnvFile(".env.local");
  const env = fromSeedLocal ?? fromEnvLocal;
  const source = fromSeedLocal ? ".env.seed.local" : ".env.local";
  const url = env?.SUPABASE_URL || env?.VITE_SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      ".env.seed.local 또는 .env.local에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요",
    );
  if (url.includes("127.0.0.1") || url.includes("localhost"))
    throw new Error(
      `${source}의 SUPABASE_URL이 로컬을 가리킴 — dev URL이어야 한다.`,
    );
  if (!url.includes(DEV_PROJECT_REF))
    throw new Error(
      `${source}의 SUPABASE_URL이 dev 프로젝트(${DEV_PROJECT_REF})가 아님 — 중단.`,
    );
  return { url: url.replace(/\/$/, ""), key, source };
}

// prod는 env 우선, 없으면 .env.seed.prod.local 파일. 둘 다 없으면 null —
// 드라이런은 타깃 미설정 상태로도 동작해야 하므로 여기서 던지지 않는다.
function loadProdEnv() {
  if (process.env.SEED_TARGET_URL && process.env.SEED_TARGET_SERVICE_ROLE_KEY) {
    return {
      url: process.env.SEED_TARGET_URL.replace(/\/$/, ""),
      key: process.env.SEED_TARGET_SERVICE_ROLE_KEY,
      source: "env(SEED_TARGET_URL)",
    };
  }
  const file = readEnvFile(".env.seed.prod.local");
  const url = file?.SEED_TARGET_URL || file?.SUPABASE_URL;
  const key =
    file?.SEED_TARGET_SERVICE_ROLE_KEY || file?.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key)
    return { url: url.replace(/\/$/, ""), key, source: ".env.seed.prod.local" };
  return null;
}

function hostOf(url) {
  return new URL(url).host;
}

// ---------------------------------------------------------------------------
// 읽기/쓰기 공통
// ---------------------------------------------------------------------------

async function fetchAll(client, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} 읽기 실패: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function upsertAll(client, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} 쓰기 실패(${i}~): ${error.message}`);
  }
}

async function countRows(client, table) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} 카운트 실패: ${error.message}`);
  return count;
}

// ---------------------------------------------------------------------------
// dev storage 도메인 → prod storage 도메인 치환 (문자열/배열/JSON 재귀)
// ---------------------------------------------------------------------------

// prodHost가 없으면(타깃 미설정 드라이런) 치환하지 않고 건수만 센다.
function replaceHostDeep(value, devHost, prodHost, counter) {
  if (typeof value === "string") {
    if (!value.includes(devHost)) return value;
    counter.count += value.split(devHost).length - 1;
    return prodHost ? value.split(devHost).join(prodHost) : value;
  }
  if (Array.isArray(value))
    return value.map((v) => replaceHostDeep(v, devHost, prodHost, counter));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value))
      out[k] = replaceHostDeep(v, devHost, prodHost, counter);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// terms 특수 처리 — seed-from-dev.mjs의 replaceTerms와 동일 이유(마이그레이션이
// prod에도 (code,version) 활성 행을 미리 심어 두 유니크에 동시에 걸림).
// ---------------------------------------------------------------------------

async function handleTerms(prodClient, rows) {
  const { error: deactivateError } = await prodClient
    .from("terms")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactivateError)
    throw new Error(`terms 비활성화 실패: ${deactivateError.message}`);
  // id는 payload에서 뺀다 — prod 기존 행의 id는 user_term_agreements가 참조
  // 중이라 dev id로 덮어쓰면 FK 위반. (code,version) 일치 행은 prod id를
  // 유지하고, 신규 행만 default로 새 id를 받는다.
  const payload = rows.map(({ id, ...rest }) => rest);
  await upsertAll(prodClient, "terms", payload, "code,version");
  // dev에 없는 (code,version) 행만 정리. 동의 기록이 참조하는 행은 지울 수
  // 없으므로(23503) 비활성 상태로 남긴다.
  const devKeys = new Set(rows.map((r) => `${r.code} ${r.version}`));
  const prodTerms = await fetchAll(prodClient, "terms");
  for (const row of prodTerms) {
    if (devKeys.has(`${row.code} ${row.version}`)) continue;
    const { error: pruneError } = await prodClient
      .from("terms")
      .delete()
      .eq("id", row.id);
    if (pruneError && pruneError.code !== "23503")
      throw new Error(`terms 잔여 행 정리 실패: ${pruneError.message}`);
  }
}

// ---------------------------------------------------------------------------
// mirror 테이블 — upsert 전에 dev에 없는 prod 전용 id를 삭제해 잔재/중복 제거.
// 사용자 데이터 FK가 없는 콘텐츠 테이블에만 지정할 것.
// ---------------------------------------------------------------------------

async function mirrorPrune(prodClient, table, devRows) {
  const devIds = new Set(devRows.map((r) => String(r.id)));
  const prodRows = await fetchAll(prodClient, table);
  const stale = prodRows.filter((r) => !devIds.has(String(r.id)));
  if (!stale.length) return;
  for (let i = 0; i < stale.length; i += PAGE) {
    const chunk = stale.slice(i, i + PAGE).map((r) => r.id);
    const { error } = await prodClient.from(table).delete().in("id", chunk);
    if (error)
      throw new Error(`${table} prod 전용 행 삭제 실패: ${error.message}`);
  }
  console.log(`  ${table}: prod 전용 잔재 ${stale.length}행 삭제`);
}

// ---------------------------------------------------------------------------
// products 특수 처리 — slug 기준. prod 기존 행 id는 order_items /
// program_access_grants가 참조하므로 유지하고, 내용만 dev로 갱신한다.
// ---------------------------------------------------------------------------

async function handleProducts(prodClient, rows) {
  const payload = rows.map(({ id, ...rest }) => rest);
  await upsertAll(prodClient, "products", payload, "slug");
  // dev에 없는 slug의 prod 행 정리 — 주문/이용권이 참조 중이면 남기고 경고만.
  const devSlugs = new Set(rows.map((r) => r.slug));
  const prodRows = await fetchAll(prodClient, "products");
  for (const row of prodRows) {
    if (devSlugs.has(row.slug)) continue;
    const [{ count: orderRefs }, { count: grantRefs }] = await Promise.all([
      prodClient
        .from("order_items")
        .select("*", { count: "exact", head: true })
        .eq("product_id", row.id),
      prodClient
        .from("program_access_grants")
        .select("*", { count: "exact", head: true })
        .eq("product_id", row.id),
    ]);
    if ((orderRefs ?? 0) > 0 || (grantRefs ?? 0) > 0) {
      console.warn(
        `  products: prod 전용 '${row.slug}'는 주문/이용권이 참조 중이라 남김(주문 ${orderRefs}, 이용권 ${grantRefs})`,
      );
      continue;
    }
    const { error } = await prodClient
      .from("products")
      .delete()
      .eq("id", row.id);
    if (error)
      throw new Error(
        `products 잔여 행 정리 실패(${row.slug}): ${error.message}`,
      );
    console.log(`  products: prod 전용 '${row.slug}' 삭제`);
  }
}

// ---------------------------------------------------------------------------
// admin_roles / admin_role_permissions 특수 처리 — id 리라이트
// ---------------------------------------------------------------------------

// id 컬럼을 payload에서 빼고 name 충돌 기준으로만 upsert한다 — 그래야 prod에
// 이미 마이그레이션이 심어 둔 admin_roles.id(admin_role_permissions FK가
// 참조 중)가 덮어써지지 않는다. 새 이름(dev에서 신설된 역할)만 새 id를 받는다.
async function handleAdminRoles(prodClient, devRows) {
  const payload = devRows.map(({ id, ...rest }) => rest);
  const { error } = await prodClient
    .from("admin_roles")
    .upsert(payload, { onConflict: "name" });
  if (error) throw new Error(`admin_roles 쓰기 실패: ${error.message}`);
  const { data: prodRoles, error: e2 } = await prodClient
    .from("admin_roles")
    .select("id, name");
  if (e2) throw new Error(`admin_roles 재조회 실패: ${e2.message}`);
  return new Map(prodRoles.map((r) => [r.name, r.id]));
}

async function handleAdminRolePermissions(
  prodClient,
  devRows,
  devRoles,
  nameToProdId,
) {
  const devIdToName = new Map(devRoles.map((r) => [r.id, r.name]));
  const remapped = [];
  const skipped = [];
  for (const row of devRows) {
    const name = devIdToName.get(row.role_id);
    const prodId = name && nameToProdId.get(name);
    if (!prodId) {
      skipped.push(row);
      continue;
    }
    remapped.push({
      role_id: prodId,
      resource_key: row.resource_key,
      level: row.level,
    });
  }
  if (skipped.length)
    console.error(
      `✗ admin_role_permissions: role_id 매핑 실패 ${skipped.length}건 스킵 (dev 역할이 admin_roles 동기화에서 빠졌을 가능성)`,
    );
  await upsertAll(
    prodClient,
    "admin_role_permissions",
    remapped,
    "role_id,resource_key",
  );
  return remapped.length;
}

// ---------------------------------------------------------------------------
// banners 스토리지 미러 — 시딩 대상 테이블 행에서만 참조 수집(전체 스캔 아님)
// ---------------------------------------------------------------------------

const ABS_URL_RE =
  /storage\/v1\/(?:object|render)\/(?:public|sign|authenticated)\/([a-z0-9_-]+)\/([^"'\\\s?]+)/g;

function collectStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) collectStrings(v, out);
}

// banners 버킷 참조만 뽑는다(storage-gc.mjs 참조 수집부 축약 재사용).
function scanBannersRefs(str, refs, pathIndex) {
  for (const m of str.matchAll(ABS_URL_RE)) {
    if (m[1] !== "banners") continue;
    let p = m[2];
    try {
      p = decodeURIComponent(p);
    } catch {}
    refs.add(p);
  }
  const bare = str.trim().replace(/^\//, "");
  if (pathIndex.has(bare)) refs.add(bare);
  if (str.length > bare.length || !pathIndex.has(bare)) {
    for (const m of str.matchAll(
      /[\w\-./]+\.(?:png|jpe?g|webp|gif|svg|pdf|mp4|webm)/gi,
    )) {
      const token = m[0].replace(/^\//, "");
      if (pathIndex.has(token)) refs.add(token);
    }
  }
}

const LIST_PAGE = 1000;

async function listBannersBucket(url, key, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const res = await fetch(`${url}/storage/v1/object/list/banners`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix,
        limit: LIST_PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    if (!res.ok)
      throw new Error(
        `banners 리스팅 실패(${prefix || "/"}): HTTP ${res.status}`,
      );
    const objs = await res.json();
    if (!Array.isArray(objs))
      throw new Error(`banners 리스팅 응답이 배열이 아님(${prefix || "/"})`);
    for (const o of objs) {
      const p = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null) out.push(...(await listBannersBucket(url, key, p)));
      else if (!p.endsWith(".emptyFolderPlaceholder"))
        out.push({ path: p, size: o.metadata?.size ?? 0 });
    }
    if (objs.length < LIST_PAGE) break;
  }
  return out;
}

async function ensureProdBannersBucket(url, key) {
  const res = await fetch(`${url}/storage/v1/bucket/banners`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.status === 404) {
    const createRes = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: "banners", name: "banners", public: true }),
    });
    if (!createRes.ok)
      throw new Error(`banners 버킷 생성 실패: HTTP ${createRes.status}`);
    console.log("  banners 버킷을 prod에 생성함(public)");
    return;
  }
  if (!res.ok) throw new Error(`banners 버킷 조회 실패: HTTP ${res.status}`);
}

async function mirrorBanner(devUrl, prodUrl, prodKey, relPath) {
  const encoded = relPath.split("/").map(encodeURIComponent).join("/");
  const downloadRes = await fetch(
    `${devUrl}/storage/v1/object/public/banners/${encoded}`,
  );
  if (!downloadRes.ok) {
    console.error(`✗ 다운로드 실패: ${relPath} (HTTP ${downloadRes.status})`);
    return false;
  }
  const buf = Buffer.from(await downloadRes.arrayBuffer());
  const contentType =
    downloadRes.headers.get("content-type") ?? "application/octet-stream";
  const uploadRes = await fetch(
    `${prodUrl}/storage/v1/object/banners/${encoded}`,
    {
      method: "POST",
      headers: {
        apikey: prodKey,
        Authorization: `Bearer ${prodKey}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buf,
    },
  );
  if (!uploadRes.ok) {
    console.error(`✗ 업로드 실패: ${relPath} (HTTP ${uploadRes.status})`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 사이트별 app_settings 오버라이드 (--site=<winning|schoolmentor>)
// ---------------------------------------------------------------------------

async function applySiteAppSettings(prodClient, siteKey) {
  const overrides = SITE_APP_SETTINGS[siteKey];
  const keys = Object.keys(overrides);
  if (keys.length === 0) {
    console.log(
      `\n--site=${siteKey}: 오버라이드 없음(마이그레이션 기본값 유지).`,
    );
    return;
  }
  for (const key of keys) {
    // jsonb boolean으로 저장 — supabase-js가 JS boolean을 그대로 jsonb로
    // 직렬화한다(false도 그대로 false로 들어간다, undefined로 새지 않는다).
    const { error } = await prodClient
      .from("app_settings")
      .upsert({ key, value: overrides[key] }, { onConflict: "key" });
    if (error)
      throw new Error(`app_settings 오버라이드 실패(${key}): ${error.message}`);
  }
  console.log(
    `\n--site=${siteKey}: app_settings 오버라이드 적용 완료(${keys.join(", ")}).`,
  );
}

// ---------------------------------------------------------------------------
// 사이트별 terms 오버라이드 (--site=<winning|schoolmentor>) — handleTerms가
// dev 약관을 복사한 뒤에 실행되어야 한다(그래야 오버라이드 대상이 아닌 code는
// dev 원문 그대로 남는다).
// ---------------------------------------------------------------------------

async function applySiteTerms(prodClient, siteKey) {
  const dir = SITE_TERMS_DIR[siteKey];
  if (!dir) {
    console.log(`\n--site=${siteKey}: terms 오버라이드 없음(dev 원문 유지).`);
    return;
  }

  const siteTerms = loadSiteTerms(dir);
  const { data: existingRows, error: selectError } = await prodClient
    .from("terms")
    .select("code, version, is_active");
  if (selectError)
    throw new Error(`terms 오버라이드용 조회 실패: ${selectError.message}`);

  const { deactivate, upserts } = planSiteTermsRows(existingRows, siteTerms);

  for (const { code, version } of deactivate) {
    const { error } = await prodClient
      .from("terms")
      .update({ is_active: false })
      .eq("code", code)
      .eq("version", version);
    if (error)
      throw new Error(
        `terms 오버라이드 비활성화 실패(${code} ${version}): ${error.message}`,
      );
  }

  if (upserts.length > 0) {
    const { error } = await prodClient
      .from("terms")
      .upsert(upserts, { onConflict: "code,version" });
    if (error)
      throw new Error(`terms 오버라이드 upsert 실패: ${error.message}`);
  }

  console.log(
    `\n--site=${siteKey}: terms 오버라이드 적용 완료 — ` +
      `${upserts.map((row) => `${row.code}→${row.version}`).join(", ")} 활성화, ` +
      `기존 활성 ${deactivate.length}건 비활성화.`,
  );
}

// ---------------------------------------------------------------------------
// 최고 관리자 계정 생성 (마지막 단계)
// ---------------------------------------------------------------------------

async function createAdminMaster(prodClient) {
  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) {
    console.log(
      "\n관리자 계정 생성: SEED_ADMIN_EMAIL 미설정 — 스킵. " +
        "필요하면 env를 설정하고 다시 실행하십시오.",
    );
    return;
  }

  // 비밀번호는 아무도 모르는 랜덤값으로 채운다 — 출력·저장하지 않는다.
  // 관리자는 로그인 화면의 비밀번호 재설정(복구 메일)으로 본인 비밀번호를 만든다.
  // Supabase createUser가 비밀번호를 요구해서 채울 뿐, 이 값으로 로그인할 일은 없다.
  const password = randomBytes(32).toString("base64url");

  const { data: roleRow, error: roleErr } = await prodClient
    .from("admin_roles")
    .select("id")
    .eq("name", "최고 관리자")
    .single();
  if (roleErr || !roleRow)
    throw new Error(
      `prod admin_roles에 '최고 관리자' 행이 없음: ${roleErr?.message ?? "not found"}`,
    );

  // 이미 가입된 이메일이면 그 계정을 그대로 승격한다(비밀번호 불변).
  let userId;
  let reused = false;
  const { data: created, error: createErr } =
    await prodClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createErr) {
    if (!/already been registered/i.test(createErr.message))
      throw new Error(`auth 계정 생성 실패: ${createErr.message}`);
    const { data: page, error: listErr } =
      await prodClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw new Error(`auth 사용자 조회 실패: ${listErr.message}`);
    const existing = page.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!existing)
      throw new Error(`기존 계정 조회 실패: ${email} 을 listUsers에서 못 찾음`);
    userId = existing.id;
    reused = true;
  } else {
    userId = created.user.id;
  }

  // prod에는 auth 트리거(handle_new_user)가 없다 — profiles 행을 직접 넣는다.
  // 기존 계정 재사용 시에는 role만 admin으로 올린다.
  const { error: profileErr } = await prodClient
    .from("profiles")
    .upsert({ id: userId, email, role: "admin" }, { onConflict: "id" });
  if (profileErr)
    throw new Error(`profiles 행 생성 실패: ${profileErr.message}`);

  const { data: memberRow } = await prodClient
    .from("admin_members")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!memberRow) {
    const { error: memberErr } = await prodClient.from("admin_members").insert({
      profile_id: userId,
      role_id: roleRow.id,
      status: "active",
      activated_at: new Date().toISOString(),
    });
    if (memberErr)
      throw new Error(`admin_members 행 생성 실패: ${memberErr.message}`);
  } else {
    const { error: memberErr } = await prodClient
      .from("admin_members")
      .update({ role_id: roleRow.id, status: "active" })
      .eq("profile_id", userId);
    if (memberErr)
      throw new Error(`admin_members 갱신 실패: ${memberErr.message}`);
  }

  console.log(
    `\n✓ 관리자 계정 ${reused ? "승격(기존 계정 재사용)" : "생성"} 완료: ${email} (최고 관리자, profile_id=${userId})\n` +
      (reused
        ? "  기존 비밀번호 그대로 로그인 가능합니다."
        : "  비밀번호는 설정되지 않았습니다(랜덤값, 미출력). " +
          "로그인 화면 → 비밀번호 재설정으로 본인 비밀번호를 설정하십시오."),
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

// 시딩 후 검증(--verify) — 읽기 전용. 세 가지를 본다:
//   1) 테이블별 행수: prod가 dev보다 적으면 실패(초과분은 정보로만 — upsert
//      재실행이나 prod 자체 등록분일 수 있다).
//   2) prod 행 데이터에 dev 도메인 문자열 잔존 0건 (URL 치환 누락 검출).
//   3) dev 행이 참조하는 banners 파일이 prod 버킷에 전부 존재.
// 하나라도 실패하면 exit code 1.
async function verifyMain(dev, prod) {
  const devHost = hostOf(dev.url);
  const prodHost = hostOf(prod.url);
  console.log(`검증 모드(--verify) | dev ${devHost} ↔ prod ${prodHost}`);

  const devClient = createClient(dev.url, dev.key, {
    auth: { persistSession: false },
  });
  const prodClient = createClient(prod.url, prod.key, {
    auth: { persistSession: false },
  });

  const devBannerFiles = await listBannersBucket(dev.url, dev.key);
  const devPathIndex = new Set(devBannerFiles.map((f) => f.path));
  const referencedPaths = new Set();

  let failures = 0;

  for (const table of TABLES) {
    const devRows = await fetchAll(devClient, table.name);
    const prodRows = await fetchAll(prodClient, table.name);

    // 참조 수집은 dev 원본에서 — 시딩이 복사했어야 하는 파일 목록의 기준이다.
    const devStrings = [];
    collectStrings(devRows, devStrings);
    for (const s of devStrings)
      scanBannersRefs(s, referencedPaths, devPathIndex);

    const prodStrings = [];
    collectStrings(prodRows, prodStrings);
    const leaks = prodStrings.filter((s) => s.includes(devHost)).length;

    const short = prodRows.length < devRows.length;
    if (short || leaks > 0) failures++;
    console.log(
      `${short || leaks ? "✗" : "✓"} ${table.name}: dev ${devRows.length} / prod ${prodRows.length}` +
        (prodRows.length > devRows.length ? " (prod 초과분 있음 — 정보)" : "") +
        (leaks ? ` | dev 도메인 잔존 ${leaks}건` : ""),
    );
  }

  console.log("\nbanners 버킷 대조(prod)...");
  const prodBannerFiles = await listBannersBucket(prod.url, prod.key);
  const prodPathIndex = new Set(prodBannerFiles.map((f) => f.path));
  const missingInProd = [...referencedPaths].filter(
    (p) => devPathIndex.has(p) && !prodPathIndex.has(p),
  );
  if (missingInProd.length > 0) {
    failures++;
    console.log(`✗ prod 버킷에 없는 참조 파일 ${missingInProd.length}건:`);
    for (const p of missingInProd.slice(0, 20)) console.log(`   - ${p}`);
  } else {
    console.log(
      `✓ 참조 파일 ${referencedPaths.size}개 전부 prod 버킷에 존재 (prod 총 ${prodBannerFiles.length}파일)`,
    );
  }

  if (failures > 0) {
    console.log(`\n검증 실패: ${failures}건`);
    process.exitCode = 1;
  } else {
    console.log("\n검증 통과: 행수·URL 치환·storage 미러 모두 정상");
  }
}

async function main() {
  const APPLY = process.argv.includes("--apply");
  const VERIFY = process.argv.includes("--verify");
  const ADMIN_ONLY = process.argv.includes("--admin-only");
  const siteArg = process.argv.find((a) => a.startsWith("--site="));
  const SITE_KEY = siteArg ? siteArg.slice("--site=".length) : null;

  if (SITE_KEY !== null && !Object.hasOwn(SITE_APP_SETTINGS, SITE_KEY)) {
    throw new Error(
      `--site 값이 올바르지 않습니다: ${JSON.stringify(SITE_KEY)} (winning|schoolmentor 중 하나여야 합니다)`,
    );
  }
  if (ADMIN_ONLY && VERIFY) {
    throw new Error("--admin-only와 --verify는 함께 쓸 수 없습니다.");
  }

  if (VERIFY) {
    if (APPLY) throw new Error("--verify와 --apply는 함께 쓸 수 없습니다.");
    const dev = loadDevEnv();
    const prod = loadProdEnv();
    if (!prod)
      throw new Error(
        "검증에는 타깃 접속 정보가 필요합니다 — SEED_TARGET_URL/SEED_TARGET_SERVICE_ROLE_KEY 또는 .env.seed.prod.local.",
      );
    if (hostOf(prod.url).split(".")[0] === DEV_PROJECT_REF)
      throw new Error("타깃이 dev 프로젝트와 동일함 — 중단.");
    await verifyMain(dev, prod);
    return;
  }

  if (ADMIN_ONLY && !APPLY) {
    throw new Error(
      "--admin-only는 --apply와 함께 써야 합니다(드라이런 대상 아님).",
    );
  }

  const dev = loadDevEnv();
  const prod = loadProdEnv();
  const devHost = hostOf(dev.url);

  console.log(
    `모드: ${APPLY ? "적용(--apply)" : "드라이런"} | dev: ${devHost}`,
  );

  if (prod) {
    const prodHost = hostOf(prod.url);
    const prodRef = prodHost.split(".")[0];
    if (prodRef === DEV_PROJECT_REF)
      throw new Error(
        "타깃이 dev 프로젝트와 동일함 — 자기 자신 시딩 방지, 중단.",
      );
    if (APPLY) {
      console.log(`타깃(prod) URL: ${prod.url}`);
      if (process.env.SEED_CONFIRM !== prodRef)
        throw new Error(
          `SEED_CONFIRM 불일치 — env SEED_CONFIRM=${prodRef} 로 설정해야 --apply가 진행됩니다.`,
        );
    }
  } else if (APPLY) {
    throw new Error(
      "타깃 접속 정보 없음 — SEED_TARGET_URL/SEED_TARGET_SERVICE_ROLE_KEY 또는 .env.seed.prod.local 필요.",
    );
  } else {
    console.log("타깃 미설정 — dev 소스 집계만 수행합니다(드라이런).");
  }

  const devClient = createClient(dev.url, dev.key, {
    auth: { persistSession: false },
  });
  const prodClient = prod
    ? createClient(prod.url, prod.key, { auth: { persistSession: false } })
    : null;
  const prodHost = prod ? hostOf(prod.url) : undefined;
  const hostCounter = { count: 0 };

  if (ADMIN_ONLY) {
    // 테이블 upsert·storage 미러를 전부 건너뛴다 — "빈 S DB에 설정+관리자만"
    // 시나리오용(위 --admin-only 가드가 이미 APPLY·prod 존재를 보장했다).
    if (SITE_KEY) {
      await applySiteAppSettings(prodClient, SITE_KEY);
      await applySiteTerms(prodClient, SITE_KEY);
    }
    await createAdminMaster(prodClient);
    console.log("\n완료: --admin-only (테이블 upsert·storage 미러 스킵)");
    return;
  }

  // banners 리스팅(참조 대조용) — dev 소스에서만.
  console.log("\nbanners 버킷 리스팅(dev)...");
  const devBannerFiles = await listBannersBucket(dev.url, dev.key);
  const pathIndex = new Set(devBannerFiles.map((f) => f.path));
  const sizeByPath = new Map(devBannerFiles.map((f) => [f.path, f.size]));
  const referencedPaths = new Set();

  const results = [];
  let devRolesCache = null;

  // tenant_id 재매핑 — products/coupons처럼 tenant_id(FK → public.tenants(id))를
  // 가진 테이블은 dev id를 그대로 쓰면 FK 위반(products_tenant_id_fkey 실측).
  // 환경 간 안정 키는 tenants.name뿐이라 name 기준으로 미리 매핑해 둔다.
  // prod 미설정(타깃 정보 자체가 없는 순수 드라이런)이면 매핑 대상이 없으므로 빈 맵.
  const tenantIdMap = prodClient
    ? buildTenantIdMap(
        await fetchAll(devClient, "tenants"),
        await fetchAll(prodClient, "tenants"),
      )
    : new Map();
  if (tenantIdMap.size > 0) {
    console.log(`\ntenant 재매핑 ${tenantIdMap.size}건`);
  }

  for (const table of TABLES) {
    const rows = await fetchAll(devClient, table.name);

    // 스토리지 참조 수집(치환 전 원본에서).
    const strings = [];
    collectStrings(rows, strings);
    for (const s of strings) scanBannersRefs(s, referencedPaths, pathIndex);

    if (table.name === "admin_roles") devRolesCache = rows;

    if (!APPLY) {
      // 드라이런: 도메인 치환 건수만 카운트(prodHost 없으면 replaceHostDeep이
      // 값은 그대로 두고 건수만 누적한다).
      replaceHostDeep(rows, devHost, prodHost, hostCounter);
      console.log(`[dry-run] ${table.name}: 원본 ${rows.length}행`);
      results.push({ table: table.name, devCount: rows.length });
      continue;
    }

    const replaced = replaceHostDeep(rows, devHost, prodHost, hostCounter);
    // upsert 직전 적용 — tenant_id 컬럼을 가진 테이블만(TABLES의 remapTenant 플래그).
    const tenantRemapped = table.remapTenant
      ? remapTenantIds(replaced, tenantIdMap)
      : replaced;

    if (table.special === "terms") {
      await handleTerms(prodClient, tenantRemapped);
    } else if (table.special === "products") {
      await handleProducts(prodClient, tenantRemapped);
    } else if (table.special === "admin_roles") {
      const nameToProdId = await handleAdminRoles(prodClient, replaced);
      console.log(
        `✓ admin_roles: dev ${rows.length}행 → prod ${nameToProdId.size}행 (name 기준 매핑, id는 prod 기존값 유지)`,
      );
      results.push({
        table: table.name,
        devCount: rows.length,
        __adminRoleMap: nameToProdId,
      });
    } else if (table.special === "admin_role_permissions") {
      const mapEntry = results.find((r) => r.__adminRoleMap);
      if (mapEntry === undefined) {
        throw new Error(
          "admin_role_permissions보다 admin_roles가 먼저 처리돼야 합니다(TABLES 순서 확인) — 매핑을 못 찾음",
        );
      }
      const n = await handleAdminRolePermissions(
        prodClient,
        replaced,
        devRolesCache,
        mapEntry.__adminRoleMap,
      );
      console.log(
        `✓ admin_role_permissions: dev ${rows.length}행 → prod ${n}행 반영`,
      );
      results.push({ table: table.name, devCount: rows.length, prodCount: n });
      continue;
    } else {
      if (table.mirror)
        await mirrorPrune(prodClient, table.name, tenantRemapped);
      await upsertAll(prodClient, table.name, tenantRemapped, table.pk ?? "id");
    }

    const prodCount = await countRows(prodClient, table.name);
    console.log(
      `✓ ${table.name}: dev ${rows.length}행 → prod 현재 ${prodCount}행`,
    );
    results.push({ table: table.name, devCount: rows.length, prodCount });
  }

  // 스토리지 미러
  let referencedSize = 0;
  const missing = [];
  for (const p of referencedPaths) {
    if (sizeByPath.has(p)) referencedSize += sizeByPath.get(p);
    else missing.push(p);
  }
  console.log(
    `\nbanners 참조 파일: ${referencedPaths.size}개(${(referencedSize / 1024 / 1024).toFixed(1)}MB)` +
      (missing.length
        ? `, 참조는 있으나 실파일 없음 ${missing.length}건(스킵)`
        : ""),
  );
  console.log(
    `URL 치환 대상(${devHost} → ${prodHost ?? "(타깃 미설정)"}): ${hostCounter.count}건`,
  );

  if (APPLY) {
    // 위에서 이미 (!prod && APPLY)면 throw했으므로(line ~724 근처) 여기
    // 도달했다면 prod는 항상 존재한다 — TS가 그 분기 간 관계를 정적으로
    // 못 따라가 도달 불가 가드로 다시 확인한다.
    if (prod === null) {
      throw new Error("타깃(prod) 접속 정보가 없습니다 — 예상치 못한 상태");
    }
    console.log("\nbanners 버킷 미러링...");
    await ensureProdBannersBucket(prod.url, prod.key);
    let ok = 0;
    for (const p of referencedPaths) {
      if (!sizeByPath.has(p)) continue; // 실파일 없는 참조는 건너뜀
      const success = await mirrorBanner(dev.url, prod.url, prod.key, p);
      if (success) ok++;
    }
    console.log(
      `  ${ok}/${referencedPaths.size - missing.length}개 파일 복사 완료`,
    );

    if (SITE_KEY) {
      await applySiteAppSettings(prodClient, SITE_KEY);
      await applySiteTerms(prodClient, SITE_KEY);
    }
    await createAdminMaster(prodClient);
  } else {
    console.log(
      "\n(드라이런이라 storage 복사·관리자 계정 생성은 실행하지 않았습니다.)",
    );
  }

  console.log(
    `\n완료: 테이블 ${TABLES.length}개 처리${APPLY ? "" : " (드라이런)"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
