// 자기평가서 리포트 계약. GET, POST /api/selfeval/report 의 요청과 응답(명세 No.133, 172, 173).
// 리포트 본문(payload)의 표지와 01~05장 모양도 여기서 정한다. 서버가 만들고 화면과 PDF 가 같은 모양으로 읽는다(명세 No.133~173).
// 학생 이름은 담지 않는다(No.90, 134). 숫자, 목록, 꼬리표, 문장 번호, 반영률, 라벨은 코드가 정하고 모델 문장만 explanation, summary 류 칸에 들어간다.

import { z } from "zod";

/** 꼬리표 문자열. 예: P1, D2, A1, H3. */
const tagSchema = z.string();

export const REPORT_STEP_KEYS = [
  "diagnosis",
  "goal",
  "growth",
  "performance",
  "inquiry",
  "selfeval",
] as const;

const coverSchema = z.object({
  /** 표시형 학년. 예: 고등학교 1학년. 값이 없으면 null. */
  gradeLabel: z.string().nullable(),
  /** 최종 저장 시각. yyyy. mm. dd */
  savedAt: z.string(),
  /** 예: 수학 자기평가서 */
  subjectTitle: z.string(),
  academicYear: z.number(),
  /** 서비스별 완료 기록 1건 이상 여부(No.136). */
  steps: z.record(z.enum(REPORT_STEP_KEYS), z.boolean()),
});

const sentenceSchema = z.object({
  /** 1부터 시작하는 문장 번호. */
  n: z.number(),
  text: z.string(),
  /** 근거 꼬리표. 같은 꼬리표는 한 번만, 주요 근거가 먼저. */
  tags: z.array(tagSchema),
  /** 근거가 0개라 학생 확인이 필요한 문장(No.199). */
  needsConfirm: z.boolean(),
});

const ch01Schema = z.object({
  paragraphs: z.array(z.object({ sentences: z.array(sentenceSchema) })),
  charCount: z.object({ withSpace: z.number(), withoutSpace: z.number() }),
  targetChars: z.number().nullable(),
  targetCharsMode: z.enum(["with_space", "without_space"]),
  /** 목표 대비 차이(%) 소수 첫째 자리. 목표가 없으면 null. */
  diffPercent: z.number().nullable(),
  paragraphCount: z.number(),
  sentenceCount: z.number(),
});

const recordKindSchema = z.enum(["performance", "deep", "activity"]);

const roleSchema = z.enum([
  "core",
  "main",
  "reflection",
  "support",
  "indirect",
  "in_progress",
  "unreflected",
]);

const kindCounts = z.object({
  performance: z.number(),
  deep: z.number(),
  activity: z.number(),
});

const ch02RowSchema = z.object({
  tag: tagSchema,
  recordId: z.string(),
  kind: recordKindSchema,
  title: z.string().nullable(),
  /** 제출일 yyyy.mm.dd. 완료되지 않은 기록은 null. */
  submittedOn: z.string().nullable(),
  inProgress: z.boolean(),
  /** 기록 요약 또는 모델이 만든 요약. 없으면 null. */
  summary: z.string().nullable(),
  sentenceNumbers: z.array(z.number()),
  role: roleSchema,
  roleLabel: z.string(),
  /** 0~5 */
  dots: z.number(),
  /** 미반영 기록만. */
  reasonCode: z
    .enum(["unrelated", "other_subject", "deselected", "plan"])
    .nullable(),
  reasonLabel: z.string().nullable(),
  /** 미반영 기록의 이유 문장(모델). */
  reasonText: z.string().nullable(),
  /** 그 과목의 자기평가서가 아직 없을 때만. 예: 국어 자기평가 추천 */
  recommendation: z.string().nullable(),
});

const ch02Schema = z.object({
  subjects: z.array(
    z.object({
      subject: z.string(),
      /** 예: 수학 (공통수학1) */
      label: z.string(),
      writing: z.boolean(),
      counts: kindCounts,
      inProgress: kindCounts,
      reflectedSentenceCount: z.number(),
      rows: z.array(ch02RowSchema),
    }),
  ),
});

