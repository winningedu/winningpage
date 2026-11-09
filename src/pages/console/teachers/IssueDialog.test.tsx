// W16b 계정 발급. 담임교사용은 계정 없는 선생님을 골라, 학교 전체 관리자용은 이름과 전화번호로 발급한다.
// 임시 비밀번호는 화면에 보이지 않고 안내 파일로 한 번만 내려받는다(교 #125).

import { fireEvent, screen, waitFor } from "@testing-library/react";
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
import IssueDialog from "./IssueDialog";

const UNISSUED = {
  items: [
    {
      id: "t-lee",
      name: "이수민",
      phoneLast4: "1234",
      classes: [{ grade: "고1", groupName: null, name: "2" }],
    },
    {
      id: "t-jin",
      name: "진다솜",
      phoneLast4: "9876",
      classes: [],
    },
  ],
};

function open(props: { teacherId?: string } = {}) {
  const onClose = vi.fn();
  const onIssued = vi.fn();
  renderRoutes(
    [
      {
        path: "/",
        element: (
          <IssueDialog {...props} onClose={onClose} onIssued={onIssued} />
        ),
      },
    ],
    "/",
  );
  return { onClose, onIssued };
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

describe("W16b 담임교사용", () => {
  it("계정 없는 선생님을 골라 발급하면 아이디를 알리고 안내 파일을 한 번만 내려받는다", async () => {
    const calls = stubApi({
      "GET /api/console/teachers/unissued": { body: UNISSUED },
      "POST /api/console/teachers/issue": {
        body: {
          ok: true,
          teacherId: "t-lee",
          loginId: "SM26HB83W5ZQ7H",
          tempPassword: "Ab3!xYz9Qk",
        },
      },
    });
    const { onIssued } = open();

    expect(await screen.findByText("신규 계정 발급")).toBeTruthy();
    const issue = screen.getByRole("button", { name: "발급" });
    expect((issue as HTMLButtonElement).disabled).toBe(true);

    expect(
      await screen.findByRole("option", {
        name: "이수민 (1학년 2반) 뒷번호 1234",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("선생님"), {
      target: { value: "t-lee" },
    });
    fireEvent.click(screen.getByRole("button", { name: "발급" }));

    expect(await screen.findByText("SM26HB83W5ZQ7H")).toBeTruthy();
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
      teacherId: "t-lee",
    });
    expect(screen.queryByText("Ab3!xYz9Qk")).toBeNull();
    expect(onIssued).toHaveBeenCalledTimes(1);

    const download = screen.getByRole("button", { name: "안내 파일 내려받기" });
    fireEvent.click(download);
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    expect(mocks.download).toHaveBeenCalledWith([
      {
        name: "이수민",
        phoneLast4: "1234",
        grade: "1학년",
        className: "2반",
        loginId: "SM26HB83W5ZQ7H",
        tempPassword: "Ab3!xYz9Qk",
      },
    ]);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "내려받았어요",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
  });
});

describe("W16b 학교 전체 관리자용", () => {
  it("이름과 전화번호를 모두 적어야 발급하고 같은 안내 파일 절차를 쓴다", async () => {
    const calls = stubApi({
      "GET /api/console/teachers/unissued": { body: UNISSUED },
      "POST /api/console/teachers/issue": {
        body: {
          ok: true,
          teacherId: "t-new",
          loginId: "SM26HB83H4KD9R",
          tempPassword: "Zz9?mmNn2P",
        },
      },
    });
    open();

    await screen.findByText("신규 계정 발급");
    fireEvent.change(screen.getByLabelText("계정 종류"), {
      target: { value: "admin" },
    });
    const issue = screen.getByRole("button", { name: "발급" });
    fireEvent.change(screen.getByLabelText("이름"), {
      target: { value: "서민아" },
    });
    expect((issue as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("전화번호"), {
      target: { value: "010-3456-7812" },
    });
    fireEvent.click(issue);

    expect(await screen.findByText("SM26HB83H4KD9R")).toBeTruthy();
    expect(calls.find((c) => c.key.startsWith("POST"))?.body).toEqual({
      role: "school_admin",
      name: "서민아",
      phone: "010-3456-7812",
    });
    fireEvent.click(screen.getByRole("button", { name: "안내 파일 내려받기" }));
    await waitFor(() =>
      expect(mocks.download).toHaveBeenCalledWith([
        {
          name: "서민아",
          phoneLast4: "7812",
          grade: "",
          className: "",
          loginId: "SM26HB83H4KD9R",
          tempPassword: "Zz9?mmNn2P",
        },
      ]),
    );
  });
});

describe("W16b 오류와 미리 고른 선생님", () => {
  it("선생님 목록을 읽지 못하면 다시 시도 안내를 보인다", async () => {
    stubApi({
      "GET /api/console/teachers/unissued": { status: 500, body: {} },
    });
    open();

    expect(
      await screen.findByText(
        "선생님 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요",
      ),
    ).toBeTruthy();
  });

  it("행에서 열면 그 선생님이 골라져 있고 서버 거절 문구를 창에 보인다", async () => {
    stubApi({
      "GET /api/console/teachers/unissued": { body: UNISSUED },
      "POST /api/console/teachers/issue": {
        status: 409,
        body: {
          error: { code: "ACCOUNT_EXISTS", message: "이미 계정이 있습니다." },
        },
      },
    });
    open({ teacherId: "t-jin" });

    await screen.findByRole("option", { name: "진다솜 뒷번호 9876" });
    await waitFor(() =>
      expect((screen.getByLabelText("선생님") as HTMLSelectElement).value).toBe(
        "t-jin",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "발급" }));

    expect(await screen.findByText("이미 계정이 있습니다.")).toBeTruthy();
    expect(screen.queryByText("발급을 마쳤어요")).toBeNull();
  });
});
