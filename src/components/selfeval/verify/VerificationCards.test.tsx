import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { VerificationSections } from "@/lib/selfeval/types";
import { MandatoryFixesCard } from "./VerificationCards";

const sections = (
  mandatoryFixes: VerificationSections["mandatoryFixes"],
): VerificationSections => ({
  items: [],
  total: 0,
  format: [],
  mandatoryFixes,
  submittable: false,
  improvements: [],
  excluded: [],
  growthFit: null,
  charCount: {} as VerificationSections["charCount"],
  sentenceCount: 0,
  clicheDensity: 0,
  clicheHits: [],
  numberCount: 0,
});

describe("MandatoryFixesCard", () => {
  test("필수 수정 카드는 오류 빨강이 아니라 노란 경고 톤이고 제목 문구가 남는다", () => {
    render(
      <MandatoryFixesCard
        sections={sections([
          { key: "cliche", message: "상투 표현을 줄여 주세요", detail: null },
        ])}
        pendingSentences={[]}
        onEdit={vi.fn()}
      />,
    );
    const card = screen.getByRole("alert", { name: "필수 수정" });
    expect(card).toHaveClass("bg-surface-warning", "border-warning");
    expect(card).not.toHaveClass("bg-error/5");
    expect(
      screen.getByText("필수 수정이 남아 있어 제출 가능으로 보지 않아요"),
    ).toBeVisible();
  });

  const PENDING_FIX: VerificationSections["mandatoryFixes"][number] = {
    key: "pending_feelings",
    message: "확인이 필요한 문장이 남아 있어요",
    detail: null,
  };

  test("미확인 문장 항목 아래에 해당 문장들을 목록으로 보인다", () => {
    render(
      <MandatoryFixesCard
        sections={sections([PENDING_FIX])}
        pendingSentences={["뿌듯했어요.", "많이 배웠어요."]}
        onEdit={vi.fn()}
      />,
    );
    const list = screen.getByRole("list", { name: "확인이 필요한 문장" });
    expect(within(list).getByText("뿌듯했어요.")).toBeVisible();
    expect(within(list).getByText("많이 배웠어요.")).toBeVisible();
  });

  test("미확인 문장이 없으면 문장 목록을 그리지 않는다", () => {
    render(
      <MandatoryFixesCard
        sections={sections([PENDING_FIX])}
        pendingSentences={[]}
        onEdit={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("list", { name: "확인이 필요한 문장" }),
    ).toBeNull();
  });

  test("미확인 문장 항목이 아니면 문장 목록을 그리지 않는다", () => {
    render(
      <MandatoryFixesCard
        sections={sections([
          { key: "cliche", message: "상투어가 많아요", detail: null },
        ])}
        pendingSentences={["뿌듯했어요."]}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.queryByText("뿌듯했어요.")).toBeNull();
  });

  test("작성 화면에서 고치기 버튼을 누르면 onEdit 이 불린다", () => {
    const onEdit = vi.fn();
    render(
      <MandatoryFixesCard
        sections={sections([PENDING_FIX])}
        pendingSentences={["뿌듯했어요."]}
        onEdit={onEdit}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "작성 화면에서 고치기" }),
    );
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
