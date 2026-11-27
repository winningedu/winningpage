import { describe, expect, it, vi } from "vitest";
import { callRoute } from "../../_lib/adminRoute.testkit.js";
import { authOnlyDb, paidDb, SESSION_ID } from "./route.testkit.js";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("../../_lib/supabaseAdmin.js", () => ({
  getEnv: (key: string) => process.env[key] ?? "",
  isSupabaseConfigError: () => false,
  createSupabaseAdmin: () => state.db,
}));

import { app } from "../app.js";
import { ALLOWED_MIME_EXT, UNSUPPORTED_MIME_MESSAGE } from "./upload-url.js";

const route = { app, path: "/api/performance/upload-url" };
const GOOD = { sessionId: SESSION_ID, mimeType: "image/png", byteSize: 1024 };

describe("upload-url 요청 형식", () => {
  it.each([
    ["sessionId 없음", { ...GOOD, sessionId: undefined }, "sessionId"],
    ["sessionId 가 uuid 아님", { ...GOOD, sessionId: "x" }, "sessionId"],
    ["mimeType 없음", { ...GOOD, mimeType: undefined }, "mimeType"],
    ["byteSize 가 문자열", { ...GOOD, byteSize: "10" }, "byteSize"],
    ["byteSize 가 0", { ...GOOD, byteSize: 0 }, "byteSize"],
    ["byteSize 가 소수", { ...GOOD, byteSize: 1.5 }, "byteSize"],
  ])(
    "%s 이면 400 VALIDATION_FAILED 와 errors 를 낸다",
    async (_name, body, field) => {
      state.db = authOnlyDb();
      const res = await callRoute(route, { method: "POST", body });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "VALIDATION_FAILED" });
      const errors = (
        res.body as { errors: { pointer?: string; field?: string }[] }
      ).errors;
      expect(JSON.stringify(errors)).toContain(field);
    },
  );
});

describe("upload-url 도메인 규칙", () => {
  it("허용하지 않는 MIME 은 415 UNSUPPORTED_MIME 이다", async () => {
    state.db = paidDb();
    const res = await callRoute(route, {
      method: "POST",
      body: { ...GOOD, mimeType: "image/heic" },
    });
    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({
      code: "UNSUPPORTED_MIME",
      detail: UNSUPPORTED_MIME_MESSAGE,
    });
  });

  it("10MB 를 넘으면 413 FILE_TOO_LARGE 이다", async () => {
    state.db = paidDb();
    const res = await callRoute(route, {
      method: "POST",
      body: { ...GOOD, byteSize: 10 * 1024 * 1024 + 1 },
    });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: "FILE_TOO_LARGE" });
  });
});

describe("안내문 업로드 MIME 화이트리스트", () => {
  it("application/pdf를 pdf 확장자로 허용한다", () => {
    expect(ALLOWED_MIME_EXT["application/pdf"]).toBe("pdf");
  });

  it("기존 이미지 형식은 그대로 허용한다", () => {
    expect(Object.keys(ALLOWED_MIME_EXT).sort()).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("HEIC와 임의 형식은 허용하지 않는다", () => {
    expect(ALLOWED_MIME_EXT["image/heic"]).toBeUndefined();
    expect(ALLOWED_MIME_EXT["application/zip"]).toBeUndefined();
  });

  it("거부 문구가 PDF 허용을 안내한다", () => {
    expect(UNSUPPORTED_MIME_MESSAGE).toContain("PDF");
  });
});
