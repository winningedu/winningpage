import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import CascadingSelect, { type CascadeLevel } from "./CascadingSelect";

// QA 시트 행342(2026-09-02) — 대학/학과 후보가 길어 검색형 콤보박스로 전환한 동작을 검증한다.
// admissionType/detailType 은 후보가 적어 기존 버튼 드롭다운을 유지하므로 별도로 확인한다.
const LEVELS: CascadeLevel[] = [
  {
    key: "university",
    label: "대학 선택",
    placeholder: "건국대",
    options: ["서울대", "서울시립대", "건국대", "경희대"],
  },
  {
    key: "department",
    label: "학과 또는 모집단위",
    placeholder: "경영학과",
    options: ["경영학과", "컴퓨터공학과"],
  },
  {
    key: "admissionType",
    label: "전형 유형",
    placeholder: "종합",
    options: ["종합", "교과"],
  },
  {
    key: "detailType",
    label: "세부 전형명",
    placeholder: "일반전형",
    options: ["일반전형", "지역균형"],
  },
];

// 부모(SurveyStepShell)가 cascade 규칙(하위 리셋)을 흉내내는 최소 stateful 래퍼.
function ControlledCascadingSelect({
  levels,
  onChangeSpy,
}: {
  levels: CascadeLevel[];
  onChangeSpy?: (value: Record<string, string>) => void;
}) {
  const [value, setValue] = useState<Record<string, string>>({});
  return (
    <CascadingSelect
      levels={levels}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChangeSpy?.(next);
      }}
    />
  );
}

describe("CascadingSelect 검색형 콤보박스(대학·학과)", () => {
  test("대학 입력창에 타이핑하면 부분 일치 후보만 남는다", () => {
    render(<ControlledCascadingSelect levels={LEVELS} />);

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    fireEvent.focus(universityInput);
    fireEvent.change(universityInput, { target: { value: "서울" } });

    const listbox = screen.getByRole("listbox", { name: "대학 선택" });
    expect(
      Array.from(listbox.querySelectorAll('[role="option"]')).map(
        (el) => el.textContent,
      ),
    ).toEqual(["서울대", "서울시립대"]);
  });

  test("공백·대소문자를 무시하고 매칭한다", () => {
    const withMixedCase: CascadeLevel[] = [
      {
        ...LEVELS[0]!,
        options: ["Seoul National University", "건국대"],
      },
      ...LEVELS.slice(1),
    ];
    render(<ControlledCascadingSelect levels={withMixedCase} />);

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    fireEvent.focus(universityInput);
    fireEvent.change(universityInput, { target: { value: "seoul national" } });

    expect(screen.getByText("Seoul National University")).toBeInTheDocument();
    expect(screen.queryByText("건국대")).not.toBeInTheDocument();
  });

  test("후보 클릭으로 선택하면 값이 확정되고 하위 단계가 초기화된다", () => {
    const onChangeSpy = vi.fn();
    render(
      <ControlledCascadingSelect levels={LEVELS} onChangeSpy={onChangeSpy} />,
    );

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    fireEvent.focus(universityInput);
    fireEvent.click(screen.getByRole("option", { name: "서울대" }));

    expect(universityInput).toHaveValue("서울대");
    expect(onChangeSpy).toHaveBeenLastCalledWith({
      university: "서울대",
      department: "",
      admissionType: "",
      detailType: "",
    });
  });

  test("↓ 로 후보를 옮기고 Enter 로 선택할 수 있다", () => {
    const onChangeSpy = vi.fn();
    render(
      <ControlledCascadingSelect levels={LEVELS} onChangeSpy={onChangeSpy} />,
    );

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    fireEvent.focus(universityInput);
    fireEvent.keyDown(universityInput, { key: "ArrowDown" });
    fireEvent.keyDown(universityInput, { key: "ArrowDown" });
    fireEvent.keyDown(universityInput, { key: "Enter" });

    // 옵션 순서: 서울대, 서울시립대, 건국대, 경희대 → 두 번째 ArrowDown 후 활성 옵션은 "서울시립대".
    expect(onChangeSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ university: "서울시립대" }),
    );
  });

  test("Esc 로 닫으면 목록에 없는 입력값은 조회 키로 남지 않는다", () => {
    const onChangeSpy = vi.fn();
    render(
      <ControlledCascadingSelect levels={LEVELS} onChangeSpy={onChangeSpy} />,
    );

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    fireEvent.focus(universityInput);
    fireEvent.change(universityInput, {
      target: { value: "존재하지않는대학" },
    });
    fireEvent.keyDown(universityInput, { key: "Escape" });

    expect(universityInput).toHaveValue("");
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  test("일치하는 후보가 없으면 안내 문구를 보여준다", () => {
    render(<ControlledCascadingSelect levels={LEVELS} />);

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    fireEvent.focus(universityInput);
    fireEvent.change(universityInput, {
      target: { value: "존재하지않는대학" },
    });

    expect(
      screen.getByText("일치하는 대학 선택이 없어요."),
    ).toBeInTheDocument();
  });

  test("대학을 바꾸면 학과 값이 초기화되고, 대학 선택 전 학과 입력은 비활성이다", () => {
    const onChangeSpy = vi.fn();
    render(
      <ControlledCascadingSelect levels={LEVELS} onChangeSpy={onChangeSpy} />,
    );

    const departmentInputBefore = screen.getByRole("combobox", {
      name: "학과 또는 모집단위",
    });
    expect(departmentInputBefore).toBeDisabled();

    fireEvent.focus(screen.getByRole("combobox", { name: "대학 선택" }));
    fireEvent.click(screen.getByRole("option", { name: "건국대" }));

    const departmentInput = screen.getByRole("combobox", {
      name: "학과 또는 모집단위",
    });
    expect(departmentInput).toBeEnabled();

    fireEvent.focus(departmentInput);
    fireEvent.click(screen.getByRole("option", { name: "경영학과" }));
    expect(onChangeSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ university: "건국대", department: "경영학과" }),
    );

    // 대학을 다시 바꾸면 학과가 리셋된다.
    fireEvent.focus(screen.getByRole("combobox", { name: "대학 선택" }));
    fireEvent.click(screen.getByRole("option", { name: "서울대" }));
    expect(onChangeSpy).toHaveBeenLastCalledWith({
      university: "서울대",
      department: "",
      admissionType: "",
      detailType: "",
    });
  });
});

