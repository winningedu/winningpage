// 관리자 초대. 서버 안내는 그대로 보이고, 기존 회원을 올릴 때는 확인을 거쳐 confirmExisting 으로 다시 보낸다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderMembers, routeApi } from "./testHelpers";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/staff": {
      items: [],
      roles: [
        { id: "role-0", name: "최고 관리자", is_super: true },
        { id: "role-1", name: "운영자", is_super: false },
      ],
      resources: [],
    },
  });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const title = () => document.querySelector('[data-slot="toast-title"]');
const description = () =>
  document.querySelector('[data-slot="toast-description"]');

async function openInvite() {
  renderMembers();
  fireEvent.click(await screen.findByText("관리자 초대"));
  fireEvent.change(await screen.findByLabelText("이름"), {
    target: { value: "김관리" },
  });
  fireEvent.change(screen.getByLabelText("이메일"), {
    target: { value: "kim@example.com" },
  });
}

const send = () => fireEvent.click(screen.getByText("초대 메일 보내기"));

const failure = (status: number, code: string, detail: string, extra = {}) =>
  new ApiError({
    status,
    code,
    detail,
    problem: {
      type: "about:blank",
      title: "오류",
      status,
      detail,
      code,
      ...extra,
    },
  });

const needsConfirm = () =>
  failure(409, "NEEDS_CONFIRM", "이미 가입된 계정입니다.", {
    existingName: "홍길동",
    existingMemberType: "학생",
  });

test("비어 있는 항목이 있으면 요청 없이 경고만 보인다", async () => {
  renderMembers();
  fireEvent.click(await screen.findByText("관리자 초대"));

  send();

  await waitFor(() =>
    expect(title()).toHaveTextContent(
      "이름, 이메일, 권한 묶음을 모두 입력해 주세요.",
    ),
  );
  expect(http.post).not.toHaveBeenCalled();
});

test("초대하면 계약 본문으로 POST 하고 메일을 보냈다는 토스트를 보인다", async () => {
  http.post.mockReturnValue({
    json: async () => ({ profileId: "p9", resent: false, emailed: true }),
  });
  await openInvite();

  send();

  await waitFor(() =>
    expect(title()).toHaveTextContent("초대 메일을 보냈습니다."),
  );
  // 권한 묶음 기본값은 최고 관리자가 아닌 첫 묶음이다.
  expect(http.post).toHaveBeenCalledWith("admin/invite-member", {
    json: {
      email: "kim@example.com",
      name: "김관리",
      roleId: "role-1",
      confirmExisting: false,
    },
  });
  await waitFor(() =>
    expect(screen.queryByText("초대 메일 보내기")).not.toBeInTheDocument(),
  );
});

test("메일이 나가지 않는 등록은 직접 알리라는 경고를 보인다", async () => {
  http.post.mockReturnValue({
    json: async () => ({ profileId: "p9", resent: false, emailed: false }),
  });
  await openInvite();
  fireEvent.change(screen.getByLabelText("부서"), {
    target: { value: " 운영팀 " },
  });

  send();

  await waitFor(() => {
    expect(title()).toHaveTextContent("관리자로 등록했습니다.");
    expect(description()).toHaveTextContent("직접 알려주세요");
  });
  expect(http.post.mock.calls[0]?.[1]).toMatchObject({
    json: { department: "운영팀" },
  });
});

test("초대가 서버 안내와 함께 실패하면 그 안내를 초대 실패로 보인다", async () => {
  http.post.mockReturnValue({
    json: async () => {
      throw failure(
        409,
        "ALREADY_ACTIVE_ADMIN",
        "이미 활성 상태인 관리자입니다.",
      );
    },
  });
  await openInvite();

  send();

  await waitFor(() => {
    expect(title()).toHaveTextContent("초대 실패");
    expect(description()).toHaveTextContent("이미 활성 상태인 관리자입니다.");
  });
});

test("기존 회원 확인창에서 취소하면 다시 보내지 않고, 계속하면 confirmExisting 으로 다시 보낸다", async () => {
  http.post
    .mockReturnValueOnce({
      json: async () => {
        throw needsConfirm();
      },
    })
    .mockReturnValueOnce({
      json: async () => {
        throw needsConfirm();
      },
    })
    .mockReturnValueOnce({
      json: async () => ({ profileId: "p9", resent: false, emailed: false }),
    });
  await openInvite();

  send();

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("대상: 홍길동(학생)");
  expect(dialog).toHaveTextContent("전 회원 정보를 볼 수 있게 됩니다");
  // 관리자 권한을 주는 동작이라 처음 포커스가 취소에 있다.
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "취소" })).toHaveFocus(),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(http.post).toHaveBeenCalledTimes(1);

  // 취소가 끝나 버튼이 다시 눌릴 수 있을 때까지 기다린다.
  await screen.findByText("초대 메일 보내기");
  send();
  fireEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "계속",
    }),
  );

  await waitFor(() => expect(http.post).toHaveBeenCalledTimes(3));
  expect(http.post.mock.calls[2]?.[1]).toMatchObject({
    json: { confirmExisting: true },
  });
});

test("보내는 동안 버튼은 눌리지 않는다", async () => {
  http.post.mockReturnValue({ json: () => new Promise(() => {}) });
  await openInvite();

  send();

  expect(await screen.findByText("보내는 중...")).toBeDisabled();
});
