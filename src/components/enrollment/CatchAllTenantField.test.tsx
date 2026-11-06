// 마이페이지 소속 칸의 기타 소속 변형(결정 96): 기관 이름 옆에 '소속코드 입력' 버튼을 두고 모달을 연다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CatchAllTenantField from "./CatchAllTenantField";

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
});

describe("CatchAllTenantField", () => {
  it("소속 이름과 소속코드 입력 버튼을 보이고, 누르면 모달이 열린다", () => {
    render(<CatchAllTenantField tenantName="기타" onJoined={() => {}} />);

    expect(screen.getByDisplayValue("기타")).toBeInTheDocument();
    expect(screen.queryByLabelText("소속코드")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "소속코드 입력" }));

    expect(screen.getByLabelText("소속코드")).toBeInTheDocument();
  });

  it("옮기기를 마치면 새 기관 이름을 넘기고 모달이 닫힌다", async () => {
    mockApiFetch
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, name: "가나중학교", orgType: "학교" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, tenantName: "가나중학교" }),
      );
    const onJoined = vi.fn();
    render(<CatchAllTenantField tenantName="기타" onJoined={onJoined} />);
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

    await waitFor(() => expect(onJoined).toHaveBeenCalledWith("가나중학교"));
    await waitFor(() =>
      expect(screen.queryByLabelText("학년")).not.toBeInTheDocument(),
    );
  });
});