const ch03Schema = z.object({
  rows: z.array(
    z.object({
      tag: tagSchema,
      recordId: z.string(),
      kind: recordKindSchema,
      title: z.string().nullable(),
      /** 작성 과목과 다른 기록이면 그 과목명. */
      subject: z.string().nullable(),
      submittedOn: z.string().nullable(),
      role: roleSchema,
      relation: z.enum(["inherit", "deepen", "complement"]),
      relationLabel: z.string(),
      /** 기록에 명시, 학생 확인. 연계 판정이 없으면 null. */
      strengthLabel: z.string().nullable(),
      sentenceNumbers: z.array(z.number()),
      explanation: z.string().nullable(),
    }),
  ),
});

const ch04Schema = z.object({
  rows: z.array(
    z.object({
      tag: tagSchema,
      logId: z.string(),
      /** yyyy.mm.dd */
      writtenOn: z.string(),
      /** 고치지 않은 원문. */
      text: z.string(),
      sentenceNumbers: z.array(z.number()),
      reflected: z.boolean(),
      explanation: z.string().nullable(),
      reasonLabel: z.string().nullable(),
    }),
  ),
  reflectedCount: z.number(),
  totalCount: z.number(),
  sentenceTotal: z.number(),
  sentenceNumbers: z.array(z.number()),
  /** 코드 틀 문장 뒤에 모델 한 문장을 붙인 요약. 모델 문장이 없으면 틀만. */
  summary: z.string(),
});

const textCardSchema = z.object({
  state: z.enum(["ok", "none", "error"]),
  text: z.string().nullable(),
  /** yyyy.mm.dd. 학습진단 카드만. */
  date: z.string().nullable(),
});

const tagCardSchema = z.object({
  items: z.array(z.object({ tag: tagSchema, subject: z.string() })),
  /** 진행 중이라 반영하지 않은 기록의 꼬리표. */
  inProgressTags: z.array(tagSchema),
});

const ch05Schema = z.object({
  counts: z.object({
    completedReports: z.number(),
    subjectCount: z.number(),
    reflectedReports: z.number(),
    reflectedMemos: z.number(),
    linkedSubjects: z.array(z.string()),
  }),
  cards: z.object({
    diagnosis: textCardSchema,
    goal: textCardSchema,
    growth: textCardSchema,
    performance: tagCardSchema,
    inquiry: tagCardSchema,
    selfeval: z.object({
      total: z.number(),
      linked: z.number(),
      allLinked: z.boolean(),
      text: z.string(),
    }),
  }),
  nextSteps: z.array(
    z.object({
      key: z.enum([
        "memo_detail",
        "finish_in_progress",
        "verify_action",
        "use_elsewhere",
        "verification_fix",
      ]),
      /** 근거 꼬리표. 항상 있다(No.169). */
      tag: tagSchema,
      /** 모델 문장. 모델 호출이 비었으면 null. */
      text: z.string().nullable(),
    }),
  ),
});

export const reportPayloadSchema = z.object({
  version: z.literal(1),
  cover: coverSchema,
  ch01: ch01Schema,
  ch02: ch02Schema,
  ch03: ch03Schema,
  /** 확인한 수기 메모가 없으면 null. 목차에 해당 없음을 표시한다(No.162). */
  ch04: ch04Schema.nullable(),
  ch05: ch05Schema,
  /** true 면 모델 문장이 비었다. 화면이 다시 만들기를 제안한다(No.138, 201). */
  composeMissing: z.boolean(),
  /** true 면 일부 항목의 모델 문장만 비었다. 화면이 다시 만들기를 제안한다(No.138). */
  composePartial: z.boolean(),
});

/** 세션 하나의 리포트를 부른다. 값은 DB uuid 컬럼에 가므로 형식만 본다. */
export const reportQuery = z.object({ sessionId: z.guid() });

/** 리포트를 만들거나 다시 만든다. */
export const reportBody = z.object({ sessionId: z.guid() });

/** building 은 저장되지 않고, 선점이 진행 중일 때 읽기가 돌려준다. */
export const REPORT_VIEW_STATUSES = ["ready", "failed", "building"] as const;

export const reportViewSchema = z.looseObject({
  sessionId: z.string(),
  finalRevision: z.number(),
  status: z.enum(REPORT_VIEW_STATUSES),
  attempts: z.number(),
  builtAt: z.string(),
  /** 만들지 못한 리포트(failed)는 null. */
  payload: reportPayloadSchema.nullable(),
});

export const reportResponseSchema = z.looseObject({
  /** POST 에서만. 같은 리비전의 완성본을 다시 만들지 않고 돌려줬는지. */
  reused: z.boolean().optional(),
  report: reportViewSchema,
});

export type ReportViewShape = z.output<typeof reportViewSchema>;
