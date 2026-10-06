import { describe, expect, it } from "vitest";
import { planRecovery, validateRecoverBody } from "./recover.js";

const terminal = {
  reason: "시도 상한 초과",
  at: "2026-10-02T00:00:00Z",
  mode: "design_report",
};
const row = {
  id: "s1",
  profile_id: "p1",
  status: "archived",
  grade_label: "고2",
  semester: 1,
  career: "의사",
  subject: "물리",
  growth_report_id: "g1",
  plan_item_id: "i1",
  selected_topic_id: "t1",
  design_report_id: "d1",
  generation_state: { modes: {}, terminal },
};
const NOW = "2026-10-06T00:00:00.000Z";
const assets = [
  {
    kind: "record",
    reliability: "A",
    position: 0,
    activity_record_id: "ar1",
    interview_answers: null,
    gaps: null,
    oneline_text: null,
  },
  {
    kind: "interview",
    reliability: "B",
    position: 1,
    activity_record_id: null,
    interview_answers: { q: "a" },
    gaps: ["빈틈"],
    oneline_text: null,
  },
];

describe("validateRecoverBody", () => {
  it("sessionId 가 uuid 여야 한다", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(validateRecoverBody({ sessionId: id })).toEqual({
      ok: true,
      sessionId: id,
    });
    expect(validateRecoverBody({ sessionId: "x" }).ok).toBe(false);
    expect(validateRecoverBody(null).ok).toBe(false);
  });
});

describe("planRecovery", () => {
  it("종결된 세션은 같은 입력으로 미차감 draft 새 세션을 만든다", () => {
    const r = planRecovery(row, assets, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session).toEqual({
      profile_id: "p1",
      status: "draft",
      current_step: 1,
      grade_label: "고2",
      semester: 1,
      career: "의사",
      subject: "물리",
      growth_report_id: "g1",
      plan_item_id: "i1",
      last_activity_at: NOW,
    });
  });

  it("주제, 설계, 차감 정보는 새 세션에 담지 않는다", () => {
    const r = planRecovery(row, assets, NOW);
    if (!r.ok) throw new Error("expected ok");
    for (const key of [
      "selected_topic_id",
      "design_report_id",
      "ledger_id",
      "generation_state",
    ])
      expect(r.session).not.toHaveProperty(key);
  });

  it("자산은 세션 id 없이 그대로 복사한다", () => {
    const r = planRecovery(row, assets, NOW);
    if (!r.ok) throw new Error("expected ok");
    expect(r.assets).toEqual([
      { profile_id: "p1", ...assets[0] },
      { profile_id: "p1", ...assets[1] },
    ]);
    expect(r.assets[1]?.gaps).not.toBe(assets[1]?.gaps);
  });

  it("archived 가 아니면 NOT_RECOVERABLE", () => {
    expect(planRecovery({ ...row, status: "completed" }, [], NOW)).toEqual({
      ok: false,
      code: "NOT_RECOVERABLE",
    });
  });

  it("terminal 이 없는 archived(만료 보관 등)는 NOT_RECOVERABLE", () => {
    expect(planRecovery({ ...row, generation_state: {} }, [], NOW)).toEqual({
      ok: false,
      code: "NOT_RECOVERABLE",
    });
  });

  it("이미 복구한 세션은 ALREADY_RECOVERED", () => {
    expect(
      planRecovery(
        {
          ...row,
          generation_state: { modes: {}, terminal, recoveredTo: "s2" },
        },
        [],
        NOW,
      ),
    ).toEqual({ ok: false, code: "ALREADY_RECOVERED" });
  });
});
