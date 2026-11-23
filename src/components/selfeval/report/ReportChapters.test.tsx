import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

describe("03장 기 제출 보고서와의 연관성", () => {
  const ch = () => chapter("03", "기 제출 보고서와의 연관성");

  test("소개 문장과 카드 4장(P1, P2, D1, D3)을 그린다", () => {
    renderDoc();
    expect(
      within(ch()).getByText(
        "이미 제출한 보고서의 내용이 자기평가에서 어떻게 이어지고(계승), 깊어지고(심화), 새로 더해졌는지(보완) 정리했습니다.",
      ),
    ).toBeInTheDocument();
    expect(
      within(ch())
        .getAllByTestId(/^ch03-row-/)
        .map((e) => e.getAttribute("data-testid")),
    ).toEqual(["ch03-row-P1", "ch03-row-P2", "ch03-row-D1", "ch03-row-D3"]);
  });

  test("카드에 꼬리표와 종류, 제목, 제출일, 관계 라벨, 연계 강도, 설명을 그린다", () => {
    renderDoc();
    const p2 = within(ch()).getByTestId("ch03-row-P2");
    expect(p2).toHaveTextContent("P2");
    expect(p2).toHaveTextContent("수행");
    expect(p2).toHaveTextContent("설문 데이터로 일차 수요식 세우기");
    expect(p2).toHaveTextContent("2026.07.09");
    expect(within(p2).getByTestId("relation")).toHaveTextContent("계승");
    expect(within(p2).getByText("학생 확인")).toBeInTheDocument();
    expect(p2).toHaveTextContent(
      "P2에서 구한 수요식이 D1 이익 함수의 입력값이 됩니다.",
    );
    const d1 = within(ch()).getByTestId("ch03-row-D1");
    expect(within(d1).getByTestId("relation")).toHaveTextContent("심화");
    expect(within(d1).getByText("기록에 명시")).toBeInTheDocument();
  });

  test("다른 과목 기록은 종류 옆에 과목명을 붙이고 보완 라벨을 쓴다", () => {
    renderDoc();
    const d3 = within(ch()).getByTestId("ch03-row-D3");
    expect(d3).toHaveTextContent("D3");
    expect(d3).toHaveTextContent("심화, 통합사회");
    expect(within(d3).getByTestId("relation")).toHaveTextContent("보완");
  });

  test("연계 강도가 없으면 강도 칸을 그리지 않고, 설명이 비면 설명 칸은 빈다", () => {
    const rows = SAMPLE_PAYLOAD.ch03.rows.map((r) => ({
      ...r,
      strengthLabel: null,
      explanation: null,
    }));
    renderDoc({ ...SAMPLE_PAYLOAD, ch03: { rows } });
    const p1 = within(ch()).getByTestId("ch03-row-P1");
    expect(within(p1).queryByText("기록에 명시")).toBeNull();
    expect(within(p1).queryByTestId("explanation")?.textContent).toBe("");
  });
});

describe("04장 수기 수행보고 연관성", () => {
  const ch = () => chapter("04", "수기 수행보고 연관성");

  test("수기마다 꼬리표, 날짜, 원문, 연결 문장 번호와 설명을 그린다", () => {
    renderDoc();
    const h3 = within(ch()).getByTestId("ch04-row-H3");
    expect(h3).toHaveTextContent("H3");
    expect(h3).toHaveTextContent("2026.06.20");
    expect(h3).toHaveTextContent("학생 수기 입력");
    expect(within(h3).getByTestId("memo-text").textContent).toBe(
      "손으로 구한 꼭짓점이랑 엑셀 그래프 최고점이 50원 차이 남. 계수 반올림해서 그런 거였음. 다시 계산함.",
    );
    expect(h3).toHaveTextContent("문장 ⑥");
    expect(h3).toHaveTextContent(
      "엑셀로 검산했다는 문장의 구체적인 과정입니다.",
    );
  });

  test("원문은 고치지 않고 따옴표와 줄바꿈 그대로 둔다", () => {
    renderDoc();
    expect(
      within(within(ch()).getByTestId("ch04-row-H1")).getByTestId("memo-text")
        .textContent,
    ).toBe(
      '매점 도우미 하는데 친구가 "가격 올리면 더 버는 거야?" 물어봄. 바로 대답 못 했음.',
    );
  });

  test("연결 문장이 없는 수기는 미반영과 이유를 붙이고 회색으로 그린다", () => {
    renderDoc();
    const h5 = within(ch()).getByTestId("ch04-row-H5");
    expect(within(h5).getByText("미반영")).toBeInTheDocument();
    expect(h5).toHaveTextContent("문항과 관련 없음");
    expect(h5).toHaveAttribute("data-muted", "true");
    expect(h5).not.toHaveTextContent("문장 ①");
    expect(within(ch()).getByTestId("ch04-row-H1")).toHaveAttribute(
      "data-muted",
      "false",
    );
  });

  test("반영률 박스에 반영된 수기 수 / 전체와 코드 틀 요약을 그린다", () => {
    renderDoc();
    const box = within(ch()).getByTestId("ch04-rate");
    expect(box).toHaveTextContent("수기 기록 반영률 4 / 5");
    expect(box).toHaveTextContent(
      "수기 메모가 자기평가 9문장 중 4문장(①③⑥⑨)의 근거가 됐습니다.",
    );
  });
});

