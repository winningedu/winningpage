#!/usr/bin/env node

// 로컬 Supabase 스택에 dev 데이터를 주입한다 (그때그때 추출 방식 - 커밋되는 시드 없음).
// 마이그레이션은 스키마만 만들고, 로컬 데이터는 전부 이 스크립트가 dev에서 복사한다.
//
// 사용법:
//   npm run db:reseed                (supabase db reset + 이 스크립트. 스택은 미리 기동)
//   node scripts/seed-from-dev.mjs   (reset 없이 주입만. 이미 있는 행은 건너뜀)
//   node scripts/seed-from-dev.mjs --plan   (분류 결과만 출력. dev 카탈로그만 읽고 로컬은 건드리지 않음)
//
// 복사 규칙 (분류는 실행 시점의 dev 카탈로그로 계산 - 허용 목록을 손으로 관리하지 않는다):
//   - 유저/런타임 데이터는 복사하지 않는다: profiles/auth.users를 직접 참조하는 테이블,
//     아래 RUNTIME_TABLES(FK 없는 로그성), 그리고 그 제외 테이블의 자식 테이블.
//   - 나머지 public 테이블은 dev 데이터를 100% 복사한다. 새 테이블도 자동 포함된다.
//   - QA 계정(auth.users.email 이 @winning.test 로 끝남)은 아래 항목만 복사한다:
//     auth.users, auth.identities, profiles, admin_members, 살아있는 program_access_grants
//     (주문 참조는 NULL), 양쪽이 모두 QA 인 parent_child_links. 부여를 넣은 뒤
//     fn_sync_program_access_cache 로 program_access 캐시를 다시 만든다.
//   - 스토리지 버킷 정의는 supabase/config.toml 이, 파일은 복사하지 않는다.
//
// 필요: dev 프로젝트 URL(SUPABASE_URL)을
//   1순위 .env.seed.local  - dev 전용 파일(gitignore됨).
//   2순위 .env.local       - 원격 dev 블록이 활성일 때만 유효.
// dev 읽기는 로그인된 supabase CLI(`supabase db query --linked`)를 쓰므로 비밀키가 필요 없다.
// 로컬 적재는 DB 컨테이너(supabase_db_<project_id>)에 docker exec psql 로 직접 연결한다.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildInsertSql,
  classifyTables,
  detachPaymentGrants,
  filterLiveGrants,
  filterQaLinks,
  insertableColumns,
  nullDanglingRefs,
  orderTables,
  refColumns,
  syncTargets,
} from "./lib/devCopy.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// profiles/auth.users FK 가 없어도 유저/런타임 성격이라 복사하지 않는 테이블.
// dev 에 없는 이름은 무시된다.
const RUNTIME_TABLES = [
  "admin_access_logs",
  "ai_model_calls",
  "ai_retrieval_events",
  "alimtalk_send_logs",
  "board_views",
  "daily_entries", // 이름/연락처
  "daily_settlements", // 매출 정산
  "identity_verifications",
  "knowledge_eval_runs",
  "link_code_lookups",
  "phone_verifications",
  "premium_consult_requests", // 상담 신청자 이름/연락처
  "refunds", // 결제자 이름/금액
  "sso_tickets",
  "tenant_code_attempts",
];

// 규칙상 제외되지만 유저 데이터가 아니라 설정이라 항상 포함한다.
// tenants: 캠퍼스 마스터. created_by -> profiles 때문에 걸리지만 products/coupons/profiles
// 가 tenant_id 로 참조하므로 없으면 상품 카탈로그와 QA 프로필이 깨진다.
// created_by 는 복사 시 NULL 로 비운다(nullDanglingRefs).
const ALWAYS_INCLUDE = ["tenants"];

const QA_EMAIL_SQL = "lower(email) like '%@winning.test'";
const PAGE = 2000;
const MAX_BUFFER = 1024 * 1024 * 1024;

