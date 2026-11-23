import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ReportPayload } from "@/lib/selfeval/reportTypes";
import SelfevalReportDocument from "./SelfevalReportDocument";
import { SAMPLE_PAYLOAD } from "./testFixtures";

function renderDoc(payload: ReportPayload = SAMPLE_PAYLOAD) {
  const onRebuild = vi.fn();
  render(
    <SelfevalReportDocument
      payload={payload}
      studentName="QA학생"
      onRebuild={onRebuild}
    />,
  );
  return { onRebuild };
}

const chapter = (no: string, title: string) =>
  screen.getByRole("region", { name: `${no} ${title}` });

describe("02장 과목별 수행, 심화 활동", () => {
  const ch = () => chapter("02", "과목별 수행, 심화 활동");

  test("소개 문장에 학년도를 쓴다", () => {
    renderDoc();
    expect(
      within(ch()).getByText(
        "올해(2026학년도) 제출한 수행평가, 심화탐구 보고서 전체와, 각 보고서가 자기평가에 얼마나 반영됐는지 보여줍니다.",
      ),
    ).toBeInTheDocument();
  });

  test("과목 머리에 수행, 심화(진행 중), 반영 문장 수를 쓴다", () => {
    renderDoc();
    const box = (label: string) => within(ch()).getByTestId(`subject-${label}`);
    expect(box("수학 (공통수학1)")).toHaveTextContent(
      "수행 2, 심화 2(진행 중 1), 반영 문장 8개",
    );
    expect(box("정보")).toHaveTextContent("수행 1, 반영 문장 1개");
    expect(box("국어")).toHaveTextContent("수행 1, 반영 문장 없음");
  });

  test("과목은 payload 순서대로 그린다", () => {
    renderDoc();
    expect(
      within(ch())
        .getAllByTestId(/^subject-/)
        .map((e) => e.getAttribute("data-testid")),
    ).toEqual([
      "subject-수학 (공통수학1)",
      "subject-정보",
      "subject-통합사회",
      "subject-국어",
    ]);
  });

  test("기록 행에 꼬리표, 종류 배지, 제목, 제출일, 요약, 역할 라벨, 문장 번호를 그린다", () => {
    renderDoc();
    const p1 = within(ch()).getByTestId("ch02-row-P1");
    expect(within(p1).getByText("P1")).toBeInTheDocument();
    expect(within(p1).getByText("수행")).toBeInTheDocument();
    expect(
      within(p1).getByText("이차함수의 최대, 최소 실생활 적용 보고서"),
    ).toBeInTheDocument();
    expect(within(p1).getByText("2026.06.18 제출")).toBeInTheDocument();
    expect(p1).toHaveTextContent("꼭짓점으로 최적 가격을 구함");
    expect(within(p1).getByText("핵심 근거")).toBeInTheDocument();
    expect(within(p1).getByText("①②⑤⑧")).toBeInTheDocument();
    expect(within(ch()).getByTestId("ch02-row-D1").textContent).toContain(
      "심화",
    );
  });

  test("반영도는 채운 점 n개와 빈 점으로 다섯 칸을 그린다", () => {
    renderDoc();
    const dots = (tag: string) =>
      within(within(ch()).getByTestId(`ch02-row-${tag}`)).getByTestId("dots");
    expect(dots("P1")).toHaveTextContent("●●●●○");
    expect(dots("P2")).toHaveTextContent("●●●○○");
    expect(dots("D2")).toHaveTextContent("○○○○○");
    expect(dots("P1")).toHaveAccessibleName("반영도 4/5");
  });

  test("진행 중 기록은 진행 중으로 적고 회색으로 그린다, 문장 번호는 없다", () => {
    renderDoc();
    const d2 = within(ch()).getByTestId("ch02-row-D2");
    expect(within(d2).getByText("진행 중")).toBeInTheDocument();
    expect(within(d2).getByText("진행 중, 반영 안 함")).toBeInTheDocument();
    expect(d2).toHaveAttribute("data-muted", "true");
    expect(within(ch()).getByTestId("ch02-row-P1")).toHaveAttribute(
      "data-muted",
      "false",
    );
  });

  test("미반영 기록은 회색이고 이유 라벨과 과목 자기평가 추천을 붙인다", () => {
    renderDoc();
    const p5 = within(ch()).getByTestId("ch02-row-P5");
    expect(p5).toHaveAttribute("data-muted", "true");
    expect(p5).toHaveTextContent(
      "미반영, 문항과 관련 없음, 국어 자기평가 추천",
    );
  });

  test("다른 과목 기록은 교과 연계 역할 라벨을 그대로 쓴다", () => {
    renderDoc();
    expect(within(ch()).getByTestId("ch02-row-P3")).toHaveTextContent(
      "보조 근거 (교과 연계)",
    );
    expect(within(ch()).getByTestId("ch02-row-D3")).toHaveTextContent(
      "성찰 근거 (교과 연계)",
    );
  });
});
