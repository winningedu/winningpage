// W16a 담당 변경과 추가. 담당 표(주 담당, 추가)에서 학급을 해제하고 새 학급을 더한다(교 #232).
// 담임의 마지막 1개는 해제할 수 없고, 다른 선생님이 담임인 학급은 서버가 거절한다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { renderRoutes, stubApi } from "../testUtils";
import AssignDialog from "./AssignDialog";
import type { AccountItem } from "./roster";

const klass = (
  id: string,
  name: string,
  isPrimary: boolean,
  students: number,
) => ({
  id,
  grade: "고2",
  groupId: null,
  groupName: null,
  name,
  isPrimary,
  activeStudents: students,
});

const teacher = (over: Partial<AccountItem> = {}): AccountItem => ({
  id: "t-park",
  name: "박지훈",
  role: "homeroom",
  phoneLast4: "5678",
  loginId: "SM26HB83K7MPQ2",
  status: "active",
  passwordSet: true,
  classes: [klass("c3", "3", true, 28), klass("c5", "5", false, 30)],
  ...over,
});

function open(item: AccountItem = teacher()) {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  renderRoutes(
    [
      {
        path: "/",
        element: (
          <AssignDialog
            teacher={item}
            onChanged={onChanged}
            onClose={onClose}
          />
        ),
      },
    ],
    "/",
  );
  return { onChanged, onClose };
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

describe("W16a 담당 표", () => {
  it("공통 아이디를 제목에 쓰고 주 담당과 추가 담당을 학생 수와 함께 보인다", async () => {
    stubApi({ "GET /api/console/groups": { body: { groups: [] } } });
    open();

    expect(
      screen.getByText("박지훈 선생님 (공통 아이디 SM26HB83K7MPQ2)"),
    ).toBeTruthy();
    const main = screen.getAllByText("2학년")[0]?.closest("tr") as HTMLElement;
    expect(within(main).getByText("주 담당")).toBeTruthy();
    expect(within(main).getByText("3반")).toBeTruthy();
    expect(within(main).getByText("28")).toBeTruthy();
    const extra = screen.getAllByText("2학년")[1]?.closest("tr") as HTMLElement;
    expect(within(extra).getByText("추가")).toBeTruthy();
    expect(within(extra).getByText("5반")).toBeTruthy();
  });

  it("추가 담당을 해제하면 그 학급만 지우는 요청을 보내고 목록을 다시 읽게 한다", async () => {
    const calls = stubApi({
      "GET /api/console/groups": { body: { groups: [] } },
      "POST /api/console/teachers/assignments": { body: { ok: true } },
    });
    const { onChanged } = open();

    const extra = screen.getByText("5반").closest("tr") as HTMLElement;
    fireEvent.click(within(extra).getByRole("button", { name: "담당 해제" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
      teacherId: "t-park",
      removeClassIds: ["c5"],
    });
  });

  it("주 담당을 해제하면 남는 첫 학급을 주 담당으로 함께 보낸다", async () => {
    const calls = stubApi({
      "GET /api/console/groups": { body: { groups: [] } },
      "POST /api/console/teachers/assignments": { body: { ok: true } },
    });
    open();

    const main = screen.getByText("3반").closest("tr") as HTMLElement;
    fireEvent.click(within(main).getByRole("button", { name: "담당 해제" }));

    await waitFor(() =>
      expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
        teacherId: "t-park",
        removeClassIds: ["c3"],
        primaryClassId: "c5",
      }),
    );
  });

  it("담임의 마지막 학급은 해제할 수 없다고 알리고 버튼을 막는다", () => {
    stubApi({ "GET /api/console/groups": { body: { groups: [] } } });
    open(teacher({ classes: [klass("c3", "3", true, 28)] }));

    expect(
      (screen.getByRole("button", { name: "담당 해제" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText(
        "담임은 담당 학급이 1개 이상 있어야 해서 마지막 학급은 해제할 수 없어요",
      ),
    ).toBeTruthy();
  });
});

describe("W16a 학급 추가", () => {
  it("학년그룹과 반을 넣어 추가하면 add 로 보내고 담임이 있는 학급이면 서버 문구를 창에 보인다", async () => {
    const calls = stubApi({
      "GET /api/console/groups": { body: { groups: [] } },
      "POST /api/console/teachers/assignments": {
        status: 409,
        body: {
          error: {
            code: "CLASS_TAKEN",
            message: "다른 선생님이 이미 담임인 학급입니다.",
          },
        },
      },
    });
    const { onChanged } = open();

    const add = screen.getByRole("button", { name: "추가" });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고2" },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "4반" } });
    fireEvent.click(add);

    expect(
      await screen.findByText("다른 선생님이 이미 담임인 학급입니다."),
    ).toBeTruthy();
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
      teacherId: "t-park",
      add: [{ grade: "고2", name: "4반" }],
    });
    expect(onChanged).not.toHaveBeenCalled();
  });
});
