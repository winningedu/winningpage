import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({
  saveGoldenQuery: vi.fn(),
  searchKnowledgeResources: vi.fn(),
}));

import * as api from "./api";
import QueryDialog from "./QueryDialog";

const target = {
  id: "q1",
  knowledge_type: "topic_pattern" as const,
  grade: "고2",
  subject: "물리학Ⅰ",
  career: null,
  selected_topic: null,
  assessment_info: null,
  note: null,
  expected_resource_ids: ["r1"],
  is_active: true,
  created_at: "2026-10-07T00:00:00Z",
};

const onClose = vi.fn();
const onSaved = vi.fn();

function renderDialog() {
  return render(
    <QueryDialog
      knowledgeType="topic_pattern"
      target={target}
      titles={{}}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
}

function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: "Escape",
  });
}

async function startSaving() {
  let finishSave: (value: { ok: true; data: null }) => void = () => {};
  vi.mocked(api.saveGoldenQuery).mockReturnValue(
    new Promise((resolve) => {
      finishSave = resolve;
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "저장" }));
  return finishSave;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("QueryDialog", () => {
  test("바깥을 눌러도 닫히지 않고 입력이 남는다", async () => {
    renderDialog();
    fireEvent.change(await screen.findByPlaceholderText("고2"), {
      target: { value: "고1" },
    });

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.mouseUp(document.body);
    fireEvent.click(document.body);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText("고2") as HTMLInputElement).value).toBe(
      "고1",
    );
  });

  test("저장 중에는 Esc 와 취소로 닫히지 않는다", async () => {
    renderDialog();
    const finishSave = await startSaving();
    await vi.waitFor(() =>
      expect(api.saveGoldenQuery).toHaveBeenCalledTimes(1),
    );

    pressEscape();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "취소" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    finishSave({ ok: true, data: null });
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  test("저장 중이 아니면 Esc 로 닫힌다", async () => {
    renderDialog();
    await screen.findByPlaceholderText("고2");

    pressEscape();

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
