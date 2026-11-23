// 연계 판정 모델 호출의 프롬프트와 응답 검증(명세 No.174~176, 184, 185, 187).
// 모델 한 번의 응답에 1차(핵심과 후보)와 2차(1차를 통과한 기록끼리)가 함께 온다.
// 모델은 후보만 내고, 인정은 acceptLink 가 코드로 정한다.

import {
  acceptLink,
  type LinkAreaContext,
  type LinkJudgment,
  linkRecordText,
  submittedAtOf,
} from "./link.js";
import type { PromptBundle } from "./prompts.js";
import {
  type ActivityRecordLike,
  AREA_LABELS,
  type Area,
  CREATIVE_SUBJECT_LINK_TYPES,
  LINK_TYPE_LABELS,
  LINK_TYPES,
  MAX_PAIR_RECORDS,
  type RecordLink,
} from "./types.js";
import type { ValidationIssue } from "./validation.js";

export const LINK_MAX_OUTPUT_TOKENS = 4096;

export type LinkPromptInput = {
  core: ActivityRecordLike;
  /** 적합도 높은 순. 1차 통과 기록 중 앞의 8건이 2차 대상이다. */
  others: ActivityRecordLike[];
  area: Area;
  subject: string | null;
  activityName: string | null;
};

export type LinkRejection = { fromId: string; toId: string; reason: string };

export type LinkValidation =
  | { ok: true; links: RecordLink[]; rejected: LinkRejection[] }
  | { ok: false; issues: ValidationIssue[] };

const TYPE_GUIDE: Record<(typeof LINK_TYPES)[number], string> = {
  inherit:
    "앞 기록의 결과나 자료가 뒤 기록의 입력이 됨 (예: 수요식 구하기 다음에 그 식으로 이익 함수 세우기)",
  deepen: "같은 질문을 범위나 변수를 넓혀 다시 다룸",
  borrow_method:
    "다른 기록의 도구나 방법을 가져다 씀 (예: 엑셀로 한 계산을 검산에 씀)",
  complement: "다른 기록이 한계, 반례, 다른 관점을 더함 (예: 표본 한계)",
  background:
    "다른 기록의 개념이 이번 판단의 이유를 설명함 (예: 수요 법칙이 음의 기울기를 설명)",
  area_extend: "교과 기록이 자율, 동아리, 진로 활동으로 이어지거나 그 반대",
  grade_continue: "이전 학년 기록의 질문이나 방법을 이번 학년 기록이 다시 다룸",
};

const RULES = [
  "너는 학생의 활동 기록들이 서로 어떻게 이어지는지 판정하는 도우미다.",
  "응답은 지정한 JSON 객체 하나만 낸다. JSON 밖에 설명을 붙이지 않는다.",
  "",
  "연계 유형(link_type)",
  ...LINK_TYPES.map((t) => `- ${t} (${LINK_TYPE_LABELS[t]}): ${TYPE_GUIDE[t]}`),
  "같은 소재(예: 매점)만 겹치는 것은 연계가 아니다. 개념, 방법, 자료, 질문 중 하나가 겹치거나 넘어가야 연계다.",
  "",
  "근거 강도(strength)",
  "- explicit: 한쪽 기록 원문이 다른 활동, 과목, 자료를 직접 언급함",
  "- implicit: 내용이 이어질 뿐 원문에 언급이 없어 네가 추론함",
  "",
  "판정 방법",
  "- 1차: R0(핵심 기록)과 나머지 기록 R1, R2, ... 를 하나씩 짝지어 판정한다.",
  "- 2차: 1차에서 연계라고 한 기록이 둘 이상이면 그 기록끼리 모든 쌍도 같은 응답에서 판정한다.",
  "- 판정마다 from 기록의 원문과 to 기록의 원문에서 근거 문장을 글자 그대로 가져와 quote_from, quote_to 에 쓴다. 고쳐 쓰지 않는다.",
  "- 이어받음(inherit)과 같은 질문 심화(deepen)는 from 이 먼저 제출한 기록이고 to 가 나중에 제출한 기록이다.",
  "- 연계가 아니면 linked 를 false 로 하고 나머지는 빈 문자열로 둔다.",
].join("\n");

const judgmentSchema = {
  type: "object",
  properties: {
    from: { type: "string" },
    to: { type: "string" },
    linked: { type: "boolean" },
    link_type: { type: "string", enum: [...LINK_TYPES, ""] },
    quote_from: { type: "string" },
    quote_to: { type: "string" },
    strength: { type: "string", enum: ["explicit", "implicit", ""] },
  },
  required: [
    "from",
    "to",
    "linked",
    "link_type",
    "quote_from",
    "quote_to",
    "strength",
  ],
};

