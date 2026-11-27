// POST, DELETE /api/admin/uploads 계약 검증: 임시 업로드 URL 발급과 banners 파일 삭제.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { issuedUploadSchema } from "../../../shared/uploads/contract.js";
import {
  createSectionAdmin,
  createSectionDb,
  seedAdmin,
} from "../../_lib/admin-sections/sectionTestKit.js";
import { createFakeStorage } from "../../_lib/admin-uploads/storageTestKit.js";
import { parseTempName } from "../../_lib/admin-uploads/tmp.js";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import {
  createKitState,
  type KitState,
} from "../../_lib/console/consoleTestKit.js";

const kit = vi.hoisted(() => ({
  state: null as unknown as KitState,
  fake: null as unknown as ReturnType<
    typeof import("../../_lib/admin-uploads/storageTestKit.js").createFakeStorage
  >,
}));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: () => "winning",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => ({
    ...createSectionAdmin(kit.state, createSectionDb({})),
    storage: kit.fake.storage,
  }),
}));

import { app } from "../app.js";

const route = { app, path: "/api/admin/uploads" };

const MB = 1024 * 1024;
const post = (body: unknown) => callRoute(route, { method: "POST", body });
const del = (body: unknown) => callRoute(route, { method: "DELETE", body });

const issue = (overrides: Record<string, unknown> = {}) => ({
  section: "banners",
  field: "image_url",
  fileName: "Main Hero.PNG",
  contentType: "image/png",
  size: MB,
  ...overrides,
});

beforeEach(() => {
  kit.state = createKitState();
  kit.fake = createFakeStorage();
  seedAdmin(kit.state, "edit", "banners");
});

describe("POST, DELETE 가 아닌 메서드", () => {
  test("405 이고 Allow 가 DELETE, POST 다", async () => {
    const r = await callRoute(route, { method: "GET" });

    expect(r.status).toBe(405);
    expect(r.body).toMatchObject({ code: "METHOD_NOT_ALLOWED" });
    expect(r.headers.allow).toBe("DELETE, POST");
    expect(kit.fake.calls).toHaveLength(0);
  });
});

