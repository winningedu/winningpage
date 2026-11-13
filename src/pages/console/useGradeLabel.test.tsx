import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { ConsoleMe } from "./api";
import { adminMe } from "./testUtils";
import { ConsoleMeContext, useGradeLabel } from "./useConsoleMe";

const withOrg =
  (orgType: string) =>
  ({ children }: { children: ReactNode }) => {
    const me: ConsoleMe = {
      ...adminMe,
      tenant: { ...adminMe.tenant, orgType },
    };
    return (
      <ConsoleMeContext.Provider value={{ me, reload: async () => {} }}>
        {children}
      </ConsoleMeContext.Provider>
    );
  };

describe("useGradeLabel", () => {
  it("학원 기관은 원래 학년 값과 다학년을 돌려준다", () => {
    const { result } = renderHook(() => useGradeLabel(), {
      wrapper: withOrg("학원"),
    });
    expect(result.current("고1")).toBe("고1");
    expect(result.current(null)).toBe("다학년");
  });

  it("학교 기관은 N학년으로 돌려준다", () => {
    const { result } = renderHook(() => useGradeLabel(), {
      wrapper: withOrg("학교"),
    });
    expect(result.current("고1")).toBe("1학년");
  });
});