function readDevUrl(name) {
  let raw;
  try {
    raw = readFileSync(path.join(repoRoot, name), "utf8");
  } catch {
    return null;
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  return url ? { url, source: name } : null;
}

function loadDevProject() {
  const found = readDevUrl(".env.seed.local") ?? readDevUrl(".env.local");
  if (!found)
    throw new Error(".env.seed.local 또는 .env.local에 SUPABASE_URL 필요");
  if (found.url.includes("127.0.0.1") || found.url.includes("localhost")) {
    throw new Error(
      `${found.source}의 SUPABASE_URL이 로컬을 가리킴 - dev URL이어야 한다. ` +
        "dev URL만 담은 .env.seed.local을 만들면 .env.local을 건드리지 않아도 된다.",
    );
  }
  const ref = new URL(found.url).hostname.split(".")[0];
  return { ref, source: found.source };
}

function localContainer() {
  const toml = readFileSync(path.join(repoRoot, "supabase/config.toml"), "utf8");
  const id = toml.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!id) throw new Error("supabase/config.toml에서 project_id를 읽지 못함");
  return `supabase_db_${id}`;
}

// dev: 읽기 전용. 결과는 json 컬럼 하나(j)로 받는다.
function queryDev(ref, sql) {
  const out = execFileSync(
    "supabase",
    ["db", "query", "--linked", "--project-ref", ref, "-o", "json", sql],
    { encoding: "utf8", maxBuffer: MAX_BUFFER, stdio: ["ignore", "pipe", "ignore"] },
  );
  return JSON.parse(out.slice(out.indexOf("{"))).rows;
}

const asJson = (select) =>
  `select coalesce(json_agg(t), '[]'::json) as j from (${select}) t`;

const devRows = (ref, select) => queryDev(ref, asJson(select))[0].j;

// 로컬: superuser(supabase_admin)로 스택의 DB 컨테이너에 직접 연결한다.
function runLocal(container, sql, args = []) {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", ...args],
    { encoding: "utf8", maxBuffer: MAX_BUFFER, input: sql },
  );
}

const localRows = (container, select) =>
  JSON.parse(runLocal(container, asJson(select), ["-At"]).trim());

const CATALOG_TABLES_SQL = `
  select c.relname as name from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`;

const CATALOG_FKS_SQL = `
  select cl.relname as child,
         pn.nspname || '.' || pcl.relname as parent,
         (select array_agg(a.attname order by k.ord)
            from unnest(c.conkey) with ordinality k(n, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) as columns
  from pg_constraint c
  join pg_class cl on cl.oid = c.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  join pg_class pcl on pcl.oid = c.confrelid
  join pg_namespace pn on pn.oid = pcl.relnamespace
  where c.contype = 'f' and n.nspname = 'public'`;

const CATALOG_COLUMNS_SQL = `
  select n.nspname as schema, c.relname as "table", a.attname as name,
         a.attgenerated <> '' as generated,
         (a.attidentity <> '' or pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) is not null) as serial
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'auth') and c.relkind in ('r', 'p')
    and a.attnum > 0 and not a.attisdropped
  order by n.nspname, c.relname, a.attnum`;

function groupColumns(rows) {
  const byTable = new Map();
  for (const r of rows) {
    const key = `${r.schema}.${r.table}`;
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key).push(r);
  }
  return byTable;
}

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

