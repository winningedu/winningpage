// 섹션 엔진 업로드(임시 버킷 경유)와 삭제. 서버 호출과 PUT 은 가짜로 바꿔 순서와 인자만 본다.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const calls = vi.hoisted(() => ({
  issueUpload: vi.fn(),
  previewUpload: vi.fn(),
  removeUploads: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => {
        throw new Error("섹션 업로드는 브라우저 스토리지를 직접 쓰지 않는다");
      },
    },
  },
}));
vi.mock("../engine/api", () => ({
  issueUpload: calls.issueUpload,
  previewUpload: calls.previewUpload,
  removeUploads: calls.removeUploads,
}));
vi.mock("@/lib/storage/signedUpload", () => ({
  putSignedUpload: calls.put,
}));

import { Toaster } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import {
  AdminForm,
  removeSectionFiles,
  uploadSectionFiles,
} from "./AdminEngine";

const png = (name: string) => new File(["x"], name, { type: "image/png" });

beforeEach(() => {
  calls.issueUpload.mockImplementation(
    async (_s: string, f: { fileName: string }) => ({
      path: `tmp-${f.fileName}`,
      uploadUrl: `https://up/${f.fileName}?token=t`,
    }),
  );
  calls.previewUpload.mockImplementation(
    async (_s: string, path: string) => `https://read/${path}`,
  );
  calls.put.mockResolvedValue(undefined);
  calls.removeUploads.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("uploadSectionFiles", () => {
  test("발급, PUT, 미리보기 순서로 처리하고 미리보기 주소를 돌려준다", async () => {
    const file = png("a.png");

    const result = await uploadSectionFiles("notices", file, {
      key: "image",
      cacheControl: "60",
    });

    expect(calls.issueUpload).toHaveBeenCalledWith("notices", {
      field: "image",
      fileName: "a.png",
      contentType: "image/png",
      size: file.size,
    });
    expect(calls.put).toHaveBeenCalledWith("https://up/a.png?token=t", file, {
      cacheControl: "60",
    });
    expect(calls.previewUpload).toHaveBeenCalledWith("notices", "tmp-a.png");
    expect(result).toEqual([
      {
        name: "a.png",
        url: "https://read/tmp-a.png",
        size: file.size,
        type: "image/png",
      },
    ]);
  });

  test("타입이 없는 파일은 octet-stream 으로 발급한다", async () => {
    await uploadSectionFiles("notices", [new File(["x"], "a.bin")], {
      key: "file",
    });

    expect(calls.issueUpload).toHaveBeenCalledWith(
      "notices",
      expect.objectContaining({ contentType: "application/octet-stream" }),
    );
  });

  test("한 파일이 실패해도 나머지는 올리고 실패는 토스트로 알린다", async () => {
    calls.put.mockRejectedValueOnce(
      new ApiError({
        status: 403,
        code: "HTTP_403",
        detail: "파일을 올리지 못했어요.",
      }),
    );
    render(<Toaster />);

    const result = await uploadSectionFiles(
      "notices",
      [png("a.png"), png("b.png")],
      { key: "images" },
    );

    expect(result.map((item) => item.name)).toEqual(["b.png"]);
    expect(console.error).toHaveBeenCalledWith(
      "업로드 실패",
      expect.any(ApiError),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("2개 중 1개는 업로드되지 않았습니다."),
    );
  });

  test("파일이 없으면 서버를 부르지 않는다", async () => {
    expect(await uploadSectionFiles("notices", null, { key: "image" })).toEqual(
      [],
    );
    expect(calls.issueUpload).not.toHaveBeenCalled();
  });
});

describe("removeSectionFiles", () => {
  test("중복과 빈 값을 걷어내고 한 번에 지운다", async () => {
    await removeSectionFiles("notices", ["a", "b", "a", ""]);

    expect(calls.removeUploads).toHaveBeenCalledWith("notices", ["a", "b"]);
  });

  test("지울 것이 없으면 서버를 부르지 않는다", async () => {
    await removeSectionFiles("notices", [""]);

    expect(calls.removeUploads).not.toHaveBeenCalled();
  });

  test("실패해도 던지지 않고 경고만 남긴다", async () => {
    calls.removeUploads.mockRejectedValue(new Error("boom"));

    await expect(removeSectionFiles("notices", ["a"])).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalled();
  });
});

describe("AdminForm onRemoveFiles", () => {
  const BANNERS = "https://x.supabase.co/storage/v1/object/public/banners/";
  const config = {
    title: "테스트",
    table: "t",
    order: "id",
    columns: [],
    fields: [{ key: "image", label: "이미지", type: "image" }],
  } as never;

  function renderForm(onRemoveFiles: (paths: Iterable<string>) => void) {
    const onUpload = vi.fn(async () => [
      {
        name: "n.png",
        url: "https://x.supabase.co/storage/v1/object/sign/admin-uploads-tmp/u.image.n.png?token=t",
        size: 1,
        type: "image/png",
      },
    ]);
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
      <>
        <AdminForm
          config={config}
          mode="edit"
          row={{ id: 1, image: `${BANNERS}admin/old.png` }}
          onCancel={onCancel}
          onSave={onSave}
          onUpload={onUpload as never}
          onRemoveFiles={onRemoveFiles}
        />
        <Toaster />
      </>,
    );
    return { onSave, onCancel, onUpload };
  }

  test("저장하면 더 이상 쓰지 않는 기존 banners 경로만 onRemoveFiles 로 넘긴다", async () => {
    const onRemoveFiles = vi.fn();
    const { onSave, onUpload } = renderForm(onRemoveFiles);

    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input as Element, { target: { files: [png("n.png")] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "저장" }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [paths = []] = onRemoveFiles.mock.calls[0] ?? [];
    expect([...paths]).toEqual(["admin/old.png"]);
  });
});
