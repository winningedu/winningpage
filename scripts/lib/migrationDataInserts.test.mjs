import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

  it("주석 처리된 insert는 무시한다", () => {
    const sql = `
      -- insert into public.admin_member_permissions (profile_id) values ('x');
      insert into public.admin_resources (key) values ('popups');
    `;

    expect(findInserts(sql)).toEqual(["admin_resources"]);
  });

  it("$fn$ 같은 임의 태그의 달러 인용 함수 본문도 제거한다", () => {
    const sql = `
      create or replace function public.fn_do_thing()
      returns void
      language plpgsql
      as $fn$
      begin
        insert into public.orders (id) values (1);
      end;
      $fn$;

      insert into public.admin_resources (key) values ('popups');
    `;

    expect(findInserts(sql)).toEqual(["admin_resources"]);
  });

  it("한 파일에서 여러 테이블·중복 insert를 등장 순으로 중복 제거해 반환한다", () => {
    const sql = `
      insert into public.programs (id) values (1);
      insert into public.products (id) values (1);
      insert into public.programs (id) values (2);
    `;

    expect(findInserts(sql)).toEqual(["programs", "products"]);
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

// 실제 저장소 회귀 테스트 — 컷오프를 0으로 낮춰 supabase/migrations/ 전체를
// 돌려본 실측 스냅샷. 새 파일이 추가돼 이 목록이 늘어나는 건 정상(그 파일이
// 참조 데이터 밖에 insert했다는 뜻이므로 실제로 고쳐야 한다). 목록이
// 줄어드는 것도 정상(그 위반이 해소됨). 어느 쪽이든 스냅샷을 실측으로
// 갱신하기 전에 왜 바뀌었는지 먼저 확인할 것.
describe("실제 저장소 회귀", () => {
  const migrationsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "supabase",
    "migrations",
  );

  function checkAll(cutoff) {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const violationsByFile = {};
    let checked = 0;
    let skipped = 0;
    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      const result = checkMigrationFile(file, sql, { cutoff });
      if (result.skipped) {
        skipped++;
        continue;
      }
      checked++;
      if (result.violations.length > 0) {
        violationsByFile[file] = result.violations;
      }
    }
    return { violationsByFile, checked, skipped };
  }

  it("기본 컷오프로는 위반이 0건이다(도입 이전 파일은 전부 제외)", () => {
    const { violationsByFile } = checkAll(undefined);

    expect(violationsByFile).toEqual({});
  });

  it("컷오프를 0으로 낮추면 현재 저장소의 위반 파일이 실측 스냅샷과 같다", () => {
    const { violationsByFile } = checkAll("00000000000000");

    expect(violationsByFile).toEqual({
      "20260821000004_products_pricing_20260806.sql": ["products"],
      "20260822000010_admin_permissions.sql": ["admin_members"],
      "20260824000001_university_acceptances_graduate_track.sql": [
        "university_acceptances",
      ],
      "20260825000020_terms_content_to_db.sql": ["terms"],
      "20260829102136_terms_ver10_refund_clauses.sql": ["terms"],
      "20260831035903_terms_ver11_consent_v4_docs.sql": ["terms"],
      "20260901050445_busan_9900_bundle_seed.sql": ["products", "bundle_items"],
      "20260922002935_tenant_id_columns_backfill.sql": ["tenants"],
    });
  });
});
