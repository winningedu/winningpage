// P6 화면 테스트가 함께 쓰는 세션 상세 조립 도우미. 화면 코드는 import 하지 않는다.
import {
  ANALYSIS_FIELDS,
  type Analysis,
  type AnalysisField,
  type GenerationSections,
  type SessionActivityView,
  type SessionDetailResponse,
  type VerificationSections,
} from "@/lib/selfeval/types";

export function makeAnalysis(
  values: Partial<Record<AnalysisField, string>> = {},
  sources: Partial<Record<AnalysisField, "record" | "student" | "empty">> = {},
  conflicts: Analysis["conflicts"] = [],
): Analysis {
  const full = {} as Analysis["values"];
  const src = {} as Analysis["sources"];
  for (const field of ANALYSIS_FIELDS) {
    full[field] = values[field] ?? `${field} 값`;
    src[field] = sources[field] ?? "record";
  }
  return { values: full, sources: src, conflicts };
}

export function makeActivity(
  role: "core" | "support",
  over: Partial<SessionActivityView> = {},
): SessionActivityView {
  return {
    activityRecordId: role === "core" ? "act-core" : "act-sup",
    role,
    fitScore: null,
    fitReasons: null,
    analysis: null,
    analysisSource: null,
    record: {
      id: role === "core" ? "act-core" : "act-sup",
      sourceProgram: "performance",
      status: "confirmed",
      gradeLabel: "고2",
      semester: 1,
      subjectGroup: null,
      subject: "수학",
      topic: role === "core" ? "버스 배차 분석" : "표본조사 설계",
      concept: "표본 추출",
      method: "배차표 자료를 비교했다",
      result: "평균 12분 간격이었다. 의미가 있었다.",
      limitation: null,
      numbers: null,
      sources: null,
      createdAt: "2026-09-16T00:00:00+09:00",
    },
    ...over,
  };
}

export const SESSION_BASE = {
  id: "s1",
  status: "in_progress",
  currentStep: 3,
  progress: null,
  academicYear: 2026,
  gradeLabel: "고2",
  semester: 1,
  area: "subject",
  subject: "수학",
  activityName: null,
  schoolPrompt: "문항",
  teacherNote: null,
  targetChars: 500,
  targetCharsMode: "with_space",
  career: { career: null, department: null, universities: [] },
  growthApplied: false,
  growthSnapshot: null,
  planItemId: null,
  replyPending: null,
  regenerateCount: 0,
  terminal: null,
  lastActivityAt: "2026-10-01T00:00:00Z",
  completedAt: null,
} as const;

export function makeDetail(
  over: {
    session?: Record<string, unknown>;
    activities?: SessionActivityView[];
    reports?: Partial<SessionDetailResponse["reports"]>;
    regenerationsLeft?: number;
    current?: SessionDetailResponse["current"];
  } = {},
) {
  return {
    kind: "ok" as const,
    data: {
      ok: true,
      session: { ...SESSION_BASE, ...over.session },
      activities: over.activities ?? [makeActivity("core")],
      reports: {
        generation: null,
        edited: null,
        verification: null,
        final: null,
        ...over.reports,
      },
      regenerationsLeft: over.regenerationsLeft ?? 3,
      current: over.current ?? null,
    },
  };
}

export function makeReport(
  sections: unknown,
  over: Partial<SessionDetailResponse["reports"]["generation"] & object> = {},
) {
  return {
    id: "r1",
    revision: 1,
    sections,
    charCount: { withSpace: 510, withoutSpace: 420 },
    score: null,
    mandatoryFixes: null,
    createdAt: "2026-10-01T00:00:00Z",
    ...over,
  };
}

export function makeSections(): GenerationSections {
  return {
    paragraphs: [
      {
        role: "link",
        sentences: [
          {
            id: "p1s1",
            text: "배차표 자료를 비교했어요.",
            evidence: { activityId: "act-core", field: "method" },
            feeling: false,
            confirmed: false,
          },
        ],
      },
      {
        role: "judgment",
        sentences: [
          {
            id: "p2s1",
            text: "뿌듯했어요.",
            evidence: null,
            feeling: true,
            confirmed: false,
          },
        ],
      },
    ],
  };
}

export function makeVerification(
  over: Partial<VerificationSections> = {},
): VerificationSections {
  return {
    items: [
      {
        key: "judgment",
        label: "판단과 근거",
        max: 15,
        discrimination: 70,
        score: 10,
        checks: [
          { text: "판단 문장이 있어요", pass: true },
          { text: "근거가 붙어 있어요", pass: false },
        ],
      },
    ],
    total: 72,
    format: [
      {
        key: "target_range",
        label: "분량",
        pass: true,
        detail: "목표 안",
        skipped: false,
      },
    ],
    mandatoryFixes: [],
    submittable: true,
    improvements: [],
    excluded: [{ label: "협업", note: "채점 제외" }],
    growthFit: null,
    charCount: { withSpace: 510, withoutSpace: 420 },
    sentenceCount: 9,
    clicheDensity: 0.4,
    clicheHits: [],
    numberCount: 3,
    ...over,
  };
}
