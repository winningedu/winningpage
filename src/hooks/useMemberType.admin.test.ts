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
});
