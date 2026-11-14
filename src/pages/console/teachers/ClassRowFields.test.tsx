import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ClassRowFields, { EMPTY_CLASS, toClassBody } from "./ClassRowFields";

const HELPER = "학년그룹에서 학년이 섞여 있으면 다학년을 선택하여 주세요";

const optionLabels = () =>
  within(screen.getByLabelText("학년그룹"))
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

    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "mixed" },
    });

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_CLASS, grade: "mixed" });
  });
});

describe("toClassBody", () => {
  it("다학년 줄은 grade 를 null 로 보낸다", () => {
    expect(
      toClassBody([{ grade: "mixed", groupId: "g1", name: " A " }]),
    ).toEqual([{ grade: null, name: "A", groupId: "g1" }]);
  });

  it("학년 줄은 그대로이고 덜 채운 줄은 null, 빈 줄은 버린다", () => {
    expect(toClassBody([{ grade: "고1", groupId: "", name: "3반" }])).toEqual([
      { grade: "고1", name: "3반" },
    ]);
    expect(toClassBody([{ grade: "mixed", groupId: "", name: "" }])).toBeNull();
    expect(toClassBody([EMPTY_CLASS])).toEqual([]);
  });
});
