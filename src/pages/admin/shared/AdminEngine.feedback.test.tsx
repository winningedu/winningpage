// AdminForm 과 uploadImage 의 안내. 알림창과 브라우저 확인창 대신 토스트와 확인 대화상자를 쓴다.
// (저장하지 않은 변경사항 이탈 확인 두 곳은 1단계에서 window.confirm 그대로라 여기서 다루지 않는다.)

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const storage = vi.hoisted(() => ({ uploads: [] as string[] }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          storage.uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/${path}` },
        }),
      }),
    },
  },
}));

import { Toaster, toast } from "@/components/ui/toast";
import { AdminForm, uploadImage } from "./AdminEngine";
import { ConfirmAdminHost } from "./confirmAdmin";

function renderForm(
  validate?: (form: unknown) => unknown,
  fields: Record<string, unknown>[] = [
    { key: "name", label: "이름", type: "text" },
  ],
) {
  const onSave = vi.fn();
  render(
    <>
      <AdminForm
        config={
          {
            title: "테스트",
            table: "t",
            order: "id",
            columns: [],
            fields,
            ...(validate ? { validate } : {}),
          } as never
        }
        mode="create"
        row={null}
        createDefaults={{ name: "프리필" }}
        onCancel={() => {}}
        onSave={onSave}
        onUpload={(async () => null) as never}
      />
      <Toaster />
      <ConfirmAdminHost />
    </>,
  );
  return { onSave };
}

function lastToastTitle() {
  return document.querySelector('[data-slot="toast-title"]');
}

beforeEach(() => {
  storage.uploads.length = 0;
});

afterEach(() => {
  toast.close();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AdminForm 저장 전 검증 안내", () => {
  test("필수 항목이 비면 닫을 때까지 남는 경고 토스트를 보이고 저장하지 않는다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const addSpy = vi.spyOn(toast, "add");
    const { onSave } = renderForm(undefined, [
      { key: "name", label: "이름", type: "text", required: true },
    ]);

    fireEvent.change(screen.getByDisplayValue("프리필"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(lastToastTitle()).toHaveTextContent("이름 항목을 입력해주세요."),
    );
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "high", timeout: 0 }),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("동기 검증이 문구를 돌려주면 토스트로 보이고 저장하지 않는다", async () => {
    const { onSave } = renderForm(() => "값을 다시 확인해 주세요.");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(lastToastTitle()).toHaveTextContent("값을 다시 확인해 주세요."),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  test("비동기 검증이 확인창을 기다리는 동안 저장을 연달아 눌러도 한 번만 저장한다", async () => {
    let finish: (error: string | null) => void = () => {};
    const validate = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          finish = resolve;
        }),
    );
    const { onSave } = renderForm(validate);

    const save = screen.getByRole("button", { name: "저장" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(validate).toHaveBeenCalledTimes(1);

    finish(null);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  test("비동기 검증이 문구를 돌려주면 토스트로 보이고 저장하지 않는다", async () => {
    const { onSave } = renderForm(async () => "저장하지 않았습니다.");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(lastToastTitle()).toHaveTextContent("저장하지 않았습니다."),
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("uploadImage 안내", () => {
  test("용량 초과는 닫을 때까지 남는 경고 토스트로 알리고 올리지 않는다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    render(<Toaster />);
    const big = new File([new Uint8Array(2 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });

    const result = await uploadImage(big, { imageSpec: { maxMB: 1 } } as never);

    expect(result).toEqual([]);
    await waitFor(() =>
      expect(lastToastTitle()).toHaveTextContent("파일 용량이 너무 큽니다."),
    );
    expect(storage.uploads).toEqual([]);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("규격이 다른 이미지는 확인창에서 취소하면 올리지 않고, 계속하면 올린다", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 200, height: 200, close: () => {} })),
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ConfirmAdminHost />);
    const file = new File(["x"], "a.png", { type: "image/png" });
    const field = { imageSpec: { width: 100, height: 100 } } as never;

    const cancelled = uploadImage(file, field);
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("이미지 규격이 다릅니다.");
    expect(dialog).toHaveTextContent("100x100 필요, 현재 200x200");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    await expect(cancelled).resolves.toEqual([]);
    expect(storage.uploads).toEqual([]);

    const accepted = uploadImage(file, field);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "계속",
      }),
    );
    await expect(accepted).resolves.toHaveLength(1);
    expect(storage.uploads).toHaveLength(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
