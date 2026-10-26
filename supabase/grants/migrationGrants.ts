// 마이그레이션 SQL 텍스트에서 함수 EXECUTE 권한의 최종 상태를 읽는 테스트 공용 헬퍼.
// 마이그레이션 전체를 파일명 순서대로 이어붙인 뒤 GRANT/REVOKE 줄을 적용 순서대로 읽는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");

/** 모든 마이그레이션을 파일명 순서대로 이어붙인 SQL. */
export const MIGRATIONS_SQL = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
  .join("\n");

/** REVOKE/GRANT는 함수 정의와 멀리 떨어진 곳(baseline 권한 섹션, 이후 마이그레이션)에 있다.
 *  해당 함수가 들어간 REVOKE/GRANT 줄만 마이그레이션 순서대로 골라낸다(한 문장 한 줄). */
export function grantRevokeLines(fnName: string): string {
  return MIGRATIONS_SQL.split("\n")
    .filter(
      (line) =>
        (line.includes(`"public"."${fnName}"`) ||
          line.includes(`public.${fnName}(`)) &&
        /^(REVOKE|GRANT)/i.test(line),
    )
    .join("\n");
}

/** 순서대로 적용한 뒤 role이 EXECUTE를 갖는가(마지막 문장이 이긴다). */
export function hasExecute(acl: string, role: string): boolean {
  let granted = false;
  for (const line of acl.split("\n")) {
    const isGrant = /^GRANT/i.test(line);
    const [, target = ""] = line.split(isGrant ? /\sTO\s/i : /\sFROM\s/i);
    const roles = target.replace(/[";]/g, "").split(/\s*,\s*/);
    if (roles.some((r) => r.trim().toLowerCase() === role)) granted = isGrant;
  }
  return granted;
}

/** role 에서 EXECUTE 를 회수하는 REVOKE 문이 있는가. GRANT 문만으로는 보이지 않는 기본 권한
 *  (함수 생성 시 default privileges 와 PUBLIC)을 걷어냈는지 확인할 때 쓴다. */
export function revokesFrom(acl: string, role: string): boolean {
  const pattern = new RegExp(`^REVOKE\\b.*\\sFROM\\s.*\\b${role}\\b`, "i");
  return acl.split("\n").some((line) => pattern.test(line));
}

/** Postgres 는 함수를 만들 때 PUBLIC 에 EXECUTE 를 주는데 GRANT 문으로는 드러나지 않는다. */
export function revokesPublic(acl: string): boolean {
  return revokesFrom(acl, "public");
}
