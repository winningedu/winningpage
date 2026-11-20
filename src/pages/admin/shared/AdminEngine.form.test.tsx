// AdminForm 입력 렌더러와 저장 경로 검증.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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

  describe("모달 저장 경로(disabled 버튼 없이 saveForm 직접 호출)", () => {
    function openListModal(onSave: (form: unknown) => unknown) {
      renderForm(
        {
          fields: [
            { key: "name", label: "이름", type: "text" },
            { key: "memo", label: "메모", type: "textarea", group: "g" },
          ],
        },
        {
          mode: "create",
          row: null,
          createDefaults: { name: "프리필" },
          origin: "list",
          initialSection: "g",
          onSave,
        },
      );
      return screen.getByRole("button", { name: "저장" });
    }

    test("첫 저장이 끝나기 전에 모달 저장을 두 번 불러도 한 번만 저장한다", async () => {
      let finish: () => void = () => {};
      const onSave = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const save = openListModal(onSave);

      act(() => {
        fireEvent.click(save);
        fireEvent.click(save);
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      await act(async () => finish());
    });

    test("첫 저장이 끝난 뒤의 저장은 다시 통과한다", async () => {
      const onSave = vi.fn(async () => {});
      const save = openListModal(onSave);

      await act(async () => {
        fireEvent.click(save);
      });
      await act(async () => {
        fireEvent.click(save);
      });

      expect(onSave).toHaveBeenCalledTimes(2);
    });

    test("onSave 가 거부돼도 이후 저장은 다시 통과한다", async () => {
      const onSave = vi
        .fn()
        .mockRejectedValueOnce(new Error("실패"))
        .mockResolvedValue(undefined);
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      const save = openListModal(onSave);

      await act(async () => {
        fireEvent.click(save);
      });
      await act(async () => {
        fireEvent.click(save);
      });

      process.off("unhandledRejection", unhandled);
      expect(onSave).toHaveBeenCalledTimes(2);
    });
  });
});
