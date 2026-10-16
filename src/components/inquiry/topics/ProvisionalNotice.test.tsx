import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PROVISIONAL_TOPIC_NOTE } from "@/lib/inquiry/labels";
import ProvisionalNotice from "./ProvisionalNotice";

describe("ProvisionalNotice", () => {
  test("안내 문장과 확인 질문 3개, 정보 입력 이동 버튼을 그린다", () => {
    const onGoInfo = vi.fn();
    render(
      <ProvisionalNotice
        questions={["질문 하나", "질문 둘", "질문 셋"]}
        onGoInfo={onGoInfo}
      />,
    );
    expect(screen.getByText(PROVISIONAL_TOPIC_NOTE)).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(
      screen.getByRole("button", { name: "활동 적으러 정보 입력으로" }),
    );
    expect(onGoInfo).toHaveBeenCalledTimes(1);
  });
});
