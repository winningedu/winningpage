// W14d 한 명 삭제, W14e 선택 삭제와 조건 일괄 삭제(교 #118, #204, #211).
// 확인 창에서 대상 인원, 선생님별 재학생 수, 연결 계정도 함께 삭제됨과 학생 정보는 남음을 알린다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { renderRoutes, stubApi } from "../testUtils";
import BulkDeleteDialog from "./BulkDeleteDialog";
import DeleteDialog from "./DeleteDialog";
import type { TeacherSummary } from "./roster";

const teacher = (over: Partial<TeacherSummary> = {}): TeacherSummary => ({
  id: "t-han",
  name: "정하나",
  role: "homeroom",
  status: "active",
  hasAccount: true,
  activeStudents: 30,
  classes: [{ grade: "고3", groupId: null, groupName: null, name: "1" }],
  ...over,
});

function mount(element: React.ReactNode) {
  renderRoutes([{ path: "/", element }], "/");
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

describe("W14d 한 명 삭제", () => {
  it("재학생 수와 연결 계정 삭제를 알린 뒤 확인하면 삭제하고 닫는다", async () => {
    const calls = stubApi({
      "POST /api/console/teachers/delete": {
        body: { ok: true, deleted: 1, activeStudents: 30 },
      },
    });
    const onDeleted = vi.fn();
    mount(
      <DeleteDialog
        teacher={teacher()}
        onDeleted={onDeleted}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("정하나 선생님을 삭제할까요?")).toBeTruthy();
    expect(screen.getByText(/재학생 30명/)).toBeTruthy();
    expect(screen.getByText(/연결 계정도 함께 삭제/)).toBeTruthy();
    expect(screen.getByText(/학생 정보는 그대로 남아요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(calls[0]?.body).toEqual({ teacherIds: ["t-han"] });
  });

  it("반은 그대로 남는다고 알리고 가입 때 반을 고를 수 없다는 말은 하지 않는다", () => {
    mount(
      <DeleteDialog
        teacher={teacher()}
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/반은 그대로 남아요/)).toBeTruthy();
    expect(screen.queryByText(/가입할 때/)).toBeNull();
  });

  it("서버가 막으면 그 문구를 창에 보이고 닫지 않는다", async () => {
    stubApi({
      "POST /api/console/teachers/delete": {
        status: 409,
        body: {
          error: {
            code: "LAST_SCHOOL_ADMIN",
            message:
              "전체 관리자가 1명뿐이라 바꿀 수 없습니다. 다른 전체 관리자를 먼저 지정해 주세요.",
          },
        },
      },
    });
    const onDeleted = vi.fn();
    mount(
      <DeleteDialog
        teacher={teacher()}
        onDeleted={onDeleted}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(
      await screen.findByText(
        "전체 관리자가 1명뿐이라 바꿀 수 없습니다. 다른 전체 관리자를 먼저 지정해 주세요.",
      ),
    ).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

const PEOPLE: TeacherSummary[] = [
  teacher(),
  teacher({
    id: "t-lee",
    name: "이수민",
    activeStudents: 29,
    classes: [{ grade: "고1", groupId: null, groupName: null, name: "2" }],
  }),
  teacher({
    id: "t-jin",
    name: "진다솜",
    hasAccount: false,
    activeStudents: 30,
    classes: [{ grade: "고1", groupId: null, groupName: null, name: "5" }],
  }),
  teacher({
    id: "t-choi",
    name: "최민정",
    role: "school_admin",
    activeStudents: 0,
    classes: [],
  }),
];

describe("W14e 선택 삭제", () => {
  it("체크한 선생님만 대상 인원과 재학생 수 합계로 알리고 한 번에 삭제한다", async () => {
    const calls = stubApi({
      "POST /api/console/teachers/delete": {
        body: { ok: true, deleted: 2, activeStudents: 59 },
      },
    });
    const onDeleted = vi.fn();
    mount(
      <BulkDeleteDialog
        teachers={PEOPLE}
        onDeleted={onDeleted}
        onClose={vi.fn()}
      />,
    );

    const del = screen.getByRole("button", { name: "삭제" });
    expect((del as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "정하나 선택" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "이수민 선택" }));

    expect(screen.getByText("대상 2명, 재학생 59명")).toBeTruthy();
    expect(screen.getByText(/연결 계정도 함께 삭제/)).toBeTruthy();
    fireEvent.click(del);

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(calls[0]?.body).toEqual({ teacherIds: ["t-han", "t-lee"] });
  });

  it("활성 전체 관리자가 한 명도 안 남게 되면 막고 삭제 버튼을 비활성으로 둔다", () => {
    stubApi({});
    mount(
      <BulkDeleteDialog
        teachers={PEOPLE}
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "최민정 선택" }));

    expect(
      screen.getByText(
        "활성 전체 관리자가 한 명도 남지 않아 삭제할 수 없어요. 다른 전체 관리자를 먼저 지정해 주세요",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "삭제" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("W14e 일괄 삭제", () => {
  it("학년을 고르면 그 학년 반을 맡은 선생님을 대상으로 잡아 삭제한다", async () => {
    const calls = stubApi({
      "POST /api/console/teachers/delete": {
        body: { ok: true, deleted: 2, activeStudents: 59 },
      },
    });
    const onDeleted = vi.fn();
    mount(
      <BulkDeleteDialog
        teachers={PEOPLE}
        onDeleted={onDeleted}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "일괄 삭제" }));
    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고1" },
    });

    const list = screen.getByRole("list", { name: "삭제 대상" });
    expect(within(list).getByText("이수민")).toBeTruthy();
    expect(within(list).getByText("진다솜")).toBeTruthy();
    expect(within(list).queryByText("정하나")).toBeNull();
    expect(screen.getByText("대상 2명, 재학생 59명")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(calls[0]?.body).toEqual({ teacherIds: ["t-lee", "t-jin"] });
  });

  it("조건은 학년과 반이고 반을 고르면 그 반을 맡은 선생님만 남는다", async () => {
    const calls = stubApi({
      "POST /api/console/teachers/delete": { body: { ok: true } },
    });
    mount(
      <BulkDeleteDialog
        teachers={PEOPLE}
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "일괄 삭제" }));
    expect(screen.queryByLabelText("그룹")).toBeNull();
    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고1" },
    });
    const klass = screen.getByLabelText("반") as HTMLSelectElement;
    expect([...klass.options].map((o) => o.text)).toEqual([
      "전체",
      "2반",
      "5반",
    ]);
    fireEvent.change(klass, {
      target: { value: [...klass.options][2]?.value },
    });

    const list = screen.getByRole("list", { name: "삭제 대상" });
    expect(within(list).getByText("진다솜")).toBeTruthy();
    expect(within(list).queryByText("이수민")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ teacherIds: ["t-jin"] });
  });

  it("학원 반은 그룹 이름을 붙여 고른다", () => {
    stubApi({});
    mount(
      <BulkDeleteDialog
        teachers={[
          teacher({
            classes: [
              { grade: "고1", groupId: "g-a", groupName: "A레벨", name: "2" },
            ],
          }),
        ]}
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "일괄 삭제" }));
    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고1" },
    });

    expect(
      [...(screen.getByLabelText("반") as HTMLSelectElement).options].map(
        (o) => o.text,
      ),
    ).toEqual(["전체", "A레벨 2반"]);
  });

  it("두 탭 모두 학생 정보는 지워지지 않는다고 알린다", () => {
    stubApi({});
    mount(
      <BulkDeleteDialog
        teachers={PEOPLE}
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/학생 정보는 지워지지 않아요/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "일괄 삭제" }));
    expect(screen.getByText(/학생 정보는 지워지지 않아요/)).toBeTruthy();
  });
});

