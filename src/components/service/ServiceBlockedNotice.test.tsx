import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
import ServiceBlockedNotice from "./ServiceBlockedNotice";

const mockApiFetch = vi.fn();

vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({ Authorization: "Bearer student-token" }),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  vi.restoreAllMocks();
});

describe("ServiceBlockedNotice", () => {
  it("기관 제공 안 함은 문구만 보이고 버튼과 구매 링크가 없다", () => {
    render(<ServiceBlockedNotice reason="disabled" />);
    expect(
      screen.getByText("소속 기관에서 제공하지 않는 서비스예요."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("기타 소속은 안내와 소속코드 입력 버튼을 보이고 누르면 모달이 열린다", () => {
    render(<ServiceBlockedNotice reason="catch_all" />);
    expect(
      screen.getByText("소속코드를 입력하면 서비스를 이용할 수 있어요."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "소속코드 입력" }));
    expect(screen.getByLabelText("소속코드")).toBeInTheDocument();
  });

  it("옮기기를 마치면 이용권 조회를 다시 하고 onJoined 를 부른다", async () => {
    mockApiFetch
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, name: "가나중학교", orgType: "학교" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, tenantName: "가나중학교" }),
      );
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);
    const onJoined = vi.fn();
    render(<ServiceBlockedNotice reason="catch_all" onJoined={onJoined} />);
    fireEvent.click(screen.getByRole("button", { name: "소속코드 입력" }));
    fireEvent.change(screen.getByLabelText("소속코드"), {
      target: { value: "ABC23456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await screen.findByText("가나중학교");
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고1" },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(onJoined).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["entitlement"] });
  });
});
