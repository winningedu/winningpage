import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { TopicView } from "@/lib/inquiry/types";
import DesignBody from "./DesignBody";
import { makeDesign } from "./designFixture";

const TOPIC = { id: "t1" } as TopicView;

function renderBody(over = {}, compact?: boolean) {
  return render(
    <DesignBody design={makeDesign(over)} topic={TOPIC} compact={compact} />,
  );
}

describe("DesignBody", () => {
  test("탐구 개요 표를 그린다", () => {
    renderBody();
    const table = screen.getByRole("table", { name: "탐구 개요" });
    expect(within(table).getByText("가설 1")).toBeVisible();
    expect(
      within(table).getByText("폭염과 가축 폐사 / 기상 지표의 예측력"),
    ).toBeVisible();
    expect(within(table).queryByText("영역")).toBeNull();
  });

  test("검증 가능성 상자를 그린다", () => {
    renderBody();
    expect(screen.getByText("검증 가능성 점검")).toBeVisible();
    expect(
      screen.getByText("공개 통계로 직접 검증할 수 있어요."),
    ).toBeVisible();
  });

  test("신뢰도 안내는 있을 때만 그린다", () => {
    const { unmount } = renderBody();
    expect(screen.queryByText("출발 활동 확인 요청")).toBeNull();
    unmount();
    renderBody({
      reliabilityNotice: "출발 활동이 실제와 맞는지 확인해 주세요",
    });
    expect(screen.getByText("출발 활동 확인 요청")).toBeVisible();
    expect(
      screen.getByText("출발 활동이 실제와 맞는지 확인해 주세요"),
    ).toBeVisible();
  });

  test("서론, 본론, 결론 묶음 안에 8절 카드를 그린다", () => {
    renderBody();
    for (const name of ["서론", "본론", "결론"]) {
      expect(screen.getByRole("heading", { name })).toBeVisible();
    }
    const card = screen.getByRole("article", { name: /Ⅲ 탐구 방법/ });
    expect(within(card).getByText("권장 300자 이상")).toBeVisible();
    expect(within(card).getByText("III절의 역할")).toBeVisible();
    expect(within(card).getByText("III 필수 1")).toBeVisible();
    expect(within(card).getByText("III 금지 1")).toBeVisible();
    expect(within(card).getByText(/III 작성 요령/)).toBeVisible();
    expect(
      within(screen.getByRole("article", { name: /Ⅷ 참고 자료/ })).getByText(
        "분량 제한 없음",
      ),
    ).toBeVisible();
  });

  test("자료 출처표는 출처와 기준 시점이 확인 필요이고 안내가 붙는다", () => {
    renderBody();
    const table = screen.getByRole("table", { name: "자료 출처표" });
    expect(within(table).getAllByText("확인 필요")).toHaveLength(4);
    expect(
      screen.getByText(
        "검증된 자료 후보가 없어 빈 표예요. 아래 검색 계획으로 직접 확인해요",
      ),
    ).toBeVisible();
  });

  test("자료 확보 계획 표와 결과별 해석 질문", () => {
    renderBody();
    const plan = screen.getByRole("table", { name: "자료 확보 계획" });
    expect(within(plan).getByText("농림축산식품부")).toBeVisible();
    expect(screen.getByText("같을 때")).toBeVisible();
    expect(screen.getByText("다를 때")).toBeVisible();
    expect(screen.getByText("부족할 때")).toBeVisible();
    expect(screen.getByText("다른 축종에서도 같은가?")).toBeVisible();
  });

  test("평가 기준 미리 보기에 배점과 산식 문구가 있다", () => {
    renderBody();
    const table = screen.getByRole("table", { name: "평가 기준 미리 보기" });
    expect(
      within(table).getByText("기존 활동과의 연계 및 탐구 동기"),
    ).toBeVisible();
    expect(within(table).getAllByText("20")).toHaveLength(2);
    expect(
      screen.getByText(
        "항목 점수 = 배점 × 수준(0~4) ÷ 4. 서비스 내부 기준이에요",
      ),
    ).toBeVisible();
  });

  test("최소 범위와 선택 심화", () => {
    renderBody();
    expect(screen.getByText("공개 통계 2종")).toBeVisible();
    expect(screen.getByText("축종별 비교")).toBeVisible();
  });

  test("체크리스트에 번호와 점수 미반영 표시가 있다", () => {
    renderBody();
    const list = screen.getByRole("list", { name: "작성 체크리스트" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("작성 지침, 점수 미반영, Ⅴ절")).toBeVisible();
  });

  test("해서는 안 되는 것 칩", () => {
    renderBody();
    expect(screen.getByText("확인하지 않은 수치 인용")).toBeVisible();
    expect(screen.getByText("상관을 인과로 바꿔 쓰기")).toBeVisible();
  });

  test("마크다운 기호를 그대로 텍스트로 둔다", () => {
    renderBody({ verifiability: "**굵게** 와 # 제목" });
    expect(screen.getByText("**굵게** 와 # 제목")).toBeVisible();
  });

  test("compact 여도 같은 내용을 그린다", () => {
    renderBody({}, true);
    expect(screen.getByRole("table", { name: "탐구 개요" })).toBeVisible();
  });
});
