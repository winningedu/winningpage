// POST /api/admin/uploads/preview 계약 검증: 임시 객체의 읽기 URL.

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSectionAdmin,
  createSectionDb,
  seedAdmin,
} from "../../../_lib/admin-sections/sectionTestKit.js";
import { createFakeStorage } from "../../../_lib/admin-uploads/storageTestKit.js";
import {
  callHandler,
  createKitState,
  type KitState,
} from "../../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  fake: null as unknown as ReturnType<
    typeof import("../../../_lib/admin-uploads/storageTestKit.js").createFakeStorage
  >,
}));

vi.mock("../../../_lib/supabaseAdmin.js", () => ({
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    ...createSectionAdmin(kit.state, createSectionDb({})),
    storage: kit.fake.storage,
  }),
}));

import handler from "./preview.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const NAME = `${UUID}.image_url.hero.png`;
const post = (body: unknown) => callHandler(handler, body, "POST");

beforeEach(() => {
  kit.state = createKitState();
  kit.fake = createFakeStorage({ "admin-uploads-tmp": [NAME] });
  seedAdmin(kit.state, "edit", "banners");
});

describe("POST /api/admin/uploads/preview", () => {
  test("임시 객체의 읽기 URL 을 2시간짜리로 돌려준다", async () => {
    const r = await post({ section: "banners", path: NAME });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      url: `https://storage.test/storage/v1/object/sign/admin-uploads-tmp/${NAME}?token=read`,
    });
    expect(kit.fake.calls.find((c) => c.op === "createSignedUrl")).toEqual({
      bucket: "admin-uploads-tmp",
      op: "createSignedUrl",
      args: [NAME, 7200],
    });
  });

  test("객체가 없으면 409 UPLOAD_EXPIRED", async () => {
    kit.fake = createFakeStorage();
    const r = await post({ section: "banners", path: NAME });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({
      code: "UPLOAD_EXPIRED",
      detail: "올린 파일이 만료됐어요. 파일을 다시 올려 주세요.",
    });
  });

  test("임시 이름 형식이 아니거나 이 섹션 필드가 아니면 400 이고 스토리지를 보지 않는다", async () => {
    for (const path of [
      "landing/hero/a.png",
      `../${NAME}`,
      `${UUID}.title.hero.png`,
    ]) {
      const r = await post({ section: "banners", path });
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("view 권한은 403", async () => {
    seedAdmin(kit.state, "view", "banners");
    const r = await post({ section: "banners", path: NAME });
    expect(r.status).toBe(403);
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("모르는 섹션은 권한을 보기 전에 400", async () => {
    seedAdmin(kit.state, "none", "x");
    const r = await post({ section: "nope", path: NAME });
    expect(r.status).toBe(400);
  });

  test("서명 URL 발급이 실패하면 500", async () => {
    kit.fake.failures.push({ op: "createSignedUrl" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ section: "banners", path: NAME })).status).toBe(500);
  });
});
