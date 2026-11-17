import { describe, expect, it } from "vitest";
import { ADMIN_ROLE_LABEL, HOMEROOM_ROLE_LABEL } from "./roleLabel";

describe("roleLabel", () => {
  it("역할 이름은 표준 용어를 쓴다", () => {
    expect(HOMEROOM_ROLE_LABEL).toBe("담임 선생님");
    expect(ADMIN_ROLE_LABEL).toBe("전체 관리자");
  });
});
