// 학년, 반, 번호 입력 폼. 학년도 전환 뒤 직접 입력(self-assign, 사 #109)과 마이페이지 수정요청(request-change, 사 #110)이 같이 쓴다.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EnrollmentForm from "./EnrollmentForm";

const mockApiFetch = vi.fn();

vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({ Authorization: "Bearer student-token" }),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body };
}

function fill(grade: string, className: string, number: string) {
  fireEvent.change(screen.getByLabelText("학년"), { target: { value: grade } });
  fireEvent.change(screen.getByLabelText("반"), {
    target: { value: className },
  });
  fireEvent.change(screen.getByLabelText("번호"), {
    target: { value: number },
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("EnrollmentForm - 스스로 입력(self-assign)", () => {
  it("입력한 학년, 반, 번호를 self-assign 으로 보내고 끝나면 onDone 을 부른다", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    const onDone = vi.fn();
    render(
      <EnrollmentForm
        endpoint="self-assign"
        orgType="학교"
        initialGrade="고2"
        submitLabel="저장"
        onDone={onDone}
      />,
    );

    fill("고3", "5", "12");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = mockApiFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/enrollment/self-assign");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer student-token",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      grade: "고3",
      className: "5",
      number: 12,
    });
  });

  it("번호가 이미 쓰이면 서버 문구를 보이고 onDone 을 부르지 않는다", async () => {
    mockApiFetch.mockResolvedValue(
      jsonResponse(409, {
        error: { code: "NUMBER_TAKEN", message: "이미 사용 중인 번호예요." },
      }),
    );
    const onDone = vi.fn();
    render(
      <EnrollmentForm
        endpoint="self-assign"
        orgType="학교"
        initialGrade="고2"
        submitLabel="저장"
        onDone={onDone}
      />,
    );

    fill("고2", "3", "12");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이미 사용 중인 번호예요.",
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it("학년, 반, 번호 중 비운 칸이 있으면 보내지 않고 안내한다", async () => {
    render(
      <EnrollmentForm
        endpoint="self-assign"
        orgType="학교"
        initialGrade="고2"
        submitLabel="저장"
        onDone={vi.fn()}
      />,
    );

    fill("고2", "", "12");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "학년, 반, 번호를 모두 입력해 주세요.",
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("EnrollmentForm - 그룹 칸", () => {
  it("학교가 아니면 그룹 칸이 보이고 입력한 그룹 이름을 함께 보낸다", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    render(
      <EnrollmentForm
        endpoint="self-assign"
        orgType="사기업"
        initialGrade="고2"
        submitLabel="저장"
        onDone={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("그룹(선택)"), {
      target: { value: "A그룹" },
    });
    fill("고2", "3", "12");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    const init = mockApiFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      groupName: "A그룹",
    });
  });

  it("학교이면 그룹 칸이 없다", () => {
    render(
      <EnrollmentForm
        endpoint="self-assign"
        orgType="학교"
        initialGrade="고2"
        submitLabel="저장"
        onDone={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("그룹(선택)")).not.toBeInTheDocument();
  });
});

describe("EnrollmentForm - 수정요청(request-change)", () => {
  it("request-change 로 보낸다", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse(200, { ok: true }));
    render(
      <EnrollmentForm
        endpoint="request-change"
        orgType="학교"
        initialGrade="고2"
        submitLabel="수정요청하기"
        onDone={vi.fn()}
      />,
    );

    fill("고3", "1", "4");
    fireEvent.click(screen.getByRole("button", { name: "수정요청하기" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(mockApiFetch.mock.calls[0]?.[0]).toBe(
      "/api/enrollment/request-change",
    );
  });
});
