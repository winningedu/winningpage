// 그룹 선택지: 학년을 고르면 그 학년 학급이 있는 그룹과 학급이 없는 그룹, 읽는 중과 실패에는 학급에서 만든 목록, 고른 그룹은 항상 남긴다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  consoleRequest: mocks.request,
}));

import { adminMe } from "./testUtils";
import type { ClassOption } from "./useClasses";
import { ConsoleMeContext } from "./useConsoleMe";
import { useGroupOptions } from "./useGroups";

const cls = (
  id: string,
  grade: string,
  groupId: string | null,
): ClassOption => ({
  id,
  grade,
  groupId,
  groupName: groupId ? `이름${groupId}` : null,
  name: id,
  hasHomeroom: false,
});
const classes = [cls("a", "고1", "g1"), cls("b", "고2", "g2")];
const registered = [
  { id: "g0", name: "이름g0" },
  { id: "g1", name: "이름g1" },
  { id: "g2", name: "이름g2" },
];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ConsoleMeContext.Provider
        value={{ me: adminMe, reload: async () => {} }}
      >
        {children}
      </ConsoleMeContext.Provider>
    </QueryClientProvider>
  );
}

const ids = (options: { id: string }[]) => options.map((o) => o.id);

beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockResolvedValue({
    status: 200,
    body: { groups: registered },
    retryAfterSeconds: null,
  });
});

describe("useGroupOptions", () => {
  it("학년을 고르지 않으면 등록된 그룹 전부를 그룹 관리 순서로 준다", async () => {
    const { result } = renderHook(() => useGroupOptions(classes, ""), {
      wrapper,
    });
    await waitFor(() =>
      expect(ids(result.current)).toEqual(["g0", "g1", "g2"]),
    );
  });

  it("학년을 고르면 그 학년 학급이 있는 그룹과 학급이 하나도 없는 그룹만 준다", async () => {
    const { result } = renderHook(() => useGroupOptions(classes, "고1"), {
      wrapper,
    });
    await waitFor(() => expect(ids(result.current)).toEqual(["g0", "g1"]));
  });

  it("읽는 중에는 학급에서 만든 목록을, 실패하면 계속 그 목록을 준다", async () => {
    mocks.request.mockResolvedValue({
      status: 500,
      body: {},
      retryAfterSeconds: null,
    });
    const { result } = renderHook(() => useGroupOptions(classes, "고1"), {
      wrapper,
    });
    expect(ids(result.current)).toEqual(["g1"]);
    await waitFor(() => expect(mocks.request).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(ids(result.current)).toEqual(["g1"]);
  });

  it("고른 그룹이 걸러졌어도 선택지에 남긴다", async () => {
    const { result } = renderHook(() => useGroupOptions(classes, "고1", "g2"), {
      wrapper,
    });
    expect(ids(result.current)).toContain("g2");
    await waitFor(() =>
      expect(ids(result.current)).toEqual(["g0", "g1", "g2"]),
    );
  });

  it("학교는 그룹을 읽지 않고 학급에서 만든 목록을 준다", async () => {
    const { result } = renderHook(
      () => useGroupOptions(classes, "", "", false),
      { wrapper },
    );
    expect(ids(result.current)).toEqual(["g1", "g2"]);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
