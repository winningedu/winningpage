// QA 학부모가 QA 가 아닌 자녀를 연결하려 할 때 DB 가 돌려주는 안내 문구가 화면까지 가는지 본다.

import { beforeEach, describe, expect, test, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("./supabase", () => ({ supabase: { rpc } }));

import { requestParentLink } from "./parentLink";

const QA_MESSAGE = "QA 계정이라 이 기능은 작동하지 않아요.";

describe("requestParentLink QA 차단", () => {
  beforeEach(() => rpc.mockReset());

  test("RPC 가 QA 안내 문구로 거절하면 그 문구를 그대로 보여 준다", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: QA_MESSAGE } });

    const result = await requestParentLink("ABCDEF");

    expect(result).toEqual({
      ok: false,
      reason: "qa_restricted",
      message: QA_MESSAGE,
    });
  });

  test("알 수 없는 오류 원문은 여전히 감춘다", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom internal" } });

    const result = await requestParentLink("ABCDEF");

    expect(result).toMatchObject({ ok: false, reason: "unknown" });
  });
});
