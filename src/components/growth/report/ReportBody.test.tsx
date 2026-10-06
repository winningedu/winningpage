import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReportDetail } from "@/lib/growth/api";
import ReportBody from "./ReportBody";

afterEach(cleanup);

const section = (over: Record<string, unknown>) => ({
  title: "제목",
  format: "prose",
  badge: "fact",
  status: "ok",
  evidence_ids: [],
  body: { text: "본문 문장" },
  ...over,
});

function detail(over: Record<string, unknown> = {}): ReportDetail {
  return {
    ok: true,
    report: {
      id: "r1",
      status: "completed",
      track: "regular",
      issuedAt: "2026-11-14T00:00:00Z",
      currentStep: 8,
      progress: [],
      range: null,
      omitted: null,
      narrative: {
        theme: "대주제 문장",
        subthemes: [
          { grade: "고1", stage: "seed", text: "씨앗 문장" },
          { grade: "고2", stage: "flower", text: "꽃 문장" },
          { grade: "고3", stage: "bloom", text: "만개 문장" },
        ],
      },
      overview: [
        { key: "a", label: "방향 일관성", value: "50%", sub: "갈리는 중" },
        { key: "b", label: "A부터 E 확인됨", value: "2 / 5" },
        { key: "c", label: "내부 추정 등급", value: "자료 없음" },
        { key: "d", label: "권장과목 이수", value: "2 / 8" },
        { key: "e", label: "끊긴 시기", value: "1학년 2학기" },
        { key: "f", label: "분석 활동", value: "14건" },
      ],
      consistency: null,
      axes: null,
      sections: [],
      excludedSectionIds: [],
      planItems: [],
      lastActivityAt: "2026-11-14T00:00:00Z",
      ...over,
    },
  } as ReportDetail;
}

