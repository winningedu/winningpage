import { describe, expect, test } from "vitest";
import {
  areaLabel,
  canRecover,
  ledgerLabel,
  statusLabel,
  stepLabel,
  terminalLabel,
} from "./selfevalSessionsRow";

describe("selfevalSessionsRow", () => {
  test("상태와 영역 라벨", () => {
    expect(statusLabel("archived")).toBe("종결");
    expect(statusLabel("zzz")).toBe("zzz");
    expect(areaLabel("subject")).toBe("교과");
    expect(areaLabel(null)).toBe("-");
  });

  test("단계는 0~6 중 현재 값을 n/6 으로 표시", () => {
    expect(stepLabel(3)).toBe("3/6");
  });

  test("차감 상태", () => {
    expect(ledgerLabel({ ledgerId: null, ledgerReversedAt: null })).toBe(
      "없음",
    );
    expect(ledgerLabel({ ledgerId: "l", ledgerReversedAt: null })).toBe("차감");
    expect(ledgerLabel({ ledgerId: "l", ledgerReversedAt: "t" })).toBe(
      "복구됨",
    );
  });

  test("종결 사유는 단계가 없으면 사유만", () => {
    expect(terminalLabel(null)).toBe("-");
    expect(terminalLabel({ reason: "discarded", at: "t", step: null })).toBe(
      "discarded",
    );
    expect(terminalLabel({ reason: "x", at: "t", step: "write" })).toBe(
      "x (write)",
    );
  });

  test("복구는 archived 이고 terminal 이 있을 때만", () => {
    const t = { reason: "discarded", at: "t", step: null };
    expect(canRecover({ status: "archived", terminal: t })).toBe(true);
    expect(canRecover({ status: "archived", terminal: null })).toBe(false);
    expect(canRecover({ status: "completed", terminal: t })).toBe(false);
  });
});
