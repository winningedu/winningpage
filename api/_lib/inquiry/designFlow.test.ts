import { describe, expect, it } from "vitest";
import {
  buildDesignInput,
  decideDesign,
  designReportRow,
  designValidator,
  finalizeDesign,
  precheckDesign,
  validateDesignBody,
} from "./designFlow.js";
import { INQUIRY_PROMPT_VERSION } from "./generateDb.js";
import type { DesignReport, TopicDetail } from "./types.js";
import type { AssetView, RecordRow, SessionRow, TopicView } from "./views.js";

const SID = "123e4567-e89b-12d3-a456-426614174000";
const TID = "223e4567-e89b-12d3-a456-426614174000";

function sessionRow(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SID,
    status: "in_progress",
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
    topic_round_count: 1,
    evaluation_count: 0,
    last_activity_at: "2026-10-06T00:00:00.000Z",
    completed_at: null,
    ...over,
  };
}

const detail: TopicDetail = {
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
  path: { from: "관심 기반", via: "후속", to: "질문" },
  fitReason: null,
  followUpQuestions: [],
};

const topic: TopicView = {
  id: TID,
  round: 1,
  idx: 1,
  linkKind: "followup",
  linkageType: "direct",
  fit: "match",
  selected: false,
  detail,
};

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

const record = {
  id: "r1",
  concept: "활성화 에너지",
  limitation: "온도 범위가 좁음",
} as RecordRow;

describe("validateDesignBody", () => {
  it("sessionId 와 topicId 가 uuid 여야 한다", () => {
    expect(validateDesignBody({ sessionId: SID, topicId: TID })).toEqual({
      ok: true,
      body: { sessionId: SID, topicId: TID },
    });
    expect(validateDesignBody({ sessionId: SID, topicId: "x" }).ok).toBe(false);
    expect(validateDesignBody({ topicId: TID }).ok).toBe(false);
    expect(validateDesignBody(null).ok).toBe(false);
  });
});

describe("decideDesign", () => {
  const base = { topicId: TID, latestRoundTopicIds: [TID, "other"] };

  it("최신 라운드 후보면 진행한다", () => {
    expect(decideDesign({ session: sessionRow(), ...base })).toEqual({
      kind: "proceed",
      retryCharge: false,
    });
  });

  it("draft 세션은 차감 재시도를 요구한다", () => {
    expect(
      decideDesign({ session: sessionRow({ status: "draft" }), ...base }),
    ).toEqual({ kind: "proceed", retryCharge: true });
  });

  it("최신 라운드에 없는 주제는 TOPIC_NOT_IN_ROUND 409", () => {
    expect(
      decideDesign({
        session: sessionRow(),
        topicId: TID,
        latestRoundTopicIds: ["other"],
      }),
    ).toMatchObject({ kind: "error", status: 409, code: "TOPIC_NOT_IN_ROUND" });
  });

  it("설계가 이미 있고 같은 주제면 저장분을 돌려주는 done", () => {
    expect(
      decideDesign({
        session: sessionRow({ design_report_id: "d1", selected_topic_id: TID }),
        ...base,
      }),
    ).toEqual({ kind: "done" });
  });

  it("설계가 이미 있는데 다른 주제면 SESSION_LOCKED 409", () => {
    expect(
      decideDesign({
        session: sessionRow({ design_report_id: "d1", selected_topic_id: "x" }),
        ...base,
      }),
    ).toMatchObject({ kind: "error", status: 409, code: "SESSION_LOCKED" });
  });

  it("닫힌 세션은 SESSION_NOT_OPEN 409", () => {
    expect(
      decideDesign({ session: sessionRow({ status: "archived" }), ...base }),
    ).toMatchObject({ kind: "error", status: 409, code: "SESSION_NOT_OPEN" });
  });
});

