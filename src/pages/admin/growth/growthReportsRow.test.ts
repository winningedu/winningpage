import { describe, expect, test } from "vitest";
import {
  canRecover,
  type GrowthReportItem,
  ledgerLabel,
  statusLabel,
  stepLabel,
  terminalLabel,
} from "./growthReportsRow";

const base: GrowthReportItem = {
  id: "r1",
  profileId: "p1",
  studentName: "홍길동",
  email: "a@b.c",
  status: "in_progress",
  currentStep: 3,
  track: null,
  issuedAt: null,
  lastActivityAt: null,
  ledgerId: null,
  ledgerReversedAt: null,
  terminal: null,
  progress: [],
};

describe("행 표시 변환", () => {
  test("상태 값을 한국어 라벨로 바꾸고 모르는 값은 그대로 둔다", () => {
    expect(statusLabel("draft")).toBe("초안");
    expect(statusLabel("in_progress")).toBe("진행 중");
    expect(statusLabel("completed")).toBe("완료");
    expect(statusLabel("archived")).toBe("종결");
    expect(statusLabel("weird")).toBe("weird");
  });

  test("단계는 n/8로 표시한다", () => {
    expect(stepLabel(3)).toBe("3/8");
  });

  test("차감 여부: ledger 없음, 차감, 복구됨", () => {
    expect(ledgerLabel(base)).toBe("없음");
    expect(ledgerLabel({ ...base, ledgerId: "l1" })).toBe("차감");
    expect(
      ledgerLabel({ ...base, ledgerId: "l1", ledgerReversedAt: "2026-10-01" }),
    ).toBe("복구됨");
  });

  test("종결 사유는 reason과 단계로, 없으면 대시", () => {
    expect(terminalLabel(null)).toBe("-");
    expect(
      terminalLabel({ reason: "expired", at: "2026-10-01", step: 4 }),
    ).toBe("expired (4단계)");
  });
});

describe("canRecover", () => {
  test("archived이고 terminal이 있을 때만 true", () => {
    const terminal = { reason: "x", at: "2026-10-01", step: 2 };
    expect(canRecover({ ...base, status: "archived", terminal })).toBe(true);
    expect(canRecover({ ...base, status: "archived", terminal: null })).toBe(
      false,
    );
    expect(canRecover({ ...base, status: "completed", terminal })).toBe(false);
  });
});