describe("CascadingSelect 목록 위치(QA 시트 2차 행57)", () => {
  test("목록은 OverlayScrollbars 호스트가 아닌 별도 positioned 래퍼에 담겨 입력 바로 아래에 붙는다", () => {
    // overlayscrollbars.css의 `[data-overlayscrollbars]{position:relative}`는 @layer 밖이라
    // Tailwind `@layer utilities`의 `.absolute`보다 항상 우선한다 — ScrollArea(OverlayScrollbars
    // 호스트) 자신에 `absolute`를 직접 걸면 캐스케이드에서 밀려 항상 position:relative로
    // 계산되고, 목록이 정상 흐름에 남아 카드 바닥까지 밀려난다(실측 재현 완료). 목록을 감싸는
    // 별도의 plain wrapper에 positioning을 맡겨야 한다.
    render(<ControlledCascadingSelect levels={LEVELS} />);

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    fireEvent.focus(universityInput);

    const listbox = screen.getByRole("listbox", { name: "대학 선택" });
    const positionedWrapper = listbox.parentElement;

    expect(positionedWrapper).not.toBeNull();
    expect(positionedWrapper).toHaveClass("absolute");
    expect(positionedWrapper).toHaveClass("top-[calc(100%+0.5rem)]");
    // 목록(OverlayScrollbars 호스트) 자신은 포지셔닝 유틸을 직접 갖지 않는다.
    expect(listbox).not.toHaveClass("absolute");
  });

  test("콤보박스를 열면 입력 필드를 화면 중앙으로 스크롤한다(모바일 키보드 대응)", () => {
    render(<ControlledCascadingSelect levels={LEVELS} />);

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    const scrollIntoViewSpy = vi.fn();
    universityInput.scrollIntoView = scrollIntoViewSpy;

    fireEvent.focus(universityInput);

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });
});

describe("CascadingSelect 기존 드롭다운(전형 유형·세부 전형)", () => {
  test("후보가 적은 단계는 여전히 button+listbox 드롭다운을 쓴다", () => {
    render(<ControlledCascadingSelect levels={LEVELS} />);

    const universityInput = screen.getByRole("combobox", { name: "대학 선택" });
    fireEvent.focus(universityInput);
    fireEvent.click(screen.getByRole("option", { name: "건국대" }));
    fireEvent.click(
      screen.getByRole("combobox", { name: "학과 또는 모집단위" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "경영학과" }));

    const admissionTypeButton = screen.getByRole("button", { name: "종합" });
    expect(admissionTypeButton).toBeEnabled();
    fireEvent.click(admissionTypeButton);
    expect(screen.getByRole("option", { name: "교과" })).toBeInTheDocument();
  });
});
