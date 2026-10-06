import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { stepMock } = vi.hoisted(() => ({ stepMock: vi.fn() }));

vi.mock("@/components/selfeval/SelfevalShellContext", () => ({
  useSelfevalScreenStep: stepMock,
}));

import AnalysisPage from "./AnalysisPage";
import ArchivePage from "./ArchivePage";
import DonePage from "./DonePage";
import ResultPage from "./ResultPage";
import VerifyPage from "./VerifyPage";

beforeEach(() => stepMock.mockClear());

// P6 가 본문을 채우기 전까지 제목과 사이드바 단계 알림만 보장한다.
describe("P6 자리 표시 페이지", () => {
  test.each([
    ["분석한 내용이 맞는지 봐주세요", AnalysisPage, 4],
    ["자기평가서가 완성됐습니다", ResultPage, 5],
    ["검증 결과", VerifyPage, 6],
    ["최종본을 저장했습니다", DonePage, 6],
    ["보관함", ArchivePage, null],
  ] as const)("%s 제목을 그리고 단계 %s 를 알린다", (title, Page, step) => {
    render(<Page />);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(stepMock).toHaveBeenCalledWith(step);
  });
});
