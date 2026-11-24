// GET /api/cron/admin-uploads-tmp-cleanup 계약 검증: 24시간 지난 임시 업로드만 지운다.

import { readFileSync } from "node:fs";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeStorage } from "../_lib/admin-uploads/storageTestKit.js";

const kit = vi.hoisted(() => ({
  fake: null as unknown as { storage: unknown },
}));

vi.mock("../_lib/supabaseAdmin.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../_lib/supabaseAdmin.js")>()),
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({ storage: kit.fake.storage }),
}));

import handler from "./admin-uploads-tmp-cleanup.js";

const NOW = Date.parse("2026-11-25T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const TMP = "admin-uploads-tmp";

let fake: ReturnType<typeof createFakeStorage>;

async function run(authorization?: string, method = "GET") {
  const captured: { status: number; body: unknown } = {
    status: 0,
    body: undefined,
  };
  const res = {
    setHeader: () => {},
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
    end(payload?: string) {
      if (payload) captured.body = JSON.parse(payload);
      return res;
    },
  } as unknown as VercelResponse;
  await handler(
    {
      method,
      headers: authorization ? { authorization } : {},
    } as unknown as VercelRequest,
    res,
  );
  return captured;
}

const objects = (count: number, createdAt: (i: number) => string) =>
  Array.from({ length: count }, (_, i) => ({
    name: `obj-${String(i).padStart(4, "0")}`,
    createdAt: createdAt(i),
  }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  fake = createFakeStorage({ [TMP]: [] });
  kit.fake = fake;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/admin-uploads-tmp-cleanup", () => {
  test("CRON_SECRET 이 없거나 틀리면 401 이고 스토리지를 보지 않는다", async () => {
    expect((await run()).status).toBe(401);
    expect((await run("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await run("Bearer ")).status).toBe(401);
    expect(fake.calls).toHaveLength(0);
  });

  test("GET 만 받는다", async () => {
    expect((await run("Bearer cron-secret", "POST")).status).toBe(405);
  });

  test("정확히 24시간은 두고 24시간 + 1ms 는 지운다", async () => {
    for (const o of [
      { name: "old", createdAt: at(-24 * HOUR - 1) },
      { name: "edge", createdAt: at(-24 * HOUR) },
      { name: "new", createdAt: at(-HOUR) },
    ]) {
      fake.put(TMP, o);
    }

    const r = await run("Bearer cron-secret");

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      scanned: 3,
      removed: 1,
      failed: 0,
      hasMore: false,
    });
    expect(fake.names(TMP).sort()).toEqual(["edge", "new"]);
  });

  test("오래된 순으로 100개씩 읽고, 안 지워지는 것을 만나면 거기서 멈춘다", async () => {
    for (const o of objects(250, (i) => at(-48 * HOUR + i))) fake.put(TMP, o);
    fake.put(TMP, { name: "fresh", createdAt: at(-HOUR) });

    const r = await run("Bearer cron-secret");

    expect(r.body).toEqual({
      scanned: 251,
      removed: 250,
      failed: 0,
      hasMore: false,
    });
    const lists = fake.calls.filter((c) => c.op === "list");
    expect(lists.map((c) => c.args)).toEqual([
      [
        "",
        {
          limit: 100,
          offset: 0,
          sortBy: { column: "created_at", order: "asc" },
        },
      ],
      [
        "",
        {
          limit: 100,
          offset: 0,
          sortBy: { column: "created_at", order: "asc" },
        },
      ],
      [
        "",
        {
          limit: 100,
          offset: 0,
          sortBy: { column: "created_at", order: "asc" },
        },
      ],
    ]);
    const removes = fake.calls.filter((c) => c.op === "remove");
    expect(removes.map((c) => (c.args[0] as string[]).length)).toEqual([
      100, 100, 50,
    ]);
    expect(fake.names(TMP)).toEqual(["fresh"]);
  });

  test("한 번에 최대 1000개까지만 지우고 남았다고 알린다", async () => {
    for (const o of objects(1200, (i) => at(-48 * HOUR + i))) fake.put(TMP, o);

    const r = await run("Bearer cron-secret");

    expect(r.body).toEqual({
      scanned: 1000,
      removed: 1000,
      failed: 0,
      hasMore: true,
    });
    expect(fake.calls.filter((c) => c.op === "list")).toHaveLength(10);
    expect(fake.names(TMP)).toHaveLength(200);
  });

  test("지우기에 실패한 이름은 실패로 세고 남겨 두며, 다음 쪽은 그만큼 건너뛰어 읽는다", async () => {
    for (const o of objects(150, (i) => at(-48 * HOUR + i))) fake.put(TMP, o);
    fake.failures.push({ op: "remove", names: ["obj-0000"] });

    const r = await run("Bearer cron-secret");

    expect(r.body).toEqual({
      scanned: 150,
      removed: 50,
      failed: 100,
      hasMore: false,
    });
    const offsets = fake.calls
      .filter((c) => c.op === "list")
      .map((c) => (c.args[1] as { offset: number }).offset);
    expect(offsets).toEqual([0, 100]);
    expect(fake.names(TMP)).toHaveLength(100);
  });

  test("실패가 1000건을 채워도 거기서 멈춘다", async () => {
    for (const o of objects(1100, (i) => at(-48 * HOUR + i))) fake.put(TMP, o);
    fake.failures.push({ op: "remove" });

    const r = await run("Bearer cron-secret");

    expect(r.body).toEqual({
      scanned: 1000,
      removed: 0,
      failed: 1000,
      hasMore: true,
    });
    expect(fake.names(TMP)).toHaveLength(1100);
  });

  test("목록 조회가 실패하면 500 이다", async () => {
    fake.failures.push({ op: "list" });
    expect((await run("Bearer cron-secret")).status).toBe(500);
  });

  test("한 줄 JSON 로그에 scanned, removed, failed 를 남긴다", async () => {
    fake.put(TMP, { name: "old", createdAt: at(-25 * HOUR) });
    await run("Bearer cron-secret");
    const lines = vi
      .mocked(console.log)
      .mock.calls.map((c) => String(c[0]))
      .filter((line) => line.includes("admin-uploads-tmp-cleanup"));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      scanned: 1,
      removed: 1,
      failed: 0,
    });
  });
});

describe("vercel.json", () => {
  test("매일 19:50 UTC 크론으로 등록돼 있다", () => {
    const config = JSON.parse(
      readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
    ) as { crons: { path: string; schedule: string }[] };
    expect(config.crons).toContainEqual({
      path: "/api/cron/admin-uploads-tmp-cleanup",
      schedule: "50 19 * * *",
    });
  });
});
