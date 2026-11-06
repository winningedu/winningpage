import { describe, expect, test } from "vitest";
import {
  denyReasonLabel,
  groupByColumns,
  overridePayloads,
  resetPayloads,
  validateOverrideEdits,
} from "./studentUsage";

describe("overridePayloads", () => {
  test("고친 칸만 학생마다 만들고 빈 칸은 null 로 보낸다", () => {
    const rows = overridePayloads(
      ["s-1", "s-2"],
      {
        diagnose: { monthly: "2", term: "9" },
        suhaeng: { monthly: "", term: "" },
        growth: { monthly: "1", term: "5" },
      },
      new Set(["diagnose.monthly", "suhaeng.monthly", "suhaeng.term"]),
      "user-1",
    );

    expect(rows).toEqual([
      {
        profile_id: "s-1",
        program_key: "diagnose",
        monthly_limit: 2,
        updated_by: "user-1",
      },
      {
        profile_id: "s-1",
        program_key: "suhaeng",
        monthly_limit: null,
        term_limit: null,
        updated_by: "user-1",
      },
      {
        profile_id: "s-2",
        program_key: "diagnose",
        monthly_limit: 2,
        updated_by: "user-1",
      },
      {
        profile_id: "s-2",
        program_key: "suhaeng",
        monthly_limit: null,
        term_limit: null,
        updated_by: "user-1",
      },
    ]);
  });
});

describe("groupByColumns", () => {
  test("같은 열 묶음의 행끼리 모아 upsert 한 번으로 보낸다", () => {
    const a = { profile_id: "s-1", program_key: "diagnose", monthly_limit: 1 };
    const b = { profile_id: "s-1", program_key: "growth", term_limit: 2 };
    const c = { profile_id: "s-2", program_key: "diagnose", monthly_limit: 1 };

    expect(groupByColumns([a, b, c])).toEqual([[a, c], [b]]);
  });
});

describe("resetPayloads", () => {
  test("기관 설정으로 되돌리기는 6개 서비스 두 한도를 모두 null 로 보낸다", () => {
    const rows = resetPayloads(["s-1"], "user-1");

    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.program_key)).toEqual([
      "diagnose",
      "target",
      "growth",
      "suhaeng",
      "inquiry",
      "selfeval",
    ]);
    expect(
      rows.every(
        (r) =>
          r.monthly_limit === null &&
          r.term_limit === null &&
          r.updated_by === "user-1" &&
          r.profile_id === "s-1",
      ),
    ).toBe(true);
  });
});

describe("validateOverrideEdits", () => {
  test("고친 칸만 검사하고 정수가 아니면 안내한다", () => {
    const dirty = new Set(["diagnose.monthly"]);
    expect(
      validateOverrideEdits({ diagnose: { monthly: "2", term: "" } }, dirty),
    ).toBeNull();
    expect(
      validateOverrideEdits({ diagnose: { monthly: "0", term: "" } }, dirty),
    ).toBe("한도는 1 이상 32767 이하의 정수로 넣어 주세요.");
    expect(
      validateOverrideEdits({ growth: { monthly: "x", term: "" } }, dirty),
    ).toBeNull();
  });
});

describe("denyReasonLabel", () => {
  test("결정 99 문구로 막힘 사유를 풀고 허용이면 빈 문자열이다", () => {
    expect(denyReasonLabel(null)).toBe("");
    expect(denyReasonLabel("disabled")).toBe(
      "소속 기관에서 제공하지 않는 서비스예요.",
    );
    expect(denyReasonLabel("grace")).toBe(denyReasonLabel("outside_period"));
    expect(denyReasonLabel("month_cap")).toBe(
      "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
    );
    expect(denyReasonLabel("term_cap")).toBe(
      "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.",
    );
    expect(denyReasonLabel("catch_all")).toBe(
      "소속코드를 입력하면 서비스를 이용할 수 있어요.",
    );
  });
});
