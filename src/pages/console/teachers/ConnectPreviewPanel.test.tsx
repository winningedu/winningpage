// W14 학생 가입 연결 미리보기(교 #119, 결정 6). 학생 한 명의 값으로 가입 결과를 시험하고 결과 문구를 아래 줄에 보인다.

import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { renderRoutes, stubApi } from "../testUtils";
import ConnectPreviewPanel from "./ConnectPreviewPanel";

const BASE =
  "/api/console/teachers/connect-preview?name=%EA%B9%80%EC%84%9C%EC%97%B0&grade=%EA%B3%A02&className=3%EB%B0%98&number=12";

function open() {
  renderRoutes([{ path: "/", element: <ConnectPreviewPanel /> }], "/");
}

function fillAll() {
  fireEvent.change(screen.getByLabelText("이름"), {
    target: { value: "김서연" },
  });
  fireEvent.change(screen.getByLabelText("학년그룹"), {
    target: { value: "고2" },
  });
  fireEvent.change(screen.getByLabelText("반"), { target: { value: "3반" } });
  fireEvent.change(screen.getByLabelText("번호"), { target: { value: "12" } });
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("W14 학생 가입 연결 미리보기", () => {
  it("값이 다 차야 확인할 수 있고 정상 연결이면 담임 이름과 함께 알린다", async () => {
    const calls = stubApi({
      "GET /api/console/groups": { body: { groups: [] } },
      [`GET ${BASE}`]: { body: { result: "ok", homeroomName: "박지훈" } },
    });
    open();

    const check = screen.getByRole("button", { name: "확인" });
    expect((check as HTMLButtonElement).disabled).toBe(true);
    fillAll();
    fireEvent.click(check);

    expect(
      await screen.findByText("정상 연결돼요. 박지훈 선생님 반으로 이어져요"),
    ).toBeTruthy();
    expect(calls.some((c) => c.key === `GET ${BASE}`)).toBe(true);
  });

  it("번호를 다른 학생이 쓰면 가린 이름과 함께 고치는 법을 알린다", async () => {
    stubApi({
      "GET /api/console/groups": { body: { groups: [] } },
      [`GET ${BASE}`]: {
        body: {
          result: "number_taken",
          homeroomName: "박지훈",
          holderName: "한*우",
        },
      },
    });
    open();

    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(
      await screen.findByText(
        "번호 사용 중이에요. 한*우 학생이 쓰고 있어요. 다른 번호로 가입하도록 안내해 주세요",
      ),
    ).toBeTruthy();
  });

  it("이미 가입한 학생과 없는 학급도 각각 알린다", async () => {
    stubApi({
      "GET /api/console/groups": { body: { groups: [] } },
      [`GET ${BASE}`]: {
        body: { result: "already_signed_up", homeroomName: "박지훈" },
      },
    });
    open();

    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(await screen.findByText("이미 가입한 학생이에요")).toBeTruthy();

    stubApi({
      "GET /api/console/groups": { body: { groups: [] } },
      [`GET ${BASE}`]: { body: { result: "no_class" } },
    });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(
      await screen.findByText(
        "등록되지 않은 학급이에요. 학년그룹과 반을 확인해 주세요",
      ),
    ).toBeTruthy();
  });

  it("읽지 못하면 오류 문구를 보인다", async () => {
    stubApi({ "GET /api/console/groups": { body: { groups: [] } } });
    open();

    fillAll();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(
      await screen.findByText("연결 결과를 불러오지 못했어요"),
    ).toBeTruthy();
  });
});
