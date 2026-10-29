import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({
  searchStudents: vi.fn(),
  fetchServiceCredits: vi.fn(),
  postServiceCreditAdjust: vi.fn(),
}));

import * as api from "./api";
import ServiceCreditAdjustAdmin from "./ServiceCreditAdjustAdmin";

const PID = "123e4567-e89b-42d3-a456-426614174000";

function creditRow(
  programKey: string,
  label: string,
  over: Record<string, unknown> = {},
) {
  return {
    programKey,
    label,
    periodBased: programKey === "target",
    liveCount: 0,
    quotaTotal: 0,
    quotaUsed: 0,
    quotaRemaining: 0,
    expiresAt: null,
    ...over,
  };
}

const ROWS = [
  creditRow("diagnose", "학습진단 서비스"),
  creditRow("target", "목표관리 서비스"),
  creditRow("growth", "위닝 성장설계", {
    liveCount: 1,
    quotaTotal: 5,
    quotaUsed: 2,
    quotaRemaining: 3,
    expiresAt: "2027-01-01T00:00:00.000Z",
  }),
  creditRow("suhaeng", "AI 수행평가 서비스"),
  creditRow("inquiry", "위닝 심화탐구"),
  creditRow("selfeval", "위닝 자기평가서"),
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.searchStudents).mockResolvedValue({
    ok: true,
    data: [{ id: PID, name: "김학생", email: "kim@example.com" }],
  });
  vi.mocked(api.fetchServiceCredits).mockResolvedValue({
    ok: true,
    data: ROWS,
  });
});

async function selectStudent() {
  render(<ServiceCreditAdjustAdmin config={{ title: "서비스이용횟수조정" }} />);
  fireEvent.change(screen.getByPlaceholderText("이름 또는 이메일"), {
    target: { value: "김" },
  });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  fireEvent.click(await screen.findByRole("button", { name: /김학생/ }));
  await screen.findByText("위닝 성장설계");
}

