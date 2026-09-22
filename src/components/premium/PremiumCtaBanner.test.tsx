import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import PremiumCtaBanner from "./PremiumCtaBanner";

function renderBanner(props: React.ComponentProps<typeof PremiumCtaBanner>) {
  return render(
    <MemoryRouter>
      <PremiumCtaBanner {...props} />
    </MemoryRouter>,
  );
}

describe("PremiumCtaBanner — 값 없으면 버튼을 렌더하지 않는다", () => {
  it("light variant — cta에 to·href 둘 다 없으면 주 버튼을 렌더하지 않는다", () => {
    renderBanner({
      title: "제목",
      cta: { label: "카카오톡 상담" },
      variant: "light",
    });

    expect(
      screen.queryByRole("link", { name: "카카오톡 상담" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "카카오톡 상담" }),
    ).not.toBeInTheDocument();
    // 제목 등 나머지는 그대로 렌더된다.
    expect(screen.getByText("제목")).toBeInTheDocument();
  });

  it("light variant — secondaryCta를 넘기지 않으면 보조 버튼을 렌더하지 않는다", () => {
    renderBanner({
      title: "제목",
      cta: { label: "이용 신청하기", to: "/premium-apply" },
      variant: "light",
    });

    expect(
      screen.getByRole("link", { name: "이용 신청하기" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/전화 상담/)).not.toBeInTheDocument();
  });

  it("plain variant — cta에 to·href 둘 다 없으면 링크를 렌더하지 않는다", () => {
    renderBanner({
      title: "제목",
      cta: { label: "안내" },
      variant: "plain",
    });

    expect(
      screen.queryByRole("link", { name: "안내" }),
    ).not.toBeInTheDocument();
  });

  it("기본(dark) variant — cta에 to·href 둘 다 없으면 링크를 렌더하지 않는다", () => {
    renderBanner({
      title: "제목",
      cta: { label: "안내" },
    });

    expect(
      screen.queryByRole("link", { name: "안내" }),
    ).not.toBeInTheDocument();
  });
});
