import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ video: false }));

vi.mock("@/config/site", () => ({
  site: {
    get features() {
      return { columnVideo: state.video };
    },
  },
}));

import ColumnCard from "./ColumnCard";

const VARIANTS = ["grid", "heroLarge", "heroSmall"] as const;

function renderCard(
  variant: (typeof VARIANTS)[number],
  linkUrl?: string | null,
) {
  render(
    <MemoryRouter>
      <ColumnCard
        variant={variant}
        categories={[]}
        column={{ id: "7", title: "칼럼 제목", link_url: linkUrl }}
      />
    </MemoryRouter>,
  );
  return screen.getByRole("link");
}

describe.each(VARIANTS)("ColumnCard %s", (variant) => {
  it("link_url이 있으면 새 창 외부 링크로 이동한다", () => {
    const link = renderCard(variant, "https://youtu.be/abc");
    expect(link).toHaveAttribute("href", "https://youtu.be/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("link_url이 없으면 내부 상세로 이동한다", () => {
    const link = renderCard(variant, null);
    expect(link).toHaveAttribute("href", "/info/column/7");
    expect(link).not.toHaveAttribute("target");
  });

  it("외부링크 표시는 link_url이 있을 때만 나온다", () => {
    const { container } = render(
      <MemoryRouter>
        <ColumnCard
          variant={variant}
          categories={[]}
          column={{ id: "7", title: "t", link_url: "https://a.com" }}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector("svg.lucide-external-link")).not.toBeNull();
  });

  it("link_url이 없으면 외부링크 표시가 없다", () => {
    const { container } = render(
      <MemoryRouter>
        <ColumnCard
          variant={variant}
          categories={[]}
          column={{ id: "7", title: "t" }}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector("svg.lucide-external-link")).toBeNull();
  });
});

describe("ColumnCard 카테고리 뱃지", () => {
  function renderWith(categories: string[]) {
    render(
      <MemoryRouter>
        <ColumnCard
          variant="heroLarge"
          categories={categories}
          column={{ id: "7", title: "t", category: "교육청소식" }}
        />
      </MemoryRouter>,
    );
  }

  it("category가 활성 목록에 있으면 뱃지를 보여준다", () => {
    renderWith(["교육청소식"]);
    expect(screen.getByText("교육청소식")).toBeInTheDocument();
  });

  it("category가 목록에 없으면 뱃지를 숨긴다", () => {
    renderWith([]);
    expect(screen.queryByText("교육청소식")).toBeNull();
  });
});

describe.each(VARIANTS)("ColumnCard %s 스쿨멘토 유튜브 글", (variant) => {
  afterEach(() => {
    state.video = false;
  });
  const YT = "https://youtu.be/abcDEF12345";

  it("유튜브 글은 새 창 없이 상세로 이동한다", () => {
    state.video = true;
    const link = renderCard(variant, YT);
    expect(link).toHaveAttribute("href", "/info/column/7");
    expect(link).not.toHaveAttribute("target");
  });

  it("유튜브가 아닌 연결주소는 새 창으로 간다", () => {
    state.video = true;
    const link = renderCard(variant, "https://a.com");
    expect(link).toHaveAttribute("href", "https://a.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("위닝은 유튜브 글도 새 창으로 간다", () => {
    const link = renderCard(variant, YT);
    expect(link).toHaveAttribute("target", "_blank");
  });
});

describe("ColumnCard 스쿨멘토 유튜브 썸네일", () => {
  afterEach(() => {
    state.video = false;
  });
  const YT = "https://youtu.be/abcDEF12345";
  const thumb = (column: Record<string, unknown>) => {
    render(
      <MemoryRouter>
        <ColumnCard
          categories={[]}
          column={{ id: "7", title: "제목", ...column }}
        />
      </MemoryRouter>,
    );
    return screen.queryByRole("img");
  };

  it("이미지가 없으면 유튜브 썸네일을 쓴다", () => {
    state.video = true;
    expect(thumb({ link_url: YT })).toHaveAttribute(
      "src",
      "https://i.ytimg.com/vi/abcDEF12345/hqdefault.jpg",
    );
  });

  it("등록한 이미지가 있으면 그대로 쓴다", () => {
    state.video = true;
    expect(
      thumb({ link_url: YT, image_url: "https://c.com/a.png" }),
    ).toHaveAttribute("src", "https://c.com/a.png");
  });

  it("위닝은 썸네일을 만들지 않는다", () => {
    expect(thumb({ link_url: YT })).toBeNull();
  });
});
