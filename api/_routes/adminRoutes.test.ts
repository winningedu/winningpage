// 관리자 라우트 규칙 가드: api/_routes/admin/** 와 api/_routes/goal/admin/** 의 모든 라우트는
// defineHandler 로 만들고, 호출마다 auth:"admin" 과 permission 을 가져야 한다.
// 권한 없는 관리자 라우트가 끼어들면 감사 행(쓰기와 조회)도 남지 않으므로(defineHandler 가 permission 이 있을 때만 남긴다) 여기서 막는다.

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

/**
 * defineHandler({ ... }) 호출마다 auth:"admin" 과 permission 이 있는지 보고, 어긋난 점을 돌려준다.
 * Hono 앱 파일(.createApp())은 admin({ ... }) 마다 permission 이 있는지만 본다. 메서드 라우트마다 인증 미들웨어가 붙었는지는
 * 라우트 표 가드(api/_routes/app.test.ts)가 실제 앱에서 본다.
 */
function checkAdminRouteSource(source: string): string[] {
  if (/\.createApp\(\)|create(Admin|Root)App\(\)/.test(source)) {
    return source
      .split("admin({")
      .slice(1)
      .flatMap((chunk, index) =>
        /permission:/.test(chunk)
          ? []
          : [`admin #${index + 1}: permission 이 없다`],
      );
  }
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

// 자동 감사 행을 끄거나 동작을 바꾼 라우트. 나머지 라우트는 메서드 기본값(GET view, POST create, PATCH, PUT update, DELETE delete)을 쓴다.
const AUDIT_OFF = "audit: false";
const AUDIT_EXPECTATIONS: Record<string, string> = {
  "admin/access-logs.ts": AUDIT_OFF,
  // member-purge, school-admin, move-student 는 각자 audit 행을 직접 남긴다.
  "admin/tenants-purge.ts": AUDIT_OFF,
  "admin/tenants-school-admins.ts": AUDIT_OFF,
  "admin/tenants-students.ts": AUDIT_OFF,
  // 발급 회수, 사용 이력 무효화 둘 다 기존 행을 바꾼다.
  "admin/coupons.ts": 'audit: { action: "update" }',
  "admin/sections/[key]/[id]/reviewed.ts": 'audit: { action: "update" }',
  "admin/growth-recover.ts": 'audit: { action: "update" }',
  "admin/inquiry-recover.ts": 'audit: { action: "update" }',
  "admin/selfeval-recover.ts": 'audit: { action: "update" }',
  "goal/admin/reset-student.ts": 'audit: { action: "update" }',
  "admin/knowledge-search.ts": 'audit: { action: "view" }',
  "admin/knowledge-dedupe.ts": 'audit: { action: "view" }',
  "admin/uploads/preview.ts": 'audit: { action: "view" }',
  "admin/mentor-applications/[id]/proof-url.ts": 'audit: { action: "view" }',
};

// 조회(GET)는 기본으로 남긴다. GET 을 받는 defineHandler 에서 audit:false 를 쓰려면 여기에 한 줄 이유를 둔다.
const GET_AUDIT_OPT_OUTS: Record<string, string> = {};

/** GET 을 받으면서 audit:false 로 자동 감사 행을 끈 defineHandler 호출 번호(1부터). */
function getAuditOptOuts(source: string): number[] {
  return source
    .split("defineHandler({")
    .slice(1)
    .flatMap((chunk, index) => {
      const methods = /methods:\s*\[([^\]]*)\]/.exec(chunk)?.[1] ?? "";
      return /"GET"/.test(methods) && /audit:\s*false/.test(chunk)
        ? [index + 1]
        : [];
    });
}

describe("getAuditOptOuts", () => {
  test("GET 핸들러의 audit:false 를 찾는다", () => {
    const source = `
      const a = defineHandler({ methods: ["POST"], audit: false, });
      const b = defineHandler({ methods: ["GET", "PATCH"], audit: false, });
      const c = defineHandler({ methods: ["GET"], });
    `;
    expect(getAuditOptOuts(source)).toEqual([2]);
  });
});

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

describe("감사 옵션", () => {
  test.each(Object.entries(AUDIT_EXPECTATIONS))(
    "%s 는 %s",
    (name, expected) => {
      const source = readFileSync(join(ROUTES_DIR, name), "utf8");
      expect(source).toContain(expected);
    },
  );

  test("GET 의 감사 끄기는 이유 표에 있는 라우트만 쓴다", () => {
    const files = SCAN_DIRS.flatMap((dir) => routeFiles(join(ROUTES_DIR, dir)));
    for (const file of files) {
      const name = relative(ROUTES_DIR, file);
      if (name in GET_AUDIT_OPT_OUTS) continue;
      expect(getAuditOptOuts(readFileSync(file, "utf8")), name).toEqual([]);
    }
  });

  test("표에 없는 라우트는 audit 옵션을 쓰지 않는다", () => {
    const files = SCAN_DIRS.flatMap((dir) => routeFiles(join(ROUTES_DIR, dir)));
    for (const file of files) {
      const name = relative(ROUTES_DIR, file);
      if (name in AUDIT_EXPECTATIONS) continue;
      expect(readFileSync(file, "utf8"), name).not.toMatch(/\baudit:/);
    }
  });
});
