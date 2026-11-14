// 스쿨멘토 이용신청 > 이용안내 화면. 프리미엄 이용 화면과 같은 틀에 안내서 뷰어와
// 도입 문의 폼을 두고, 위닝에듀 전용 문구는 쓰지 않는다.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/premiumBook/usePremiumBookPages", () => ({
  usePremiumBookPages: () => ({
    pages: [{ id: 1, sort_order: 1, image_url: "https://x.test/p01.webp" }],
    loading: false,
    error: null,
    retry: () => {},
  }),
}));
vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({}),
}));

const { default: UsageGuide } = await import("./UsageGuide");

function renderPage() {
  return render(
    <MemoryRouter>
      <UsageGuide />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UsageGuide (스쿨멘토)", () => {
  it("문의 머리말은 그대로 두고 제목과 문장을 이용안내 문구로 바꾼다", () => {
    renderPage();

    expect(screen.getByText("문의")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "이용방법 세부 문의하기 및 서비스 도입 신청하기",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "문의사항을 남겨주시면 관련 팀이 확인후 연락 또는 메일회신 드립니다",
      ),
    ).toBeInTheDocument();
  });

  it("히어로는 이용안내 문구이고 프리미엄과 위닝에듀 문구가 없다", () => {
    const { container } = renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: /이용 방법/ }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/프리미엄|위닝/);
    expect(
      screen.queryByPlaceholderText(/winningedu\.com/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "학생 사용 안내서" }),
    ).toBeInTheDocument();
  });

  it("서비스 선택지는 스쿨멘토 서비스 6종이다", () => {
    renderPage();

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      "이용 서비스 선택",
      "학습진단",
      "목표관리",
      "성장설계",
      "수행평가",
      "심화탐구",
      "자기평가",
    ]);
  });

  it("제출하면 프리미엄 상담과 같은 /api/create-consult-request 로 보낸다", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("예 : 홍길동"), {
      target: { value: "김교사" },
    });
    fireEvent.change(screen.getByPlaceholderText("010-0000-0000"), {
      target: { value: "01012345678" },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "목표관리" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "상담 신청하기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/create-consult-request");
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: "김교사",
      phone: "010-1234-5678",
      service: "목표관리",
      agree: true,
    });
  });
});
