import { describe, expect, test } from "vitest";
import {
  emptyTenantForm,
  type TenantFormValues,
  tenantFormFromRow,
  tenantPayload,
  validateTenantForm,
} from "./tenantForm";

function form(over: Partial<TenantFormValues> = {}): TenantFormValues {
  return { ...emptyTenantForm(), name: "한빛고", ...over };
}

describe("validateTenantForm", () => {
  test("이름이 비면 거부한다", () => {
    expect(validateTenantForm(form({ name: "  " }))).toBe(
      "이름 항목을 입력해주세요.",
    );
  });

  test("계약 시작일이 종료일보다 늦으면 거부하고 같은 날은 통과한다", () => {
    expect(
      validateTenantForm(
        form({
          contract_start_date: "2027-03-01",
          contract_end_date: "2027-02-28",
        }),
      ),
    ).toBe("계약 시작일은 종료일보다 늦을 수 없어요.");
    expect(
      validateTenantForm(
        form({
          contract_start_date: "2027-02-28",
          contract_end_date: "2027-02-28",
        }),
      ),
    ).toBeNull();
  });

  test("유예 종료일이 계약 종료일보다 앞서면 거부한다", () => {
    expect(
      validateTenantForm(
        form({ contract_end_date: "2027-02-28", grace_ends_on: "2027-02-27" }),
      ),
    ).toBe("유예 종료일은 계약 종료일과 같거나 그 뒤여야 해요.");
  });

  test("종료일이 비어 있으면 시작일과 유예 종료일은 비교하지 않는다", () => {
    expect(
      validateTenantForm(
        form({
          contract_start_date: "2030-01-01",
          grace_ends_on: "2020-01-01",
        }),
      ),
    ).toBeNull();
  });

  test("학기 길이는 비우거나 3 또는 6 만 된다", () => {
    expect(validateTenantForm(form({ term_months: "4" }))).toBe(
      "학기 길이는 3개월 또는 6개월이어야 해요.",
    );
    expect(validateTenantForm(form({ term_months: "3" }))).toBeNull();
    expect(validateTenantForm(form({ term_months: "6" }))).toBeNull();
    expect(validateTenantForm(form({ term_months: "" }))).toBeNull();
  });

  test("이메일, 전화, 홈페이지 형식을 org-info 와 같은 규칙으로 검사한다", () => {
    expect(validateTenantForm(form({ contact_email: "a@b" }))).toBe(
      "담당 이메일 형식을 확인해 주세요.",
    );
    expect(validateTenantForm(form({ contact_phone: "02 123" }))).toBe(
      "담당 전화번호는 숫자와 하이픈만 쓸 수 있어요.",
    );
    expect(validateTenantForm(form({ contact_mobile: "abc" }))).toBe(
      "담당 휴대전화는 숫자와 하이픈만 쓸 수 있어요.",
    );
    expect(validateTenantForm(form({ main_phone: "x" }))).toBe(
      "대표 전화는 숫자와 하이픈만 쓸 수 있어요.",
    );
    expect(validateTenantForm(form({ homepage: "example.com" }))).toBe(
      "홈페이지는 http:// 또는 https:// 로 시작해야 해요.",
    );
    expect(
      validateTenantForm(
        form({
          contact_email: "a@b.kr",
          contact_phone: "02-123-4567",
          contact_mobile: "010-1111-2222",
          main_phone: "051-902-0080",
          homepage: "https://hanbit.kr",
        }),
      ),
    ).toBeNull();
  });
});

describe("tenantPayload", () => {
  test("비운 선택 항목은 null 로 보내고 학기 길이는 숫자로 바꾼다", () => {
    const payload = tenantPayload(
      form({ term_months: "6", contract_end_date: "", address: "  " }),
    );

    expect(payload).toMatchObject({
      name: "한빛고",
      term_months: 6,
      contract_end_date: null,
      address: null,
      mou_status: null,
      grace_ends_on: null,
      contact_name: null,
    });
  });

  test("소속 코드는 페이로드에 절대 들어가지 않는다", () => {
    const row = {
      code: "ABCD2345",
      name: "한빛고",
      region: "서울",
      org_type: "학교",
      tier: "B",
    };

    const payload = tenantPayload(tenantFormFromRow(row));

    expect(Object.keys(payload)).not.toContain("code");
    expect(Object.keys(payload)).not.toContain("is_catch_all");
  });
});

describe("tenantFormFromRow", () => {
  test("null 칼럼은 빈 문자열로 채워 입력칸이 제어 상태를 유지한다", () => {
    const values = tenantFormFromRow({
      name: "한빛고",
      region: "서울",
      org_type: "학교",
      tier: "B",
      term_months: 3,
      mou_status: "signed",
      contract_start_date: "2026-03-01",
    });

    expect(values.term_months).toBe("3");
    expect(values.mou_status).toBe("signed");
    expect(values.contract_end_date).toBe("");
    expect(values.contact_email).toBe("");
  });
});
