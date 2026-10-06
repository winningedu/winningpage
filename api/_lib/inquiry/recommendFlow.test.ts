import { describe, expect, it, vi } from "vitest";
import {
  buildTopicsInput,
  finalizeTopics,
  interpretCharge,
  isProvisional,
  persistRecommendation,
  precheckTopics,
  topicRowsOf,
  validateRecommendBody,
} from "./recommendFlow.js";
import type { AssetView, RecordRow, SessionRow } from "./views.js";
import type { ModelTopic } from "./validation.js";

const SID = "123e4567-e89b-12d3-a456-426614174000";

function sessionRow(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SID,
    status: "draft",
    grade_label: "고2",
    semester: 1,
    career: "의사",
    subject: "생명과학",
    growth_report_id: null,
    plan_item_id: null,
    reply_pending: false,
    selected_topic_id: null,
    design_report_id: null,
    latest_evaluation_id: null,
    final_report_id: null,
    generation_state: {},
    topic_round_count: 0,
    evaluation_count: 0,
    last_activity_at: "2026-10-06T00:00:00.000Z",
    completed_at: null,
    ...over,
  };
}

function asset(over: Partial<AssetView> = {}): AssetView {
  return {
    id: "a1",
    kind: "record",
    reliability: "A",
    position: 0,
    activityRecordId: "r1",
    interviewAnswers: null,
    gaps: [],
    onelineText: null,
    summary: "효소 활성 실험",
    ...over,
  };
}

