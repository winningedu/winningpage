// W9 교사 메모 패널과 W9d 삭제 확인. 저장은 비어 있으면 막고, 삭제는 작성자만 확인 창을 거친다.

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { type ApiHandler, renderRoutes, stubApi } from "../testUtils";
import MemoPanel from "./MemoPanel";

const LIST_URL = "GET /api/console/memos?studentId=s1";

const memos = [
  {
    id: "m1",
    body: "진로 상담 필요",
    createdAt: "2026-10-28T01:00:00Z",
    authorName: "박지훈",
    canDelete: true,
  },
  {
    id: "m2",
    body: "목표시간 점검",
    createdAt: "2026-10-14T01:00:00Z",
    authorName: "최민정",
    canDelete: false,
  },
];

function render(routes: Record<string, ApiHandler> = {}, admin = false) {
  const calls = stubApi({ [LIST_URL]: { body: { memos } }, ...routes });
  renderRoutes(
    [{ path: "/p", element: <MemoPanel studentId="s1" admin={admin} /> }],
    "/p",
  );
  return calls;
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

describe("교사 메모 패널", () => {
  it("메모를 날짜와 작성자와 함께 보이고 남의 메모에는 삭제 대신 안내를 둔다", async () => {
    render();

    expect(await screen.findByText("진로 상담 필요")).toBeTruthy();
    expect(screen.getAllByText("교사 메모").length).toBeGreaterThan(0);
    expect(screen.getByText("2026.10.28 박지훈")).toBeTruthy();
    expect(screen.getByText("2026.10.14 최민정")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "삭제" })).toHaveLength(1);
    expect(screen.getByText("작성한 교사만 지울 수 있어요")).toBeTruthy();
    expect(
      screen.getByText("작성자와 현재 담임만 열람, 학생과 학부모 비공개"),
    ).toBeTruthy();
  });

  it("저장은 내용이 비어 있거나 공백뿐이면 막힌다", async () => {
    render();
    await screen.findByText("진로 상담 필요");
    const save = screen.getByRole("button", {
      name: "저장",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("메모"), {
      target: { value: "   " },
    });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("메모"), {
      target: { value: "상담함" },
    });
    expect(save.disabled).toBe(false);
  });

  it("저장하면 요청 번호와 함께 보내고 목록을 다시 읽고 입력칸을 비운다", async () => {
    let saved = false;
    const calls = render({
      [LIST_URL]: () => ({
        body: {
          memos: saved
            ? [
                {
                  id: "m3",
                  body: "상담함",
                  createdAt: "2026-11-02T01:00:00Z",
                  authorName: "박지훈",
                  canDelete: true,
                },
                ...memos,
              ]
            : memos,
        },
      }),
      "POST /api/console/memos": () => {
        saved = true;
        return { body: { memo: memos[0] } };
      },
    });
    await screen.findByText("진로 상담 필요");

    fireEvent.change(screen.getByLabelText("메모"), {
      target: { value: " 상담함 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("2026.11.02 박지훈")).toBeTruthy();
    const post = calls.find((c) => c.key === "POST /api/console/memos");
    expect(post?.body).toMatchObject({ studentId: "s1", body: " 상담함 " });
    const sent = (post?.body ?? {}) as Record<string, unknown>;
    expect(String(sent.requestId)).toMatch(/^[0-9a-f-]{36}$/);
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe(
      "",
    );
  });

  it("저장이 실패하면 안내를 보이고 입력은 남긴다", async () => {
    render({ "POST /api/console/memos": { status: 500, body: {} } });
    await screen.findByText("진로 상담 필요");

    fireEvent.change(screen.getByLabelText("메모"), {
      target: { value: "상담함" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(
      await screen.findByText(
        "메모를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe(
      "상담함",
    );
  });

  it("저장이 실패한 뒤 내용을 고쳐 다시 저장하면 새 요청 번호를 쓴다", async () => {
    const calls = render({
      "POST /api/console/memos": { status: 500, body: {} },
    });
    await screen.findByText("진로 상담 필요");
    const field = screen.getByLabelText("메모");
    const save = screen.getByRole("button", { name: "저장" });

    fireEvent.change(field, { target: { value: "상담함" } });
    fireEvent.click(save);
    await screen.findByText(
      "메모를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요",
    );
    fireEvent.click(save);
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === "POST /api/console/memos"),
      ).toHaveLength(2),
    );
    fireEvent.change(field, { target: { value: "상담함, 추가" } });
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(save);
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === "POST /api/console/memos"),
      ).toHaveLength(3),
    );

    const ids = calls
      .filter((c) => c.key === "POST /api/console/memos")
      .map((c) => (c.body as { requestId: string }).requestId);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("메모가 없으면 빈 목록 안내를 보인다", async () => {
    render({ [LIST_URL]: { body: { memos: [] } } });
    expect(await screen.findByText("아직 메모가 없어요")).toBeTruthy();
  });

  it("학교 관리자에게는 자기 메모만 보인다는 안내를 더한다", async () => {
    render({}, true);
    expect(await screen.findByText("내가 쓴 메모만 보여요")).toBeTruthy();
  });
});

describe("W9d 메모 삭제 확인", () => {
  it("삭제를 누르면 확인 창이 뜨고 취소하면 아무것도 보내지 않는다", async () => {
    const calls = render();
    await screen.findByText("진로 상담 필요");

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("메모를 삭제할까요?")).toBeTruthy();
    expect(
      screen.getByText(
        "삭제하면 화면에서만 숨겨져요. 작성한 교사만 삭제할 수 있어요",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    await waitFor(() =>
      expect(screen.queryByText("메모를 삭제할까요?")).toBeNull(),
    );
    expect(calls.some((c) => c.key === "POST /api/console/memos/hide")).toBe(
      false,
    );
  });

  it("삭제를 확정하면 숨기고 목록에서 뺀다", async () => {
    let hidden = false;
    const calls = render({
      [LIST_URL]: () => ({ body: { memos: hidden ? [memos[1]] : memos } }),
      "POST /api/console/memos/hide": () => {
        hidden = true;
        return { body: { ok: true } };
      },
    });
    await screen.findByText("진로 상담 필요");

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await screen.findByText("메모를 삭제할까요?");
    fireEvent.click(
      screen.getAllByRole("button", { name: "삭제" }).at(-1) as HTMLElement,
    );

    await waitFor(() =>
      expect(screen.queryByText("진로 상담 필요")).toBeNull(),
    );
    expect(
      calls.find((c) => c.key === "POST /api/console/memos/hide")?.body,
    ).toEqual({
      memoId: "m1",
    });
  });
});

describe("태블릿과 휴대폰의 접힘", () => {
  it("접기 버튼이 펼침 상태를 알린다", async () => {
    render();
    await screen.findByText("진로 상담 필요");
    const toggle = screen.getByRole("button", { name: /교사 메모/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});
