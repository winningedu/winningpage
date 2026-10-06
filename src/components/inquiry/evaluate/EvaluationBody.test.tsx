import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { NOT_PRODUCED } from "@/lib/inquiry/labels";
import type { EvaluationView, RubricItemId } from "@/lib/inquiry/types";
import EvaluationBody from "./EvaluationBody";

afterEach(cleanup);

const IDS: RubricItemId[] = [
  "linkage",
  "question",
  "method",
  "evidence",
  "conclusion",
  "structure",
];

function evaluation(over: Partial<EvaluationView> = {}): EvaluationView {
  return {
    id: "e1",
    revision: 1,
    createdAt: "2026-10-06T00:00:00Z",
    total: 91.3,
    label: "ready_with_minor_edits",
    items: IDS.map((id) => ({
      id,
      level: 4,
      score: 10,
      met: ["a", "b", "c", "d"],
      unmet: [],
      evidence: "근거",
      capReason: null,
    })),
    coreErrors: [],
    fixFirst: [],
    mustFix: [],
    checklist: Array.from({ length: 13 }, (_, i) => ({
      id: `c${String(i + 1).padStart(2, "0")}`,
      met: true,
    })),
    sources: [],
    placeholders: {},
    ...over,
  };
}

describe("EvaluationBody 총점 카드", () => {
  test("총점, 만점, 상태 라벨, 핵심 오류 없음 요약을 그린다", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    const card = screen.getByRole("region", { name: "총점" });
    expect(within(card).getByText("91.3")).toBeVisible();
    expect(within(card).getByText("/ 100")).toBeVisible();
    expect(within(card).getByText("소규모 보완 후 제출 가능")).toBeVisible();
    expect(
      within(card).getByText(/핵심 오류가 없어요\. 먼저 고칠 것을 보완하면/),
    ).toBeVisible();
  });

  test("점수 확정 배지는 없다", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    expect(screen.queryByText("점수 확정")).not.toBeInTheDocument();
  });

  test("핵심 오류가 있으면 요약이 바뀐다", () => {
    render(
      <EvaluationBody
        evaluation={evaluation({
          label: "major_revision_needed",
          coreErrors: [
            {
              id: "overclaim",
              location: "V",
              detail: "단정 표현",
              effect: "결론 항목 수준 2 이하로 제한",
            },
          ],
        })}
      />,
    );
    const card = screen.getByRole("region", { name: "총점" });
    expect(
      within(card).getByText(
        "핵심 오류 1건이 있어요. 총점과 관계없이 제출 전에 반드시 고쳐야 해요",
      ),
    ).toBeVisible();
    expect(within(card).getByText("대폭 수정 필요")).toBeVisible();
  });
});

describe("EvaluationBody 평가표", () => {
  test("6항목 행과 점수 / 배점, 수준 배지, 충족 문구", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    const table = screen.getByRole("table", { name: "평가표" });
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(within(table).getByText("10 / 25")).toBeVisible();
    expect(within(table).getAllByText("수준 4")).toHaveLength(6);
    expect(within(table).getAllByText("요건 4개 모두 충족")).toHaveLength(6);
  });

  test("산식 문구를 보여 준다", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    expect(screen.getByText(/항목 점수 = 배점 × 수준 ÷ 4/)).toBeVisible();
  });

  test("상한 사유가 있으면 해당 행 아래에 그린다", () => {
    const base = evaluation();
    base.items[2] = {
      id: "method",
      level: 2,
      score: 12,
      met: ["a"],
      unmet: ["x"],
      evidence: "근거",
      capReason: "핵심 오류로 수준 2 이하로 제한",
    };
    render(<EvaluationBody evaluation={base} />);
    expect(screen.getByText("핵심 오류로 수준 2 이하로 제한")).toBeVisible();
    expect(screen.getByText("미충족: x")).toBeVisible();
  });
});

describe("EvaluationBody 핵심 오류", () => {
  test("0건이면 확인 문구와 0건 배지", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    const sec = screen.getByRole("region", { name: "핵심 오류" });
    expect(within(sec).getByText("0건")).toBeVisible();
    expect(
      within(sec).getByText(
        "질문과 측정변수, 대리 지표, 원인 단정, 증거를 넘은 단정, 출처 없는 수치, 미작성 자리를 모두 확인했어요. 고쳐야 할 핵심 오류는 없어요",
      ),
    ).toBeVisible();
  });

  test("있으면 라벨, 위치 절, 설명, 영향을 건마다 그린다", () => {
    render(
      <EvaluationBody
        evaluation={evaluation({
          coreErrors: [
            {
              id: "unsourced_number",
              location: "IV",
              detail: "수치 3개에 출처가 없어요",
              effect: "근거 항목 수준 1로 제한",
            },
          ],
        })}
      />,
    );
    const sec = screen.getByRole("region", { name: "핵심 오류" });
    expect(within(sec).getByText("1건")).toBeVisible();
    expect(within(sec).getByText("출처 없는 수치 주장이 있어요")).toBeVisible();
    expect(within(sec).getByText("Ⅳ절 탐구 결과")).toBeVisible();
    expect(within(sec).getByText("수치 3개에 출처가 없어요")).toBeVisible();
    expect(within(sec).getByText("근거 항목 수준 1로 제한")).toBeVisible();
  });
});

