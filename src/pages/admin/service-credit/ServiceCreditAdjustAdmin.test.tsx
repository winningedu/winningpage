import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { ROWS, renderCredit, STUDENT_ID, SUMMARY, searchBody } from "./testKit";

const SUMMARY_PATH = "admin/service-credit-summary";
const ADJUST_PATH = "admin/service-credit-adjust";
const SEARCH_PATH = "admin/students/search";
const STUDENT_URL = `/admin/serviceCreditAdjust/${STUDENT_ID}`;

beforeEach(() => {
  resetApi();
  on(
    "GET",
    SEARCH_PATH,
    searchBody([{ id: STUDENT_ID, name: "김학생", email: "kim@example.com" }]),
  );
  on("GET", SUMMARY_PATH, SUMMARY);
});

async function openStudent() {
  const view = renderCredit(STUDENT_URL);
  await screen.findByText("위닝 성장설계");
  return view;
}

async function applyOnGrowth(delta: string, reason: string) {
  const growth = screen.getByRole("row", { name: /위닝 성장설계/ });
  fireEvent.change(within(growth).getByLabelText("조정 횟수"), {
    target: { value: delta },
  });
  fireEvent.change(within(growth).getByLabelText("사유"), {
    target: { value: reason },
  });
  fireEvent.click(within(growth).getByRole("button", { name: "적용" }));
  return growth;
}

describe("ServiceCreditAdjustAdmin 검색", () => {
  test("학생 검색은 서비스이용횟수조정 구분으로 학생 검색 API 를 부르고 결과를 보여 준다", async () => {
    renderCredit();
    fireEvent.change(screen.getByPlaceholderText("이름 또는 이메일"), {
      target: { value: "김" },
    });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(
      await screen.findByRole("button", { name: /김학생/ }),
    ).toBeInTheDocument();
    expect(callsTo("GET", SEARCH_PATH)[0]?.options).toMatchObject({
      searchParams: { q: "김", section: "serviceCreditAdjust" },
      signal: expect.any(AbortSignal),
    });
  });

  test("검색어는 주소의 q 에 남아 새로고침해도 결과가 다시 나온다", async () => {
    const { router } = renderCredit("/admin/serviceCreditAdjust?q=김");

    expect(
      await screen.findByRole("button", { name: /김학생/ }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("이름 또는 이메일")).toHaveValue("김");
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
      "김",
    );
  });

  test("결과를 고르면 학생 주소로 이동하며 검색어를 달고 간다", async () => {
    const { router } = renderCredit("/admin/serviceCreditAdjust?q=김");
    fireEvent.click(await screen.findByRole("button", { name: /김학생/ }));

    await screen.findByText("위닝 성장설계");
    expect(router.state.location.pathname).toBe(STUDENT_URL);
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe(
      "김",
    );
    expect(callsTo("GET", SUMMARY_PATH)[0]?.options).toMatchObject({
      searchParams: { profileId: STUDENT_ID },
      signal: expect.any(AbortSignal),
    });
  });

  test("검색 결과가 없으면 안내한다", async () => {
    on("GET", SEARCH_PATH, searchBody([]));
    renderCredit("/admin/serviceCreditAdjust?q=없음");
    expect(
      await screen.findByText("검색 결과가 없습니다."),
    ).toBeInTheDocument();
  });

  test("검색이 실패하면 서버 안내를 alert 로 보인다", async () => {
    on("GET", SEARCH_PATH, () => {
      throw new FakeApiError(403, "FORBIDDEN", "권한이 없습니다.");
    });
    renderCredit("/admin/serviceCreditAdjust?q=김");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "권한이 없습니다.",
    );
  });

  test("관리자 계정이 검색되면 결과 행에 관리자 배지를 보여준다", async () => {
    on(
      "GET",
      SEARCH_PATH,
      searchBody([
        {
          id: STUDENT_ID,
          name: "총괄관리자",
          email: "a@example.com",
          isAdmin: true,
        },
      ]),
    );
    renderCredit("/admin/serviceCreditAdjust?q=총괄");
    const row = await screen.findByRole("button", { name: /총괄관리자/ });
    expect(within(row).getByText("관리자")).toBeInTheDocument();
  });

  test("제목이 학생 검색 입력보다 앞에 온다", () => {
    renderCredit();
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
    renderCredit();
    expect(
      screen.getByText(
        "이 메뉴에서 적용한 조정은 학생의 서비스 이용횟수에 즉시 반영됩니다.",
      ),
    ).toBeInTheDocument();
  });

  test("알 수 없는 하위 주소는 검색 화면으로 돌아간다", async () => {
    const { router } = renderCredit("/admin/serviceCreditAdjust/a/b");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/serviceCreditAdjust"),
    );
  });
});

