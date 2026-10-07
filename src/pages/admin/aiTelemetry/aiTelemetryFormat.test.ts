import { describe, expect, test } from "vitest";
import {
  formatDate,
  formatInt,
  formatMs,
  formatPercent,
  formatUsd,
  KIND_OPTIONS,
  SERVICE_OPTIONS,
  STATUS_OPTIONS,
  serviceLabel,
} from "./aiTelemetryFormat";

describe("formatUsd", () => {
  test("소수 4자리로 표시하고 null 이면 빈 문자열이다", () => {
    expect(formatUsd(1.23456)).toBe("1.2346");
    expect(formatUsd(0)).toBe("0.0000");
    expect(formatUsd(null)).toBe("");
  });
});

describe("formatPercent", () => {
  test("소수 1자리 뒤에 %를 붙이고 null 이면 빈 문자열이다", () => {
    expect(formatPercent(12.345)).toBe("12.3%");
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(null)).toBe("");
  });
});

describe("formatInt", () => {
  test("천 단위 콤마를 넣는다", () => {
    expect(formatInt(1234567)).toBe("1,234,567");
    expect(formatInt(0)).toBe("0");
  });
});

describe("formatMs", () => {
  test("정수 밀리초에 콤마를 넣고 값이 없으면 빈 문자열이다", () => {
    expect(formatMs(1500)).toBe("1,500");
    expect(formatMs(null)).toBe("");
  });
});

describe("formatDate", () => {
  test("null 과 잘못된 값은 빈 문자열이다", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("not-a-date")).toBe("");
  });

  test("유효한 시각은 ko-KR 날짜시간 문자열이다", () => {
    expect(formatDate("2026-10-06T16:00:00Z")).toContain("2026");
  });
});

describe("serviceLabel", () => {
  test("알려진 서비스는 한글 이름, 모르면 키 그대로다", () => {
    expect(serviceLabel("performance")).toBe("수행평가");
    expect(serviceLabel("growth")).toBe("성장설계");
    expect(serviceLabel("inquiry")).toBe("심화탐구");
    expect(serviceLabel("selfeval")).toBe("자기평가서");
    expect(serviceLabel("goal")).toBe("목표관리");
    expect(serviceLabel("other")).toBe("other");
  });
});

describe("옵션 목록", () => {
  test("서비스, 종류, 상태 옵션을 value 와 label 로 둔다", () => {
    expect(SERVICE_OPTIONS.map((o) => o.value)).toEqual([
      "performance",
      "growth",
      "inquiry",
      "selfeval",
      "goal",
    ]);
    expect(KIND_OPTIONS.map((o) => o.value)).toEqual(["generate", "embed"]);
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual(["ok", "error"]);
  });
});