const linkSchema = {
  type: "object",
  properties: { judgments: { type: "array", items: judgmentSchema } },
  required: ["judgments"],
};

const refOf = (i: number): string => `R${i}`;

function view(ref: string, r: ActivityRecordLike) {
  return {
    ref,
    subject: r.subject ?? r.subjectGroup,
    submittedAt: submittedAtOf(r),
    topic: r.topic,
    concept: r.concept,
    method: r.method,
    result: r.result,
    limitation: r.limitation,
    numbers: r.numbers,
    sources: r.sources,
    summary: r.summary ?? null,
    reflection: r.reflection ?? null,
  };
}

export function buildLinkPrompt(
  input: LinkPromptInput,
  retryNotes: string[] = [],
): PromptBundle {
  const head = [
    `작성 영역: ${AREA_LABELS[input.area]}`,
    input.subject ? `교과: ${input.subject}` : null,
    input.activityName ? `활동 이름: ${input.activityName}` : null,
    input.area === "subject"
      ? null
      : `창체 영역 자기평가다. 핵심은 그 영역 활동이고, 교과 기록은 ${CREATIVE_SUBJECT_LINK_TYPES.join(", ")} 유형으로만 잇는다.`,
  ]
    .filter((x): x is string => x !== null)
    .join("\n");
  const records = [
    view(refOf(0), input.core),
    ...input.others.map((r, i) => view(refOf(i + 1), r)),
  ];
  const notes =
    retryNotes.length > 0
      ? `\n\n[이전 응답의 문제]\n${retryNotes.map((n) => `- ${n}`).join("\n")}`
      : "";
  return {
    system: RULES,
    user: `${head}\n\n[핵심 기록 R0와 후보 기록]\n${JSON.stringify(records, null, 2)}${notes}`,
    responseSchema: linkSchema,
    maxOutputTokens: LINK_MAX_OUTPUT_TOKENS,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * 모델 응답을 코드 규칙으로 걸러 인정된 연계만 남긴다. 핵심과 이어진 1차 쌍을 먼저 확인하고,
 * 1차를 통과한 기록 중 앞의 8건 사이의 쌍만 2차로 인정한다(명세 No.184).
 */
export function validateLinkResponse(
  value: unknown,
  input: LinkPromptInput,
): LinkValidation {
  if (!isObj(value) || !Array.isArray(value.judgments)) {
    return {
      ok: false,
      issues: [{ code: "link_shape", message: "judgments 배열이 필요합니다." }],
    };
  }
  const byRef = new Map<string, ActivityRecordLike>([
    [refOf(0), input.core],
    ...input.others.map((r, i) => [refOf(i + 1), r] as const),
  ]);
  const ctx: LinkAreaContext = { area: input.area, subject: input.subject };
  const seen = new Set<string>();
  const rejected: LinkRejection[] = [];
  const pass1: RecordLink[] = [];
  const pass2: RecordLink[] = [];

  for (const raw of value.judgments) {
    if (!isObj(raw) || raw.linked !== true) continue;
    const from = byRef.get(str(raw.from));
    const to = byRef.get(str(raw.to));
    if (!from || !to || from.id === to.id) continue;
    const key = [from.id, to.id].sort().join("|");
    if (seen.has(key)) continue;
    const judgment: LinkJudgment = {
      fromId: from.id,
      toId: to.id,
      type: str(raw.link_type),
      strength: raw.strength === "explicit" ? "explicit" : "implicit",
      quoteFrom: str(raw.quote_from),
      quoteTo: str(raw.quote_to),
    };
    const verdict = acceptLink(judgment, from, to, ctx);
    if (!verdict.ok) {
      rejected.push({ fromId: from.id, toId: to.id, reason: verdict.reason });
      continue;
    }
    seen.add(key);
    const link: RecordLink = {
      fromId: from.id,
      toId: to.id,
      type: judgment.type as RecordLink["type"],
      strength: judgment.strength,
      source: "model",
      confirmed: false,
      deleted: false,
      note: null,
      quoteFrom: judgment.quoteFrom,
      quoteTo: judgment.quoteTo,
    };
    (from.id === input.core.id || to.id === input.core.id ? pass1 : pass2).push(
      link,
    );
  }

  const passed = new Set(
    pass1.map((l) => (l.fromId === input.core.id ? l.toId : l.fromId)),
  );
  const pool = new Set(
    input.others
      .filter((r) => passed.has(r.id))
      .slice(0, MAX_PAIR_RECORDS)
      .map((r) => r.id),
  );
  const second = pass2.filter((l) => pool.has(l.fromId) && pool.has(l.toId));
  return { ok: true, links: [...pass1, ...second], rejected };
}
