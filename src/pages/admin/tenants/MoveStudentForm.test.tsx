import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("tok"),
}));

import MoveStudentForm from "./MoveStudentForm";

const SCHOOL = {
  id: "t-school",
  name: "가나고",
  orgType: "학교",
  isCatchAll: false,
};
const ACADEMY = {
  id: "t-acad",
  name: "다라학원",
  orgType: "기관",
  isCatchAll: false,
};
const ETC = { id: "t-etc", name: "기타", orgType: "기타", isCatchAll: true };

const fetchMock = vi.fn();

function renderForm(
  tenant = SCHOOL,
  handlers: { onMoved?: () => void; onCancel?: () => void } = {},
) {
  return render(
    <MoveStudentForm
      profileId="p-1"
      tenant={tenant}
      onMoved={handlers.onMoved ?? (() => {})}
      onCancel={handlers.onCancel ?? (() => {})}
    />,
  );
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MoveStudentForm", () => {
  test("학년을 고르기 전에는 옮기기 버튼이 막혀 있다", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "옮기기" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    expect(screen.getByRole("button", { name: "옮기기" })).toBeEnabled();
  });

  test("학교로 옮길 때는 그룹 칸이 없고 반을 비우면 마이페이지 안내가 보인다", () => {
    renderForm(SCHOOL);

    expect(screen.queryByLabelText("그룹")).toBeNull();
    expect(screen.getByLabelText("반")).toBeInTheDocument();
    expect(screen.getByLabelText("번호")).toBeInTheDocument();
    expect(
      screen.getByText("반을 비우면 학생이 마이페이지에서 반을 입력해요."),
    ).toBeInTheDocument();
  });

  test("학교가 아닌 기관은 그룹 칸이 있다", () => {
    renderForm(ACADEMY);

    expect(screen.getByLabelText("그룹")).toBeInTheDocument();
  });

  test("기타 기관으로 옮길 때는 그룹, 반, 번호 칸을 숨긴다", () => {
    renderForm(ETC);

    expect(screen.queryByLabelText("그룹")).toBeNull();
    expect(screen.queryByLabelText("반")).toBeNull();
    expect(screen.queryByLabelText("번호")).toBeNull();
    expect(screen.getByLabelText("학년")).toBeInTheDocument();
  });

  test("옮기면 토큰과 함께 move-student 로 보내고 성공을 알린다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const onMoved = vi.fn();
    renderForm(SCHOOL, { onMoved });

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "3반" } });
    fireEvent.change(screen.getByLabelText("번호"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/tenants/move-student");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
    expect(JSON.parse(init.body as string)).toEqual({
      profileId: "p-1",
      tenantId: "t-school",
      grade: "고2",
      className: "3반",
      number: 7,
    });
  });

  test("반과 번호를 비우면 본문에 싣지 않는다", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    renderForm(SCHOOL);

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      profileId: "p-1",
      tenantId: "t-school",
      grade: "고1",
    });
  });

  test("숫자가 아닌 번호는 조용히 버리지 않고 그대로 보내 서버가 거절하게 한다", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: { code: "BAD_REQUEST", message: "입력값을 확인해 주세요." },
      }),
    );
    renderForm(SCHOOL);

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.change(screen.getByLabelText("번호"), {
      target: { value: "7a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    expect(
      await screen.findByText("입력값을 확인해 주세요."),
    ).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).number).toBe("7a");
  });

  test("전화번호가 겹치면 소속 저장 오류와 같은 문구를 보여주고 성공을 알리지 않는다", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: { code: "PHONE_TAKEN", message: "x" } }),
    );
    const onMoved = vi.fn();
    renderForm(SCHOOL, { onMoved });

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    expect(
      await screen.findByText(
        "이 기관에 같은 휴대폰 번호의 회원이 이미 있어요. 확인 후 다시 옮겨 주세요.",
      ),
    ).toBeInTheDocument();
    expect(onMoved).not.toHaveBeenCalled();
  });

  test("그 밖의 오류는 서버 문구를 그대로 보여준다", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: { code: "NUMBER_TAKEN", message: "이미 사용 중인 번호예요." },
      }),
    );
    renderForm(SCHOOL);

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    expect(
      await screen.findByText("이미 사용 중인 번호예요."),
    ).toBeInTheDocument();
  });

  test("취소를 누르면 onCancel 을 부른다", () => {
    const onCancel = vi.fn();
    renderForm(SCHOOL, { onCancel });

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
