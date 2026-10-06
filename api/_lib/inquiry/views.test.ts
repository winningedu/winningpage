// 심화탐구 뷰 변환 테스트(부록 A 공용 뷰 타입). 행을 받아 뷰로 바꾸는 순수 함수만 다룬다.
import { describe, expect, it } from "vitest";
import {
  CHECKLIST,
  DESIGN_FORBIDDEN,
  RELIABILITY_CHECK_NOTICE,
  RUBRIC,
  SECTIONS,
} from "./constants.js";
import {
  type AssetRow,
  buildFinalizePreview,
  primaryAssetOf,
  primaryReliability,
  type ReportRow,
  type SessionRow,
  type SubmissionRow,
  type TopicRow,
  toArchivedItem,
  toAssetView,
  toDesignView,
  toEvaluationView,
  toOpenItem,
  toRecordCandidate,
  toReportsListItem,
  toSessionView,
  toSubmissionView,
  toTopicView,
} from "./views.js";

const sessionRow = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1",
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
  topic_round_count: 0,
  evaluation_count: 0,
  last_activity_at: "2026-10-01T00:00:00.000Z",
  completed_at: null,
  ...over,
});

describe("toSessionView", () => {
  it("snake_case 행을 camelCase 뷰로 바꾸고 화면 단계를 계산한다", () => {
    const view = toSessionView(sessionRow(), {
      hasTopics: false,
      hasSubmissionDraft: false,
    });
    expect(view).toMatchObject({
      id: "s1",
      status: "in_progress",
      currentStep: 1,
      gradeLabel: "고2",
      semester: 1,
      career: "의사",
      subject: "생명과학",
      growthReportId: null,
      planItemId: null,
      replyPending: false,
      selectedTopicId: null,
      designReportId: null,
      latestEvaluationId: null,
      finalReportId: null,
      topicRoundCount: 0,
      evaluationCount: 0,
      lastActivityAt: "2026-10-01T00:00:00.000Z",
      completedAt: null,
    });
  });

  it("추천 주제가 있으면 2단계, 설계가 있으면 4단계다", () => {
    const topics = toSessionView(sessionRow(), {
      hasTopics: true,
      hasSubmissionDraft: false,
    });
    expect(topics.currentStep).toBe(2);
    const designed = toSessionView(sessionRow({ design_report_id: "d1" }), {
      hasTopics: true,
      hasSubmissionDraft: false,
    });
    expect(designed.currentStep).toBe(4);
  });

  it("generation_state 를 parseGenerationState 결과로 내려 준다", () => {
    const view = toSessionView(
      sessionRow({
        generation_state: {
          modes: { topic_recommendation: { status: "ok", attempts: 1 } },
        },
      }),
      { hasTopics: true, hasSubmissionDraft: false },
    );
    expect(view.generation.modes.topic_recommendation.status).toBe("ok");
    expect(view.generation.modes.design_report.status).toBe("pending");
    expect(view.generation.terminal).toBeNull();
  });
});

const baseAsset: AssetRow = {
  id: "a1",
  kind: "record",
  reliability: "A",
  position: 0,
  activity_record_id: "r1",
  interview_answers: null,
  gaps: null,
  oneline_text: null,
};

describe("toAssetView", () => {
  it("기록 자산의 summary 는 활동 기록 topic 이다", () => {
    const view = toAssetView(baseAsset, new Map([["r1", "미생물 배양"]]));
    expect(view).toEqual({
      id: "a1",
      kind: "record",
      reliability: "A",
      position: 0,
      activityRecordId: "r1",
      interviewAnswers: null,
      gaps: [],
      onelineText: null,
      summary: "미생물 배양",
    });
  });

  it("기록 topic 을 못 찾으면 summary 는 null 이다", () => {
    expect(toAssetView(baseAsset, new Map()).summary).toBeNull();
  });

  it("인터뷰 자산의 summary 는 q1 이고 빈틈을 내려 준다", () => {
    const view = toAssetView(
      {
        ...baseAsset,
        kind: "interview",
        reliability: "B",
        activity_record_id: null,
        interview_answers: { q1: "곰팡이 실험" },
        gaps: ["대조군"],
      },
      new Map(),
    );
    expect(view.summary).toBe("곰팡이 실험");
    expect(view.gaps).toEqual(["대조군"]);
    expect(view.interviewAnswers).toEqual({ q1: "곰팡이 실험" });
  });

  it("한 줄 자산의 summary 는 text 다", () => {
    const view = toAssetView(
      {
        ...baseAsset,
        kind: "oneline",
        reliability: "C",
        activity_record_id: null,
        oneline_text: "항생제 내성",
      },
      new Map(),
    );
    expect(view.summary).toBe("항생제 내성");
    expect(view.onelineText).toBe("항생제 내성");
  });
});

