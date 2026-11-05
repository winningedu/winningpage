// 히어로 영역별 상태(W1 loading, error, empty): 슬롯 크기는 그대로 두고 점 줄은 투명하게 자리만 지킨다.
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import HeroSection from "./HeroSection";

function renderHero(
  props: Partial<React.ComponentProps<typeof HeroSection>> = {},
) {
  return render(
    <MemoryRouter>
      <HeroSection syncedSlides {...props} />
    </MemoryRouter>,
  );
}

describe("HeroSection 상태", () => {
  it("불러오는 중에는 두 슬롯이 글자 없는 빈 박스이고 점 줄은 투명하게 남는다", () => {
    renderHero({ mainStatus: "loading", sideStatus: "loading" });
    const main = screen.getByRole("region", { name: "메인 배너" });
    const side = screen.getByRole("region", { name: "이벤트 배너" });
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(side).toHaveAttribute("aria-busy", "true");
    expect(main).toHaveTextContent("");
    expect(screen.getByTestId("hero-dots-placeholder")).toHaveClass(
      "opacity-0",
    );
  });

  it("큰 배너 조회만 실패하면 큰 슬롯에만 오류 안내를 보이고 작은 배너는 그대로 그린다", () => {
    renderHero({
      mainStatus: "error",
      sideBanners: [{ id: "s1", title: "이벤트 1", image_url: "/s1.png" }],
    });
    const main = screen.getByRole("region", { name: "메인 배너" });
    expect(within(main).getByRole("alert")).toHaveTextContent(
      "배너를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByAltText("이벤트 1")).toBeInTheDocument();
  });

  it("배너가 없으면 안내 문구를 보이고 점 줄은 투명하게 남는다", () => {
    renderHero({ showMainEmptyNotice: true, showSideEmptyNotice: true });
    expect(screen.getAllByText("배너가 없어요")).toHaveLength(2);
    expect(screen.getByTestId("hero-dots-placeholder")).toHaveClass(
      "opacity-0",
    );
  });

  it("위닝처럼 상태를 주지 않으면 배너가 없을 때 아무것도 그리지 않는다", () => {
    const { container } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
