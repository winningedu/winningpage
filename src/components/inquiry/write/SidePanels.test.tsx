import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { makeDesign } from "../design/designFixture";
import SidePanels from "./SidePanels";

describe("SidePanels", () => {
  test("설계 이행 점검은 정적 목록이고 갱신 안내가 있다", () => {
    render(<SidePanels design={makeDesign()} />);
    const list = screen.getByRole("list", { name: "설계 이행 점검" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("출발 활동 이름이 나오는가")).toBeVisible();
    expect(
      screen.getByText(
        "작성 중에는 갱신되지 않아요. 평가에서 같은 기준으로 확인해요",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/\d+ \/ 13/)).toBeNull();
  });

  test("진로 연결은 점수 미반영으로 표시", () => {
    render(<SidePanels design={makeDesign()} />);
    expect(screen.getByText("작성 지침, 점수 미반영, Ⅴ절")).toBeVisible();
  });

  test("가설 기각 안내와 쓰면 안 되는 것 4가지", () => {
    render(<SidePanels design={makeDesign()} />);
    expect(screen.getByText("가설이 틀려도 돼요")).toBeVisible();
    expect(screen.getByText(/결과를 가설에 맞춰 고치지 마세요/)).toBeVisible();
    const forbidden = screen.getByRole("list", { name: "쓰면 안 되는 것" });
    expect(within(forbidden).getAllByRole("listitem")).toHaveLength(4);
  });
});
