// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { profileRow } = vi.hoisted(() => ({
  profileRow: { current: {} as Record<string, unknown> },
}));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "u1", isReady: true }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profileRow.current, error: null }),
        }),
      }),
    }),
  },
}));

import { useMemberType } from "./useMemberType";

describe("useMemberType 관리자 통과", () => {
  beforeEach(() => {
    profileRow.current = {};
  });

  it("role=admin 은 member_type 이 비어 있어도 student 로 판정된다", async () => {
    profileRow.current = { member_type: "", role: "admin" };
    const { result } = renderHook(() => useMemberType());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.memberType).toBe("student");
  });

  it("일반 mentor 는 그대로 mentor 다", async () => {
    profileRow.current = { member_type: "mentor", role: "user" };
    const { result } = renderHook(() => useMemberType());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.memberType).toBe("mentor");
  });

  it("앞뒤 공백이 있는 member_type 도 다듬어서 판정한다", async () => {
    profileRow.current = { member_type: " Parent ", role: "user" };
    const { result } = renderHook(() => useMemberType());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.memberType).toBe("parent");
  });

  it("kind는 다듬은 member_type의 유형이고 관리자는 학생 경로의 student다", async () => {
    profileRow.current = { member_type: " Parent ", role: "user" };
    const parent = renderHook(() => useMemberType());
    await waitFor(() => expect(parent.result.current.loading).toBe(false));
    expect(parent.result.current.kind).toBe("parent");

    profileRow.current = { member_type: "", role: "admin" };
    const admin = renderHook(() => useMemberType());
    await waitFor(() => expect(admin.result.current.loading).toBe(false));
    expect(admin.result.current.kind).toBe("student");
  });

  it("유형이 비어 있으면 kind는 unset이다", async () => {
    profileRow.current = { member_type: "", role: "user" };
    const { result } = renderHook(() => useMemberType());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.kind).toBe("unset");
  });
});