describe("precheckDesign", () => {
  it("열린 세션이면 기본 정보를 돌려준다", () => {
    expect(precheckDesign(sessionRow(), TID)).toMatchObject({
      ok: true,
      info: { gradeLabel: "고2", subject: "생명과학" },
    });
  });

  it("닫힌 세션이면 막는다", () => {
    expect(
      precheckDesign(sessionRow({ status: "completed" }), TID),
    ).toMatchObject({
      ok: false,
      code: "SESSION_NOT_OPEN",
    });
  });

  it("기본 정보가 비면 STEP_ORDER", () => {
    expect(precheckDesign(sessionRow({ career: null }), TID)).toMatchObject({
      ok: false,
      code: "STEP_ORDER",
    });
  });
});

describe("buildDesignInput", () => {
  const info = {
    gradeLabel: "고2" as const,
    semester: 1 as const,
    career: "의사",
    subject: "생명과학",
  };

  it("기본 출발 활동(position 최소)의 신뢰도와 재료를 쓴다", () => {
    const input = buildDesignInput({
      info,
      topic,
      assets: [
        asset({
          id: "a2",
          position: 1,
          reliability: "C",
          kind: "oneline",
          activityRecordId: null,
          summary: "한 줄",
        }),
        asset(),
      ],
      records: [record],
      handoff: null,
      planItemId: null,
    });
    expect(input.primaryAsset).toEqual({
      summary: "효소 활성 실험",
      concept: "활성화 에너지",
      limitation: "온도 범위가 좁음",
      reliability: "A",
    });
    expect(input.topic).toMatchObject({
      title: "제목",
      linkKind: "followup",
      fit: "match",
    });
    expect(input.grade).toBe("고2");
    expect(input.handoff).toBeNull();
  });

  it("자산이 없으면 신뢰도 C 이고 출발 활동 요약은 주제 경로의 from 이다", () => {
    const input = buildDesignInput({
      info,
      topic,
      assets: [],
      records: [],
      handoff: null,
      planItemId: null,
    });
    expect(input.primaryAsset).toEqual({
      summary: "관심 기반",
      concept: null,
      limitation: null,
      reliability: "C",
    });
  });

  it("성장설계 값은 단계 라벨과 과제 제목만 넘긴다", () => {
    const input = buildDesignInput({
      info,
      topic,
      assets: [asset()],
      records: [record],
      handoff: {
        reportId: "g1",
        issuedAt: "x",
        theme: "t",
        subthemes: [],
        stage: "flower",
        weakAxes: [],
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
        stageMismatch: false,
        autoSelectedPlanItemId: null,
      },
      planItemId: "p1",
    });
    expect(input.handoff).toEqual({ stageLabel: "꽃", planItemTitle: "과제1" });
  });
});

const design = (): DesignReport => ({
  verifiability: "v",
  sections: [],
  sourceTable: [
    { item: "기온 자료", source: "기상청", asOf: "2026" },
    { item: "수온 자료", source: "", asOf: "" },
  ],
  searchPlan: [{ keyword: "k", institution: "i", item: "t" }],
  interpretQuestions: { same: "a", different: "b", insufficient: "c" },
  scope: { minimum: ["m"], optional: [] },
});

describe("finalizeDesign", () => {
  it("출처표의 source 와 asOf 를 확인 필요로 고정한다", () => {
    const out = finalizeDesign(design());
    expect(out.sourceTable).toEqual([
      { item: "기온 자료", source: "확인 필요", asOf: "확인 필요" },
      { item: "수온 자료", source: "확인 필요", asOf: "확인 필요" },
    ]);
  });
});

describe("designReportRow", () => {
  it("설계 리포트 행에 모델과 프롬프트 버전을 싣는다", () => {
    const row = designReportRow("s1", "u1", "t1", design());
    expect(row).toMatchObject({
      session_id: "s1",
      profile_id: "u1",
      report_type: "design",
      topic_id: "t1",
      prompt_version: INQUIRY_PROMPT_VERSION,
    });
    expect(row.model).toEqual(expect.any(String));
    expect(row.model).not.toBe("");
  });
});

describe("designValidator", () => {
  it("검증기가 거절하면 문제 목록을 그대로 돌려준다", () => {
    const r = designValidator("A")({ nope: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });
});
