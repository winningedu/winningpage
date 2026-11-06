import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({
  fetchSchoolAdmins: vi.fn(),
  issueSchoolAdmin: vi.fn(),
}));

import * as api from "./api";
import SchoolAdminPanel from "./SchoolAdminPanel";

const ADMIN = {
  id: "t-1",
  name: "박관리",
  phone: "01099998888",
  landline: "0212345678",
  email: "park@example.com",
  position: "교감",
  loginId: "ABCD2345XY7Z9K",
  status: "active" as const,
  issuedAt: "2026-11-05T05:00:00Z",
  canceledAt: null,
};
const CANCELED = {
  ...ADMIN,
  id: "t-2",
  name: "최취소",
  loginId: null,
  status: "inactive" as const,
  canceledAt: "2026-10-21T05:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchSchoolAdmins).mockResolvedValue({
    ok: true,
    data: { address: "서울시 중구 1", admins: [ADMIN, CANCELED] },
  });
});

function renderPanel() {
  return render(<SchoolAdminPanel tenantId="tenant-7" tenantName="한빛고" />);
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("SchoolAdminPanel", () => {
  test("학교 관리자 목록에 주소, 발급일, 등록취소일을 읽기로만 보여준다", async () => {
    renderPanel();

    expect(await screen.findByText("박관리")).toBeTruthy();
    expect(api.fetchSchoolAdmins).toHaveBeenCalledWith("tenant-7");
    const row = screen.getByText("박관리").closest("tr") as HTMLElement;
    expect(within(row).getByText("서울시 중구 1")).toBeTruthy();
    expect(within(row).getByText("ABCD2345XY7Z9K")).toBeTruthy();
    expect(within(row).getByText("2026. 11. 5.")).toBeTruthy();
    const canceled = screen.getByText("최취소").closest("tr") as HTMLElement;
    expect(within(canceled).getByText("2026. 10. 21.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "주소" })).toBeNull();
    expect(
      screen.getByText("취소와 재발급은 본사 대행으로 해 주세요."),
    ).toBeTruthy();
  });

  test("발급 폼의 학교 칸은 읽기 전용 기관 이름이고 입력한 값을 tenantId 와 함께 보낸다", async () => {
    vi.mocked(api.issueSchoolAdmin).mockResolvedValue({
      ok: true,
      data: { loginId: "NEWLOGIN2345AB", tempPassword: "Tmp-pass-1" },
    });
    renderPanel();
    await screen.findByText("박관리");

    expect((screen.getByLabelText("학교") as HTMLInputElement).value).toBe(
      "한빛고",
    );
    expect((screen.getByLabelText("학교") as HTMLInputElement).readOnly).toBe(
      true,
    );
    fill("이름", "  김새로 ");
    fill("전화번호", "010-1111-2222");
    fill("일반전화", "02-111-2222");
    fill("담당 이메일", "new@example.com");
    fill("직책", "행정실장");
    fireEvent.click(screen.getByRole("button", { name: "발급" }));

    await waitFor(() =>
      expect(api.issueSchoolAdmin).toHaveBeenCalledWith({
        tenantId: "tenant-7",
        name: "김새로",
        phone: "010-1111-2222",
        landline: "02-111-2222",
        email: "new@example.com",
        position: "행정실장",
      }),
    );
  });

  test("임시 비밀번호는 모달에 한 번만 보이고 닫으면 다시 볼 수 없다", async () => {
    vi.mocked(api.issueSchoolAdmin).mockResolvedValue({
      ok: true,
      data: { loginId: "NEWLOGIN2345AB", tempPassword: "Tmp-pass-1" },
    });
    renderPanel();
    await screen.findByText("박관리");
    fill("이름", "김새로");
    fill("전화번호", "010-1111-2222");
    fireEvent.click(screen.getByRole("button", { name: "발급" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("NEWLOGIN2345AB")).toBeTruthy();
    expect(within(dialog).getByText("Tmp-pass-1")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "확인" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Tmp-pass-1")).toBeNull();
    // 발급 뒤 목록을 다시 불러오고 입력칸은 비워진다.
    await waitFor(() => expect(api.fetchSchoolAdmins).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("이름") as HTMLInputElement).value).toBe("");
  });

  test("발급이 실패하면 서버 문구를 보이고 모달은 열지 않는다", async () => {
    vi.mocked(api.issueSchoolAdmin).mockResolvedValue({
      ok: false,
      message: "이미 쓰는 전화번호예요.",
    });
    renderPanel();
    await screen.findByText("박관리");
    fill("이름", "김새로");
    fill("전화번호", "010-1111-2222");
    fireEvent.click(screen.getByRole("button", { name: "발급" }));

    expect(await screen.findByText("이미 쓰는 전화번호예요.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("이름이나 전화번호가 비면 서버를 부르지 않는다", async () => {
    renderPanel();
    await screen.findByText("박관리");

    fireEvent.click(screen.getByRole("button", { name: "발급" }));

    expect(screen.getByText("이름과 전화번호를 입력해 주세요.")).toBeTruthy();
    expect(api.issueSchoolAdmin).not.toHaveBeenCalled();
  });
});
