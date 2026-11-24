// 중복 검사와 반영이 useMutation 으로 돌고, 호출 중에는 버튼이 꺼지고, 실패는 서버 detail 로 알리는지 확인한다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("xlsx", () => ({ read: vi.fn(() => ({})) }));
vi.mock("./xlsxDownload", () => ({ downloadXlsx: vi.fn() }));
vi.mock("./xlsx", () => ({
  exportKnowledgeRowsToXlsx: vi.fn(),
  parseKnowledgeRowsFromXlsx: vi.fn(async () => ({
    inserts: [
      { rowNo: 2, id: null, values: { title: "새 자료", content: "내용" } },
    ],
    updates: [],
    errors: [],
  })),
}));
vi.mock("../api", () => ({
  postKnowledgeDedupe: vi.fn(),
  postKnowledgeBulk: vi.fn(),
  postEmbedBackfill: vi.fn(),
}));

import * as api from "../api";
import { renderWithQuery } from "../testKit";
import BulkPanel from "./BulkPanel";

const config = {
  title: "위닝 수행 주제 DB",
  fields: [{ key: "title", label: "제목", type: "text" }],
  fixedValues: { knowledge_type: "topic_pattern" },
  defaults: {},
};

async function openPreview(onReload = () => {}) {
  renderWithQuery(<BulkPanel config={config} rows={[]} onReload={onReload} />);
  const file = new File(["x"], "a.xlsx");
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(0),
  });
  fireEvent.change(screen.getByLabelText("위닝 수행 주제 DB xlsx 파일 선택"), {
    target: { files: [file] },
  });
  await screen.findByRole("dialog");
}

const button = (name: string) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("BulkPanel 서버 호출", () => {
  test("중복 검사 호출 중에는 검사, 반영, 취소 버튼이 꺼진다", async () => {
    vi.mocked(api.postKnowledgeDedupe).mockReturnValue(new Promise(() => {}));
    await openPreview();

    fireEvent.click(button("중복 검사"));

    await waitFor(() => expect(button("중복 검사").disabled).toBe(true));
    expect(button("반영").disabled).toBe(true);
    expect(button("취소").disabled).toBe(true);
    expect(vi.mocked(api.postKnowledgeDedupe).mock.calls[0]?.[0]).toEqual({
      knowledgeType: "topic_pattern",
      items: [expect.objectContaining({ rowNo: 2, title: "새 자료" })],
    });
  });

  test("중복 검사가 실패하면 서버 detail 을 접두어와 함께 alert 로 알린다", async () => {
    vi.mocked(api.postKnowledgeDedupe).mockRejectedValue(
      new Error("항목이 비었습니다."),
    );
    await openPreview();

    fireEvent.click(button("중복 검사"));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "중복 검사에 실패했습니다: 항목이 비었습니다.",
    );
    expect(button("중복 검사").disabled).toBe(false);
  });

  test("반영 호출 중에는 버튼이 꺼지고, 성공하면 완료 문구를 알리고 목록을 다시 읽는다", async () => {
    vi.mocked(api.postKnowledgeDedupe).mockResolvedValue([]);
    let finishBulk: (value: unknown) => void = () => {};
    vi.mocked(api.postKnowledgeBulk).mockReturnValue(
      new Promise((resolve) => {
        finishBulk = resolve;
      }) as ReturnType<typeof api.postKnowledgeBulk>,
    );
    vi.mocked(api.postEmbedBackfill)
      .mockResolvedValueOnce({ embedded: 1, failed: 0 })
      .mockResolvedValueOnce({ embedded: 0, failed: 0 });
    const onReload = vi.fn();
    await openPreview(onReload);
    fireEvent.click(button("중복 검사"));
    await waitFor(() => expect(button("반영").disabled).toBe(false));

    fireEvent.click(button("반영"));

    await waitFor(() => expect(button("반영").disabled).toBe(true));
    expect(button("취소").disabled).toBe(true);
    finishBulk({ inserted: 1, updated: 0, ids: ["a"] });
    expect(
      await screen.findByText("반영 완료: 신규 1건, 수정 0건, 임베딩 1건."),
    ).toBeTruthy();
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  test("반영이 실패하면 서버 detail 을 반영 건수 안내와 함께 알린다", async () => {
    vi.mocked(api.postKnowledgeDedupe).mockResolvedValue([]);
    vi.mocked(api.postKnowledgeBulk).mockRejectedValue(
      new Error("이 메뉴에 없는 id 가 있습니다: a"),
    );
    await openPreview();
    fireEvent.click(button("중복 검사"));
    await waitFor(() => expect(button("반영").disabled).toBe(false));

    fireEvent.click(button("반영"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "(신규 0건, 수정 0건 반영됨): 이 메뉴에 없는 id 가 있습니다: a",
    );
    expect(api.postEmbedBackfill).not.toHaveBeenCalled();
  });
});
