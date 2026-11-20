import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../api", () => ({ postSearchPreview: vi.fn() }));

import * as api from "../api";
import SearchPreview from "./SearchPreview";

const config = {
  title: "위닝 수행 주제 DB",
  fixedValues: { knowledge_type: "topic_pattern" },
};

beforeEach(() => {
  vi.resetAllMocks();
});

async function openDialog() {
  render(<SearchPreview config={config} />);
  fireEvent.click(screen.getByRole("button", { name: "검색 테스트" }));
  return screen.findByRole("dialog");
}

describe("SearchPreview", () => {
  test("입력한 조건과 검색 방식으로 검색하고 결과 표를 그린다", async () => {
    vi.mocked(api.postSearchPreview).mockResolvedValue({
      ok: true,
      data: {
        mode: "vector",
        threshold: 0.5,
        queryText: "q",
        keywordQuery: null,
        items: [
          {
            rank: 1,
            id: "r1",
            title: "마찰력 자료",
            grade: "고2",
            subject: "물리",
            career_field: "공학",
            similarity: 0.8,
            passesThreshold: true,
            wouldBeInjected: true,
          },
        ],
      },
    });
    await openDialog();
    fireEvent.change(screen.getByLabelText("교과군 또는 과목"), {
      target: { value: "물리학" },
    });
    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "벡터만" }));
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    await waitFor(() => expect(api.postSearchPreview).toHaveBeenCalled());
    expect(vi.mocked(api.postSearchPreview).mock.calls[0]?.[0]).toMatchObject({
      knowledgeType: "topic_pattern",
      grade: "고2",
      subject: "물리학",
      includeOtherSubjects: true,
      mode: "vector",
    });
    expect(await screen.findByText("마찰력 자료")).toBeTruthy();
  });

  test("검색이 실패하면 alert 로 알린다", async () => {
    vi.mocked(api.postSearchPreview).mockResolvedValue({
      ok: false,
      message: "검색하지 못했습니다.",
    });
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "검색하지 못했습니다.",
    );
  });

  test("검색 중에는 검색 버튼이 꺼진다", async () => {
    vi.mocked(api.postSearchPreview).mockReturnValue(new Promise(() => {}));
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    const busy = await screen.findByRole("button", { name: "검색 중" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
  });
});
