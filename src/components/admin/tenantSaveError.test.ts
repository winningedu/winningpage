import { describe, expect, it } from "vitest";
import { tenantSaveErrorMessage } from "./tenantSaveError";

describe("tenantSaveErrorMessage", () => {
  it("같은 번호 회원이 이미 있어 unique 위반(23505)이면 안내 문구를 준다", () => {
    expect(
      tenantSaveErrorMessage({ code: "23505", message: "duplicate key" }),
    ).toBe(
      "이 기관에 같은 휴대폰 번호의 회원이 이미 있어요. 확인 후 다시 옮겨 주세요.",
    );
  });

  it("올해 학적이 다른 기관에 있어 WC100이면 기관 이동 화면을 쓰라고 안내한다", () => {
    expect(
      tenantSaveErrorMessage({
        code: "WC100",
        message: "other_tenant_enrollment",
      }),
    ).toBe(
      "이 학생은 올해 학적이 다른 기관에 있어요. 학생 기관 이동 화면에서 옮겨 주세요.",
    );
  });

  it("그 밖의 오류는 기존처럼 소속 저장 실패와 원문을 준다", () => {
    expect(
      tenantSaveErrorMessage({ code: "WC072", message: "not_authorized" }),
    ).toBe("소속 저장 실패: not_authorized");
  });
});
