import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";
import { BannerFormPreview, SideBannerFormPreview } from "./bannersForm";

function renderPreview(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const noop = () => {};

describe("BannerFormPreview", () => {
  test("입력한 이미지로 공개 화면의 메인 배너 한 장을 그린다", () => {
    renderPreview(
      <BannerFormPreview
        form={{ image_url: "https://example.com/a.png", title: "개강 안내" }}
        onPatch={noop}
      />,
    );
    const img = screen.getByAltText("개강 안내");
    expect(img.getAttribute("src")).toBe("https://example.com/a.png");
    expect(screen.getByLabelText("메인 배너")).toBeTruthy();
  });

  test("이미지가 없으면 안내 문구만 보인다", () => {
    renderPreview(
      <BannerFormPreview form={{ title: "제목" }} onPatch={noop} />,
    );
    expect(screen.getByText(/이미지를 등록하면/)).toBeTruthy();
    expect(screen.queryByLabelText("메인 배너")).toBeNull();
  });
});

describe("SideBannerFormPreview", () => {
  test("입력한 이미지로 공개 화면의 소형 배너 한 장을 그린다", () => {
    renderPreview(
      <SideBannerFormPreview
        form={{ image_url: "https://example.com/s.png", title: "이벤트" }}
        onPatch={noop}
      />,
    );
    expect(screen.getByAltText("이벤트").getAttribute("src")).toBe(
      "https://example.com/s.png",
    );
    expect(screen.getByLabelText("이벤트 배너")).toBeTruthy();
  });

  test("PC 이미지 없이 모바일 이미지만 있어도 그린다", () => {
    renderPreview(
      <SideBannerFormPreview
        form={{
          mobile_image_url: "https://example.com/m.png",
          title: "모바일",
        }}
        onPatch={noop}
      />,
    );
    expect(screen.getByLabelText("이벤트 배너")).toBeTruthy();
  });
});
