import { describe, expect, test } from "vitest";
import {
  canRecover,
  type InquirySessionItem,
  ledgerLabel,
  modeRows,
  statusLabel,
  stepLabel,
  terminalLabel,
} from "./inquirySessionsRow";

const mode = {
  status: "pending",
  attempts: 0,
  startedAt: null,
  finishedAt: null,
  issues: [],
};
const base: InquirySessionItem = {
  id: "s1",
  profileId: "p1",
  studentName: "김위닝",
  email: "a@b.c",
  status: "archived",
  currentStep: 3,
  subject: "물리",
  topicTitle: null,
  completedAt: null,
  lastActivityAt: "2026-10-01T00:00:00Z",
  ledgerId: "l1",
  ledgerReversedAt: null,
  terminal: null,
  generation: {
    modes: {
      topic_recommendation: mode,
      design_report: { ...mode, status: "failed", attempts: 3, issues: ["x"] },
      evaluation_report: mode,
    },
    terminal: null,
  },
  evaluationCount: 0,
  topicRoundCount: 1,
};

describe("statusLabel, stepLabel", () => {
  test("상태는 한글로, 모르는 값은 그대로", () => {
    expect(statusLabel("in_progress")).toBe("진행 중");
    expect(statusLabel("archived")).toBe("종결");
    expect(statusLabel("zzz")).toBe("zzz");
  });
  test("단계는 6단계 중 몇 번째", () => {
    expect(stepLabel(3)).toBe("3/6");
  });
});

describe("ledgerLabel", () => {
  test("원장이 없으면 없음, 있으면 차감, 되돌렸으면 복구됨", () => {
    expect(ledgerLabel({ ledgerId: null, ledgerReversedAt: null })).toBe(
      "없음",
    );
    expect(ledgerLabel({ ledgerId: "l", ledgerReversedAt: null })).toBe("차감");
    expect(ledgerLabel({ ledgerId: "l", ledgerReversedAt: "t" })).toBe(
      "복구됨",
    );
  });
});

describe("terminalLabel, canRecover", () => {
  const terminal = { reason: "시도 상한 초과", at: "t", mode: "design_report" };
  test("종결 사유에 mode 한글명을 붙인다", () => {
    expect(terminalLabel(null)).toBe("-");
    expect(terminalLabel(terminal)).toBe("시도 상한 초과 (설계 리포트)");
  });
  test("archived 이고 terminal 이 있을 때만 복구 가능", () => {
    expect(canRecover({ status: "archived", terminal })).toBe(true);
    expect(canRecover({ status: "archived", terminal: null })).toBe(false);
    expect(canRecover({ status: "completed", terminal })).toBe(false);
  });
});

describe("modeRows", () => {
  test("3 mode 를 고정 순서와 한글명으로 펼친다", () => {
    const rows = modeRows(base);
    expect(rows.map((r) => r.label)).toEqual([
      "주제 추천",
      "설계 리포트",
      "평가 리포트",
    ]);
    expect(rows[1]).toMatchObject({
      status: "failed",
      attempts: 3,
      issues: ["x"],
    });
  });
  test("issues 는 문자열로 바꾼다", () => {
    const rows = modeRows({
      ...base,
      generation: {
        ...base.generation,
        modes: {
          ...base.generation.modes,
          design_report: { ...mode, issues: [{ code: "a" }, "b"] },
        },
      },
    });
    expect(rows[1]?.issues).toEqual(['{"code":"a"}', "b"]);
  });
});
