// AdminForm 파일 입력: 키보드 접근과 같은 파일 재선택.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminForm } from "./AdminEngine";

const CASES = [
  { type: "image", label: "이미지 업로드", multiple: false },
  { type: "file", label: "파일 등록", multiple: false },
  { type: "multiImage", label: "이미지 여러 개 업로드", multiple: true },
  { type: "multiFile", label: "파일 여러 개 등록", multiple: true },
] as const;

function renderForm(type: string) {
  const onUpload = vi.fn(async () => []);
  render(
    <AdminForm
      config={
        {
          title: "테스트",
          table: "t",
          order: "id",
          columns: [],
          fields: [{ key: "f", label: "첨부", type }],
        } as never
      }
      mode="edit"
      row={{ id: "r1" } as never}
      onCancel={() => {}}
      onSave={() => {}}
      onUpload={onUpload as never}
    />,
  );
  return { onUpload };
}

function fileInput(label: string) {
  return screen
    .getByText(label)
    .closest("label")
    ?.querySelector('input[type="file"]') as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(CASES)("AdminForm $type 파일 입력", ({ type, label }) => {
  test("키보드로 닿을 수 있도록 숨김 대신 sr-only 를 쓴다", () => {
    renderForm(type);
    const input = fileInput(label);

    expect(input.classList.contains("hidden")).toBe(false);
    expect(input.classList.contains("sr-only")).toBe(true);
    expect(input.closest("label")?.className).toContain(
      "has-[:focus-visible]:ring-3",
    );
    input.focus();
    expect(document.activeElement).toBe(input);
  });

  test("같은 파일을 두 번 고르면 업로드가 두 번 호출된다", async () => {
    const { onUpload } = renderForm(type);
    const input = fileInput(label);
    const file = new File(["a"], "a.png", { type: "image/png" });

    // 실제 브라우저처럼 선택 후 value 가 남아 있도록 흉내 낸다.
    let current = "";
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => current,
      set: (v: string) => {
        current = v;
      },
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });

    for (let i = 0; i < 2; i += 1) {
      current = "C:\\fakepath\\a.png";
      fireEvent.change(input);
      await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(i + 1));
      // 값이 비어야 브라우저가 같은 파일 재선택에도 change 를 낸다.
      expect(input.value).toBe("");
    }
  });
});
