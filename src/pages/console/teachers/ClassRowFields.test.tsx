import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClassRowFields, { EMPTY_CLASS, toClassBody } from "./ClassRowFields";

const HELPER = "학년이 섞여 있으면 다학년을 선택하여 주세요";

const optionLabels = () =>
  within(screen.getByLabelText("학년"))
    .getAllByRole("option")
    .map((o) => o.textContent);

describe("ClassRowFields", () => {
  it("학교는 학년만 고르고 다학년 선택지도 안내 문구도 없다", () => {
    render(
      <ClassRowFields
        value={EMPTY_CLASS}
        groups={[]}
        academy={false}
        onChange={() => {}}
      />,
    );

    expect(optionLabels()).toEqual([
      "선택",
      "중1",
      "중2",
      "중3",
      "고1",
      "고2",
      "고3",
    ]);
    expect(screen.queryByText(HELPER)).toBeNull();
  });

  it("학원은 학년 뒤에 다학년을 더하고 안내 문구를 보인다", () => {
    render(
      <ClassRowFields
        value={EMPTY_CLASS}
        groups={[]}
        academy
        onChange={() => {}}
      />,
    );

    expect(optionLabels()).toEqual([
      "선택",
      "중1",
      "중2",
      "중3",
      "고1",
      "고2",
      "고3",
      "다학년",
    ]);
    expect(screen.getByText(HELPER)).toBeTruthy();
  });

  it("반 칸은 숫자 예시와 숫자 키패드를 쓴다", () => {
    render(
      <ClassRowFields
        value={EMPTY_CLASS}
        groups={[]}
        academy
        onChange={() => {}}
      />,
    );

    const input = screen.getByLabelText("반");
    expect(input.getAttribute("placeholder")).toBe("예: 3");
    expect(input.getAttribute("inputmode")).toBe("numeric");
  });

  it.each(["A", "3학년 2반"])(
    "숫자가 아닌 반 %s 을 적으면 숫자만 적으라고 안내한다",
    (name) => {
      render(
        <ClassRowFields
          value={{ ...EMPTY_CLASS, name }}
          groups={[]}
          academy
          onChange={() => {}}
        />,
      );

      expect(screen.getByText("반은 숫자만 적어요")).toBeTruthy();
    },
  );

  it("3반 과 비운 칸에는 안내가 없다", () => {
    const { rerender } = render(
      <ClassRowFields
        value={{ ...EMPTY_CLASS, name: "3반" }}
        groups={[]}
        academy
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("반은 숫자만 적어요")).toBeNull();

    rerender(
      <ClassRowFields
        value={EMPTY_CLASS}
        groups={[]}
        academy
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("반은 숫자만 적어요")).toBeNull();
  });

  it("다학년을 고르면 mixed 값이 전해진다", () => {
    const onChange = vi.fn();
    render(
      <ClassRowFields
        value={EMPTY_CLASS}
        groups={[]}
        academy
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "mixed" },
    });

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_CLASS, grade: "mixed" });
  });
});

describe("toClassBody", () => {
  it("다학년 줄은 grade 를 null 로 보낸다", () => {
    expect(
      toClassBody([{ grade: "mixed", groupId: "g1", name: " 5 " }]),
    ).toEqual([{ grade: null, name: "5", groupId: "g1" }]);
  });

  it("학년 줄은 그대로이고 덜 채운 줄은 null, 빈 줄은 버린다", () => {
    expect(toClassBody([{ grade: "고1", groupId: "", name: "3반" }])).toEqual([
      { grade: "고1", name: "3" },
    ]);
    expect(toClassBody([{ grade: "mixed", groupId: "", name: "" }])).toBeNull();
    expect(toClassBody([EMPTY_CLASS])).toEqual([]);
  });

  it.each(["A", "B반", "3학년 2반", "1-2", "3 반", "0"])(
    "숫자가 아닌 반 %s 이 든 줄이 있으면 null 이다",
    (name) => {
      expect(toClassBody([{ grade: "고1", groupId: "", name }])).toBeNull();
    },
  );
});
