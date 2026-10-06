// 심화탐구 뷰 변환(부록 A 공용 뷰 타입). DB 행을 받아 응답용 뷰로 바꾸는 순수 함수만 둔다.
// 클라이언트 src/lib/inquiry/types.ts 가 이 타입을 그대로 미러한다.

import {
  CHECKLIST,
  type ChecklistItem,
  DESIGN_FORBIDDEN,
  FIT_LABELS,
  LINK_KIND_LABELS,
  RELIABILITY_CHECK_NOTICE,
  RUBRIC,
  SECTIONS,
  type SectionMeta,
} from "./constants.js";
import { extractActivityFields } from "./extract.js";
import {
  type GenerationState,
  parseGenerationState,
  screenStepFor,
} from "./session.js";
import {
  countChars,
  countPlaceholders,
  normalizeSections,
  stripPlaceholders,
} from "./submission.js";
import type {
  ActivityFields,
  AssetKind,
  DesignReport,
  EvaluationReport,
  Fit,
  InterviewAnswers,
  LinkageType,
  LinkKind,
  RecordCandidate,
  Reliability,
  RubricItemId,
  ScreenStep,
  SectionId,
  SessionStatus,
  SubmissionLabel,
  SubmissionSections,
  TopicDetail,
} from "./types.js";

/** inquiry_sessions 행에서 뷰에 쓰는 컬럼. */
export type SessionRow = {
  id: string;
  status: string;
  grade_label: string | null;
  semester: number | null;
  career: string | null;
  subject: string;
  growth_report_id: string | null;
  plan_item_id: string | null;
  reply_pending: boolean;
  selected_topic_id: string | null;
  design_report_id: string | null;
  latest_evaluation_id: string | null;
  final_report_id: string | null;
  generation_state: unknown;
  topic_round_count: number;
  evaluation_count: number;
  last_activity_at: string;
  completed_at: string | null;
};

export type SessionView = {
  id: string;
  status: SessionStatus;
  currentStep: ScreenStep;
  gradeLabel: string | null;
  semester: number | null;
  career: string | null;
  subject: string;
  growthReportId: string | null;
  planItemId: string | null;
  replyPending: boolean;
  selectedTopicId: string | null;
  designReportId: string | null;
  latestEvaluationId: string | null;
  finalReportId: string | null;
  topicRoundCount: number;
  evaluationCount: number;
  generation: GenerationState;
  lastActivityAt: string;
  completedAt: string | null;
};

export function toSessionView(
  row: SessionRow,
  flags: { hasTopics: boolean; hasSubmissionDraft: boolean },
): SessionView {
  const status = row.status as SessionStatus;
  return {
    id: row.id,
    status,
    currentStep: screenStepFor({
      status,
      selectedTopicId: row.selected_topic_id,
      designReportId: row.design_report_id,
      latestEvaluationId: row.latest_evaluation_id,
      hasSubmissionDraft: flags.hasSubmissionDraft,
      hasTopics: flags.hasTopics,
    }),
    gradeLabel: row.grade_label,
    semester: row.semester,
    career: row.career,
    subject: row.subject,
    growthReportId: row.growth_report_id,
    planItemId: row.plan_item_id,
    replyPending: row.reply_pending,
    selectedTopicId: row.selected_topic_id,
    designReportId: row.design_report_id,
    latestEvaluationId: row.latest_evaluation_id,
    finalReportId: row.final_report_id,
    topicRoundCount: row.topic_round_count,
    evaluationCount: row.evaluation_count,
    generation: parseGenerationState(row.generation_state),
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at,
  };
}

/** inquiry_assets 행. */
export type AssetRow = {
  id: string;
  kind: string;
  reliability: string;
  position: number;
  activity_record_id: string | null;
  interview_answers: unknown;
  gaps: string[] | null;
  oneline_text: string | null;
};

export type AssetView = {
  id: string;
  kind: AssetKind;
  reliability: Reliability;
  position: number;
  activityRecordId: string | null;
  interviewAnswers: InterviewAnswers | null;
  gaps: string[];
  onelineText: string | null;
  /** 기록은 topic, 인터뷰는 q1, 한 줄은 text. */
  summary: string | null;
};

/** recordTopicById 는 activity_records.id 에서 topic 으로 가는 표다. */
export function toAssetView(
  row: AssetRow,
  recordTopicById: ReadonlyMap<string, string | null>,
): AssetView {
  const kind = row.kind as AssetKind;
  const answers =
    kind === "interview" ? (row.interview_answers as InterviewAnswers) : null;
  let summary: string | null = null;
  if (kind === "record" && row.activity_record_id) {
    summary = recordTopicById.get(row.activity_record_id) ?? null;
  } else if (kind === "interview") {
    summary = answers?.q1 ?? null;
  } else if (kind === "oneline") {
    summary = row.oneline_text;
  }
  return {
    id: row.id,
    kind,
    reliability: row.reliability as Reliability,
    position: row.position,
    activityRecordId: row.activity_record_id,
    interviewAnswers: answers,
    gaps: row.gaps ?? [],
    onelineText: row.oneline_text,
    summary,
  };
}