describe("EvaluationBody 먼저 고칠 것", () => {
  test("비면 안내 문구", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    expect(screen.getByText("먼저 고칠 것이 없어요")).toBeVisible();
  });

  test("있으면 위치, 문제, 영향, 할 일, 확인 기준 표", () => {
    render(
      <EvaluationBody
        evaluation={evaluation({
          fixFirst: [
            {
              location: "III",
              problem: "규모 보정 과정이 한 줄뿐",
              impact: "폐사율 비교의 근거가 약해짐",
              action: "사육두수로 나눈 과정을 적기",
              check: "계산식이 본문에 있는가",
            },
          ],
        })}
      />,
    );
    const table = screen.getByRole("table", { name: "먼저 고칠 것" });
    expect(within(table).getByText("Ⅲ절")).toBeVisible();
    expect(within(table).getByText("규모 보정 과정이 한 줄뿐")).toBeVisible();
    expect(within(table).getByText("계산식이 본문에 있는가")).toBeVisible();
  });
});

describe("EvaluationBody 필수 수정 목록", () => {
  test("mustFix 가 없으면 그리지 않는다", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    expect(
      screen.queryByRole("region", { name: "필수 수정 목록" }),
    ).not.toBeInTheDocument();
  });

  test("있으면 표로 그린다", () => {
    render(
      <EvaluationBody
        evaluation={evaluation({
          mustFix: [
            {
              location: "VI",
              problem: "한계가 하나뿐",
              impact: "결론 범위 과다",
              action: "한계 추가",
              check: "두 가지 이상",
            },
          ],
        })}
      />,
    );
    const sec = screen.getByRole("region", { name: "필수 수정 목록" });
    expect(within(sec).getByText("한계가 하나뿐")).toBeVisible();
  });
});

describe("EvaluationBody 설계 대비 이행표", () => {
  test("충족 n / 13 과 미충족 항목 이름", () => {
    const base = evaluation();
    base.checklist[11] = { id: "c12", met: false };
    render(<EvaluationBody evaluation={base} />);
    const sec = screen.getByRole("region", { name: "설계 대비 이행표" });
    expect(within(sec).getByText("12 / 13 충족")).toBeVisible();
    expect(within(sec).getByText(/한계 두 가지 이상/)).toBeVisible();
  });

  test("모두 충족이면 미충족 줄이 없다", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    const sec = screen.getByRole("region", { name: "설계 대비 이행표" });
    expect(within(sec).getByText("13 / 13 충족")).toBeVisible();
    expect(within(sec).queryByText(/못 채운 항목/)).not.toBeInTheDocument();
  });
});

describe("EvaluationBody 출처 확인", () => {
  test("자료와 상태 배지, 미확인은 직접 확인 안내", () => {
    render(
      <EvaluationBody
        evaluation={evaluation({
          sources: [
            { text: "기상청 자료", status: "supplied_unverified" },
            { text: "통계청 자료", status: "search_target" },
          ],
        })}
      />,
    );
    const table = screen.getByRole("table", { name: "출처 확인" });
    expect(within(table).getByText("기상청 자료")).toBeVisible();
    expect(within(table).getByText("사용자 제공 미확인")).toBeVisible();
    expect(within(table).getByText("직접 확인해 주세요")).toBeVisible();
    expect(within(table).getByText("검색 예정")).toBeVisible();
  });

  test("자료가 없으면 표 대신 안내", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    expect(
      screen.queryByRole("table", { name: "출처 확인" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("확인할 참고 자료가 없어요")).toBeVisible();
  });
});

describe("EvaluationBody 자리표시자와 하지 않는 것", () => {
  test("자리표시자가 있으면 절별 개수를 안내한다", () => {
    render(
      <EvaluationBody evaluation={evaluation({ placeholders: { IV: 2 } })} />,
    );
    expect(screen.getByText("Ⅳ절 탐구 결과 2개")).toBeVisible();
  });

  test("자리표시자가 없으면 안내 영역이 없다", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    expect(
      screen.queryByRole("region", { name: "남은 자리표시자" }),
    ).not.toBeInTheDocument();
  });

  test("이 평가가 하지 않는 것 칩 6개", () => {
    render(<EvaluationBody evaluation={evaluation()} />);
    const sec = screen.getByRole("region", { name: "이 평가가 하지 않는 것" });
    for (const t of NOT_PRODUCED)
      expect(within(sec).getByText(t)).toBeVisible();
    expect(within(sec).getAllByRole("listitem")).toHaveLength(6);
  });
});

describe("EvaluationBody compact", () => {
  test("compact 이면 하지 않는 것 영역을 생략한다", () => {
    render(<EvaluationBody evaluation={evaluation()} compact />);
    expect(
      screen.queryByRole("region", { name: "이 평가가 하지 않는 것" }),
    ).not.toBeInTheDocument();
  });
});
