// 마이페이지 위쪽 학급 입력 안내(사 #109). 올해 학적에 학급이 없는 스쿨멘토 학생에게만 보인다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SelfAssignPrompt from "./SelfAssignPrompt";
import { useMyEnrollment } from "./useMyEnrollment";

const state = vi.hoisted(() => ({ studentEnrollment: true }));
const mockApiFetch = vi.fn();

vi.mock("@/config/site", () => ({
  site: {
    features: {
      get studentEnrollment() {
        return state.studentEnrollment;
      },
    },
  },
}));

vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({ Authorization: "Bearer student-token" }),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// MyPage 가 학적을 한 번 읽어 내려 주는 모양을 흉내 낸다.
function Harness() {
  return <SelfAssignPrompt {...useMyEnrollment()} />;
}

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body };
}

const meBody = (className: string | null, number: number | null) => ({
  ok: true,
  orgType: "학교",
  enrollment: {
    schoolYear: 2026,
    grade: "고3",
    groupName: null,
    className,
    number,
  },
  pending: null,
});

beforeEach(() => {
  state.studentEnrollment = true;
  mockApiFetch.mockReset();
});

describe("SelfAssignPrompt", () => {
  it("학급이 없으면 입력 안내와 학년이 채워진 폼을 보인다", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(200, meBody(null, null)));
    render(<Harness />);

    expect(
      await screen.findByText("새 학년의 반과 번호를 입력해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("학년")).toHaveValue("고3");
  });

  it("입력을 마치면 다시 불러와 안내가 사라진다", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(200, meBody(null, null)))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, meBody("5", 12)));
    render(<Harness />);
    await screen.findByText("새 학년의 반과 번호를 입력해 주세요.");

    fireEvent.change(screen.getByLabelText("반"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("번호"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() =>
      expect(
        screen.queryByText("새 학년의 반과 번호를 입력해 주세요."),
      ).not.toBeInTheDocument(),
    );
  });

  it("학급이 이미 있으면 아무것도 그리지 않는다", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(200, meBody("5", 12)));
    const { container } = render(<Harness />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("기타 소속 학생에게는 학급이 비어 있어도 숨긴다(결정 98.9)", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse(200, { ...meBody(null, null), isCatchAll: true }),
    );
    const { container } = render(<Harness />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("학적 기능이 꺼진 사이트(위닝)는 조회도 하지 않는다", () => {
    state.studentEnrollment = false;
    const { container } = render(<Harness />);

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