describe("05장 성장 흐름과 다음 단계", () => {
  const ch = () => chapter("05", "성장 흐름과 다음 단계");

  test("소개 문장과 집계 카드 4개를 그린다", () => {
    renderDoc();
    expect(
      within(ch()).getByText(
        "이번 자기평가가 위닝에듀 6단계 과정 안에서 어떻게 쌓여 왔는지 한눈에 정리했습니다.",
      ),
    ).toBeInTheDocument();
    const counts = within(ch()).getAllByTestId("count-card");
    expect(counts.map((c) => c.textContent)).toEqual([
      "7완료 보고서 (4과목)",
      "6자기평가에 반영된 보고서",
      "4반영된 수기 기록",
      "3연계된 교과 (수학, 정보, 통합사회)",
    ]);
  });

  test("단계 카드 6개를 01~06 순서로 그리고 문장은 payload 에서 읽는다", () => {
    renderDoc();
    const cards = within(ch()).getAllByTestId("stage-card");
    expect(cards).toHaveLength(6);
    expect(cards[0]).toHaveTextContent("01학습진단");
    expect(cards[0]).toHaveTextContent(
      "함수 단원 개념 이해는 양호, 실생활 적용 경험 부족으로 진단",
    );
    expect(cards[1]).toHaveTextContent("목표관리");
    expect(cards[3]).toHaveTextContent(
      "P1(수학), P2(수학), P3(정보), P4(통합사회)",
    );
    expect(cards[4]).toHaveTextContent("D1(수학), D3(통합사회)");
    expect(cards[4]).toHaveTextContent("D2는 진행 중");
    expect(cards[5]).toHaveTextContent("9문장 중 9문장 모두 근거 연결 완료");
  });

  test("값이 없는 카드는 이용 기록 없음, 읽기 실패는 불러오지 못함으로 적고 문장을 만들지 않는다", () => {
    const base = SAMPLE_PAYLOAD.ch05;
    renderDoc({
      ...SAMPLE_PAYLOAD,
      ch05: {
        ...base,
        cards: {
          ...base.cards,
          diagnosis: { state: "error", text: null, date: null },
        },
      },
    });
    const cards = within(ch()).getAllByTestId("stage-card");
    expect(cards[0]).toHaveTextContent("불러오지 못함");
    expect(cards[2]).toHaveTextContent("이용 기록 없음");
    expect(cards[2]).not.toHaveTextContent("활동 계획");
  });

  test("다음 단계 제안을 번호, 꼬리표, 문장으로 그린다", () => {
    renderDoc();
    const steps = within(ch()).getAllByTestId("next-step");
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent("①");
    expect(steps[0]).toHaveTextContent("H3");
    expect(steps[0]).toHaveTextContent("과정 서술이 더 구체적이 됩니다.");
    expect(steps[1]).toHaveTextContent("D2");
    expect(steps[3]).toHaveTextContent("P5");
  });
});

describe("모델 문장 실패(No.201)", () => {
  test("composeMissing 이면 안내와 다시 만들기 버튼을 그리고 누르면 onRebuild 를 부른다", () => {
    const { onRebuild } = renderDoc({
      ...SAMPLE_PAYLOAD,
      composeMissing: true,
    });
    expect(
      screen.getByText("설명 문장을 만들지 못해 비워 두었어요."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 만들기" }));
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  test("composeMissing 이 아니면 다시 만들기를 그리지 않는다", () => {
    renderDoc();
    expect(screen.queryByRole("button", { name: "다시 만들기" })).toBeNull();
  });
});