describe("toTopicView", () => {
  it("주제 행을 camelCase 뷰로 바꾼다", () => {
    const row: TopicRow = {
      id: "t1",
      round: 1,
      idx: 2,
      link_kind: "followup",
      linkage_type: "direct",
      fit: "match",
      selected: true,
      detail: { title: "주제" },
    };
    expect(toTopicView(row)).toEqual({
      id: "t1",
      round: 1,
      idx: 2,
      linkKind: "followup",
      linkageType: "direct",
      fit: "match",
      selected: true,
      detail: { title: "주제" },
    });
  });
});

const sectionsOf = (over: Record<string, string> = {}) => ({
  I: "",
  II: "",
  III: "",
  IV: "",
  V: "",
  VI: "",
  VII: "",
  VIII: "",
  ...over,
});

describe("toSubmissionView", () => {
  const row = (sections: Record<string, string>): SubmissionRow => ({
    id: "sub1",
    revision: 2,
    sections,
    char_counts: { I: 99 },
    is_draft: true,
    updated_at: "2026-10-02T00:00:00.000Z",
  });

  it("counts 는 저장된 char_counts 를 그대로 내린다", () => {
    const view = toSubmissionView(row(sectionsOf({ I: "가나다" })));
    expect(view.counts.I).toBe(99);
    expect(view.id).toBe("sub1");
    expect(view.revision).toBe(2);
    expect(view.isDraft).toBe(true);
    expect(view.updatedAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("strippedCounts 와 placeholders 는 sections 로 다시 계산한다", () => {
    const view = toSubmissionView(
      row(sectionsOf({ I: "가나다[여기에 쓰기]", II: "[a][b]" })),
    );
    expect(view.strippedCounts.I).toBe(3);
    expect(view.strippedCounts.II).toBe(0);
    expect(view.placeholders).toEqual({ I: 1, II: 2 });
  });

  it("8절이 아닌 sections 는 던진다", () => {
    expect(() => toSubmissionView(row({ I: 1 } as never))).toThrow();
  });
});

const designBody = {
  verifiability: "검증 가능",
  sections: [],
  sourceTable: [],
  searchPlan: [],
  interpretQuestions: { same: "a", different: "b", insufficient: "c" },
  scope: { minimum: [], optional: [] },
};

const designTopic = (over: Partial<TopicRow> = {}): TopicRow => ({
  id: "t1",
  round: 1,
  idx: 1,
  link_kind: "followup",
  linkage_type: "direct",
  fit: "off",
  selected: true,
  detail: {
    title: "제목",
    subtitle: "부제",
    question: "질문",
    hypothesis1: "가설1",
    hypothesis2: "가설2",
    fitReason: "학년과 어긋남",
    path: { from: "배양 실험", via: "후속", to: "질문" },
  },
  ...over,
});

const designRow: ReportRow = {
  id: "d1",
  report_type: "design",
  topic_id: "t1",
  submission_id: null,
  sections: designBody,
  score: null,
  label: null,
  created_at: "2026-10-03T00:00:00.000Z",
};

describe("toDesignView", () => {
  const input = (over = {}) => ({
    topic: toTopicView(designTopic()),
    primaryAsset: toAssetView(baseAsset, new Map([["r1", "미생물 배양"]])),
    reliability: "A" as const,
    planItemTitle: null,
    stageLabel: "꽃",
    ...over,
  });

  it("저장된 설계 본문에 상수 부분을 붙인다", () => {
    const view = toDesignView(designRow, input());
    expect(view.verifiability).toBe("검증 가능");
    expect(view.lengths).toEqual(SECTIONS);
    expect(view.checklist).toEqual(CHECKLIST);
    expect(view.rubricPreview).toEqual(
      RUBRIC.map((r) => ({ id: r.id, label: r.label, maxScore: r.maxScore })),
    );
    expect(view.forbidden).toEqual(DESIGN_FORBIDDEN);
  });

  it("개요는 주제와 출발 활동에서 채운다", () => {
    const { overview } = toDesignView(designRow, input());
    expect(overview).toEqual({
      topicTitle: "제목",
      subtitle: "부제",
      linkKindLabel: "후속형",
      startActivity: "미생물 배양",
      startGap: null,
      question: "질문",
      hypothesis1: "가설1",
      hypothesis2: "가설2",
      fit: "off",
      fitLabel: "어긋남",
      fitReason: "학년과 어긋남",
      stageLabel: "꽃",
      planItemTitle: null,
    });
  });

  it("신뢰도 A 면 확인 안내가 없고 B, C 면 고정 문구가 붙는다", () => {
    expect(toDesignView(designRow, input()).reliabilityNotice).toBeNull();
    const b = toDesignView(designRow, input({ reliability: "B" }));
    expect(b.reliability).toBe("B");
    expect(b.reliabilityNotice).toBe(RELIABILITY_CHECK_NOTICE);
  });

  it("출발 활동이 인터뷰면 첫 빈틈을 startGap 으로 준다", () => {
    const interview = toAssetView(
      {
        ...baseAsset,
        kind: "interview",
        reliability: "B",
        activity_record_id: null,
        interview_answers: { q1: "곰팡이" },
        gaps: ["대조군", "표본 수"],
      },
      new Map(),
    );
    const { overview } = toDesignView(
      designRow,
      input({ primaryAsset: interview, planItemTitle: "생명과학 심화" }),
    );
    expect(overview.startActivity).toBe("곰팡이");
    expect(overview.startGap).toBe("대조군");
    expect(overview.planItemTitle).toBe("생명과학 심화");
  });

  it("출발 활동이 없으면 경로 도식의 출발점을 쓴다", () => {
    const { overview } = toDesignView(designRow, input({ primaryAsset: null }));
    expect(overview.startActivity).toBe("배양 실험");
  });
});

const evalBody = {
  total: 71,
  label: "revision_needed",
  items: [],
  coreErrors: [],
  fixFirst: [],
  mustFix: [],
  checklist: [],
  sources: [],
  placeholders: {},
};

describe("toEvaluationView", () => {
  const row: ReportRow = {
    id: "e1",
    report_type: "evaluation",
    topic_id: "t1",
    submission_id: "sub1",
    sections: evalBody,
    score: 72.5,
    label: "ready_with_minor_edits",
    created_at: "2026-10-04T00:00:00.000Z",
  };

  it("본문에 id, revision, createdAt 을 붙이고 점수와 라벨은 컬럼을 따른다", () => {
    const view = toEvaluationView(row, 3);
    expect(view.id).toBe("e1");
    expect(view.revision).toBe(3);
    expect(view.createdAt).toBe("2026-10-04T00:00:00.000Z");
    expect(view.total).toBe(72.5);
    expect(view.label).toBe("ready_with_minor_edits");
  });

  it("컬럼이 비어 있으면 본문 값을 쓴다", () => {
    const view = toEvaluationView({ ...row, score: null, label: null }, 1);
    expect(view.total).toBe(71);
    expect(view.label).toBe("revision_needed");
  });
});

describe("buildFinalizePreview", () => {
  const evaluation = toEvaluationView(
    {
      id: "e1",
      report_type: "evaluation",
      topic_id: "t1",
      submission_id: "sub1",
      sections: evalBody,
      score: 88,
      label: "ready_with_minor_edits",
      created_at: "2026-10-04T00:00:00.000Z",
    },
    1,
  );
  const base = {
    topic: toTopicView(designTopic()),
    subject: "생명과학",
    primaryAsset: toAssetView(baseAsset, new Map([["r1", "미생물 배양"]])),
    evaluation,
    planItemTitle: null,
    concepts: ["삼투압", "확산"],
  };

  it("작성본에서 7항목을 뽑고 요약을 채운다", () => {
    const preview = buildFinalizePreview({
      ...base,
      submissionSections: sectionsOf({
        III: "방법 문단",
        IV: "결과 문단 3회 측정했다.",
        VI: "한계가 있다.",
        VIII: "교과서",
      }),
    });
    expect(preview.summary).toEqual({
      topic: "제목",
      subject: "생명과학",
      linkage: "미생물 배양 (후속형)",
      concepts: ["삼투압", "확산"],
      limitation: "한계가 있다.",
      score: 88,
      label: "ready_with_minor_edits",
      planItemTitle: null,
    });
    expect(preview.fields).toEqual({
      topic: "제목",
      concept: "삼투압, 확산",
      method: "방법 문단",
      result: "결과 문단 3회 측정했다.",
      limitation: "한계가 있다.",
      numbers: ["결과 문단 3회 측정했다."],
      sources: ["교과서"],
    });
    expect(preview.missing).toEqual([]);
  });

  it("비어 있는 항목은 missing 으로 알린다", () => {
    const preview = buildFinalizePreview({
      ...base,
      submissionSections: sectionsOf({ III: "방법" }),
    });
    expect(preview.missing).toEqual(["result", "limitation"]);
  });

  it("출발 활동이 없으면 경로 도식의 출발점을 쓴다", () => {
    const preview = buildFinalizePreview({
      ...base,
      primaryAsset: null,
      planItemTitle: "과제",
      submissionSections: sectionsOf(),
    });
    expect(preview.summary.linkage).toBe("배양 실험 (후속형)");
    expect(preview.summary.planItemTitle).toBe("과제");
  });
});

describe("보관함 목록 항목", () => {
  const topic = designTopic();
  const evalRow: ReportRow = {
    id: "e1",
    report_type: "evaluation",
    topic_id: "t1",
    submission_id: "sub1",
    sections: evalBody,
    score: 91,
    label: "ready_with_minor_edits",
    created_at: "2026-10-04T00:00:00.000Z",
  };

  it("완료 항목은 세션, 선택 주제, 최신 평가에서 채운다", () => {
    const item = toReportsListItem(
      sessionRow({
        status: "completed",
        completed_at: "2026-10-05T00:00:00.000Z",
      }),
      topic,
      evalRow,
    );
    expect(item).toEqual({
      sessionId: "s1",
      completedAt: "2026-10-05T00:00:00.000Z",
      subject: "생명과학",
      topicTitle: "제목",
      linkKind: "followup",
      score: 91,
      label: "ready_with_minor_edits",
    });
  });

  it("주제나 평가가 없으면 null 을 돌려 호출부가 거른다", () => {
    const done = sessionRow({
      status: "completed",
      completed_at: "2026-10-05T00:00:00.000Z",
    });
    expect(toReportsListItem(done, null, evalRow)).toBeNull();
    expect(toReportsListItem(done, topic, null)).toBeNull();
  });

  it("열린 세션 요약은 화면 단계와 주제 제목을 준다", () => {
    expect(toOpenItem(sessionRow(), 2, "제목")).toEqual({
      sessionId: "s1",
      currentStep: 2,
      subject: "생명과학",
      topicTitle: "제목",
      lastActivityAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("보관 항목은 종결 사유와 모드를 준다", () => {
    const terminal = {
      reason: "attempts",
      at: "2026-10-02T00:00:00Z",
      mode: "design_report",
    };
    expect(
      toArchivedItem(
        sessionRow({ status: "archived", generation_state: { terminal } }),
        null,
      ),
    ).toEqual({
      sessionId: "s1",
      subject: "생명과학",
      topicTitle: null,
      lastActivityAt: "2026-10-01T00:00:00.000Z",
      terminal: { reason: "attempts", mode: "design_report" },
    });
  });

  it("종결 기록이 없는 보관(만료)은 terminal 이 null 이다", () => {
    expect(
      toArchivedItem(sessionRow({ status: "archived" }), "제목").terminal,
    ).toBeNull();
  });
});

describe("toRecordCandidate", () => {
  it("activity_records 행을 RecordCandidate 로 바꾼다", () => {
    expect(
      toRecordCandidate({
        id: "r1",
        source_program: "growth",
        status: "confirmed",
        grade_label: "고1",
        semester: 2,
        subject_group: "교과",
        subject: "생명과학",
        topic: "배양",
        concept: "미생물",
        limitation: null,
        confirmed_at: "2026-09-01T00:00:00.000Z",
        created_at: "2026-08-01T00:00:00.000Z",
      }),
    ).toEqual({
      id: "r1",
      sourceProgram: "growth",
      status: "confirmed",
      gradeLabel: "고1",
      semester: 2,
      subjectGroup: "교과",
      subject: "생명과학",
      topic: "배양",
      concept: "미생물",
      limitation: null,
      confirmedAt: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
  });
});

describe("primaryAssetOf / primaryReliability", () => {
  const asset = (
    position: number,
    kind: AssetRow["kind"],
    reliability: string,
  ) =>
    toAssetView(
      {
        ...baseAsset,
        id: `a${position}`,
        kind,
        reliability,
        position,
        activity_record_id: kind === "record" ? "r1" : null,
        interview_answers: kind === "interview" ? { q1: "x" } : null,
        gaps: kind === "interview" ? ["g"] : null,
        oneline_text: kind === "oneline" ? "t" : null,
      },
      new Map(),
    );

  it("position 이 가장 작은 자산이 기본 출발 활동이다", () => {
    const assets = [asset(2, "oneline", "C"), asset(0, "interview", "B")];
    expect(primaryAssetOf(assets)?.id).toBe("a0");
    expect(primaryReliability(assets)).toBe("B");
  });

  it("자산이 없으면 출발 활동이 없는 것이라 가장 낮은 신뢰도 C 다", () => {
    expect(primaryAssetOf([])).toBeNull();
    expect(primaryReliability([])).toBe("C");
  });
});
