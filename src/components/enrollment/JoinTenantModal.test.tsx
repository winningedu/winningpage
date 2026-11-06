// 기타 소속 학생의 소속코드 입력 흐름(결정 96, 98, 99): 코드 입력, 기관 이름 확인, 학적 입력, 제출.

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import JoinTenantModal from "./JoinTenantModal";

const mockApiFetch = vi.fn();

vi.mock("@/lib/apiFetch", () => ({
  getAuthHeader: async () => ({ Authorization: "Bearer student-token" }),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status < 400, json: async () => body };
}

function errorResponse(status: number, code: string, message: string) {
  return jsonResponse(status, { error: { code, message } });
}

const CODE = "ABC23456";

function renderModal(
  props: Partial<Parameters<typeof JoinTenantModal>[0]> = {},
) {
  const onClose = vi.fn();
  const onJoined = vi.fn();
  render(
    <JoinTenantModal open onClose={onClose} onJoined={onJoined} {...props} />,
  );
  return { onClose, onJoined };
}

async function enterCode(code = CODE) {
  fireEvent.change(screen.getByLabelText("소속코드"), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("JoinTenantModal", () => {
  it("코드로 기관을 확인하고 학적을 입력해 옮기면 onJoined 에 기관 이름을 넘기고 닫는다", async () => {
    mockApiFetch
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, name: "가나중학교", orgType: "학교" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, tenantName: "가나중학교" }),
      );
    const { onClose, onJoined } = renderModal();

    await enterCode(" abc2-3456 ");
    expect(await screen.findByText("가나중학교")).toBeInTheDocument();
    const [lookupUrl, lookupInit] = mockApiFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(lookupUrl).toBe("/api/enrollment/join-tenant-lookup");
    expect(JSON.parse(lookupInit.body as string)).toEqual({ code: CODE });

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "고2" },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("번호(선택)"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(onJoined).toHaveBeenCalledWith("가나중학교"));
    expect(onClose).toHaveBeenCalled();
    const [joinUrl, joinInit] = mockApiFetch.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(joinUrl).toBe("/api/enrollment/join-tenant");
    expect(JSON.parse(joinInit.body as string)).toEqual({
      code: CODE,
      grade: "고2",
      className: "3",
      number: 12,
    });
  });

  it("형식이 틀린 코드는 서버에 묻지 않고 다시 확인하라고 안내한다", async () => {
    renderModal();

    await enterCode("ABC");

    expect(
      await screen.findByText("소속코드를 다시 확인해 주세요."),
    ).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it.each([
    [404, "TENANT_NOT_FOUND", "소속코드를 다시 확인해 주세요."],
    [
      429,
      "TOO_MANY_ATTEMPTS",
      "소속코드 확인을 너무 많이 시도했어요. 잠시 후 다시 시도해 주세요.",
    ],
    [403, "NOT_CATCH_ALL", "기타 소속 학생만 소속코드를 입력할 수 있어요."],
  ])(
    "코드 확인이 %i %s 이면 서버 문구를 보이고 코드 단계에 머문다",
    async (status, code, message) => {
      mockApiFetch.mockResolvedValue(errorResponse(status, code, message));
      renderModal();

      await enterCode();

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByLabelText("소속코드")).toBeInTheDocument();
    },
  );

  it("서버 응답을 읽지 못하면 일반 문구를 보인다", async () => {
    mockApiFetch.mockRejectedValue(new Error("network"));
    renderModal();

    await enterCode();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  });

  async function reachFields(orgType: string) {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, name: "가나기관", orgType }),
    );
    const handlers = renderModal();
    await enterCode();
    await screen.findByText("가나기관");
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    return handlers;
  }

  it("그룹 칸은 학원일 때만 보이고 보낸다", async () => {
    await reachFields("학원");
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, tenantName: "가나기관" }),
    );

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: "중3" },
    });
    fireEvent.change(screen.getByLabelText("그룹(선택)"), {
      target: { value: " A그룹 " },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const init = mockApiFetch.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      code: CODE,
      grade: "중3",
      groupName: "A그룹",
      className: "2",
    });
  });

  it("학교에는 그룹 칸이 없다", async () => {
    await reachFields("학교");

    expect(screen.queryByLabelText("그룹(선택)")).not.toBeInTheDocument();
  });

  it.each([
    ["학년을 고르지 않으면", "", "3", "", "학년을 선택해 주세요."],
    ["반을 비우면", "고1", "  ", "", "반을 입력해 주세요."],
    [
      "번호가 100이면",
      "고1",
      "3",
      "100",
      "번호는 1에서 99까지 숫자로 입력해 주세요.",
    ],
    [
      "번호가 숫자가 아니면",
      "고1",
      "3",
      "열두",
      "번호는 1에서 99까지 숫자로 입력해 주세요.",
    ],
  ])("%s 제출하지 않고 안내한다", async (_name, grade, cls, num, message) => {
    await reachFields("학교");

    fireEvent.change(screen.getByLabelText("학년"), {
      target: { value: grade },
    });
    fireEvent.change(screen.getByLabelText("반"), { target: { value: cls } });
    fireEvent.change(screen.getByLabelText("번호(선택)"), {
      target: { value: num },
    });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "WC096",
      409,
      "PHONE_TAKEN",
      "이 기관에 같은 휴대폰 번호로 가입한 계정이 있어요. 선생님께 문의해 주세요.",
    ],
    ["WC077", 409, "NUMBER_TAKEN", "이미 사용 중인 번호예요."],
    ["WC080", 400, "GROUP_NOT_REGISTERED", "등록되지 않은 그룹이에요."],
  ])(
    "옮기기가 %s 로 실패하면 문구를 보이고 닫지 않는다",
    async (_pg, status, code, message) => {
      const { onClose, onJoined } = await reachFields("학교");
      mockApiFetch.mockResolvedValueOnce(errorResponse(status, code, message));

      fireEvent.change(screen.getByLabelText("학년"), {
        target: { value: "고1" },
      });
      fireEvent.change(screen.getByLabelText("반"), { target: { value: "3" } });
      fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(onClose).not.toHaveBeenCalled();
      expect(onJoined).not.toHaveBeenCalled();
    },
  );

  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <JoinTenantModal open={false} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
