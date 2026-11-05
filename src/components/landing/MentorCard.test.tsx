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

const { default: MentorCard } = await import("./MentorCard");

const base = {
  id: 1,
  mentor_name: "김형준",
  badge: "위닝 8기",
  title_lines: ["김형준 멘토", "서울대 수의예과"],
};
const photo = { top: 80, left: 10, width: 190, height: 240 };

function renderCard(mentor: Record<string, unknown>) {
  return render(
    <ul>
      <MentorCard mentor={{ id: 1, ...mentor }} />
    </ul>,
  );
}

beforeEach(() => {
  state.b2b = true;
});

describe("MentorCard 기본 이미지", () => {
  test("스쿨멘토는 사진이 없으면 카드를 건너뛰지 않고 기본 이미지를 보여준다", () => {
    renderCard(base);
    expect(screen.getByText("위닝 8기")).toBeInTheDocument();
    expect(screen.getByAltText("")).toHaveAttribute(
      "src",
      "/images/schoolmentor-logo.png",
    );
  });

  test("사진이 있으면 기본 이미지 대신 사진을 보여준다", () => {
    renderCard({ ...base, photo_url: "https://img/p.png", photo });
    expect(screen.getByAltText("김형준 멘토")).toHaveAttribute(
      "src",
      "https://img/p.png",
    );
    expect(screen.queryByAltText("")).toBeNull();
  });

  test("위닝은 사진이 없으면 카드를 그리지 않는다", () => {
    state.b2b = false;
    renderCard(base);
    expect(screen.queryByText("위닝 8기")).toBeNull();
  });

  test("스쿨멘토도 배지나 줄 글이 없는 행은 그리지 않는다", () => {
    renderCard({ id: 2, mentor_name: "무명" });
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});
