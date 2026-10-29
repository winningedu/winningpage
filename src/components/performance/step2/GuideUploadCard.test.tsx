import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import GuideUploadCard from "./GuideUploadCard";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("GuideUploadCard PDF", () => {
  test("파일 선택 accept에 application/pdf가 포함된다", () => {
    const { container } = render(<GuideUploadCard />);
    expect(fileInput(container).accept.split(",")).toContain("application/pdf");
  });

  test("PDF를 고르면 이미지 대신 PDF 아이콘과 파일명으로 미리보기한다", async () => {
    const { container } = render(<GuideUploadCard />);
    const pdf = new File(["%PDF-1.4"], "수행평가-안내.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(fileInput(container), { target: { files: [pdf] } });

    expect(await screen.findByText("수행평가-안내.pdf")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("pdf-thumb-icon")).toBeInTheDocument(),
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
