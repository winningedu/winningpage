// 리포트 표지 실측 데모 - 표지를 로컬에서 반복 실측하는 개발 전용 화면.
import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getReportAccessToken } from "@/lib/report/downloadReportPdf";
import demoRoutes from "@/routes/demoRoutes";
import ReportCoverDemo from "./ReportCoverDemo";

vi.mock("@/lib/report/downloadReportPdf", () => ({
  downloadReportPdf: vi.fn(),
  getReportAccessToken: vi.fn(),
}));

function renderDemo() {
  // 앱 루트에 ToastProvider 가 없으므로 바깥 provider 없이 그린다.
  return render(<ReportCoverDemo />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ReportCoverDemo", () => {
  it("바깥 ToastProvider 없이 그려도 던지지 않는다", () => {
    expect(() => renderDemo()).not.toThrow();
  });

  it("기본 종류(학습진단) 표지를 렌더한다", () => {
    renderDemo();

    expect(screen.getByLabelText("학습진단 리포트 표지")).toBeInTheDocument();
    expect(screen.getByText("LEARNING DIAGNOSIS REPORT")).toBeInTheDocument();
  });

  it("종류를 바꾸면 표지의 영문 라벨이 바뀐다", () => {
    renderDemo();

    fireEvent.change(screen.getByLabelText("종류"), {
      target: { value: "selfeval" },
    });

    expect(screen.getByText("SELF EVALUATION REPORT")).toBeInTheDocument();
    expect(
      screen.queryByText("LEARNING DIAGNOSIS REPORT"),
    ).not.toBeInTheDocument();
  });

  it("학생명 빼기를 켜면 학생명 칸이 사라진다", () => {
    renderDemo();
    expect(screen.getByText("학생명")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("학생명 빼기"));

    expect(screen.queryByText("학생명")).not.toBeInTheDocument();
    expect(screen.getByText("학년")).toBeInTheDocument();
  });

  it("flow 표지가 미리보기 영역 안에서 화면에 보이도록 데모 규칙을 건다", () => {
    const { container } = renderDemo();

    const preview = screen.getByTestId("cover-preview");
    expect(
      within(preview).getByLabelText("학습진단 리포트 표지"),
    ).toBeInTheDocument();
    const css = Array.from(container.querySelectorAll("style"))
      .map((node) => node.textContent ?? "")
      .join("\n");
    expect(css).toMatch(/\.fd-report-cover-flow[^}]*display:\s*block/);
  });

  it("a4 방식을 고르면 표지가 fd-report-sheet 시트로 그려진다", () => {
    renderDemo();

    fireEvent.change(screen.getByLabelText("방식"), {
      target: { value: "a4" },
    });

    expect(screen.getByLabelText("학습진단 리포트 표지")).toHaveClass(
      "fd-report-sheet",
    );
  });

  it("표지 뒤 더미 본문을 켜면 인쇄 영역 안 표지 다음에 더미 본문이 생긴다", () => {
    renderDemo();
    expect(screen.queryByTestId("dummy-body")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("표지 뒤 더미 본문 1장"));

    const dummy = screen.getByTestId("dummy-body");
    expect(screen.getByTestId("print-root")).toContainElement(dummy);
  });

  it("조작 패널은 인쇄 영역 밖에 있다", () => {
    renderDemo();

    expect(screen.getByTestId("print-root")).not.toContainElement(
      screen.getByLabelText("종류"),
    );
  });

  it("서버 PDF 는 로그인 세션이 없으면 화면에 실패 메시지를 보인다", async () => {
    vi.mocked(getReportAccessToken).mockResolvedValue(null);
    renderDemo();

    fireEvent.click(screen.getByRole("button", { name: "서버 PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("로그인");
  });

  it("파일83 이미지를 고르면 미리보기에 겹치고 투명도를 조절하며 언마운트 때 해제한다", () => {
    const createObjectURL = vi.fn(() => "blob:file83");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const { unmount } = renderDemo();
    expect(screen.queryByAltText("파일83 겹침")).not.toBeInTheDocument();

    const file = new File(["x"], "file83.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("파일83 이미지"), {
      target: { files: [file] },
    });

    const overlay = screen.getByAltText("파일83 겹침");
    expect(overlay).toHaveAttribute("src", "blob:file83");
    expect(screen.getByTestId("cover-preview")).toContainElement(overlay);
    expect(screen.getByTestId("print-root")).not.toContainElement(overlay);

    fireEvent.change(screen.getByLabelText("겹침 투명도"), {
      target: { value: "30" },
    });
    expect(overlay).toHaveStyle({ opacity: "0.3" });

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:file83");
  });

  it("미리보기에 이미지를 끌어다 놓아도 겹침이 생긴다", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:dropped",
      revokeObjectURL: vi.fn(),
    });
    renderDemo();

    const file = new File(["x"], "file83.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("cover-preview"), {
      dataTransfer: { files: [file] },
    });

    await waitFor(() =>
      expect(screen.getByAltText("파일83 겹침")).toHaveAttribute(
        "src",
        "blob:dropped",
      ),
    );
  });

  it("DEV 에서는 /demo/report-cover 라우트가 목록에 있다", () => {
    expect(demoRoutes.map((route) => route.path)).toContain(
      "/demo/report-cover",
    );
  });

  it("a4 방식에서만 학습진단 인쇄 페이지 규칙을 마운트한다", () => {
    const { container } = renderDemo();
    const hasPageRule = () =>
      Array.from(container.querySelectorAll("style")).some((node) =>
        (node.textContent ?? "").includes("font-size: 3mm"),
      );
    expect(hasPageRule()).toBe(false);

    fireEvent.change(screen.getByLabelText("방식"), {
      target: { value: "a4" },
    });

    expect(hasPageRule()).toBe(true);
  });

  it("미리보기 배율 기본값은 화면 맞춤이고 무대에 맞춤 클래스가 걸린다", () => {
    renderDemo();

    expect(screen.getByLabelText("미리보기 배율")).toHaveValue("fit");
    expect(
      screen.getByRole("option", { name: "화면 맞춤" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cover-preview")).toHaveClass("rcd-fit");
  });

  it("고정 배율을 고르면 맞춤 클래스가 빠지고 zoom 이 걸린다", () => {
    renderDemo();

    fireEvent.change(screen.getByLabelText("미리보기 배율"), {
      target: { value: "75" },
    });

    const preview = screen.getByTestId("cover-preview");
    expect(preview).not.toHaveClass("rcd-fit");
    expect(preview.style.zoom).toBe("0.75");
  });
});