function record(over: Partial<RecordRow> = {}): RecordRow {
  return {
    id: "r1",
    source_program: "deep",
    status: "confirmed",
    grade_label: "고2",
    semester: 1,
    subject_group: "교과",
    subject: "생명과학",
    topic: "효소 활성 실험",
    concept: "활성화 에너지",
    limitation: "온도 범위가 좁음",
    confirmed_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

describe("validateRecommendBody", () => {
  it("sessionId 와 seedTopic 을 읽는다", () => {
    expect(
      validateRecommendBody({ sessionId: SID, seedTopic: "  효소 조절  " }),
    ).toEqual({ ok: true, body: { sessionId: SID, seedTopic: "효소 조절" } });
  });

  it("seedTopic 이 없거나 비면 null 이다", () => {
    expect(validateRecommendBody({ sessionId: SID })).toEqual({
      ok: true,
      body: { sessionId: SID, seedTopic: null },
    });
    expect(validateRecommendBody({ sessionId: SID, seedTopic: "  " })).toEqual({
      ok: true,
      body: { sessionId: SID, seedTopic: null },
    });
  });

  it.each([
    [null],
    [{}],
    [{ sessionId: "nope" }],
    [{ sessionId: SID, seedTopic: 3 }],
    [{ sessionId: SID, seedTopic: "가".repeat(201) }],
  ])("잘못된 본문 %j 은 거절한다", (body) => {
    expect(validateRecommendBody(body).ok).toBe(false);
  });
});

describe("precheckTopics", () => {
  it("열린 세션이면 다음 라운드 번호와 세션 정보를 돌려준다", () => {
    const r = precheckTopics(sessionRow({ topic_round_count: 1 }));
    expect(r).toMatchObject({
      ok: true,
      round: 2,
      info: {
        gradeLabel: "고2",
        semester: 1,
        career: "의사",
        subject: "생명과학",
      },
    });
  });

  it("설계 리포트가 있으면 SESSION_LOCKED 409", () => {
    expect(
      precheckTopics(sessionRow({ design_report_id: "d1" })),
    ).toMatchObject({ ok: false, status: 409, code: "SESSION_LOCKED" });
  });

  it("닫힌 세션이면 SESSION_NOT_OPEN 409", () => {
    expect(precheckTopics(sessionRow({ status: "archived" }))).toMatchObject({
      ok: false,
      status: 409,
      code: "SESSION_NOT_OPEN",
    });
  });

  it("재추천 상한이면 ROUND_LIMIT 409 와 maxRounds", () => {
    expect(precheckTopics(sessionRow({ topic_round_count: 4 }))).toMatchObject({
      ok: false,
      status: 409,
      code: "ROUND_LIMIT",
      extra: { maxRounds: 4 },
    });
  });

  it("기본 정보가 비면 STEP_ORDER 409(값을 지어내지 않는다)", () => {
    expect(precheckTopics(sessionRow({ career: null }))).toMatchObject({
      ok: false,
      status: 409,
      code: "STEP_ORDER",
    });
    expect(precheckTopics(sessionRow({ grade_label: null }))).toMatchObject({
      ok: false,
      code: "STEP_ORDER",
    });
  });
});

describe("buildTopicsInput", () => {
  const info = {
    gradeLabel: "고2" as const,
    semester: 1 as const,
    career: "의사",
    subject: "생명과학",
  };

  it("record 자산은 기록의 개념과 한계를, 학년 규칙은 STAGE_LINK_RULES 를 쓴다", () => {
    const input = buildTopicsInput({
      info,
      assets: [asset()],
      records: [record()],
      excludedTitles: ["이전 제목"],
      seedTopic: "효소",
      handoff: null,
      planItemId: null,
    });
    expect(input).toMatchObject({
      grade: "고2",
      semester: 1,
      career: "의사",
      subject: "생명과학",
      primaryAssetIndex: 0,
      excludedTitles: ["이전 제목"],
      seedTopic: "효소",
      recommendedKinds: ["critique", "transfer", "extension"],
      discouragedKinds: [],
      handoff: null,
      assets: [
        {
          kind: "record",
          reliability: "A",
          summary: "효소 활성 실험",
          concept: "활성화 에너지",
          limitation: "온도 범위가 좁음",
        },
      ],
    });
  });

  it("interview 자산은 q1 을 요약으로, 선택한 빈틈을 한계로 쓴다", () => {
    const input = buildTopicsInput({
      info,
      assets: [
        asset({
          kind: "interview",
          reliability: "B",
          activityRecordId: null,
          interviewAnswers: { q1: "삼투 실험" },
          gaps: ["농도 기준", "반복 횟수"],
          summary: "삼투 실험",
        }),
      ],
      records: [],
      excludedTitles: [],
      seedTopic: null,
      handoff: null,
      planItemId: null,
    });
    expect(input.assets).toEqual([
      {
        kind: "interview",
        reliability: "B",
        summary: "삼투 실험",
        concept: null,
        limitation: "농도 기준, 반복 횟수",
      },
    ]);
  });

  it("oneline 자산은 text 를 요약으로 쓴다", () => {
    const input = buildTopicsInput({
      info,
      assets: [
        asset({
          kind: "oneline",
          reliability: "C",
          activityRecordId: null,
          onelineText: "혈당 조절",
          summary: "혈당 조절",
        }),
      ],
      records: [],
      excludedTitles: [],
      seedTopic: null,
      handoff: null,
      planItemId: null,
    });
    expect(input.assets[0]).toMatchObject({
      kind: "oneline",
      summary: "혈당 조절",
    });
  });

  it("position 이 가장 작은 자산이 기본 출발 활동이다", () => {
    const input = buildTopicsInput({
      info,
      assets: [
        asset({ id: "a2", position: 1, summary: "둘째" }),
        asset({ id: "a1", position: 0, summary: "첫째" }),
      ],
      records: [],
      excludedTitles: [],
      seedTopic: null,
      handoff: null,
      planItemId: null,
    });
    expect(input.assets.map((a) => a.summary)).toEqual(["첫째", "둘째"]);
    expect(input.primaryAssetIndex).toBe(0);
  });

  it("성장설계 수신값은 세션 학년 기준 단계, 소주제, 과제 제목으로 줄인다", () => {
    const input = buildTopicsInput({
      info,
      assets: [asset()],
      records: [],
      excludedTitles: [],
      seedTopic: null,
      handoff: {
        reportId: "g1",
        issuedAt: "2026-09-01T00:00:00.000Z",
        theme: "생명 윤리",
        subthemes: [
          { grade: "고1", stage: "seed", text: "고1 소주제" },
          { grade: "고2", stage: "flower", text: "고2 소주제" },
        ],
        stage: "seed",
        weakAxes: ["B"],
        signals: null,
        planItems: [
          {
            id: "p1",
            title: "과제1",
            description: null,
            category: null,
            axis: null,
          },
        ],
        stale: false,
        stageMismatch: true,
        autoSelectedPlanItemId: null,
      },
      planItemId: "p1",
    });
    expect(input.handoff).toEqual({
      theme: "생명 윤리",
      stageLabel: "꽃",
      subthemeText: "고2 소주제",
      weakAxes: ["B"],
      planItemTitle: "과제1",
    });
  });
});

describe("isProvisional", () => {
  it("쓸 수 있는 자산이 0건이면 예비 주제다", () => {
    expect(isProvisional([])).toBe(true);
    expect(isProvisional([asset({ summary: null })])).toBe(true);
    expect(isProvisional([asset()])).toBe(false);
  });
});

function modelTopic(over: Partial<ModelTopic> = {}): ModelTopic {
  return {
    linkKind: "followup",
    title: "제목",
    subtitle: "부제",
    question: "질문?",
    hypothesis1: "가설1",
    hypothesis2: "가설2",
    verifiability: "검증",
    concepts: ["a", "b", "c", "d"],
    methodSteps: ["1", "2", "3", "4"],
    sourceCandidates: ["기관"],
    reason: "이유",
    careerLink: "직무",
    nextDirection: "다음",
    path: { from: "활동", via: "후속", to: "질문" },
    fitReason: "어긋난다",
    followUpQuestions: ["q1", "q2", "q3"],
    ...over,
  };
}

describe("finalizeTopics", () => {
  const topics = [
    modelTopic({ linkKind: "followup", title: "T1" }),
    modelTopic({ linkKind: "critique", title: "T2" }),
    modelTopic({ linkKind: "extension", title: "T3" }),
  ];

  it("고3 은 권장 유형이 앞에 오도록 정렬하고 idx 를 1~3 으로 매긴다", () => {
    const out = finalizeTopics(topics, { grade: "고3", provisional: false });
    expect(out.map((t) => [t.idx, t.linkKind, t.fit])).toEqual([
      [1, "followup", "match"],
      [2, "critique", "match"],
      [3, "extension", "off"],
    ]);
  });

  it("적합도는 서버 계산값이고 비권장일 때만 fitReason 을 남긴다", () => {
    const out = finalizeTopics(topics, { grade: "고3", provisional: false });
    expect(out[0]?.detail.fitReason).toBeNull();
    expect(out[2]?.detail.fitReason).toBe("어긋난다");
  });

  it("연계 허용값은 자산 유무로 정한다", () => {
    expect(
      finalizeTopics(topics, { grade: "고2", provisional: false }).map(
        (t) => t.linkageType,
      ),
    ).toEqual(["direct", "direct", "direct"]);
    expect(
      finalizeTopics(topics, { grade: "고2", provisional: true }).map(
        (t) => t.linkageType,
      ),
    ).toEqual([
      "interest_based_provisional",
      "interest_based_provisional",
      "interest_based_provisional",
    ]);
  });

  it("확인 질문은 예비 주제에만 남긴다", () => {
    const direct = finalizeTopics(topics, { grade: "고2", provisional: false });
    const prov = finalizeTopics(topics, { grade: "고2", provisional: true });
    expect(direct[0]?.detail.followUpQuestions).toEqual([]);
    expect(prov[0]?.detail.followUpQuestions).toEqual(["q1", "q2", "q3"]);
  });

  it("detail 에는 linkKind 를 넣지 않는다", () => {
    const out = finalizeTopics(topics, { grade: "고2", provisional: false });
    expect(out.every((x) => !("linkKind" in x.detail))).toBe(true);
    expect(out.find((x) => x.linkKind === "followup")?.detail.title).toBe("T1");
  });
});

describe("topicRowsOf", () => {
  it("DB 행 모양으로 바꾼다", () => {
    const finals = finalizeTopics([modelTopic()], {
      grade: "고2",
      provisional: false,
    });
    expect(topicRowsOf("s1", "u1", 2, finals)).toEqual([
      {
        session_id: "s1",
        profile_id: "u1",
        round: 2,
        idx: 1,
        link_kind: "followup",
        linkage_type: "direct",
        fit: "neutral",
        detail: finals[0]?.detail,
      },
    ]);
  });
});

describe("interpretCharge", () => {
  it("charged 면 in_progress 로 올린다", () => {
    expect(interpretCharge({ status: "charged", charged: true })).toEqual({
      charged: true,
      markInProgress: true,
    });
  });
  it("already_charged 도 차감된 것으로 본다", () => {
    expect(
      interpretCharge({ status: "already_charged", charged: false }),
    ).toEqual({
      charged: true,
      markInProgress: true,
    });
  });
  it("거절은 charged false 로 통과하고 draft 로 둔다", () => {
    expect(
      interpretCharge({ status: "quota_exhausted", charged: false }),
    ).toEqual({ charged: false, markInProgress: false });
    expect(interpretCharge(null)).toEqual({
      charged: false,
      markInProgress: false,
    });
  });
});

describe("persistRecommendation", () => {
  const rows = [{ idx: 1 }] as never;
  function io(over: Record<string, unknown> = {}) {
    return {
      saveTopicRound: vi.fn(async () => [{ id: "t1" }] as never),
      consume: vi.fn(async () => ({ status: "charged", charged: true })),
      markInProgress: vi.fn(async () => {}),
      ...over,
    };
  }

  it("draft 세션은 저장 뒤 차감하고 in_progress 로 올린다", async () => {
    const x = io();
    const r = await persistRecommendation(x, { status: "draft", rows });
    expect(r).toEqual({ topics: [{ id: "t1" }], charged: true });
    expect(x.saveTopicRound).toHaveBeenCalledWith(rows);
    expect(x.consume).toHaveBeenCalledTimes(1);
    expect(x.markInProgress).toHaveBeenCalledTimes(1);
  });

  it("차감이 거절돼도 결과는 막지 않고 charged false 다", async () => {
    const x = io({
      consume: vi.fn(async () => ({
        status: "quota_exhausted",
        charged: false,
      })),
    });
    const r = await persistRecommendation(x, { status: "draft", rows });
    expect(r.charged).toBe(false);
    expect(x.markInProgress).not.toHaveBeenCalled();
  });

  it("차감 RPC 가 던져도 막지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const x = io({ consume: vi.fn().mockRejectedValue(new Error("db")) });
    const r = await persistRecommendation(x, { status: "draft", rows });
    spy.mockRestore();
    expect(r.charged).toBe(false);
  });

  it("이미 in_progress 면 차감을 시도하지 않는다", async () => {
    const x = io();
    const r = await persistRecommendation(x, { status: "in_progress", rows });
    expect(r.charged).toBe(false);
    expect(x.consume).not.toHaveBeenCalled();
  });

  it("저장이 던지면 차감하지 않고 그대로 던진다", async () => {
    const x = io({
      saveTopicRound: vi.fn().mockRejectedValue(new Error("insert")),
    });
    await expect(
      persistRecommendation(x, { status: "draft", rows }),
    ).rejects.toThrow("insert");
    expect(x.consume).not.toHaveBeenCalled();
  });
});
