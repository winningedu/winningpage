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
});
