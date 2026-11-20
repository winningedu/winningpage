// AdminForm 입력 렌더러와 저장 경로 검증.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminForm } from "./AdminEngine";

type Row = { id?: string; name?: string; rate?: number | null };

function renderForm(
  overrides: Record<string, unknown> = {},
  props: Record<string, unknown> = {},
) {
  const onSave = vi.fn();
  const config = {
    title: "테스트",
    table: "t",
    order: "id",
    columns: [],
    fields: [
      { key: "name", label: "이름", type: "text" },
      { key: "rate", label: "비율", type: "number", nullable: true },
    ],
    ...overrides,
  };
  const row: Row = { id: "r1", name: "가", rate: 3 };
  render(
    <AdminForm
      config={config as never}
      mode="edit"
      row={row as never}
      onCancel={() => {}}
      onSave={onSave}
      onUpload={(async () => null) as never}
      {...props}
    />,
  );
  return { onSave };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminForm 숫자 입력", () => {
  test("nullable 숫자 필드를 비우고 저장하면 null 로 저장된다", () => {
    const { onSave } = renderForm();

    const input = screen.getByDisplayValue("3") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0].rate).toBeNull();
  });
});

describe("AdminForm select 와 textarea", () => {
  test("select 와 textarea 변경이 저장 값에 반영된다", () => {
    const { onSave } = renderForm({
      fields: [
        {
          key: "name",
          label: "구분",
          type: "select",
          options: ["가", { value: "b", label: "나" }],
        },
        { key: "memo", label: "메모", type: "textarea" },
      ],
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "내용" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: "b",
      memo: "내용",
    });
  });
});

describe("AdminForm 저장 중복 방지", () => {
  test("createDefaults 로 연 신규 등록에서 저장을 연달아 두 번 눌러도 한 번만 저장한다", async () => {
    let finish: () => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderForm(
      {},
      {
        mode: "create",
        row: null,
        createDefaults: { name: "프리필", rate: 1 },
        onSave,
      },
    );

    const save = screen.getByRole("button", { name: "저장" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole("button", { name: "저장 중..." }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    finish();
    await screen.findByRole("button", { name: "저장" });
  });
});
