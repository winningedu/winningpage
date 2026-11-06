import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ b2b: true }));

vi.mock("@/config/site", () => ({
  site: {
    logo: { horizontal: "/images/schoolmentor-logo.png" },
    features: {
      get b2bMenu() {
        return state.b2b;
      },
    },
  },
}));

const { default: MentorSection } = await import("./MentorSection");

const mentors = [
  {
    id: 1,
    badge: "위닝 8기",
    title_lines: ["김형준 멘토"],
    mentor_name: "김형준",
  },
];

beforeEach(() => {
  state.b2b = true;
});

describe("MentorSection 스쿨멘토", () => {
  test("영역 이름이 위닝을 가리키지 않는 중립 이름이다", () => {
    render(<MentorSection mentors={mentors} />);
    expect(
      screen.getByRole("region", { name: "선배 합격 노하우" }),
    ).toBeInTheDocument();
  });

  test("위닝은 영역 이름이 그대로 위닝 멘토다", () => {
    state.b2b = false;
    render(
      <MentorSection
        mentors={[
          {
            ...mentors[0],
            id: 1,
            photo_url: "https://img/p.png",
            photo: { top: 1, left: 1, width: 1, height: 1 },
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("region", { name: "위닝 멘토" }),
    ).toBeInTheDocument();
  });

  test("불러오지 못하면 카드 줄 자리에 오류 안내를 보여준다", () => {
    render(
      <MentorSection mentors={[]} status="error" titleMain="스쿨멘토와 함께" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "선배 카드를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요",
    );
    expect(screen.getByText("스쿨멘토와 함께")).toBeInTheDocument();
  });

  test("카드가 없고 오류도 아니면 영역을 그리지 않는다", () => {
    render(<MentorSection mentors={[]} status="ready" />);
    expect(screen.queryByRole("region")).toBeNull();
  });
});