/** inquiry_topics 행. detail 은 서버가 검증해 저장한 TopicDetail 이다. */
export type TopicRow = {
  id: string;
  round: number;
  idx: number;
  link_kind: string;
  linkage_type: string;
  fit: string;
  selected: boolean;
  detail: unknown;
};

export type TopicView = {
  id: string;
  round: number;
  idx: number;
  linkKind: LinkKind;
  linkageType: LinkageType;
  fit: Fit;
  selected: boolean;
  detail: TopicDetail;
};

export function toTopicView(row: TopicRow): TopicView {
  return {
    id: row.id,
    round: row.round,
    idx: row.idx,
    linkKind: row.link_kind as LinkKind,
    linkageType: row.linkage_type as LinkageType,
    fit: row.fit as Fit,
    selected: row.selected,
    detail: row.detail as TopicDetail,
  };
}

/** inquiry_submissions 행. */
export type SubmissionRow = {
  id: string;
  revision: number;
  sections: unknown;
  char_counts: unknown;
  is_draft: boolean;
  updated_at: string;
};

export type SubmissionView = {
  id: string;
  revision: number;
  sections: SubmissionSections;
  /** 저장된 원문 기준 글자 수(화면 카운터). */
  counts: Record<SectionId, number>;
  /** 자리표시자를 뺀 글자 수. sections 로 다시 센다. */
  strippedCounts: Record<SectionId, number>;
  placeholders: Partial<Record<SectionId, number>>;
  isDraft: boolean;
  updatedAt: string;
};

export function toSubmissionView(row: SubmissionRow): SubmissionView {
  const sections = normalizeSections(row.sections);
  if (!sections)
    throw new Error(`inquiry_submissions ${row.id}: sections 형식 오류`);
  return {
    id: row.id,
    revision: row.revision,
    sections,
    counts: row.char_counts as Record<SectionId, number>,
    strippedCounts: countChars(stripPlaceholders(sections)),
    placeholders: countPlaceholders(sections),
    isDraft: row.is_draft,
    updatedAt: row.updated_at,
  };
}

/** inquiry_reports 행(design, evaluation, final 공통). */
export type ReportRow = {
  id: string;
  report_type: string;
  topic_id: string | null;
  submission_id: string | null;
  sections: unknown;
  score: number | null;
  label: string | null;
  created_at: string;
};

export type DesignView = DesignReport & {
  overview: {
    topicTitle: string;
    subtitle: string;
    linkKindLabel: string;
    startActivity: string | null;
    startGap: string | null;
    question: string;
    hypothesis1: string;
    hypothesis2: string;
    fit: Fit;
    fitLabel: string;
    fitReason: string | null;
    stageLabel: string;
    planItemTitle: string | null;
  };
  reliability: Reliability;
  reliabilityNotice: string | null;
  lengths: SectionMeta[];
  checklist: ChecklistItem[];
  rubricPreview: { id: RubricItemId; label: string; maxScore: number }[];
  forbidden: string[];
};

/** 설계 리포트 본문에 상수 부분(분량, 체크리스트, 평가 기준, 금지)을 조회 때 붙인다. */
export function toDesignView(
  row: ReportRow,
  ctx: {
    topic: TopicView;
    primaryAsset: AssetView | null;
    reliability: Reliability;
    planItemTitle: string | null;
    stageLabel: string;
  },
): DesignView {
  const { topic, primaryAsset } = ctx;
  const { detail } = topic;
  return {
    ...(row.sections as DesignReport),
    overview: {
      topicTitle: detail.title,
      subtitle: detail.subtitle,
      linkKindLabel: LINK_KIND_LABELS[topic.linkKind],
      startActivity: primaryAsset?.summary ?? detail.path.from,
      startGap:
        primaryAsset?.kind === "interview"
          ? (primaryAsset.gaps[0] ?? null)
          : null,
      question: detail.question,
      hypothesis1: detail.hypothesis1,
      hypothesis2: detail.hypothesis2,
      fit: topic.fit,
      fitLabel: FIT_LABELS[topic.fit],
      fitReason: detail.fitReason,
      stageLabel: ctx.stageLabel,
      planItemTitle: ctx.planItemTitle,
    },
    reliability: ctx.reliability,
    reliabilityNotice:
      ctx.reliability === "A" ? null : RELIABILITY_CHECK_NOTICE,
    lengths: [...SECTIONS],
    checklist: [...CHECKLIST],
    rubricPreview: RUBRIC.map((r) => ({
      id: r.id,
      label: r.label,
      maxScore: r.maxScore,
    })),
    forbidden: [...DESIGN_FORBIDDEN],
  };
}

export type EvaluationView = EvaluationReport & {
  id: string;
  /** 평가한 작성본의 revision. */
  revision: number;
  createdAt: string;
};

