import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { ApiError } from "@/lib/http/client";
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

const MOVED = {
  fromTenantId: "t-old",
  tenantId: "t-school",
  enrollmentId: "e-1",
};

function renderForm(
  tenant = SCHOOL,
  handlers: {
    onMoved?: () => void;
    onCancel?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
  } = {},
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MoveStudentForm
        profileId="p-1"
        tenant={tenant}
        onMoved={handlers.onMoved ?? (() => {})}
        onCancel={handlers.onCancel ?? (() => {})}
        {...(handlers.onDirtyChange
          ? { onDirtyChange: handlers.onDirtyChange }
          : {})}
      />
    </QueryClientProvider>,
  );
}

const reply = (body: unknown) => ({ json: async () => body });

function failWith(status: number, code: string, detail: string) {
  http.post.mockReturnValue({
    json: async () => {
      throw new ApiError({ status, code, detail });
    },
  });
}

beforeEach(() => {
  http.post.mockReset();
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

  test("옮기면 move-student 로 보내고 성공을 알린다", async () => {
    http.post.mockReturnValue(reply(MOVED));
    const onMoved = vi.fn();
    renderForm(SCHOOL, { onMoved });

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "3반" } });
    fireEvent.change(screen.getByLabelText("번호"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(http.post).toHaveBeenCalledWith("admin/tenants/move-student", {
      json: {
        profileId: "p-1",
        tenantId: "t-school",
        grade: "고2",
        className: "3반",
        number: 7,
      },
    });
  });

  test("반과 번호를 비우면 본문에 싣지 않는다", async () => {
    http.post.mockReturnValue(reply(MOVED));
    renderForm(SCHOOL);

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post.mock.calls[0]?.[1]).toEqual({
      json: { profileId: "p-1", tenantId: "t-school", grade: "고1" },
    });
  });

  test("숫자가 아닌 번호는 조용히 버리지 않고 그대로 보내 서버가 거절하게 한다", async () => {
    failWith(400, "BAD_REQUEST", "입력값을 확인해 주세요.");
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
    expect(http.post.mock.calls[0]?.[1]).toMatchObject({
      json: { number: "7a" },
    });
  });

  test("전화번호가 겹치면 소속 저장 오류와 같은 문구를 보여주고 성공을 알리지 않는다", async () => {
    failWith(409, "PHONE_TAKEN", "x");
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
    failWith(409, "NUMBER_TAKEN", "이미 사용 중인 번호예요.");
    renderForm(SCHOOL);

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    expect(
      await screen.findByText("이미 사용 중인 번호예요."),
    ).toBeInTheDocument();
  });

  test("옮기는 동안은 버튼이 잠긴다", async () => {
    http.post.mockReturnValue({ json: () => new Promise(() => {}) });
    renderForm(SCHOOL);

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    expect(
      await screen.findByRole("button", { name: "옮기는 중..." }),
    ).toBeDisabled();
  });

  test("입력이 하나라도 있으면 바뀐 상태를 알리고, 닫히면 해제한다", () => {
    const onDirtyChange = vi.fn();
    const { unmount } = renderForm(SCHOOL, { onDirtyChange });

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "3반" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  test("취소를 누르면 onCancel 을 부른다", () => {
    const onCancel = vi.fn();
    renderForm(SCHOOL, { onCancel });

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