describe("ReportBody", () => {
  it("한눈에 카드 6개를 그대로 그린다", () => {
    render(<ReportBody detail={detail()} />);
    const cards = within(screen.getByLabelText("한눈에")).getAllByRole(
      "listitem",
    );
    expect(cards).toHaveLength(6);
    expect(screen.getByText("갈리는 중")).toBeInTheDocument();
    expect(screen.getByText("자료 없음")).toBeInTheDocument();
  });

  it("대주제와 학년별 씨앗 꽃 만개를 보여 준다", () => {
    render(<ReportBody detail={detail()} />);
    const card = screen.getByLabelText("이 학생의 대주제");
    expect(within(card).getByText("대주제 문장")).toBeInTheDocument();
    expect(within(card).getByText("1학년 씨앗")).toBeInTheDocument();
    expect(within(card).getByText("2학년 꽃")).toBeInTheDocument();
    expect(within(card).getByText("3학년 만개")).toBeInTheDocument();
  });

  it("진로 변경이면 이전 대주제를 안내한다", () => {
    render(
      <ReportBody
        detail={detail({
          narrative: {
            theme: "새",
            subthemes: [],
            previous: {
              theme: "예전 대주제",
              issuedAt: "2026-03-10T00:00:00Z",
              reason: "career_change",
            },
          },
        })}
      />,
    );
    const notice = screen.getByLabelText("진로 변경 안내");
    expect(notice).toHaveTextContent("예전 대주제");
    expect(notice).toHaveTextContent("2026년 3월 10일");
  });

  it("섹션을 1부 2부 3부 순서로 묶어 그린다", () => {
    render(
      <ReportBody
        detail={detail({
          sections: [
            section({ id: "3-2", title: "셋째" }),
            section({ id: "1-2", title: "첫째" }),
            section({ id: "2-7", title: "둘째" }),
          ],
        })}
      />,
    );
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(headings.filter((t) => /^[123]부/.test(t ?? ""))).toEqual([
      "1부 지금까지 무엇을 했는가 (1항목)",
      "2부 위닝 A부터 E 5축 진단 (1항목)",
      "3부 남은 기간 설계 (1항목)",
    ]);
  });

  it("섹션 카드에 번호 제목 형식 배지 근거 수를 표시하고 근거 0이면 생략한다", () => {
    render(
      <ReportBody
        detail={detail({
          sections: [
            section({
              id: "1-2",
              title: "장기 목표",
              evidence_ids: ["a", "b"],
            }),
            section({
              id: "3-2",
              title: "1학년 평가",
              badge: "proposal",
              format: "prose",
            }),
          ],
        })}
      />,
    );
    const one = screen.getByLabelText("1-2 장기 목표");
    expect(one).toHaveTextContent("서술");
    expect(one).toHaveTextContent("확인된 사실");
    expect(one).toHaveTextContent("근거 2건");
    const three = screen.getByLabelText("3-2 1학년 평가");
    expect(three).toHaveTextContent("제안");
    expect(three).not.toHaveTextContent("근거");
  });

  it("배지가 없는 섹션은 배지를 그리지 않는다", () => {
    render(
      <ReportBody
        detail={detail({
          sections: [
            section({ id: "1-2", title: "장기 목표", badge: undefined }),
          ],
        })}
      />,
    );
    const card = screen.getByLabelText("1-2 장기 목표");
    expect(card).not.toHaveTextContent("확인된 사실");
    expect(card).not.toHaveTextContent("제안");
  });

  it("자료 없음 항목은 사유를 보여 준다", () => {
    render(
      <ReportBody
        detail={detail({
          sections: [
            section({
              id: "1-12",
              title: "성적 추이와 곡선 판정",
              format: "line",
              status: "no_data",
              body: { text: "자료 없음", reason: "성적 자료가 아직 없어요" },
              no_data_reason: "성적 자료가 아직 없어요",
            }),
          ],
        })}
      />,
    );
    const card = screen.getByLabelText("1-12 성적 추이와 곡선 판정");
    expect(card).toHaveTextContent("자료 없음");
    expect(card).toHaveTextContent("성적 자료가 아직 없어요");
  });

  it("제외 항목은 사유와 함께 안내하고 학부모 열람이면 문구가 다르다", () => {
    const omitted = { ids: ["1-12"], reasons: ["1학년 자료 없이 진행했어요"] };
    const { rerender } = render(<ReportBody detail={detail({ omitted })} />);
    expect(screen.getByLabelText("제외 항목 안내")).toHaveTextContent(
      "1학년 자료 없이 진행했어요",
    );
    rerender(
      <ReportBody
        parentView
        detail={detail({ omitted: null, excludedSectionIds: ["1-12", "1-13"] })}
      />,
    );
    expect(screen.getByLabelText("제외 항목 안내")).toHaveTextContent(
      "학부모 열람",
    );
  });

  it("1-13 은 note 를 표시한다", () => {
    render(
      <ReportBody
        detail={detail({
          sections: [
            section({
              id: "1-13",
              title: "내부 추정 등급",
              format: "table",
              body: {
                rows: [{ label: "내부 추정 등급", value: "2.15" }],
                note: "참고용 내부 추정이에요.",
              },
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("참고용 내부 추정이에요.")).toBeInTheDocument();
  });

  it("3-10 이 도달 어려움이면 그대로 적고 다른 전형을 함께 보라고 안내한다", () => {
    render(
      <ReportBody
        detail={detail({
          sections: [
            section({
              id: "3-10",
              title: "학년별 목표 등급",
              format: "table",
              badge: "proposal",
              body: {
                status: "unreachable",
                rows: [{ key: "고3-1", target: 1.9, note: null }],
                note: "입결은 참고 자료이며 합격 가능성을 뜻하지 않아요.",
              },
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/다른 전형/)).toBeInTheDocument();
  });

  it("형식별 렌더러를 고른다", () => {
    render(
      <ReportBody
        detail={detail({
          sections: [
            section({
              id: "1-4",
              title: "막대",
              format: "bar",
              body: { bars: [{ label: "고1", value: 2 }] },
            }),
            section({
              id: "3-11",
              title: "목록",
              format: "list",
              body: { items: [{ text: "항목A", evidence_ids: ["x"] }] },
            }),
            section({
              id: "1-12",
              title: "선",
              format: "line",
              body: {
                system: "five",
                points: [
                  { key: "고1-1", average: 2.5 },
                  { key: "고1-2", average: 2 },
                ],
                actual: 2.3,
                estimate: 2.15,
                verdictLabel: "상승",
                thresholdText: "기준 문장",
              },
            }),
            section({
              id: "1-1",
              title: "표",
              format: "table",
              body: { rows: [{ label: "학교", value: "A고" }] },
            }),
            section({
              id: "1-10",
              title: "방향",
              format: "diagram",
              formula: "7 / 14",
              body: {
                percent: 50,
                verdictLabel: "갈리는 중",
                criteria: "기준",
                smallSample: true,
                linked: [],
              },
            }),
          ],
        })}
      />,
    );
    expect(
      screen.getByLabelText("1-4 막대").querySelector("[role=img]"),
    ).not.toBeNull();
    expect(
      screen.getByLabelText("3-11 목록").querySelector("ul"),
    ).not.toBeNull();
    expect(
      screen.getByLabelText("1-12 선").querySelector("svg"),
    ).not.toBeNull();
    expect(screen.getByLabelText("1-12 선")).toHaveTextContent("기준 문장");
    expect(
      screen.getByLabelText("1-1 표").querySelector("table"),
    ).not.toBeNull();
    const dir = screen.getByLabelText("1-10 방향");
    expect(dir).toHaveTextContent("50%");
    expect(dir).toHaveTextContent("7 / 14");
    expect(dir).toHaveTextContent("활동이 쌓이면");
  });

  it("꼭 알아 두세요 안내를 하단에 둔다", () => {
    render(<ReportBody detail={detail()} />);
    expect(screen.getByLabelText("꼭 알아 두세요")).toHaveTextContent(
      "위닝 내부 기준",
    );
  });
});
