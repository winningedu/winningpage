import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";
import type { HomeColumnBox } from "./homeColumns";

vi.mock("@/config/site", () => ({
  site: {
    brandName: "스쿨멘토",
    columnTitle: "칼럼-교육청소식",
    logo: { horizontal: "/images/schoolmentor-logo.png" },
  },
}));

const { default: ColumnNewsSection } = await import("./ColumnNewsSection");

const boxes: HomeColumnBox[] = [
  {
    id: "v1",
    kind: "video",
    title: "늦은 시작과 높은 꿈",
    date: "2026.10.05",
    thumbnailUrl: "https://i.ytimg.com/vi/abcDEF12345/hqdefault.jpg",
    videoId: "abcDEF12345",
    durationLabel: "12:40",
  },
  {
    id: "c1",
    kind: "column",
    title: "수시 전략 한눈에",
    date: "2026.10.03",
    thumbnailUrl: "https://img/c1.png",
  },
  { id: "c2", kind: "column", title: "썸네일 없는 글", date: "2026.10.01" },
  {
    id: "v2",
    kind: "video",
    title: "시간 없는 영상",
    date: "2026.09.30",
    videoId: "zzzDEF12345",
  },
];

function renderSection(
  props: Partial<{
    status: "loading" | "ready" | "error";
    boxes: HomeColumnBox[];
  }> = {},
) {
  return render(
    <MemoryRouter>
      <ColumnNewsSection status="ready" boxes={boxes} {...props} />
    </MemoryRouter>,
  );
}

describe("ColumnNewsSection 박스", () => {
  test("제목과 더 보기 링크와 박스 4개를 그린다", () => {
    renderSection();
    const region = screen.getByRole("region", { name: "칼럼-교육청소식" });
    expect(
      within(region).getByRole("heading", { name: "칼럼-교육청소식" }),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole("link", { name: "칼럼-교육청소식 더 보기" }),
    ).toHaveAttribute("href", "/info/column");
    expect(within(region).getAllByRole("listitem")).toHaveLength(4);
  });

  test("칼럼 박스는 상세 글로 가는 링크이고 영상 박스는 재생 버튼이다", () => {
    renderSection();
    expect(
      screen.getByRole("link", { name: /수시 전략 한눈에/ }),
    ).toHaveAttribute("href", "/info/column/c1");
    expect(
      screen.getByRole("button", { name: "늦은 시작과 높은 꿈 영상 재생" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /늦은 시작/ })).toBeNull();
  });

  test("영상 박스는 재생 시간이 있을 때만 시간 칩을 보여준다", () => {
    renderSection();
    expect(screen.getByText("12:40")).toBeInTheDocument();
    const noTime = screen.getByRole("button", {
      name: "시간 없는 영상 영상 재생",
    });
    expect(within(noTime).queryByText(/^\d\d:\d\d$/)).toBeNull();
  });

  test("썸네일이 없으면 기본 이미지(로고)를 보여준다", () => {
    renderSection();
    const link = screen.getByRole("link", { name: /썸네일 없는 글/ });
    expect(within(link).getByAltText("")).toHaveAttribute(
      "src",
      "/images/schoolmentor-logo.png",
    );
  });

  test("영상 박스를 누르기 전에는 플레이어가 없고 누르면 팝업에 플레이어가 뜬다", async () => {
    renderSection();
    expect(document.querySelector("iframe")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "늦은 시작과 높은 꿈 영상 재생" }),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(document.querySelector("iframe")).toHaveAttribute(
      "src",
      expect.stringContaining("/embed/abcDEF12345"),
    );
  });
});
