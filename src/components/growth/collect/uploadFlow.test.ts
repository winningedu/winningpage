import { describe, expect, test, vi } from "vitest";
import type { ApiResult } from "@/lib/growth/api";
import {
  IDLE,
  isUploadBusy,
  runUpload,
  type UploadDeps,
  type UploadState,
  uploadReducer,
  validateUploadFile,
} from "./uploadFlow";

const file = (name = "a.pdf", type = "application/pdf", size = 1000) =>
  ({ name, type, size }) as File;

describe("업로드 파일 사전 검사", () => {
  test("허용 5종과 10MB 이하는 통과한다", () => {
    for (const type of [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      expect(validateUploadFile(file("x", type))).toBeNull();
    }
    expect(
      validateUploadFile(file("x", "application/pdf", 10 * 1024 * 1024)),
    ).toBeNull();
  });

  test("허용하지 않는 형식, 10MB 초과, 빈 파일은 안내를 돌려준다", () => {
    expect(validateUploadFile(file("x", "image/gif"))).toBe(
      "PDF, 이미지, TXT, DOCX 파일만 올릴 수 있어요.",
    );
    expect(
      validateUploadFile(file("x", "application/pdf", 10 * 1024 * 1024 + 1)),
    ).toBe("파일은 10MB까지 올릴 수 있어요.");
    expect(validateUploadFile(file("x", "application/pdf", 0))).toBe(
      "빈 파일은 올릴 수 없어요.",
    );
  });
});

describe("업로드 상태 머신", () => {
  const step = (
    state: UploadState,
    ...events: Parameters<typeof uploadReducer>[1][]
  ) => events.reduce(uploadReducer, state);

  test("idle 에서 요청, 업로드, 추출, 완료 순서로 흐른다", () => {
    expect(IDLE.phase).toBe("idle");
    expect(step(IDLE, { type: "start" }).phase).toBe("requesting");
    expect(step(IDLE, { type: "start" }, { type: "url-issued" }).phase).toBe(
      "uploading",
    );
    expect(
      step(
        IDLE,
        { type: "start" },
        { type: "url-issued" },
        { type: "uploaded" },
      ).phase,
    ).toBe("extracting");
    expect(
      step(
        IDLE,
        { type: "start" },
        { type: "url-issued" },
        { type: "uploaded" },
        { type: "extracted", topic: "열섬 현상" },
      ),
    ).toEqual({ phase: "ok", topic: "열섬 현상" });
  });

  test("추출 실패와 오류는 failed, 상한 초과는 limit 이다", () => {
    expect(
      step(IDLE, { type: "start" }, { type: "failed", message: "실패" }),
    ).toEqual({ phase: "failed", message: "실패" });
    expect(step(IDLE, { type: "limit", message: "10개까지" })).toEqual({
      phase: "limit",
      message: "10개까지",
    });
  });

  test("진행 중에 start 가 또 오면 무시하고 reset 은 idle 로 돌린다", () => {
    const busy = step(IDLE, { type: "start" });
    expect(uploadReducer(busy, { type: "start" })).toBe(busy);
    expect(uploadReducer(busy, { type: "reset" })).toEqual(IDLE);
  });

  test("busy 판정은 요청, 업로드, 추출 단계만 참이다", () => {
    expect(isUploadBusy({ phase: "requesting" })).toBe(true);
    expect(isUploadBusy({ phase: "uploading" })).toBe(true);
    expect(isUploadBusy({ phase: "extracting" })).toBe(true);
    expect(isUploadBusy(IDLE)).toBe(false);
    expect(isUploadBusy({ phase: "failed", message: "" })).toBe(false);
  });
});

describe("업로드 실행 흐름", () => {
  const okResult = <T>(data: T): ApiResult<T> => ({ kind: "ok", data });
  const request = {
    gradeLabel: "고1" as const,
    semester: 2 as const,
    file: file("1학년 2학기 자기평가서.pdf"),
  };

  function setup(overrides: Partial<UploadDeps> = {}) {
    const events: unknown[] = [];
    const deps: UploadDeps = {
      requestUploadUrl: vi.fn().mockResolvedValue(
        okResult({
          ok: true,
          uploadId: "up1",
          bucket: "b",
          path: "p",
          token: "t",
          signedUrl: "s",
        }),
      ),
      uploadToStorage: vi.fn().mockResolvedValue({ error: null }),
      extract: vi.fn().mockResolvedValue(
        okResult({
          ok: true,
          uploadId: "up1",
          status: "ok",
          extracted: {
            topic: "열섬 현상",
            concept: null,
            result: null,
            limitation: null,
          },
        }),
      ),
      ...overrides,
    };
    return { deps, events, dispatch: (e: unknown) => events.push(e) };
  }

  test("URL 발급, 직접 업로드, 추출 순서로 부르고 완료 때 추출 주제를 알린다", async () => {
    const { deps, events, dispatch } = setup();
    const outcome = await runUpload(deps, request, dispatch);
    expect(deps.requestUploadUrl).toHaveBeenCalledWith({
      fileName: "1학년 2학기 자기평가서.pdf",
      mimeType: "application/pdf",
      byteSize: 1000,
      gradeLabel: "고1",
      semester: 2,
      consent: true,
    });
    expect(deps.uploadToStorage).toHaveBeenCalledWith(
      "b",
      "p",
      "t",
      request.file,
    );
    expect(deps.extract).toHaveBeenCalledWith("up1");
    expect(events).toEqual([
      { type: "start" },
      { type: "url-issued" },
      { type: "uploaded" },
      { type: "extracted", topic: "열섬 현상" },
    ]);
    expect(outcome).toBe("ok");
  });

  test("추출 status failed 는 직접 입력 안내와 함께 실패로 끝난다", async () => {
    const { deps, events, dispatch } = setup({
      extract: vi
        .fn()
        .mockResolvedValue(
          okResult({ ok: true, uploadId: "up1", status: "failed", error: "x" }),
        ),
    });
    expect(await runUpload(deps, request, dispatch)).toBe("unreadable");
    expect(events.at(-1)).toEqual({
      type: "failed",
      message: "글자를 읽지 못했어요. 직접 입력에 적어 주세요",
    });
  });

  test("UPLOAD_LIMIT 는 limit 상태로, 그 밖의 발급 오류는 서버 문구로 실패한다", async () => {
    const limit = setup({
      requestUploadUrl: vi.fn().mockResolvedValue({
        kind: "error",
        status: 409,
        code: "UPLOAD_LIMIT",
        message: "서버",
      }),
    });
    expect(await runUpload(limit.deps, request, limit.dispatch)).toBe("limit");
    expect(limit.events.at(-1)).toEqual({
      type: "limit",
      message: "이 학기에는 파일을 10개까지 올릴 수 있어요",
    });
    expect(limit.deps.uploadToStorage).not.toHaveBeenCalled();

    const bad = setup({
      requestUploadUrl: vi.fn().mockResolvedValue({
        kind: "error",
        status: 415,
        code: "UNSUPPORTED_MIME",
        message: "형식 안 돼요",
      }),
    });
    expect(await runUpload(bad.deps, request, bad.dispatch)).toBe("failed");
    expect(bad.events.at(-1)).toEqual({
      type: "failed",
      message: "형식 안 돼요",
    });
  });

  test("Storage 업로드 실패면 추출을 부르지 않는다", async () => {
    const { deps, events, dispatch } = setup({
      uploadToStorage: vi.fn().mockResolvedValue({ error: { message: "x" } }),
    });
    expect(await runUpload(deps, request, dispatch)).toBe("failed");
    expect(deps.extract).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: "failed" });
  });

  test("추출 타임아웃은 실패로 끝나고 다시 시도하라고 알린다", async () => {
    const { deps, events, dispatch } = setup({
      extract: vi.fn().mockResolvedValue({ kind: "timeout" }),
    });
    expect(await runUpload(deps, request, dispatch)).toBe("failed");
    expect(events.at(-1)).toMatchObject({ type: "failed" });
  });
});
