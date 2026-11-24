// 서버 레지스트리의 쓰기 허용 플래그(allowCreate, allowUpdate, allowDelete)가 마이그레이션의 관리자 RLS 정책과 같은지 본다.
// 서비스 롤 클라이언트는 RLS 를 건너뛰므로, 예전 브라우저에서 RLS 가 막던 동작을 서버 레지스트리가 대신 막아야 한다.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SECTIONS } from "./registry.js";

const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url);

type Command = "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";

// 관리자 판정 함수(is_admin, is_winning_admin, 메뉴 권한 fn_admin_can)를 쓰는 정책만 관리자 정책으로 본다.
const ADMIN_PREDICATE =
  /"public"\."(is_admin|is_winning_admin|fn_admin_can)"\(/;

// 마이그레이션을 파일명 순서로 읽어 테이블별 정책을 쌓는다(CREATE 는 더하고 DROP 은 뺀다).
function policiesByTable(): Map<string, Map<string, string>> {
  const tables = new Map<string, Map<string, string>>();
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS), "utf8");
    for (const raw of sql.split(/;\s*\n/)) {
      const statement = raw.replace(/--.*$/gm, "").trim();
      const create = /^CREATE POLICY "([^"]+)" ON "public"\."([^"]+)"/.exec(
        statement,
      );
      const drop =
        /^DROP POLICY (?:IF EXISTS )?"([^"]+)" ON "public"\."([^"]+)"/.exec(
          statement,
        );
      if (create) {
        const [, name, table] = create as unknown as [string, string, string];
        const policies = tables.get(table) ?? new Map<string, string>();
        policies.set(name, statement);
        tables.set(table, policies);
      } else if (drop) {
        const [, name, table] = drop as unknown as [string, string, string];
        tables.get(table)?.delete(name);
      }
    }
  }
  return tables;
}

function adminOperations(policies: Map<string, string> | undefined) {
  const granted = new Set<Command>();
  for (const statement of policies?.values() ?? []) {
    const command = (/\sFOR (ALL|SELECT|INSERT|UPDATE|DELETE)\b/.exec(
      statement,
    )?.[1] ?? "ALL") as Command;
    if (command === "SELECT" || !ADMIN_PREDICATE.test(statement)) continue;
    granted.add(command);
  }
  const has = (command: Command) => granted.has("ALL") || granted.has(command);
  return {
    allowCreate: has("INSERT"),
    allowUpdate: has("UPDATE"),
    allowDelete: has("DELETE"),
  };
}

describe("레지스트리 쓰기 허용 플래그와 관리자 RLS 정책", () => {
  const policies = policiesByTable();

  test("refund_requests 는 관리자 수정 정책만 있다(등록, 삭제 정책 없음)", () => {
    expect(adminOperations(policies.get("refund_requests"))).toEqual({
      allowCreate: false,
      allowUpdate: true,
      allowDelete: false,
    });
  });

  test("정책 파서가 FOR ALL 은 셋 다, 정책이 없는 뷰는 아무것도 허용하지 않는다", () => {
    expect(adminOperations(policies.get("notices"))).toEqual({
      allowCreate: true,
      allowUpdate: true,
      allowDelete: true,
    });
    expect(adminOperations(policies.get("admin_refund_ledger"))).toEqual({
      allowCreate: false,
      allowUpdate: false,
      allowDelete: false,
    });
  });

  test.each(Object.entries(SECTIONS))(
    "%s 플래그는 %s 테이블의 관리자 정책과 같다",
    (key, entry) => {
      expect({
        key,
        allowCreate: entry.allowCreate,
        allowUpdate: entry.allowUpdate,
        allowDelete: entry.allowDelete,
      }).toEqual({ key, ...adminOperations(policies.get(entry.table)) });
    },
  );
});
