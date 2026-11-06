import { render, screen, waitFor, within } from "@testing-library/react";
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
});
