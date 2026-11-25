// AdminForm onDirtyChange: 라우트 화면이 이탈 확인을 직접 맡을 때 폼 자체의 이탈 가드를 끄고 변경 여부만 알린다.

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { AdminForm } from "./AdminEngine";

const CONFIG = {
  title: "테스트",
  table: "t",
  order: "id",
  columns: [],
  fields: [{ key: "name", label: "이름", type: "text" }],
} as never;

function renderForm(props: Record<string, unknown> = {}) {
  const onCancel = vi.fn();
  render(
    <AdminForm
      config={CONFIG}
      mode="create"
      row={null}
      createDefaults={{ name: "프리필" }}
      onCancel={onCancel}
      onSave={vi.fn()}
      onUpload={(async () => null) as never}
      onRemoveFiles={vi.fn()}
      {...props}
    />,
  );
  return { onCancel };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("onDirtyChange 가 있을 때", () => {
  test("고치면 true 로, 처음에는 false 로 알린다", () => {
    const onDirtyChange = vi.fn();
    renderForm({ onDirtyChange });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByDisplayValue("프리필"), {
      target: { value: "고침" },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  test("폼 자체의 beforeunload 와 히스토리 가드를 만들지 않는다", () => {
    const push = vi.spyOn(window.history, "pushState");
    const add = vi.spyOn(window, "addEventListener");
    renderForm({ onDirtyChange: vi.fn() });
    fireEvent.change(screen.getByDisplayValue("프리필"), {
      target: { value: "고침" },
    });

    expect(push).not.toHaveBeenCalled();
    const types = add.mock.calls.map(([type]) => type);
    expect(types).not.toContain("beforeunload");
    expect(types).not.toContain("popstate");
  });

  test("고친 폼의 취소는 폼이 묻지 않고 바로 닫는다(화면의 이탈 확인이 맡는다)", () => {
    const { onCancel } = renderForm({ onDirtyChange: vi.fn() });
    fireEvent.change(screen.getByDisplayValue("프리필"), {
      target: { value: "고침" },
    });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

test("onDirtyChange 가 없으면 예전처럼 히스토리 가드를 쌓는다", () => {
  const push = vi.spyOn(window.history, "pushState");
  renderForm();
  expect(push).toHaveBeenCalledTimes(1);
});
