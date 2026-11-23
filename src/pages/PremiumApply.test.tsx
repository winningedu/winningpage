// 위닝에듀 프리미엄 이용 화면의 문구를 고정한다. 이용안내(스쿨멘토) 화면이 같은
// 컴포넌트를 쓰게 되어도 위닝에듀 출력은 바뀌지 않아야 한다.
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/apiFetch", () => ({ getAuthHeader: async () => ({}) }));

vi.mock("@/components/premiumBook/usePremiumBookPages", () => ({
  usePremiumBookPages: () => ({
    pages: [],
    loading: false,
    error: null,
    retry: () => {},
  }),
}));

const { default: PremiumApply } = await import("./PremiumApply");

function renderPage() {
  return render(
    <MemoryRouter>
      <PremiumApply />
    </MemoryRouter>,
  );
}

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText("예 : 홍길동"), {
    target: { value: "홍길동" },
  });
  fireEvent.change(screen.getByPlaceholderText("010-0000-0000"), {
    target: { value: "010-1234-5678" },
  });
  fireEvent.change(screen.getByLabelText("이용하고 싶으신 서비스 *"), {
    target: { value: "대입컨설팅 프로그램" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "상담 신청하기" }));
}

describe("PremiumApply 상담 신청 이벤트", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("접수가 성공하면 consult_apply 이벤트를 보낸다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
    );
    renderPage();

    fillAndSubmit();

    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith("consult_apply"),
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("접수가 실패하면 보내지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ ok: false, error: "실패" }),
      }),
    );
    renderPage();

    fillAndSubmit();

    expect(await screen.findByText("실패")).toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe("PremiumApply (위닝에듀)", () => {
  it("히어로와 상담 신청 머리말이 프리미엄 문구 그대로다", () => {
    renderPage();

    expect(screen.getByText("프리미엄 이용")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "위닝에듀만의 프리미엄 서비스를 확인해보세요",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("문의")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "프리미엄 서비스 상담 신청하기",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "문의사항을 남겨주시면 위닝에듀 팀이 확인 후 연락드립니다.",
      ),
    ).toBeInTheDocument();
  });

  it("책자 뷰어 접근성 이름이 프리미엄 안내 책자 그대로다", () => {
    renderPage();

    expect(
      screen.getByRole("group", { name: "프리미엄 안내 책자" }),
    ).toBeInTheDocument();
  });

  it("이메일 예시와 서비스 선택지가 프리미엄 6종이다", () => {
    renderPage();

    expect(
      screen.getByPlaceholderText("example@winningedu.com"),
    ).toBeInTheDocument();
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "이용 서비스 선택",
      "대입컨설팅 프로그램",
      "특목고입학 프로그램",
      "대학원입학 프로그램",
      "해외명문대 진학컨설팅",
      "국제학교 학습관리",
      "국제・해외고 국내대 입학컨설팅",
    ]);
  });
});
