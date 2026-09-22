// BookViewer.tsx의 빈 페이지 워터마크(WATERMARK_SRC)가 site.logo.stacked를
// 쓰는지 확인한다. 워터마크는 3D 플립 뷰어의 FACE_GAP 분기에서만 렌더되고
// alt=""(장식용)이라 DOM 렌더로 검증하기보다, 모듈이 실제로 내보내는 상수값을
// 직접 비교하는 편이 가볍고 안정적이다.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { logo: { stacked: "/images/schoolmentor-logo-stacked.png" } },
}));

describe("BookViewer — WATERMARK_SRC", () => {
  it("site.logo.stacked를 그대로 쓴다", async () => {
    const { WATERMARK_SRC } = await import("./BookViewer");

    expect(WATERMARK_SRC).toBe("/images/schoolmentor-logo-stacked.png");
  });
});