describe("ServiceCreditAdjustAdmin 학생 화면", () => {
  test("주소로 바로 열면 학생 이름과 이메일, 6개 서비스의 총/사용/잔여를 보여준다", async () => {
    renderCredit(STUDENT_URL);

    expect(
      await screen.findByText("김학생 님의 서비스 이용횟수"),
    ).toBeInTheDocument();
    expect(screen.getByText("kim@example.com")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(7);
    const growth = screen.getByRole("row", { name: /위닝 성장설계/ });
    expect(within(growth).getByText("5")).toBeInTheDocument();
    expect(within(growth).getByText("2")).toBeInTheDocument();
    expect(within(growth).getByText("3")).toBeInTheDocument();
    expect(callsTo("GET", SEARCH_PATH)).toHaveLength(0);
  });

  test("열 머리글은 scope col 을 가진다", async () => {
    await openStudent();
    expect(
      screen.getByRole("columnheader", { name: "서비스" }),
    ).toHaveAttribute("scope", "col");
  });

  test("회원이 없으면 서버 안내를 alert 로 보이고 표는 없다", async () => {
    on("GET", SUMMARY_PATH, () => {
      throw new FakeApiError(
        404,
        "PROFILE_NOT_FOUND",
        "회원을 찾을 수 없습니다.",
      );
    });
    renderCredit(STUDENT_URL);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "회원을 찾을 수 없습니다.",
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  test("불러오는 동안 상태를 알린다", async () => {
    on("GET", SUMMARY_PATH, () => new Promise(() => {}));
    renderCredit(STUDENT_URL);
    expect(
      await screen.findByRole("status", {
        name: "서비스 이용횟수를 불러오는 중",
      }),
    ).toBeInTheDocument();
  });

  test("차감 입력은 확인 단계를 거친 뒤 delta 와 사유로 API 를 호출하고 그 행만 바꾼다", async () => {
    on("POST", ADJUST_PATH, {
      credit: { ...ROWS[2], quotaUsed: 3, quotaRemaining: 2 },
    });
    await openStudent();
    const growth = await applyOnGrowth("-1", "실수 복구");

    expect(callsTo("POST", ADJUST_PATH)).toHaveLength(0);
    fireEvent.click(within(growth).getByRole("button", { name: "확인" }));

    await waitFor(() =>
      expect(callsTo("POST", ADJUST_PATH)[0]?.options.json).toEqual({
        profileId: STUDENT_ID,
        programKey: "growth",
        delta: -1,
        reason: "실수 복구",
      }),
    );
    expect(await screen.findByText(/적용했습니다. 잔여 2/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /위닝 성장설계/ })).getByText("3"),
    ).toBeInTheDocument();
    expect(callsTo("GET", SUMMARY_PATH)).toHaveLength(1);
  });

  test("요청이 진행 중이면 확인과 취소 버튼이 비활성이다", async () => {
    on("POST", ADJUST_PATH, () => new Promise(() => {}));
    await openStudent();
    const growth = await applyOnGrowth("2", "보상 지급");
    fireEvent.click(within(growth).getByRole("button", { name: "확인" }));

    await waitFor(() =>
      expect(
        within(growth).getByRole("button", { name: "확인" }),
      ).toBeDisabled(),
    );
    expect(within(growth).getByRole("button", { name: "취소" })).toBeDisabled();
    expect(callsTo("POST", ADJUST_PATH)).toHaveLength(1);
  });

  test("사유가 없으면 확인 단계로 가지 않고 안내한다", async () => {
    await openStudent();
    const growth = await applyOnGrowth("2", "");
    expect(screen.getByText(/사유를 2자 이상/)).toBeInTheDocument();
    expect(within(growth).queryByRole("button", { name: "확인" })).toBeNull();
  });

  test("기간형 서비스는 개월 수를 받고 delta 는 1 로 보낸다", async () => {
    on("POST", ADJUST_PATH, { credit: ROWS[1] });
    await openStudent();
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
      expect(callsTo("POST", ADJUST_PATH)[0]?.options.json).toEqual({
        profileId: STUDENT_ID,
        programKey: "target",
        delta: 1,
        months: 3,
        reason: "보상 연장",
      }),
    );
  });

  test("서버가 거부하면 서버 안내를 보여주고 표를 바꾸지 않는다", async () => {
    on("POST", ADJUST_PATH, () => {
      throw new FakeApiError(
        409,
        "INSUFFICIENT_QUOTA",
        "잔여 3회보다 많이 차감할 수 없습니다.",
      );
    });
    await openStudent();
    const growth = await applyOnGrowth("-9", "실수 복구");
    fireEvent.click(within(growth).getByRole("button", { name: "확인" }));

    expect(
      await screen.findByText("잔여 3회보다 많이 차감할 수 없습니다."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /위닝 성장설계/ })).getByText("2"),
    ).toBeInTheDocument();
  });
});
