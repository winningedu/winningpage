import { describe, expect, it } from "vitest";
import { findInserts } from "./migrationDataInserts.mjs";

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