describe("ServiceCreditAdjustAdmin", () => {
  test("학생을 검색해 고르면 6개 서비스의 총/사용/잔여를 표로 보여준다", async () => {
    await selectStudent();
    expect(api.searchStudents).toHaveBeenCalledWith("김");
    expect(api.fetchServiceCredits).toHaveBeenCalledWith(PID);
    expect(screen.getAllByRole("row")).toHaveLength(7);
    const growth = screen.getByRole("row", { name: /위닝 성장설계/ });
    expect(within(growth).getByText("5")).toBeTruthy();
    expect(within(growth).getByText("2")).toBeTruthy();
    expect(within(growth).getByText("3")).toBeTruthy();
  });

  test("차감 입력은 확인 단계를 거친 뒤 delta 와 사유로 API 를 호출한다", async () => {
    vi.mocked(api.postServiceCreditAdjust).mockResolvedValue({
      ok: true,
      data: {
        credit: {
          ...ROWS[2],
          quotaUsed: 3,
          quotaRemaining: 2,
        },
      },
    } as never);
    await selectStudent();
    const growth = screen.getByRole("row", { name: /위닝 성장설계/ });
    fireEvent.change(within(growth).getByLabelText("조정 횟수"), {
      target: { value: "-1" },
    });
    fireEvent.change(within(growth).getByLabelText("사유"), {
      target: { value: "실수 복구" },
    });
    fireEvent.click(within(growth).getByRole("button", { name: "적용" }));

    expect(api.postServiceCreditAdjust).not.toHaveBeenCalled();
    fireEvent.click(within(growth).getByRole("button", { name: "확인" }));

    await waitFor(() =>
      expect(api.postServiceCreditAdjust).toHaveBeenCalledWith({
        profileId: PID,
        programKey: "growth",
        delta: -1,
        reason: "실수 복구",
      }),
    );
    expect(await screen.findByText(/적용했습니다/)).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /위닝 성장설계/ })).getByText("2"),
    ).toBeTruthy();
  });

  test("사유가 없으면 확인 단계로 가지 않고 안내한다", async () => {
    await selectStudent();
    const growth = screen.getByRole("row", { name: /위닝 성장설계/ });
    fireEvent.change(within(growth).getByLabelText("조정 횟수"), {
      target: { value: "2" },
    });
    fireEvent.click(within(growth).getByRole("button", { name: "적용" }));
    expect(screen.getByText(/사유를 2자 이상/)).toBeTruthy();
    expect(within(growth).queryByRole("button", { name: "확인" })).toBeNull();
  });

  test("기간형 서비스는 개월 수를 받고 delta 는 1 로 보낸다", async () => {
    vi.mocked(api.postServiceCreditAdjust).mockResolvedValue({
      ok: true,
      data: { credit: ROWS[1] },
    } as never);
    await selectStudent();
    const target = screen.getByRole("row", { name: /목표관리 서비스/ });
    expect(within(target).queryByLabelText("조정 횟수")).toBeNull();
    fireEvent.change(within(target).getByLabelText("기간(개월)"), {
      target: { value: "3" },
    });
    fireEvent.change(within(target).getByLabelText("사유"), {
      target: { value: "보상 연장" },
    });
    fireEvent.click(within(target).getByRole("button", { name: "적용" }));
    fireEvent.click(within(target).getByRole("button", { name: "확인" }));
    await waitFor(() =>
      expect(api.postServiceCreditAdjust).toHaveBeenCalledWith({
        profileId: PID,
        programKey: "target",
        delta: 1,
        months: 3,
        reason: "보상 연장",
      }),
    );
  });

  test("서버가 거부하면 메시지를 보여주고 표를 바꾸지 않는다", async () => {
    vi.mocked(api.postServiceCreditAdjust).mockResolvedValue({
      ok: false,
      message: "잔여 3회보다 많이 차감할 수 없습니다.",
    });
    await selectStudent();
    const growth = screen.getByRole("row", { name: /위닝 성장설계/ });
    fireEvent.change(within(growth).getByLabelText("조정 횟수"), {
      target: { value: "-9" },
    });
    fireEvent.change(within(growth).getByLabelText("사유"), {
      target: { value: "실수 복구" },
    });
    fireEvent.click(within(growth).getByRole("button", { name: "적용" }));
    fireEvent.click(within(growth).getByRole("button", { name: "확인" }));
    expect(
      await screen.findByText("잔여 3회보다 많이 차감할 수 없습니다."),
    ).toBeTruthy();
  });

  test("관리자 계정이 검색되면 결과 행에 관리자 배지를 보여준다", async () => {
    vi.mocked(api.searchStudents).mockResolvedValue({
      ok: true,
      data: [
        {
          id: PID,
          name: "총괄관리자",
          email: "admin@example.com",
          isAdmin: true,
        },
      ],
    });
    render(
      <ServiceCreditAdjustAdmin config={{ title: "서비스이용횟수조정" }} />,
    );
    fireEvent.change(screen.getByPlaceholderText("이름 또는 이메일"), {
      target: { value: "총괄" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    const row = await screen.findByRole("button", { name: /총괄관리자/ });
    expect(within(row).getByText("관리자")).toBeTruthy();
  });
  test("제목이 학생 검색 입력보다 앞에 온다", () => {
    render(
      <ServiceCreditAdjustAdmin config={{ title: "서비스이용횟수조정" }} />,
    );
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "서비스이용횟수조정",
    });
    const input = screen.getByPlaceholderText("이름 또는 이메일");
    expect(
      heading.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("제목 아래에 조정 즉시 반영 안내문을 보여준다", () => {
    render(
      <ServiceCreditAdjustAdmin config={{ title: "서비스이용횟수조정" }} />,
    );
    expect(
      screen.getByText(
        "이 메뉴에서 적용한 조정은 학생의 서비스 이용횟수에 즉시 반영됩니다.",
      ),
    ).toBeTruthy();
  });
});
