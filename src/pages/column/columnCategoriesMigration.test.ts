// column_categories 마이그레이션이 테이블, RLS, 이름 변경 전파 트리거를 담는지 잠근다.
// 원격 DB 에는 적용하지 않으므로 파일 내용으로만 본다. seed 는 마이그레이션이 아니라
// supabase/data 에 둔다(check-migration-data-inserts.mjs).

import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const MIGRATIONS = path.resolve(
  import.meta.dirname,
  "../../../supabase/migrations",
);

function readMigration(): string {
  const file = fs
    .readdirSync(MIGRATIONS)
    .find((name) => name.endsWith("_column_categories.sql"));
  expect(file).toBeDefined();
  return fs.readFileSync(path.join(MIGRATIONS, file as string), "utf8");
}

test("label unique, sort_order, is_active 를 가진 column_categories 테이블을 만든다", () => {
  const sql = readMigration();
  expect(sql).toMatch(/create table if not exists public\.column_categories/i);
  expect(sql).toMatch(/label text not null unique/i);
  expect(sql).toMatch(/sort_order int not null default 0/i);
  expect(sql).toMatch(/is_active boolean not null default true/i);
  expect(sql).toMatch(/created_at timestamptz not null default now\(\)/i);
});

test("RLS 를 켜고 공개 조회와 관리자 전용 쓰기 정책을 둔다", () => {
  const sql = readMigration();
  expect(sql).toMatch(
    /alter table public\.column_categories enable row level security/i,
  );
  expect(sql).toMatch(
    /for select to authenticated, anon\s+using \(is_active or public\.is_winning_admin\(\)\)/i,
  );
  expect(sql).toMatch(
    /to authenticated\s+using \(public\.is_winning_admin\(\)\)\s+with check \(public\.is_winning_admin\(\)\)/i,
  );
});

test("label 이 바뀌면 같은 트랜잭션에서 galleries.category 를 새 이름으로 바꾼다", () => {
  const sql = readMigration();
  expect(sql).toMatch(/after update of label on public\.column_categories/i);
  expect(sql).toMatch(/when \(old\.label is distinct from new\.label\)/i);
  expect(sql).toMatch(
    /update public\.galleries\s+set category = new\.label\s+where category = old\.label/i,
  );
});

test("마이그레이션에는 seed insert 를 두지 않는다", () => {
  expect(readMigration()).not.toMatch(/insert\s+into/i);
});

test("seed 데이터 SQL 이 현재 7개 칩을 기존 순서대로 멱등하게 넣는다", () => {
  const dataDir = path.resolve(MIGRATIONS, "../data");
  const file = fs
    .readdirSync(dataDir)
    .find((name) => name.endsWith("_column_categories_seed.sql"));
  expect(file).toBeDefined();
  const sql = fs.readFileSync(path.join(dataDir, file as string), "utf8");
  const labels = [
    "학습관리 방법",
    "수시 및 정시 전략",
    "특목고 입학",
    "해외 및 대학원",
    "입시제도 변화",
    "대학 입시 제로",
    "학생부•수행평가•세특",
  ];
  const positions = labels.map((label, i) => {
    expect(sql).toContain(`('${label}', ${(i + 1) * 10})`);
    return sql.indexOf(`('${label}'`);
  });
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(sql).toMatch(/on conflict \(label\) do nothing/i);
});
