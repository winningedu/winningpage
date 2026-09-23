import { describe, expect, it } from "vitest";
import { checkMigrationFile, findInserts } from "./migrationDataInserts.mjs";

// findInserts(sql) — 함수 본문(create [or replace] function ... $tag$...$tag$)
// 안의 insert는 실행 시점 로직(예: 결제 승인 시 orders insert)이라 마이그레이션
// 데이터 시딩이 아니다. 함수 밖 insert만 대상이어야 한다.
describe("findInserts", () => {
  it("함수 본문 안의 insert는 무시하고 함수 밖 insert만 찾는다", () => {
    const sql = `
      create or replace function public.fn_do_thing()
      returns void
      language plpgsql
      as $$
      begin
        insert into public.orders (id) values (1);
      end;
      $$;

      insert into public.admin_resources (key) values ('popups');
    `;

    expect(findInserts(sql)).toEqual(["admin_resources"]);
  });

  it("do 블록 안의 insert는 데이터 시드이므로 검출한다", () => {
    const sql = `
      do $$
      begin
        insert into public.tenants (code, name) values ('AB', '테스트');
      end $$;
    `;

    expect(findInserts(sql)).toEqual(["tenants"]);
  });

  it("대문자·public 접두어를 소문자 테이블명으로 정규화한다", () => {
    const sql = `INSERT INTO public.products (id) VALUES (1);`;

    expect(findInserts(sql)).toEqual(["products"]);
  });

  it("스키마 접두어 없는 테이블명도 public으로 간주해 같은 값으로 찾는다", () => {
    const sql = `insert into app_settings (key) values ('foo');`;

    expect(findInserts(sql)).toEqual(["app_settings"]);
  });

  it("public이 아닌 다른 스키마는 접두어를 붙인 그대로 반환한다", () => {
    const sql = `insert into auth.users (id) values ('u1');`;

    expect(findInserts(sql)).toEqual(["auth.users"]);
  });
});

// checkMigrationFile(fileName, sql, { allowed, cutoff }) — 컷오프 이후
// 파일에서 allowed 목록 밖 테이블에 insert하면 violations를 채운다.
describe("checkMigrationFile", () => {
  it("허용 목록 테이블에만 insert하면 violations가 빈 배열이다", () => {
    const sql = `insert into public.programs (id) values (1);`;

    const result = checkMigrationFile("20260924000000_seed.sql", sql, {
      allowed: ["programs"],
      cutoff: "20260923000000",
    });

    expect(result).toEqual({ skipped: false, violations: [] });
  });

  it("허용 목록 밖 테이블에 insert하면 그 테이블명이 violations에 담긴다", () => {
    const sql = `insert into public.products (id) values (1);`;

    const result = checkMigrationFile("20260924000000_seed.sql", sql, {
      allowed: ["programs"],
      cutoff: "20260923000000",
    });

    expect(result).toEqual({ skipped: false, violations: ["products"] });
  });

  it("파일명 타임스탬프가 컷오프 미만이면 위반이 있어도 건너뛴다", () => {
    const sql = `insert into public.products (id) values (1);`;

    const result = checkMigrationFile("20260101000000_old.sql", sql, {
      allowed: ["programs"],
      cutoff: "20260923000000",
    });

    expect(result).toEqual({ skipped: true, violations: [] });
  });

  it("파일명이 <14자리>_ 형식이 아니면 컷오프와 무관하게 검사한다", () => {
    const sql = `insert into public.products (id) values (1);`;

    const result = checkMigrationFile("not-a-timestamped-file.sql", sql, {
      allowed: ["programs"],
      cutoff: "20260923000000",
    });

    expect(result).toEqual({ skipped: false, violations: ["products"] });
  });
});