describe("POST /api/admin/uploads", () => {
  test("edit 권한이면 임시 이름과 업로드 URL 을 201 로 돌려준다", async () => {
    const r = await post(issue());

    expect(r.status).toBe(201);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(issuedUploadSchema.safeParse(r.body).success).toBe(true);
    const body = r.body as { path: string; uploadUrl: string };
    expect(parseTempName(body.path)).toMatchObject({
      fieldKey: "image_url",
      safeName: "Main_Hero",
      ext: "png",
    });
    expect(body.uploadUrl).toBe(
      `https://storage.test/storage/v1/object/upload/sign/admin-uploads-tmp/${body.path}?token=up`,
    );
    expect(kit.fake.calls).toEqual([
      {
        bucket: "admin-uploads-tmp",
        op: "createSignedUploadUrl",
        args: [body.path],
      },
    ]);
  });

  test("같은 요청을 두 번 보내도 이름이 겹치지 않는다", async () => {
    const a = (await post(issue())).body as { path: string };
    const b = (await post(issue())).body as { path: string };
    expect(a.path).not.toBe(b.path);
  });

  test("view 권한은 403 이고 스토리지를 부르지 않는다", async () => {
    seedAdmin(kit.state, "view", "banners");
    const r = await post(issue());
    expect(r.status).toBe(403);
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("권한이 없으면 403", async () => {
    seedAdmin(kit.state, "none", "banners");
    expect((await post(issue())).status).toBe(403);
  });

  test("모르는 섹션은 권한을 보기 전에 400 VALIDATION_FAILED", async () => {
    seedAdmin(kit.state, "none", "x");
    const r = await post(issue({ section: "nope" }));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "VALIDATION_FAILED" });
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("섹션이 문자열이 아니어도 400", async () => {
    expect((await post(issue({ section: 1 }))).status).toBe(400);
    expect((await post(undefined)).status).toBe(400);
  });

  test("이 섹션 업로드 필드가 아니면 400", async () => {
    const r = await post(issue({ field: "title" }));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({
      code: "VALIDATION_FAILED",
      errors: [{ path: "field", message: "업로드할 수 없는 항목입니다." }],
    });
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("확장자와 MIME 이 맞지 않으면 400", async () => {
    for (const bad of [
      { fileName: "a.pdf", contentType: "application/pdf" },
      { fileName: "a.png", contentType: "image/jpeg" },
      { fileName: "noext", contentType: "image/png" },
    ]) {
      const r = await post(issue(bad));
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({
        errors: [{ message: "올릴 수 없는 파일 형식입니다." }],
      });
    }
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("필드 한도(banners 이미지 2MB)를 넘으면 400, 딱 한도는 통과", async () => {
    const over = await post(issue({ size: 2 * MB + 1 }));
    expect(over.status).toBe(400);
    expect(over.body).toMatchObject({
      errors: [{ path: "size", message: "최대 2MB까지 업로드할 수 있습니다." }],
    });
    expect((await post(issue({ size: 2 * MB }))).status).toBe(201);
  });

  test("한도가 없는 파일 필드는 50MB, 문서 확장자를 받는다", async () => {
    seedAdmin(kit.state, "edit", "notices");
    const file = {
      section: "notices",
      field: "attachments",
      fileName: "안내문.hwp",
      contentType: "application/octet-stream",
      size: 50 * MB,
    };
    expect((await post(file)).status).toBe(201);
    const over = await post({ ...file, size: 50 * MB + 1 });
    expect(over.body).toMatchObject({
      errors: [{ message: "최대 50MB까지 업로드할 수 있습니다." }],
    });
  });

  test("본문 값이 규칙을 벗어나면 400", async () => {
    for (const bad of [
      { size: 0 },
      { size: 1.5 },
      { fileName: "" },
      { fileName: `${"a".repeat(252)}.png` },
      { contentType: undefined },
    ]) {
      expect((await post(issue(bad))).status).toBe(400);
    }
  });

  test("서명 URL 발급이 실패하면 500", async () => {
    kit.fake.failures.push({ op: "createSignedUploadUrl" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post(issue())).status).toBe(500);
  });
});

describe("premiumBookPages 업로드 규칙", () => {
  const premium = (overrides: Record<string, unknown> = {}) =>
    issue({ section: "premiumBookPages", ...overrides });

  beforeEach(() => {
    seedAdmin(kit.state, "edit", "premiumBookPages");
  });

  test("image_url 은 이미지 2MB 까지 받고 넘으면 400", async () => {
    expect((await post(premium({ size: 2 * MB }))).status).toBe(201);
    const over = await post(premium({ size: 2 * MB + 1 }));
    expect(over.status).toBe(400);
    expect(over.body).toMatchObject({ errors: [{ path: "size" }] });
  });

  test("booklet_pdf 는 pdf 만, page_webp 는 webp 이미지를 받는다", async () => {
    const pdf = {
      field: "booklet_pdf",
      fileName: "booklet.pdf",
      contentType: "application/pdf",
    };
    expect((await post(premium(pdf))).status).toBe(201);
    expect(
      (await post(premium({ ...pdf, fileName: "booklet.zip" }))).status,
    ).toBe(400);
    const webp = {
      field: "page_webp",
      fileName: "p01.webp",
      contentType: "image/webp",
    };
    expect((await post(premium(webp))).status).toBe(201);
    expect((await post(premium({ ...webp, fileName: "p01.pdf" }))).status).toBe(
      400,
    );
  });

  test("모르는 필드는 400 이고 스토리지를 부르지 않는다", async () => {
    const r = await post(premium({ field: "title" }));
    expect(r.status).toBe(400);
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("view 권한은 403", async () => {
    seedAdmin(kit.state, "view", "premiumBookPages");
    expect((await post(premium())).status).toBe(403);
  });

  test("DELETE 는 premium-book/ 아래만 지우고 밖은 400", async () => {
    kit.fake.put("banners", "premium-book/p01.webp");
    const ok = await del({
      section: "premiumBookPages",
      paths: ["premium-book/p01.webp"],
    });
    expect(ok.status).toBe(204);
    const bad = await del({
      section: "premiumBookPages",
      paths: ["landing/hero/a.png"],
    });
    expect(bad.status).toBe(400);
  });
});

describe("DELETE /api/admin/uploads", () => {
  test("섹션 업로드 폴더 아래 경로만 banners 에서 지우고 204", async () => {
    const paths = ["landing/hero/a-b.png", "landing/hero/sub/c.png"];
    kit.fake.put("banners", paths[0] as string);
    kit.fake.put("banners", paths[1] as string);

    const r = await del({ section: "banners", paths });

    expect(r.status).toBe(204);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(kit.fake.calls).toEqual([
      { bucket: "banners", op: "remove", args: [paths] },
    ]);
    expect(kit.fake.names("banners")).toEqual([]);
  });

  test("폴더 밖이거나 모양이 나쁜 경로가 하나라도 있으면 전체를 400 으로 막는다", async () => {
    const bad = [
      "other/x.png",
      "landing/hero",
      "landing/heroes/x.png",
      "landing/hero/../x.png",
      "landing/hero/./x.png",
      "landing/hero//x.png",
      "/landing/hero/x.png",
      "landing/hero/x y.png",
      "landing/hero/x.png?a=1",
      "",
    ];
    for (const path of bad) {
      const r = await del({
        section: "banners",
        paths: ["landing/hero/ok.png", path],
      });
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({
        code: "VALIDATION_FAILED",
        errors: [{ path: "paths.1" }],
      });
    }
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("다른 섹션의 폴더는 이 섹션에서 지울 수 없다", async () => {
    const r = await del({
      section: "banners",
      paths: ["admission-body/x.png"],
    });
    expect(r.status).toBe(400);
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("업로드 필드가 없는 섹션은 어떤 경로도 400", async () => {
    seedAdmin(kit.state, "edit", "specialHighschool");
    const r = await del({
      section: "specialHighschool",
      paths: ["admin/x.png"],
    });
    expect(r.status).toBe(400);
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("경로는 1개 이상 100개 이하", async () => {
    expect((await del({ section: "banners", paths: [] })).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => `landing/hero/${i}.png`);
    expect((await del({ section: "banners", paths: many })).status).toBe(400);
    const ok = many.slice(0, 100);
    expect((await del({ section: "banners", paths: ok })).status).toBe(204);
  });

  test("view 권한은 403 이고 지우지 않는다", async () => {
    seedAdmin(kit.state, "view", "banners");
    const r = await del({ section: "banners", paths: ["landing/hero/a.png"] });
    expect(r.status).toBe(403);
    expect(kit.fake.calls).toHaveLength(0);
  });

  test("모르는 섹션은 400", async () => {
    seedAdmin(kit.state, "none", "x");
    const r = await del({ section: "nope", paths: ["a/b.png"] });
    expect(r.status).toBe(400);
  });

  test("스토리지 삭제가 실패하면 500", async () => {
    kit.fake.failures.push({ op: "remove" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await del({ section: "banners", paths: ["landing/hero/a.png"] });
    expect(r.status).toBe(500);
  });
});