function fetchTableRows(ref, schema, table, where = "true") {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = devRows(
      ref,
      `select * from ${schema}."${table}" where ${where} order by ctid limit ${PAGE} offset ${offset}`,
    );
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function main() {
  const planOnly = process.argv.includes("--plan");
  const dev = loadDevProject();

  const tables = devRows(dev.ref, CATALOG_TABLES_SQL).map((r) => r.name);
  const fks = devRows(dev.ref, CATALOG_FKS_SQL);
  const { included, excluded } = classifyTables({
    tables,
    fks,
    runtimeTables: RUNTIME_TABLES,
    alwaysInclude: ALWAYS_INCLUDE,
  });
  const { order, cyclic } = orderTables(included, fks);
  console.log(`제외 ${excluded.length}개 (유저/런타임): ${excluded.join(", ")}`);
  console.log(`포함 ${included.length}개 (dev 100% 복사): ${order.join(", ")}`);
  if (cyclic.length) console.log(`순환 FK: ${cyclic.join(", ")}`);
  if (planOnly) return;

  const container = localContainer();
  const devCols = groupColumns(devRows(dev.ref, CATALOG_COLUMNS_SQL));
  const localCols = groupColumns(localRows(container, CATALOG_COLUMNS_SQL));
  const colsFor = (schema, table) => {
    const key = `${schema}.${table}`;
    if (!localCols.has(key))
      throw new Error(`로컬에 ${key} 테이블이 없음 - 마이그레이션이 최신인가?`);
    return insertableColumns(
      (devCols.get(key) ?? []).map((c) => ({ name: c.name, generated: c.generated })),
      localCols.get(key).map((c) => ({ name: c.name, generated: c.generated })),
    );
  };

  const excludedSet = new Set(excluded);
  const statements = [];
  const loaded = [];
  const queueRows = (schema, table, rows) => {
    for (let i = 0; i < rows.length; i += PAGE) {
      statements.push(
        buildInsertSql({
          schema,
          table,
          columns: colsFor(schema, table),
          rows: rows.slice(i, i + PAGE),
        }),
      );
    }
    loaded.push({ schema, table, count: rows.length });
  };

  // 1) 비유저 테이블 - FK 순서대로
  for (const table of order) {
    const rows = nullDanglingRefs(
      fetchTableRows(dev.ref, "public", table),
      refColumns(table, fks, excludedSet),
      new Set(),
    );
    queueRows("public", table, rows);
  }

  // 2) QA 계정 - auth 행은 비밀번호 해시까지 SQL 로 그대로 복사한다
  const authUsers = fetchTableRows(dev.ref, "auth", "users", QA_EMAIL_SQL);
  const qaIds = new Set(authUsers.map((u) => u.id));
  const inQa = (col) =>
    `${col} in (${[...qaIds].map(lit).join(", ") || "null"})`;
  queueRows("auth", "users", authUsers);
  queueRows(
    "auth",
    "identities",
    fetchTableRows(dev.ref, "auth", "identities", inQa("user_id")),
  );
  const qaPart = (table, where) =>
    nullDanglingRefs(
      fetchTableRows(dev.ref, "public", table, where),
      refColumns(table, fks, excludedSet),
      qaIds,
    );
  queueRows("public", "profiles", qaPart("profiles", inQa("id")));
  queueRows("public", "admin_members", qaPart("admin_members", inQa("profile_id")));
  // 주문 참조를 비우면 CHECK pag_payment_*_pairing_check 가 granted_by='payment' 를 막아 'qa' 로 바꾼다.
  const grants = detachPaymentGrants(
    nullDanglingRefs(
      filterLiveGrants(
        fetchTableRows(dev.ref, "public", "program_access_grants", inQa("profile_id")),
        new Date(),
      ),
      refColumns("program_access_grants", fks, excludedSet),
      qaIds,
    ),
  );
  queueRows("public", "program_access_grants", grants);
  queueRows(
    "public",
    "parent_child_links",
    nullDanglingRefs(
      filterQaLinks(
        fetchTableRows(dev.ref, "public", "parent_child_links", inQa("parent_id")),
        qaIds,
      ),
      refColumns("parent_child_links", fks, excludedSet),
      qaIds,
    ),
  );

  // 3) 적재 - 순환 FK/트리거(handle_new_user 등)를 피하려고 replica 모드, 트랜잭션 안에서만
  runLocal(
    container,
    [
      "begin;",
      "set local session_replication_role = replica;",
      ...statements,
      "commit;",
    ].join("\n"),
  );

  // 4) identity/serial 시퀀스를 적재된 최댓값 뒤로 맞춘다
  const seqSql = loaded.flatMap(({ schema, table }) =>
    localCols
      .get(`${schema}.${table}`)
      .filter((c) => c.serial)
      .map(
        (c) =>
          `select setval(pg_get_serial_sequence('"${schema}"."${table}"', '${c.name}'), coalesce(max("${c.name}"), 0) + 1, false) from "${schema}"."${table}";`,
      ),
  );
  if (seqSql.length) runLocal(container, seqSql.join("\n"), ["-At"]);

  // 5) program_access 캐시 재계산. 복사한 부여는 모두 살아있어 빈 상태 값(3번째 인자)은 쓰이지 않는다.
  const targets = syncTargets(grants);
  if (targets.length) {
    runLocal(
      container,
      targets
        .map(
          (t) =>
            `select public.fn_sync_program_access_cache(${lit(t.profile_id)}::uuid, ${lit(t.program_key)}, null);`,
        )
        .join("\n"),
      ["-At"],
    );
  }

  for (const { schema, table, count } of loaded) {
    console.log(`✓ ${schema}.${table}: ${count}행`);
  }
  console.log(
    `\n완료: ${loaded.length}개 테이블, QA 계정 ${qaIds.size}개, 캐시 재계산 ${targets.length}쌍`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
