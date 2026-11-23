import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { CandidateRow } from "@/lib/selfeval/types";
import CandidateCard from "./CandidateCard";

function row(over: Partial<CandidateRow> = {}): CandidateRow {
  return {
    activity: {
      id: "x",
      sourceProgram: "performance",
      status: "confirmed",
      gradeLabel: "고2",
      semester: 1,
      subjectGroup: null,
      subject: "수학",
      topic: "버스 배차 분석",
      concept: null,
      method: null,
      result: "결과",
      limitation: null,
      numbers: null,
      sources: null,
      createdAt: "2026-09-16T12:00:00Z",
    },
    fit: {
      activityId: "x",
      score: 70,
      signals: [],
      reasons: ["적합도 이유"],
    },
    unavailableReason: null,
    alreadyUsed: false,
    role: null,
    ...over,
  };
}

function renderCard(
  r: CandidateRow,
  over: Partial<Parameters<typeof CandidateCard>[0]> = {},
) {
  return render(
    <CandidateCard
      row={r}
      activityRole={null}
      checked={false}
      disabled={false}
      onToggle={vi.fn()}
      linkStatus="ok"
      unlinked={false}
      {...over}
    />,
  );
}

const linked = (over = {}) => ({
  linked: true,
  hop: 1,
  type: "borrow_method" as const,
  strength: "explicit" as const,
  confirmed: false,
  ...over,
});

describe("CandidateCard 연계 표시", () => {
  test("연계됨 칩에 유형과 단계와 강도를 적는다", () => {
    renderCard(row({ linkState: linked() }));
    expect(
      screen.getByText("연계됨, 방법 빌림, 1단계, 기록에 명시"),
    ).toBeTruthy();
  });

  test("연계 상태가 없으면 연계 없음 칩을 보인다", () => {
    renderCard(row({ linkState: null }));
    expect(screen.getByText("연계 없음")).toBeTruthy();
  });

  test("연계 확인이 안 됐으면 연계 확인 안 됨 칩을 보인다", () => {
    renderCard(row({ linkState: null }), { linkStatus: "unchecked" });
    expect(screen.getByText("연계 확인 안 됨")).toBeTruthy();
    expect(screen.queryByText("연계 없음")).toBeNull();
  });

  test("판정 전에는 연계 칩을 그리지 않는다", () => {
    renderCard(row({ linkState: null }), { linkStatus: "pending" });
    expect(screen.queryByText("연계 없음")).toBeNull();
  });

  test("선정 이유 줄과 새로 더하는 항목 수를 보인다", () => {
    renderCard(
      row({
        selectionReasons: [
          "적합도 이유",
          "핵심 기록과 직접 이어져요 (방법 빌림)",
        ],
        contribution: 3,
      }),
    );
    expect(screen.getByText("적합도 이유")).toBeTruthy();
    expect(
      screen.getByText("핵심 기록과 직접 이어져요 (방법 빌림)"),
    ).toBeTruthy();
    expect(screen.getByText("새로 더하는 항목 3개")).toBeTruthy();
  });

  test("확인하지 않은 암묵 연계는 참고 항목으로만 쓴다고 알린다", () => {
    renderCard(row({ linkState: linked({ strength: "implicit" }) }), {
      checked: true,
    });
    expect(
      screen.getByText("확인하기 전에는 연결 문장 없이 참고 항목으로만 써요"),
    ).toBeTruthy();
  });

  test("사용할 수 없는 기록은 진행 중이든 계획이든 서버 이유를 보인다", () => {
    renderCard(
      row({
        fit: null,
        unavailableReason: "아직 진행 중인 기록이라 재료로 쓸 수 없어요",
      }),
    );
    expect(screen.getByText("사용 불가")).toBeTruthy();
    expect(
      screen.getByText("아직 진행 중인 기록이라 재료로 쓸 수 없어요"),
    ).toBeTruthy();
    expect(screen.queryByText("연계 없음")).toBeNull();
  });

  test("연계 없는 기록을 고르면 경고와 생성 제외 안내, 입력 칸을 보인다", () => {
    renderCard(row({ linkState: null }), {
      checked: true,
      activityRole: "support",
      unlinked: true,
      children: <p>설명 입력 칸</p>,
    });
    expect(
      screen.getByText("다른 기록과 이어지는 지점을 찾지 못했어요"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "어떻게 이어지는지 한 줄을 쓰지 않으면 이 기록은 글을 만들 때 쓰지 않아요",
      ),
    ).toBeTruthy();
    expect(screen.getByText("설명 입력 칸")).toBeTruthy();
  });
});
