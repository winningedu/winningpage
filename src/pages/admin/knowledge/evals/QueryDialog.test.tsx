import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { callsTo, on, resetApi } from "./fakeApi";
import QueryDialog from "./QueryDialog";
import { goldenRow, renderInRouter } from "./testKit";

const target = {
  ...goldenRow,
  career: null,
  selected_topic: null,
  expected_resource_ids: ["r1"],
};

const onClose = vi.fn();
const onSaved = vi.fn();

function renderDialog() {
  return renderInRouter(
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
  let finishSave: (value: unknown) => void = () => {};
  on(
    "PATCH",
    "admin/knowledge-eval/queries/q1",
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "저장" }));
  return (value: unknown) => finishSave(value);
}

beforeEach(() => {
  vi.resetAllMocks();
  resetApi();
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
      expect(callsTo("PATCH", "admin/knowledge-eval/queries/q1")).toHaveLength(
        1,
      ),
    );

    // react-query 의 isPending 은 한 틱 늦게 반영되므로 닫기 막힘이 걸린 뒤에 누른다.
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "취소" })).toBeDisabled(),
    );
    pressEscape();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();

    finishSave(target);
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  test("저장 중이 아니면 Esc 로 닫힌다", async () => {
    renderDialog();
    await screen.findByPlaceholderText("고2");

    pressEscape();

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
