// AdminTableFrame: 가로 스크롤 영역의 접근성(region/tabindex)과 끝단 그림자 단서 검증.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { AdminTableFrame } from "./AdminTableFrame";

afterEach(cleanup);

function renderFrame() {
  return render(
    <AdminTableFrame label="회원 목록" className="min-w-[62.5rem]">
      <tbody>
        <tr>
          <td>셀</td>
        </tr>
      </tbody>
    </AdminTableFrame>,
  );
}

function setScroll(
  viewport: HTMLElement,
  { scrollWidth, clientWidth, scrollLeft }: Record<string, number>,
) {
  Object.defineProperty(viewport, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  });
  Object.defineProperty(viewport, "clientWidth", {
    configurable: true,
    value: clientWidth,
  });
  Object.defineProperty(viewport, "scrollLeft", {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
  act(() => {
    fireEvent.scroll(viewport);
  });
}

function edge(container: HTMLElement, side: "left" | "right") {
  const el = container.querySelector(`[data-edge="${side}"]`);
  if (!el) throw new Error(`${side} edge not rendered`);
  return el.getAttribute("data-visible");
}

describe("AdminTableFrame 접근성", () => {
  test("스크롤 뷰포트가 이름 있는 포커스 가능한 region 이다", () => {
    renderFrame();
    const region = screen.getByRole("region", { name: "회원 목록" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.hasAttribute("data-overlayscrollbars-viewport")).toBe(true);
  });

  test("표는 break-keep 과 전달한 클래스를 가진다", () => {
    renderFrame();
    const table = screen.getByRole("table");
    expect(table.className).toContain("break-keep");
    expect(table.className).toContain("min-w-[62.5rem]");
  });

  test("table 속성(aria-label)을 표에 전달한다", () => {
    render(
      <AdminTableFrame label="영역" aria-label="표 이름">
        <tbody />
      </AdminTableFrame>,
    );
    expect(screen.getByRole("table", { name: "표 이름" })).toBeTruthy();
  });
});

describe("AdminTableFrame 끝단 그림자", () => {
  test("처음 위치에서는 오른쪽만 보인다", () => {
    const { container } = renderFrame();
    const region = screen.getByRole("region");
    setScroll(region, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 0 });
    expect(edge(container, "left")).toBe("false");
    expect(edge(container, "right")).toBe("true");
  });

  test("중간 위치에서는 양쪽이 보인다", () => {
    const { container } = renderFrame();
    const region = screen.getByRole("region");
    setScroll(region, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 200 });
    expect(edge(container, "left")).toBe("true");
    expect(edge(container, "right")).toBe("true");
  });

  test("끝 위치에서는 왼쪽만 보인다", () => {
    const { container } = renderFrame();
    const region = screen.getByRole("region");
    setScroll(region, { scrollWidth: 1000, clientWidth: 400, scrollLeft: 600 });
    expect(edge(container, "left")).toBe("true");
    expect(edge(container, "right")).toBe("false");
  });

  test("넘치지 않으면 양쪽 모두 숨긴다", () => {
    const { container } = renderFrame();
    const region = screen.getByRole("region");
    setScroll(region, { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 });
    expect(edge(container, "left")).toBe("false");
    expect(edge(container, "right")).toBe("false");
  });

  test("그림자는 보조기술에서 숨기고 포인터를 가로채지 않는다", () => {
    const { container } = renderFrame();
    for (const side of ["left", "right"] as const) {
      const el = container.querySelector(`[data-edge="${side}"]`);
      expect(el?.getAttribute("aria-hidden")).toBe("true");
      expect(el?.className).toContain("pointer-events-none");
    }
  });
});
