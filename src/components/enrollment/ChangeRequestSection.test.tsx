// 마이페이지 학년, 반, 번호 행(사 #110). 직접 고치지 않고 수정요청으로 담임 승인을 거친다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChangeRequestSection from "./ChangeRequestSection";
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
  return <ChangeRequestSection {...useMyEnrollment()} />;
}

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body };
}

const me = (pending: unknown = null, className: string | null = "3") => ({
  ok: true,
  orgType: "학교",
  enrollment: {
    schoolYear: 2026,
    grade: "고2",
    groupName: null,
    className,
    number: className ? 12 : null,
  },
  pending,
});

beforeEach(() => {
  state.studentEnrollment = true;
  mockApiFetch.mockReset();
});

describe("ChangeRequestSection", () => {
  it("현재 학년, 반, 번호를 읽기 전용으로 보이고 수정요청하기 버튼을 둔다", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(200, me()));
    render(<Harness />);

    expect(await screen.findByText("고2 3반 12번")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "수정요청하기" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("반")).not.toBeInTheDocument();
  });

  it("수정요청하기를 누르면 폼이 열리고 보내면 승인 대기 상태로 바뀐다", async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse(200, me()))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          me({
            grade: "고3",
            groupName: null,
            className: "5",
            number: 7,
            createdAt: "2026-11-06T01:00:00Z",
          }),
        ),
      );
    render(<Harness />);
    fireEvent.click(
      await screen.findByRole("button", { name: "수정요청하기" }),
    );

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고3" },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("번호"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "수정요청하기" }));

    expect(
      await screen.findByText("승인 대기 중: 고3 5반 7번"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "수정요청하기" }),
    ).not.toBeInTheDocument();
  });

  it("이미 열린 신청이 있으면 처음부터 승인 대기 상태로 보인다", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse(
        200,
        me({
          grade: "고3",
          groupName: null,
          className: "5",
          number: 7,
          createdAt: "2026-11-06T01:00:00Z",
        }),
      ),
    );
    render(<Harness />);

    expect(
      await screen.findByText("승인 대기 중: 고3 5반 7번"),
    ).toBeInTheDocument();
  });

  it("반이 비어 있으면 반 미정으로 보이고 요청 버튼은 없다(입력 안내가 맡는다)", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(200, me(null, null)));
    render(<Harness />);

    expect(await screen.findByText("고2 반 미정")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "수정요청하기" }),
    ).not.toBeInTheDocument();
  });

  it("학적 기능이 꺼진 사이트(위닝)는 조회도 하지 않고 그리지 않는다", async () => {
    state.studentEnrollment = false;
    const { container } = render(<Harness />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