/** 점수와 라벨은 컬럼이 있으면 컬럼을 따르고, 없으면 본문 값을 쓴다. */
export function toEvaluationView(
  row: ReportRow,
  submissionRevision: number,
): EvaluationView {
  const body = row.sections as EvaluationReport;
  return {
    ...body,
    total: row.score ?? body.total,
    label: (row.label as SubmissionLabel | null) ?? body.label,
    id: row.id,
    revision: submissionRevision,
    createdAt: row.created_at,
  };
}

export type FinalizePreview = {
  summary: {
    topic: string;
    subject: string;
    /** 출발 활동 요약과 연계 유형 라벨. */
    linkage: string;
    concepts: string[];
    limitation: string;
    score: number;
    label: SubmissionLabel;
    planItemTitle: string | null;
  };
  fields: ActivityFields;
  missing: string[];
};

/** 확정 화면 미리보기. 7항목은 작성본에서 뽑고 빈 항목은 missing 으로 알린다. */
export function buildFinalizePreview(input: {
  topic: TopicView;
  subject: string;
  primaryAsset: AssetView | null;
  evaluation: EvaluationView;
  planItemTitle: string | null;
  submissionSections: SubmissionSections;
  concepts: string[];
}): FinalizePreview {
  const { topic, primaryAsset, evaluation } = input;
  const { fields, missing } = extractActivityFields({
    topicTitle: topic.detail.title,
    concepts: input.concepts,
    sections: input.submissionSections,
  });
  const start = primaryAsset?.summary ?? topic.detail.path.from;
  return {
    summary: {
      topic: topic.detail.title,
      subject: input.subject,
      linkage: `${start} (${LINK_KIND_LABELS[topic.linkKind]})`,
      concepts: input.concepts,
      limitation: fields.limitation,
      score: evaluation.total,
      label: evaluation.label,
      planItemTitle: input.planItemTitle,
    },
    fields,
    missing,
  };
}

export type ReportsListItem = {
  sessionId: string;
  completedAt: string;
  subject: string;
  topicTitle: string;
  linkKind: LinkKind;
  score: number;
  label: SubmissionLabel;
};

/** 완료 세션 한 건. 선택 주제, 최신 평가, 완료 시각이 하나라도 없으면 null 이라 호출부가 거른다. */
export function toReportsListItem(
  session: SessionRow,
  topic: TopicRow | null,
  evaluation: ReportRow | null,
): ReportsListItem | null {
  if (!topic || !evaluation || !session.completed_at) return null;
  const view = toTopicView(topic);
  const body = evaluation.sections as EvaluationReport;
  return {
    sessionId: session.id,
    completedAt: session.completed_at,
    subject: session.subject,
    topicTitle: view.detail.title,
    linkKind: view.linkKind,
    score: evaluation.score ?? body.total,
    label: (evaluation.label as SubmissionLabel | null) ?? body.label,
  };
}

export type OpenItem = {
  sessionId: string;
  currentStep: ScreenStep;
  subject: string;
  topicTitle: string | null;
  lastActivityAt: string;
};

export function toOpenItem(
  session: SessionRow,
  currentStep: ScreenStep,
  topicTitle: string | null,
): OpenItem {
  return {
    sessionId: session.id,
    currentStep,
    subject: session.subject,
    topicTitle,
    lastActivityAt: session.last_activity_at,
  };
}

export type ArchivedItem = {
  sessionId: string;
  subject: string;
  topicTitle: string | null;
  lastActivityAt: string;
  terminal: { reason: string; mode: string } | null;
};

export function toArchivedItem(
  session: SessionRow,
  topicTitle: string | null,
): ArchivedItem {
  const { terminal } = parseGenerationState(session.generation_state);
  return {
    sessionId: session.id,
    subject: session.subject,
    topicTitle,
    lastActivityAt: session.last_activity_at,
    terminal: terminal
      ? { reason: terminal.reason, mode: terminal.mode }
      : null,
  };
}

/** activity_records 에서 출발 활동 후보에 쓰는 컬럼. */
export type RecordRow = {
  id: string;
  source_program: string;
  status: string;
  grade_label: string | null;
  semester: number | null;
  subject_group: string | null;
  subject: string | null;
  topic: string | null;
  concept: string | null;
  limitation: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export function toRecordCandidate(row: RecordRow): RecordCandidate {
  return {
    id: row.id,
    sourceProgram: row.source_program,
    status: row.status,
    gradeLabel: row.grade_label,
    semester: row.semester,
    subjectGroup: row.subject_group,
    subject: row.subject,
    topic: row.topic,
    concept: row.concept,
    limitation: row.limitation,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  };
}

/** position 이 가장 작은 자산이 기본 출발 활동이다(No.40). 없으면 null. */
export function primaryAssetOf(assets: AssetView[]): AssetView | null {
  let best: AssetView | null = null;
  for (const asset of assets) {
    if (!best || asset.position < best.position) best = asset;
  }
  return best;
}

/** 설계 리포트 신뢰도는 기본 출발 활동의 값이다. 출발 활동이 없으면 가장 낮은 C 로 본다(§6 가정). */
export function primaryReliability(assets: AssetView[]): Reliability {
  return primaryAssetOf(assets)?.reliability ?? "C";
}
