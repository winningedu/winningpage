import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api", () => ({ fetchAccessLogs: vi.fn() }));

import AccessLogsAdmin from "./AccessLogsAdmin";
import * as api from "./api";

const ENTRY: api.AccessLogEntry = {
  id: "log-1",
  createdAt: "2026-11-05T10:00:00Z",
  tenantCode: "ABCD1234",
  actorName: null,
  actorEmail: null,
  reason: null,
  teacherName: "박교사",
  teacherLoginId: "ABCD1234a1b2c3",
  teacherPhone: "010-****-1234",
  kind: "view",
  kindLabel: "조회",
  targetStudentName: "김*늘",
  content: "학생 상세",
  isProxy: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchAccessLogs).mockResolvedValue({
    ok: true,
    data: { logs: [ENTRY], page: 1, hasNext: false },
  });
});

describe("AccessLogsAdmin", () => {
  test("API 가 준 로그를 소속코드, 교사, 전화, 구분, 대상 학생, 내용 열로 보여 준다", async () => {
    render(<AccessLogsAdmin />);

    const row = (await screen.findByText("박교사")).closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText("ABCD1234")).toBeInTheDocument();
    expect(cells.getByText("ABCD1234a1b2c3")).toBeInTheDocument();
    expect(cells.getByText("010-****-1234")).toBeInTheDocument();
    expect(cells.getByText("조회")).toBeInTheDocument();
    expect(cells.getByText("김*늘")).toBeInTheDocument();
    expect(cells.getByText("학생 상세")).toBeInTheDocument();
    for (const header of [
      "일시",
      "소속코드",
      "교사 이름",
      "교사 코드",
      "교사 전화번호",
      "구분",
      "대상 학생",
      "내용",
      "대행 여부",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(api.fetchAccessLogs).toHaveBeenCalledWith({
        tenantCode: "",
        from: "",
        to: "",
        kind: "",
        page: 1,
      }),
    );
  });

  test("소속코드, 기간, 구분을 골라 조회하면 그 조건으로 1쪽을 다시 읽는다", async () => {
    render(<AccessLogsAdmin />);
    await screen.findByText("박교사");

    fireEvent.change(screen.getByLabelText("소속코드"), {
      target: { value: "ABCD1234" },
    });
    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-11-05" },
    });
    fireEvent.change(screen.getByLabelText("구분"), {
      target: { value: "edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));

    await waitFor(() =>
      expect(api.fetchAccessLogs).toHaveBeenLastCalledWith({
        tenantCode: "ABCD1234",
        from: "2026-11-01",
        to: "2026-11-05",
        kind: "edit",
        page: 1,
      }),
    );
  });

  test("다음 쪽이 있으면 다음 버튼으로 같은 조건의 다음 쪽을 읽고 첫 쪽에서는 이전이 막힌다", async () => {
    vi.mocked(api.fetchAccessLogs).mockResolvedValue({
      ok: true,
      data: { logs: [ENTRY], page: 1, hasNext: true },
    });
    render(<AccessLogsAdmin />);
    await screen.findByText("박교사");

    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    await waitFor(() =>
      expect(api.fetchAccessLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  test("마지막 쪽에서는 다음이 막힌다", async () => {
    render(<AccessLogsAdmin />);
    await screen.findByText("박교사");

    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  test("기록이 없으면 안내를 보이고, 실패하면 서버 메시지를 보인다", async () => {
    vi.mocked(api.fetchAccessLogs).mockResolvedValueOnce({
      ok: true,
      data: { logs: [], page: 1, hasNext: false },
    });
    const { unmount } = render(<AccessLogsAdmin />);
    expect(await screen.findByText("기록이 없어요.")).toBeInTheDocument();
    unmount();

    vi.mocked(api.fetchAccessLogs).mockResolvedValueOnce({
      ok: false,
      message: "최고 관리자만 볼 수 있습니다.",
    });
    render(<AccessLogsAdmin />);
    expect(
      await screen.findByText("최고 관리자만 볼 수 있습니다."),
    ).toBeInTheDocument();
  });
});
