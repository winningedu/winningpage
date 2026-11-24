// MembersAdmin 문자 발송. 성공하면 이력을 다시 읽고, 실패하면 서버가 관리자용으로 쓴 안내를 그대로 보인다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/config/site", () => ({
  site: { key: "winning", features: { studentEnrollment: true } },
}));

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: http,
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminTable: ({
    rows,
    onEdit,
  }: {
    rows: { id: string; name: string }[];
    onEdit: (row: unknown) => void;
  }) => (
    <div>
      {rows.map((row) => (
        <button key={row.id} type="button" onClick={() => onEdit(row)}>
          {`열기 ${row.name}`}
        </button>
      ))}
    </div>
  ),
}));

import { toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/http/client";
import { renderMembers, routeApi } from "./testHelpers";

const KIM = {
  id: "p-student",
  name: "김학생",
  member_type: "student",
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  routeApi(http.get, {
    "admin/members": { items: [KIM] },
    "admin/members/p-student": KIM,
    "admin/members/p-student/messages": { items: [] },
  });
});

afterEach(() => {
  toast.close();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const messageCalls = () =>
  http.get.mock.calls.filter(
    (call) => call[0] === "admin/members/p-student/messages",
  );

async function writeMessage(text: string) {
  renderMembers("/admin/members/p-student/msg");
  const box = await screen.findByRole("textbox", { name: "메시지 내용" });
  fireEvent.change(box, { target: { value: text } });
  return box;
}

const send = () =>
  fireEvent.click(screen.getByRole("button", { name: "발송" }));
const title = () => document.querySelector('[data-slot="toast-title"]');
const description = () =>
  document.querySelector('[data-slot="toast-description"]');

test("발송하면 profileId 와 내용만 보내고 성공을 알린 뒤 입력을 비우고 이력을 다시 읽는다", async () => {
  http.post.mockReturnValue({
    json: async () => ({ channel: "SMS", logId: 1 }),
  });
  const box = await writeMessage(" 안내드립니다 ");
  await waitFor(() => expect(messageCalls()).toHaveLength(1));

  send();

  await waitFor(() =>
    expect(http.post).toHaveBeenCalledWith("admin/send-message", {
      json: { profileId: "p-student", text: "안내드립니다" },
    }),
  );
  await waitFor(() => expect(title()).toHaveTextContent("발송했습니다 (SMS)."));
  expect(box).toHaveValue("");
  await waitFor(() => expect(messageCalls()).toHaveLength(2));
});

test("내용이 비어 있으면 보내지 않고 안내한다", async () => {
  await writeMessage("   ");

  send();

  await waitFor(() =>
    expect(title()).toHaveTextContent("보낼 내용을 입력해 주세요."),
  );
  expect(http.post).not.toHaveBeenCalled();
});

test("발송이 서버 detail 과 함께 실패하면 그 detail 을 토스트로 보인다", async () => {
  http.post.mockReturnValue({
    json: async () => {
      throw new ApiError({
        status: 400,
        code: "BAD_REQUEST",
        detail: "수신자 연락처가 없습니다.",
      });
    },
  });
  await writeMessage("안내드립니다");

  send();

  await waitFor(() => {
    expect(title()).toHaveTextContent("발송 실패");
    expect(description()).toHaveTextContent("수신자 연락처가 없습니다.");
  });
});

test("우리 JSON 이 아닌 응답이면 본문 원문 없이 일반 안내를 보인다", async () => {
  http.post.mockReturnValue({
    json: async () => {
      throw new ApiError({
        status: 502,
        code: "HTTP_502",
        detail: "요청을 처리하지 못했어요.",
      });
    },
  });
  await writeMessage("안내드립니다");

  send();

  await waitFor(() =>
    expect(description()).toHaveTextContent("요청을 처리하지 못했어요."),
  );
  expect(document.body.textContent).not.toContain("HTTP 502");
});

test("발송하는 동안 버튼이 잠긴다", async () => {
  http.post.mockReturnValue({ json: () => new Promise(() => {}) });
  await writeMessage("안내드립니다");

  send();

  expect(
    await screen.findByRole("button", { name: "보내는 중..." }),
  ).toBeDisabled();
});
