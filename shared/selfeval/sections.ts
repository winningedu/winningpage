// 자기평가서 본문(생성, 편집, 최종)과 검증의 sections 계약. 서버가 jsonb 로 저장하고 응답으로 내보내며 브라우저가 같은 스키마로 읽는다.
// 모양의 서버 정본은 api/_lib/selfeval/types.ts 다. 객체 스키마는 아는 칸만 두고, 서버가 더한 모르는 칸은 읽을 때 버린다.

import { z } from "zod";
import { ANALYSIS_FIELDS } from "./contract.js";

export const charCountSchema = z.object({
  withSpace: z.number(),
  withoutSpace: z.number(),
});

/** 근거 출처 유형(명세 No.145): P 수행평가, D 심화탐구, A 창체 활동, H 수기 메모, S 학생 입력. */
export const EVIDENCE_SOURCE_TYPES = ["P", "D", "A", "H", "S"] as const;
export const EVIDENCE_WEIGHTS = ["main", "sub"] as const;

/** 문장 하나가 기댄 근거 하나. 한 문장에 여러 개를 붙일 수 있다(명세 No.145, No.85). */
export const evidenceSchema = z.object({
  sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
  /** P, D, A 는 활동 기록 id, H 는 수기 메모 id, S 는 null. */
  refId: z.string().nullable(),
  item: z.enum([...ANALYSIS_FIELDS, "student_input"]),
  weight: z.enum(EVIDENCE_WEIGHTS),
});

export const sentenceSchema = z.object({
  id: z.string(),
  text: z.string(),
  evidence: z.array(evidenceSchema),
  /** 확인이 필요한 문장(노란 표시). 근거가 없거나 근거로 설명되지 않는 수치가 있으면 서버가 올린다. */
  feeling: z.boolean(),
  /** 학생이 느낌 문장을 확인했는지(명세 No.49, No.57). */
  confirmed: z.boolean(),
});

export const PARAGRAPH_ROLES = ["link", "process", "judgment", "wrap"] as const;

export const paragraphSchema = z.object({
  /** 문단 수를 고정하지 않으므로 새 본문에는 없다. 옛 리포트를 읽을 때만 있다. */
  role: z.enum(PARAGRAPH_ROLES).optional(),
  sentences: z.array(sentenceSchema),
});

/** 생성본, 편집본, 최종본의 sections. */
export const generationSectionsSchema = z.object({
  paragraphs: z.array(paragraphSchema),
});

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

export const SCORE_ITEM_KEYS = [
  "judgment",
  "limitation",
  "link",
  "source",
  "numbers",
  "start",
  "next",
  "prompt",
] as const;
export const FORMAT_CHECK_KEYS = [
  "target_range",
  "cliche_density",
  "min_length",
  "min_sentences",
  "no_university",
  "no_pending_feelings",
  "no_plan_expression",
] as const;
export const MANDATORY_FIX_KEYS = [
  "pending_feelings",
  "cliche",
  "judgment_low",
  "plan_expression",
] as const;

const scoreItemKeySchema = z.enum(SCORE_ITEM_KEYS);

const scoreCheckSchema = z.object({ text: z.string(), pass: z.boolean() });

const scoreItemSchema = z.object({
  key: scoreItemKeySchema,
  label: z.string(),
  max: z.number(),
  /** 판별력(상위 25% 와 하위 25% 보유율 차이, p). 문항 대응은 null. */
  discrimination: z.number().nullable(),
  checks: z.array(scoreCheckSchema),
  score: z.number(),
  /** false 면 채점에서 뺀 항목이다(학교 문항이 없는 문항 대응). 없으면 적용으로 본다. */
  applied: z.boolean().optional(),
});

const formatCheckSchema = z.object({
  key: z.enum(FORMAT_CHECK_KEYS),
  label: z.string(),
  pass: z.boolean(),
  detail: z.string(),
  /** 목표 글자 수가 비어 target_range 를 끈 경우 true. */
  skipped: z.boolean(),
});

export const mandatoryFixSchema = z.object({
  key: z.enum(MANDATORY_FIX_KEYS),
  message: z.string(),
  detail: z.string().nullable(),
});

const improvementSchema = z.object({
  key: scoreItemKeySchema,
  label: z.string(),
  message: z.string(),
  failedChecks: z.array(z.string()),
});

const growthFitSchema = z.object({
  stageChecks: z.array(scoreCheckSchema),
  axisChecks: z.array(
    z.object({
      axis: z.string(),
      name: z.string(),
      satisfied: z.boolean(),
      current: z.number(),
      required: z.number(),
      guideline: z.string(),
    }),
  ),
});

/** 연계 경고 한 건(명세 No.182, 190). 점수와 제출 가능 판정에는 들어가지 않는다. 판정을 못 낸 칸은 null. */
const linkCheckSchema = z.object({
  recordId: z.string(),
  label: z.string(),
  /** unused 는 선택했지만 본문이 인용하지 않은 기록이다. */
  status: z.enum(["checked", "unused"]),
  linkShown: z.boolean().nullable(),
  concreteWordPresent: z.boolean().nullable(),
  listingSuspect: z.boolean().nullable(),
});

export const verificationSectionsSchema = z.object({
  items: z.array(scoreItemSchema),
  total: z.number(),
  /** 학교 문항이 없어 문항 대응을 뺀 채점이면 true. 이전 리포트에는 없다. */
  promptMissing: z.boolean().optional(),
  format: z.array(formatCheckSchema),
  mandatoryFixes: z.array(mandatoryFixSchema),
  submittable: z.boolean(),
  improvements: z.array(improvementSchema),
  excluded: z.array(z.object({ label: z.string(), note: z.string() })),
  growthFit: growthFitSchema.nullable(),
  charCount: charCountSchema,
  sentenceCount: z.number(),
  clicheDensity: z.number(),
  clicheHits: z.array(z.string()),
  numberCount: z.number(),
  /** 연계 경고. 이전 리포트에는 없다. */
  linkChecks: z.array(linkCheckSchema).optional(),
});
