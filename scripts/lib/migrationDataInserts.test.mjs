import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkMigrationFile,
  findDataStatements,
  stripFunctionBodies,
} from "./migrationDataInserts.mjs";

// findDataStatements(sql) — 함수 본문 밖의 데이터 문(insert/update/delete/
// truncate/merge/copy)을 { kind, table, line } 배열로 돌려준다.
describe("findDataStatements", () => {
  it("함수 본문 안의 데이터 문은 무시하고 함수 밖 insert만 찾는다", () => {
    const sql = `create or replace function public.fn_do_thing()
returns void
language plpgsql
as $$
begin
  insert into public.orders (id) values (1);
  update public.orders set id = 2;
end;
$$;

insert into public.admin_resources (key) values ('popups');
`;

    expect(findDataStatements(sql)).toEqual([
      { kind: "insert", table: "admin_resources", line: 11 },
    ]);
  });

  it("create procedure 본문도 제외한다", () => {
    const sql = `create procedure p() language plpgsql as $$
begin
  delete from public.orders;
end;
$$;`;

    expect(findDataStatements(sql)).toEqual([]);
  });

  it("do 블록 안의 insert는 검출한다", () => {
    const sql = `do $$
begin
  insert into public.tenants (code) values ('AB');
end $$;`;

    expect(findDataStatements(sql)).toEqual([
      { kind: "insert", table: "tenants", line: 3 },
    ]);
  });

  it("update, delete, truncate, merge, copy를 종류와 테이블로 찾는다", () => {
    const sql = `UPDATE public.products SET price = 1;
delete from storage.objects where true;
truncate table public.terms;
truncate public.programs;
merge into public.app_settings a using x on true when matched then do nothing;
copy public.products (id) from stdin;`;

    expect(findDataStatements(sql)).toEqual([
      { kind: "update", table: "products", line: 1 },
      { kind: "delete", table: "storage.objects", line: 2 },
      { kind: "truncate", table: "terms", line: 3 },
      { kind: "truncate", table: "programs", line: 4 },
      { kind: "merge", table: "app_settings", line: 5 },
      { kind: "copy", table: "products", line: 6 },
    ]);
  });

  it("스키마 접두어 없는 이름과 public. 접두어는 같은 값으로 정규화한다", () => {
    const sql = `insert into app_settings (key) values ('a');
insert into public.APP_SETTINGS (key) values ('b');
insert into auth.users (id) values ('u1');`;

    expect(findDataStatements(sql).map((s) => s.table)).toEqual([
      "app_settings",
      "app_settings",
      "auth.users",
    ]);
  });

  it("주석 처리된 문은 무시하고 줄 번호는 주석을 거쳐도 유지된다", () => {
    const sql = `-- insert into public.x (a) values (1);
-- another
update public.y set a = 1;`;

    expect(findDataStatements(sql)).toEqual([
      { kind: "update", table: "y", line: 3 },
    ]);
  });

  it("DDL 구문의 on update, on delete, for update는 데이터 문이 아니다", () => {
    const sql = `create table t (a int references u(id) on update set null on delete cascade);
create policy p on t for update using (true);
create trigger tr before update on t for each row execute function f();
create trigger tr2 after update of a on t for each row execute function f();
alter table t add constraint c foreign key (a) references u(id) on update cascade;`;

    expect(findDataStatements(sql)).toEqual([]);
  });

  it("함수 본문을 제거해도 뒤따르는 줄 번호가 밀리지 않는다", () => {
    const sql = `create function f() returns void as $f$
a
b
$f$ language sql;
delete from public.z;`;

    expect(stripFunctionBodies(sql).split("\n")).toHaveLength(5);
    expect(findDataStatements(sql)).toEqual([
      { kind: "delete", table: "z", line: 5 },
    ]);
  });
});

// checkMigrationFile(fileName, sql) — 허용 목록·컷오프 없이 모든 파일을 검사한다.
describe("checkMigrationFile", () => {
  it("데이터 문이 없으면 violations가 빈 배열이다", () => {
    const result = checkMigrationFile(
      "20260924000000_ddl.sql",
      `create table public.a (id int);`,
    );

    expect(result).toEqual({ violations: [] });
  });

  it("어떤 테이블이든 데이터 문이면 위반이다", () => {
    const result = checkMigrationFile(
      "20260101000000_old.sql",
      `insert into public.programs (id) values (1);`,
    );

    expect(result).toEqual({
      violations: [{ kind: "insert", table: "programs", line: 1 }],
    });
  });
});

// 실제 저장소 회귀 테스트 — supabase/migrations/ 전체에 데이터 문이 없어야 한다.
describe("실제 저장소 회귀", () => {
  const migrationsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "supabase",
    "migrations",
  );

  it("모든 마이그레이션 파일에 함수 본문 밖 데이터 문이 없다", () => {
    const violationsByFile = {};
    for (const file of readdirSync(migrationsDir).filter((f) =>
      f.endsWith(".sql"),
    )) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      const { violations } = checkMigrationFile(file, sql);
      if (violations.length > 0) violationsByFile[file] = violations;
    }

    expect(violationsByFile).toEqual({});
  });
});
