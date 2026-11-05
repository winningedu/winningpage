// W14b 개별 등록. 이름과 전화번호는 필수, 학년그룹과 반은 여러 줄(교 #115, #219). 결과는 같은 창에서 알린다.

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  download: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("./issuedFile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./issuedFile")>()),
  downloadIssuedFile: mocks.download,
}));

import { renderRoutes, stubApi } from "../testUtils";
import RegisterDialog from "./RegisterDialog";

const GROUPS = { groups: [{ id: "g-a", name: "A레벨", studentCount: 3 }] };
const EXISTING = [
  {
    id: "t-park",
    name: "박지훈",
    role: "homeroom" as const,
    status: "active" as const,
    hasAccount: true,
    activeStudents: 58,
    classes: [],
  },
];

function open() {
  const onClose = vi.fn();
  const onDone = vi.fn();
  renderRoutes(
    [
      {
        path: "/",
        element: (
          <RegisterDialog
            existing={EXISTING}
            onDone={onDone}
            onClose={onClose}
          />
        ),
      },
    ],
    "/",
  );
  return { onClose, onDone };
}

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "u" }, access_token: "tok" } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("W14b 개별 등록", () => {
  it("이름과 전화번호가 있어야 등록하고 새 계정이면 아이디와 안내 파일을 보인다", async () => {
    const calls = stubApi({
      "GET /api/console/groups": { body: GROUPS },
      "POST /api/console/teachers/register": {
        body: {
          ok: true,
          teacherId: "t-new",
          loginId: "SM26HB83W2RF7H",
          verdict: "created",
          tempPassword: "Ab3!xYz9Qk",
        },
      },
    });
    const { onDone } = open();

    expect(await screen.findByText("개별 등록")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "등록" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fill("이름", "윤서진");
    fill("전화번호", "010-5678-1234");
    fireEvent.change(screen.getByLabelText("학년그룹"), {
      target: { value: "고3" },
    });
    fill("반", "2반");
    fireEvent.click(submit);

    expect(await screen.findByText("SM26HB83W2RF7H")).toBeTruthy();
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
      name: "윤서진",
      phone: "010-5678-1234",
      classes: [{ grade: "고3", name: "2반" }],
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ab3!xYz9Qk")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "안내 파일 내려받기" }));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith([
        {
          name: "윤서진",
          phoneLast4: "1234",
          grade: "3학년",
          className: "2반",
          loginId: "SM26HB83W2RF7H",
          tempPassword: "Ab3!xYz9Qk",
        },
      ]),
    );
  });
});

describe("W14b 결과 상태", () => {
  it("이미 등록된 사람이면 새 아이디 없이 반만 더했다고 알리고 안내 파일은 없다", async () => {
    stubApi({
      "GET /api/console/groups": { body: GROUPS },
      "POST /api/console/teachers/register": {
        body: {
          ok: true,
          teacherId: "t-park",
          loginId: "SM26HB83K7MPQ2",
          verdict: "classes_added",
        },
      },
    });
    open();

    await screen.findByText("개별 등록");
    fill("이름", "박지훈");
    fill("전화번호", "01012345678");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(
      await screen.findByText(
        "이미 등록된 선생님이라 새 아이디를 만들지 않고 그 아이디에 반만 더했어요",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "안내 파일 내려받기" }),
    ).toBeNull();
  });

  it("서버가 전화번호 중복이나 담임 있는 학급을 거절하면 그 문구를 창에 보이고 입력은 남는다", async () => {
    stubApi({
      "GET /api/console/groups": { body: GROUPS },
      "POST /api/console/teachers/register": {
        status: 409,
        body: {
          error: {
            code: "PHONE_IN_USE",
            message: "다른 이름의 선생님이 이미 쓰는 전화번호입니다.",
          },
          existingLoginId: "SM26HB83K7MPQ2",
        },
      },
    });
    open();

    await screen.findByText("개별 등록");
    fill("이름", "한소율");
    fill("전화번호", "010-1234-5678");
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(
      await screen.findByText(
        "다른 이름의 선생님이 이미 쓰는 전화번호입니다. 기존 아이디는 SM26HB83K7MPQ2 예요",
      ),
    ).toBeTruthy();
    expect((screen.getByLabelText("이름") as HTMLInputElement).value).toBe(
      "한소율",
    );
  });

  it("이름이 같은 선생님이 있으면 같은 이름 안내를 보인다", async () => {
    stubApi({ "GET /api/console/groups": { body: GROUPS } });
    open();

    await screen.findByText("개별 등록");
    expect(screen.queryByText(/이름이 같은 선생님이 이미 있어요/)).toBeNull();
    fill("이름", "박지훈");

    expect(screen.getByText(/이름이 같은 선생님이 이미 있어요/)).toBeTruthy();
  });

  it("학년그룹-반 추가로 줄을 늘려 여러 학급을 보내고 덜 채운 줄은 서버를 부르지 않는다", async () => {
    const calls = stubApi({
      "GET /api/console/groups": { body: GROUPS },
      "POST /api/console/teachers/register": {
        body: {
          ok: true,
          teacherId: "t",
          loginId: "SM26HB83AAAAAA",
          verdict: "classes_added",
        },
      },
    });
    open();

    await screen.findByText("개별 등록");
    fill("이름", "박지훈");
    fill("전화번호", "01012345678");
    fireEvent.click(screen.getByRole("button", { name: "학년그룹-반 추가" }));
    const grades = screen.getAllByLabelText("학년그룹");
    const names = screen.getAllByLabelText("반");
    expect(grades).toHaveLength(2);
    fireEvent.change(grades[0] as HTMLElement, { target: { value: "고2" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    expect(
      await screen.findByText("학년그룹과 반을 함께 입력해 주세요"),
    ).toBeTruthy();
    expect(calls.filter((c) => c.key.startsWith("POST"))).toHaveLength(0);

    fireEvent.change(names[0] as HTMLElement, { target: { value: "3" } });
    fireEvent.change(grades[1] as HTMLElement, { target: { value: "고2" } });
    fireEvent.change(names[1] as HTMLElement, { target: { value: "5" } });
    fireEvent.change(
      within(screen.getByRole("dialog")).getAllByLabelText(
        "그룹",
      )[1] as HTMLElement,
      { target: { value: "g-a" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await waitFor(() =>
      expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
        name: "박지훈",
        phone: "01012345678",
        classes: [
          { grade: "고2", name: "3" },
          { grade: "고2", name: "5", groupId: "g-a" },
        ],
      }),
    );
  });
});
