// 읽기 전용 대행(결정 116)에서 쓰기 메서드가 통과하는 콘솔 라우트를 전수로 고정한다.
// 공통 처리부가 막으므로 라우트 본문까지 가는 것은 데이터를 바꾸지 않는 POST 4개(allowReadOnlyProxy)와
// 대행 시작, 종료(본사 관리자 auth:"user")뿐이어야 한다. 새 쓰기 라우트는 따로 손대지 않아도 막힌다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  callHandler,
  createFakeAdmin,
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({ state: null as unknown as KitState }));

vi.mock("../../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => createFakeAdmin(kit.state),
}));

import { routes } from "../manifest.js";
import { routes as routes30 } from "../manifest-30.js";
import { routes as routes60 } from "../manifest-60.js";

const CONSOLE_ROUTES = Object.entries({ ...routes, ...routes30, ...routes60 })
  .filter(([path]) => path.startsWith("console/"))
  .sort(([a], [b]) => a.localeCompare(b));
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

beforeEach(() => {
  vi.stubEnv("SITE", "schoolmentor");
  kit.state = createKitState();
  kit.state.user = { id: "hq-1", email: "hq@t.local" };
  kit.state.actor = {
    kind: "hq_proxy",
    tenant_id: "tenant-1",
    teacher_id: null,
    class_ids: [],
    proxy_session_id: "proxy-1",
    must_change_password: false,
  };
  kit.state.rows.proxy_sessions = () => ({ reason: "read_only" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("읽기 전용 대행의 쓰기 메서드", () => {
  test("허용 4개와 대행 시작, 종료만 라우트 본문까지 가고 나머지는 403 READ_ONLY_PROXY 다", async () => {
    const passed: string[] = [];
    for (const [path, load] of CONSOLE_ROUTES) {
      const handler = (await load()).default as Parameters<
        typeof callHandler
      >[0];
      for (const method of WRITE_METHODS) {
        const r = await callHandler(handler, {}, method);
        if (r.status === 405) continue;
        const code = (r.body as { error?: { code?: string } } | undefined)
          ?.error?.code;
        if (r.status === 403 && code === "READ_ONLY_PROXY") continue;
        passed.push(`${method} ${path}`);
      }
    }

    expect(passed).toEqual([
      "POST console/coaching/print-log",
      "POST console/enrollment/export",
      "POST console/proxy/end",
      "POST console/proxy/start",
      "POST console/school-year/rollover/preview",
      "POST console/teachers/import-preview",
    ]);
  });

  test("막힌 쓰기는 데이터를 하나도 쓰지 않는다", async () => {
    const students = (await import("./students/flag.js")).default;

    const r = await callHandler(students, { studentId: "s1", flag: true });

    expect(r.status).toBe(403);
    expect(kit.state.inserts).toEqual([]);
    expect(kit.state.updates).toEqual([]);
    expect(kit.state.upserts).toEqual([]);
    expect(kit.state.deletes).toEqual([]);
  });
});
