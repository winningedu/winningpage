import { describe, expect, it } from "vitest";
import type { AdvanceOutcome } from "./advance.js";
import {
  pickResumable,
  pickUnreversed,
  type ResumeCandidateRow,
  summarizeOutcome,
} from "./resume.js";

const NOW = "2026-10-06T10:00:00.000Z";
const ago = (sec: number) =>
  new Date(Date.parse(NOW) - sec * 1000).toISOString();

function row(over: Partial<ResumeCandidateRow> = {}): ResumeCandidateRow {
  return {
    id: "r1",
    profile_id: "p1",
    status: "in_progress",
    step_state: { steps: { 1: { status: "ok" } } },
    last_activity_at: ago(300),
    ...over,
  };
}

describe("pickResumable", () => {
  it("오래 멈춘 in_progress 회차의 다음 단계를 고른다", () => {
    expect(pickResumable([row()], NOW)).toEqual([
      { reportId: "r1", profileId: "p1", step: 2 },
    ]);
  });

  it("in_progress 가 아니거나 terminal 이 있으면 제외한다", () => {
    const terminal = {
      steps: {},
      terminal: { reason: "x", at: NOW, step: 1 },
    };
    expect(
      pickResumable(
        [
          row({ id: "a", status: "draft" }),
          row({ id: "b", profile_id: "p2", step_state: terminal }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });

  it("마지막 활동이 정체 기준보다 최근이면 제외한다", () => {
    expect(pickResumable([row({ last_activity_at: ago(119) })], NOW)).toEqual(
      [],
    );
    expect(
      pickResumable([row({ last_activity_at: ago(121) })], NOW),
    ).toHaveLength(1);
  });

  it("모든 단계가 ok 면 제외한다", () => {
    const steps: Record<number, { status: string }> = {};
    for (let n = 1; n <= 12; n++) steps[n] = { status: "ok" };
    expect(pickResumable([row({ step_state: { steps } })], NOW)).toEqual([]);
  });

  it("다음 단계가 선점 유효 시간 안의 running 이면 제외한다", () => {
    const running = (startedAt: string) => ({
      steps: { 1: { status: "ok" }, 2: { status: "running", startedAt } },
    });
    expect(
      pickResumable([row({ step_state: running(ago(100)) })], NOW),
    ).toEqual([]);
    expect(
      pickResumable([row({ step_state: running(ago(130)) })], NOW),
    ).toEqual([{ reportId: "r1", profileId: "p1", step: 2 }]);
  });

  it("활동이 오래된 순으로 최대 3건, 같은 프로필은 1건만 고른다", () => {
    const rows = [
      row({ id: "a", profile_id: "p1", last_activity_at: ago(900) }),
      row({ id: "b", profile_id: "p1", last_activity_at: ago(800) }),
      row({ id: "c", profile_id: "p2", last_activity_at: ago(700) }),
      row({ id: "d", profile_id: "p3", last_activity_at: ago(1000) }),
      row({ id: "e", profile_id: "p4", last_activity_at: ago(600) }),
      row({ id: "f", profile_id: "p5", last_activity_at: ago(500) }),
    ];
    expect(pickResumable(rows, NOW).map((p) => p.reportId)).toEqual([
      "d",
      "a",
      "c",
    ]);
  });
});

describe("pickUnreversed", () => {
  it("종결 실패(terminal)로 archived 됐고 되돌림 전인 회차만 고른다", () => {
    const terminal = { steps: {}, terminal: { reason: "x", at: NOW, step: 1 } };
    const base = {
      id: "r",
      profile_id: "p",
      status: "archived",
      step_state: terminal as unknown,
      ledger_id: "l" as string | null,
      ledger_reversed_at: null as string | null,
    };
    expect(
      pickUnreversed([
        { ...base, id: "ok" },
        { ...base, id: "done", ledger_reversed_at: NOW },
        { ...base, id: "noledger", ledger_id: null },
        { ...base, id: "active", status: "in_progress" },
        { ...base, id: "expired", step_state: { steps: {} } },
      ]),
    ).toEqual([{ reportId: "ok", profileId: "p" }]);
  });
});

describe("summarizeOutcome", () => {
  const state = { steps: {} };
  it("종류와 종결 여부를 요약한다", () => {
    const cases: [AdvanceOutcome, { kind: string; terminal: boolean }][] = [
      [
        { kind: "ok", state },
        { kind: "ok", terminal: false },
      ],
      [
        { kind: "done", state },
        { kind: "done", terminal: false },
      ],
      [
        {
          kind: "failure",
          failure: "upstream",
          issues: [],
          state,
          terminal: true,
        },
        { kind: "failure", terminal: true },
      ],
      [
        {
          kind: "claim_error",
          claim: { kind: "running" },
          state,
          terminal: false,
        },
        { kind: "claim_error", terminal: false },
      ],
      [{ kind: "superseded" }, { kind: "superseded", terminal: false }],
    ];
    for (const [outcome, expected] of cases)
      expect(summarizeOutcome(outcome)).toEqual(expected);
  });
});
