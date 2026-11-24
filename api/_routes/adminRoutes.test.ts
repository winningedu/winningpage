// 관리자 라우트 규칙 가드: api/_routes/admin/** 와 api/_routes/goal/admin/** 의 모든 라우트는
// defineHandler 로 만들고, 호출마다 auth:"admin" 과 permission 을 가져야 한다.
// 권한 없는 관리자 라우트가 끼어들면 쓰기 감사 행도 남지 않으므로(defineHandler 가 permission 이 있을 때만 남긴다) 여기서 막는다.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const ROUTES_DIR = new URL(".", import.meta.url).pathname;
const SCAN_DIRS = ["admin", "goal/admin"];

// 규칙 밖에 두는 라우트와 그 이유.
const ALLOWLIST: Record<string, string> = {
  "admin/me/activate.ts":
    "초대받은 사용자는 관리자가 되기 전에 활성화하므로 auth user 다",
  "admin/me/permissions.ts":
    "호출자 자신의 권한 맵을 읽는 라우트라 메뉴 권한이 없다",
};

/** defineHandler({ ... }) 호출마다 auth:"admin" 과 permission 이 있는지 보고, 어긋난 점을 돌려준다. */
function checkAdminRouteSource(source: string): string[] {
  const chunks = source.split("defineHandler({").slice(1);
  if (chunks.length === 0) return ["defineHandler 를 쓰지 않는다"];
  const problems: string[] = [];
  chunks.forEach((chunk, index) => {
    const label = `defineHandler #${index + 1}`;
    if (!/auth:\s*"admin"/.test(chunk))
      problems.push(`${label}: auth:"admin" 이 없다`);
    if (!/permission:/.test(chunk))
      problems.push(`${label}: permission 이 없다`);
  });
  return problems;
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    if (!entry.name.endsWith(".ts")) return [];
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".testkit.ts")) {
      return [];
    }
    return [path];
  });
}

describe("checkAdminRouteSource", () => {
  const good = `
    // defineHandler 를 설명하는 주석
    export default defineHandler({
      methods: ["POST"],
      auth: "admin",
      permission: { key: "members" },
    });
  `;

  test("auth:admin 과 permission 이 있으면 통과한다", () => {
    expect(checkAdminRouteSource(good)).toEqual([]);
  });

  test("auth 가 admin 이 아니면 실패한다", () => {
    const bad = good.replace('auth: "admin"', 'auth: "user"');
    expect(checkAdminRouteSource(bad)).toHaveLength(1);
  });

  test("permission 이 없으면 실패한다", () => {
    const bad = good.replace('permission: { key: "members" },', "");
    expect(checkAdminRouteSource(bad)).toHaveLength(1);
  });

  test("defineHandler 가 없으면 실패한다", () => {
    expect(
      checkAdminRouteSource("export default function handler() {}"),
    ).toHaveLength(1);
  });

  test("호출이 둘이면 하나라도 어긋날 때 실패한다", () => {
    expect(
      checkAdminRouteSource(good + good.replace("permission:", "perm:")),
    ).toHaveLength(1);
  });
});

describe("관리자 라우트 규칙", () => {
  const files = SCAN_DIRS.flatMap((dir) => routeFiles(join(ROUTES_DIR, dir)));

  test("라우트 파일을 찾는다", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  test("허용 목록의 파일은 실제로 있다", () => {
    const names = files.map((file) => relative(ROUTES_DIR, file));
    for (const name of Object.keys(ALLOWLIST)) expect(names).toContain(name);
  });

  test.each(files.map((file) => [relative(ROUTES_DIR, file), file]))(
    "%s",
    (name, file) => {
      if (name !== undefined && name in ALLOWLIST) return;
      expect(
        checkAdminRouteSource(readFileSync(file as string, "utf8")),
      ).toEqual([]);
    },
  );
});
