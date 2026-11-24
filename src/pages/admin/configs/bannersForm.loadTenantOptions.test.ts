// 배너 노출 대상 select 선택지 로더 검증. 엔진이 effect 안에서 명령형으로 부르는 로더라 react-query 없이 api 를 직접 쓴다.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/http/client";
import { loadTenantOptions } from "./bannersForm";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

vi.mock("@/lib/http/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http/client")>()),
  api: { get: (...args: unknown[]) => ({ json: () => mocks.get(...args) }) },
}));

const apiError = (status: number) =>
  new ApiError({ status, code: "X", detail: "실패" });

beforeEach(() => {
  mocks.get.mockReset();
});

describe("loadTenantOptions", () => {
  test("id 와 이름을 value, label 로 옮긴다", async () => {
    mocks.get.mockResolvedValue({
      items: [
        { id: "t-1", name: "가 학원" },
        { id: "t-2", name: "나 학원" },
      ],
    });

    await expect(loadTenantOptions()).resolves.toEqual([
      { value: "t-1", label: "가 학원" },
      { value: "t-2", label: "나 학원" },
    ]);
    expect(mocks.get).toHaveBeenCalledWith("admin/tenant-options");
  });

  test("tenants 권한이 없으면(403) 빈 목록이다", async () => {
    mocks.get.mockImplementation(async () => {
      throw apiError(403);
    });

    await expect(loadTenantOptions()).resolves.toEqual([]);
  });

  test("그 밖의 오류는 그대로 던진다", async () => {
    mocks.get.mockImplementation(async () => {
      throw apiError(500);
    });

    await expect(loadTenantOptions()).rejects.toMatchObject({ status: 500 });
  });
});