describe("QA 53 삭제 경고", () => {
  const WARNING = "삭제하면 되돌릴 수 없어요";

  it("한 명 삭제 창은 맨 위에 되돌릴 수 없다는 경고를 보이고 기존 안내는 그대로 둔다", () => {
    mount(
      <DeleteDialog
        teacher={teacher()}
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const warning = screen.getByText(WARNING);
    const body = screen.getByText(/재학생 30명/);
    expect(
      warning.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText(/연결 계정도 함께 삭제/)).toBeTruthy();
  });

  it("선택 삭제와 일괄 삭제 창에도 같은 경고가 있다", () => {
    mount(
      <BulkDeleteDialog
        teachers={[teacher()]}
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(WARNING)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "일괄 삭제" }));
    expect(screen.getByText(WARNING)).toBeTruthy();
  });
});

describe("본인 계정 제외", () => {
  const NOTICE = "본인 계정은 삭제할 수 없어서 목록에서 뺐어요";

  it("선택 삭제 목록에서 본인을 빼고 안내를 한 줄 보인다", () => {
    mount(
      <BulkDeleteDialog
        teachers={PEOPLE}
        ownId="t-han"
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("checkbox", { name: "정하나 선택" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "이수민 선택" })).toBeTruthy();
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
  });

  it("일괄 삭제 조건 결과에서도 본인을 빼고 요청에 본인 id가 없다", async () => {
    const calls = stubApi({
      "POST /api/console/teachers/delete": { body: { ok: true } },
    });
    mount(
      <BulkDeleteDialog
        teachers={PEOPLE}
        ownId="t-lee"
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "일괄 삭제" }));
    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고1" },
    });

    const list = screen.getByRole("list", { name: "삭제 대상" });
    expect(within(list).queryByText("이수민")).toBeNull();
    expect(within(list).getByText("진다솜")).toBeTruthy();
    expect(screen.getByText(NOTICE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ teacherIds: ["t-jin"] });
  });

  it("본인이 목록에 없으면 안내를 보이지 않는다", () => {
    mount(
      <BulkDeleteDialog
        teachers={PEOPLE}
        ownId="nobody"
        onDeleted={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
