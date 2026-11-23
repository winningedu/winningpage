import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { VerificationSections } from "@/lib/selfeval/types";
import {
  LinkWarningsCard,
  MandatoryFixesCard,
  ScoreItemCards,
} from "./VerificationCards";

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

describe("ScoreItemCards", () => {
  const item = (over: Record<string, unknown>) => ({
    key: "prompt",
    label: "문항 대응",
    max: 10,
    discrimination: null,
    checks: [],
    score: 0,
    ...over,
  });

  test("적용하지 않은 문항 대응은 점수 대신 문항 미입력을 보인다", () => {
    const base = sections([]);
    render(
      <ScoreItemCards
        sections={{
          ...base,
          promptMissing: true,
          items: [item({ applied: false })] as never,
        }}
      />,
    );
    expect(screen.getByText("문항 미입력")).toBeVisible();
    expect(screen.queryByText("0 / 10")).toBeNull();
  });

  test("적용한 항목은 점수를 그대로 보인다", () => {
    const base = sections([]);
    render(
      <ScoreItemCards
        sections={{ ...base, items: [item({ score: 7 })] as never }}
      />,
    );
    expect(screen.getByText("7 / 10")).toBeVisible();
    expect(screen.queryByText("문항 미입력")).toBeNull();
  });
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

describe("LinkWarningsCard(명세 No.182, 190)", () => {
  const warned = (): VerificationSections => ({
    ...sections([{ key: "cliche", message: "상투어가 많아요", detail: null }]),
    linkChecks: [
      {
        recordId: "s1",
        label: "보조탐구",
        status: "checked",
        linkShown: false,
        concreteWordPresent: false,
        listingSuspect: true,
      },
      {
        recordId: "s2",
        label: "곁탐구",
        status: "unused",
        linkShown: null,
        concreteWordPresent: null,
        listingSuspect: null,
      },
    ],
  });

  test("연계 경고 머리글 아래에 기록별 경고를 한 줄씩 보인다", () => {
    render(<LinkWarningsCard sections={warned()} />);
    const card = screen.getByRole("region", { name: "연계 경고" });
    expect(
      within(card).getByRole("heading", { name: "연계 경고" }),
    ).toBeVisible();
    for (const text of [
      "보조탐구: 연계가 드러난 문장이 없어요",
      "보조탐구: 넘어온 구체물 낱말이 연계 문장에 없어요",
      "보조탐구: 이 기록 문장을 빼도 글이 성립해요(나열 의심)",
      "곁탐구: 선택했지만 본문에 쓰이지 않았어요(미사용)",
    ]) {
      expect(within(card).getByText(text)).toBeVisible();
    }
  });

  test("필수 수정 카드와 따로 그리고 필수 수정 경고 영역에 섞이지 않는다", () => {
    render(
      <>
        <MandatoryFixesCard
          sections={warned()}
          pendingSentences={[]}
          onEdit={() => {}}
        />
        <LinkWarningsCard sections={warned()} />
      </>,
    );
    const mandatory = screen.getByRole("alert", { name: "필수 수정" });
    expect(within(mandatory).queryByText(/연계가 드러난/)).toBeNull();
    const link = screen.getByRole("region", { name: "연계 경고" });
    expect(link).not.toBe(mandatory);
    expect(screen.queryByRole("alert", { name: "연계 경고" })).toBeNull();
  });

  test("경고가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<LinkWarningsCard sections={sections([])} />);
    expect(container).toBeEmptyDOMElement();
  });
});
