import { describe, expect, test } from "vitest";
import {
  buildServiceRows,
  enableRow,
  type ProgramKey,
  SERVICE_PROGRAMS,
  type ServiceRowForm,
  settingPayload,
  type UsageDefaults,
  validateServiceRow,
} from "./serviceSettings";

const DEFAULTS: UsageDefaults = {
  diagnose: { monthly_limit: 1 },
  suhaeng: {
    monthly_limit: 10,
    term_limit_by_term_months: { "6": 24, "3": 12 },
  },
};

function rowOf(rows: ServiceRowForm[], key: ProgramKey): ServiceRowForm {
  const row = rows.find((r) => r.programKey === key);
  if (!row) throw new Error(key);
  return row;
}

describe("buildServiceRows", () => {
  test("행이 없는 서비스는 제공 안 함으로 6개를 사 #5 순서로 보인다", () => {
    const rows = buildServiceRows([]);

    expect(rows.map((r) => r.programKey)).toEqual([
      "diagnose",
      "target",
      "growth",
      "suhaeng",
      "inquiry",
      "selfeval",
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      "학습진단",
      "목표관리",
      "성장설계",
      "수행평가",
      "심화탐구",
      "자기평가",
    ]);
    expect(rows.every((r) => !r.provided && !r.saved)).toBe(true);
    expect(SERVICE_PROGRAMS).toHaveLength(6);
  });

  test("저장된 행은 저장 값을 그대로 보이고 꺼진 행은 제공 안 함이다", () => {
    const rows = buildServiceRows([
      {
        program_key: "diagnose",
        enabled: true,
        starts_on: "2026-03-01",
        ends_on: null,
        monthly_limit: 3,
        term_limit: null,
      },
      {
        program_key: "growth",
        enabled: false,
        starts_on: null,
        ends_on: null,
        monthly_limit: 2,
        term_limit: null,
      },
    ]);

    expect(rows[0]).toMatchObject({
      provided: true,
      saved: true,
      startsOn: "2026-03-01",
      endsOn: "",
      monthlyLimit: "3",
      termLimit: "",
    });
    expect(rows[2]).toMatchObject({
      provided: false,
      saved: true,
      monthlyLimit: "2",
    });
  });
});

describe("enableRow", () => {
  test("저장된 적 없는 행을 켜면 기본 한도를 채우고 학기 한도는 학기 길이로 고른다", () => {
    const suhaeng = rowOf(buildServiceRows([]), "suhaeng");
    const enabled = enableRow(suhaeng, DEFAULTS, 3);

    expect(enabled).toMatchObject({
      provided: true,
      monthlyLimit: "10",
      termLimit: "12",
    });
  });

  test("학기 길이가 비어 있으면 학기 한도를 비운다", () => {
    const suhaeng = rowOf(buildServiceRows([]), "suhaeng");
    const enabled = enableRow(suhaeng, DEFAULTS, null);

    expect(enabled).toMatchObject({ monthlyLimit: "10", termLimit: "" });
  });

  test("기본값이 없는 서비스는 한도를 비운 채로 켠다", () => {
    const target = rowOf(buildServiceRows([]), "target");
    expect(enableRow(target, DEFAULTS, 6)).toMatchObject({
      provided: true,
      monthlyLimit: "",
      termLimit: "",
    });
  });

  test("저장된 적 있는 행을 다시 켜도 저장 값을 덮지 않는다", () => {
    const diagnose = rowOf(
      buildServiceRows([
        {
          program_key: "diagnose",
          enabled: false,
          starts_on: null,
          ends_on: null,
          monthly_limit: 5,
          term_limit: null,
        },
      ]),
      "diagnose",
    );
    expect(enableRow(diagnose, DEFAULTS, 6)).toMatchObject({
      provided: true,
      monthlyLimit: "5",
    });
  });
});

describe("settingPayload", () => {
  const base = rowOf(buildServiceRows([]), "diagnose");

  test("빈 칸은 null, 숫자 칸은 정수로 바꾸고 updated_by 를 싣는다", () => {
    const row = {
      ...base,
      provided: true,
      startsOn: "2026-03-01",
      monthlyLimit: "3",
    };

    expect(settingPayload("tenant-7", row, "user-1")).toEqual({
      tenant_id: "tenant-7",
      program_key: "diagnose",
      enabled: true,
      starts_on: "2026-03-01",
      ends_on: null,
      monthly_limit: 3,
      term_limit: null,
      updated_by: "user-1",
    });
  });

  test("제공 안 함은 enabled false 로 보낸다(행을 지우지 않는다)", () => {
    expect(settingPayload("tenant-7", base, "user-1").enabled).toBe(false);
  });
});

describe("validateServiceRow", () => {
  const base = { ...rowOf(buildServiceRows([]), "diagnose"), provided: true };

  test("정상 값과 빈 한도는 통과한다", () => {
    expect(validateServiceRow(base)).toBeNull();
    expect(validateServiceRow({ ...base, monthlyLimit: "2" })).toBeNull();
  });

  test.each(["0", "-1", "1.5", "abc", "40000"])(
    "한도 %s 는 거절한다",
    (value) => {
      expect(validateServiceRow({ ...base, monthlyLimit: value })).toBe(
        "한도는 1 이상 32767 이하의 정수로 넣어 주세요.",
      );
      expect(validateServiceRow({ ...base, termLimit: value })).toBe(
        "한도는 1 이상 32767 이하의 정수로 넣어 주세요.",
      );
    },
  );

  test("시작일이 종료일보다 늦으면 거절한다", () => {
    expect(
      validateServiceRow({
        ...base,
        startsOn: "2026-05-01",
        endsOn: "2026-04-01",
      }),
    ).toBe("서비스 시작일은 종료일보다 늦을 수 없어요.");
  });
});
