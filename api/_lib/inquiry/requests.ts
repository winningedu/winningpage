// assets, submission, reports 요청 본문과 쿼리 검증, 자산 행 변환(부록 A 2~4번). 순수 함수만 둔다.
// 여기서는 모양만 본다. 값의 의미 검증(빈틈 1개, 한 줄 길이 등)은 assets.ts validateAssetInputs 가 한다.
import { reliabilityOf } from "./assets.js";
import {
  INTERVIEW_ENDING_LABELS,
  INTERVIEW_SOURCE_LABELS,
  INTERVIEW_TASK_TYPE_LABELS,
} from "./constants.js";
import type { NewAssetRow } from "./db.js";
import { normalizeSections } from "./submission.js";
import type {
  AssetInput,
  InterviewAnswers,
  InterviewEnding,
  InterviewSourceType,
  InterviewTaskType,
  SubmissionSections,
} from "./types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 한 세션이 가질 자산 상한. 출발 활동 후보 목록 상한과 같다. */
const MAX_ASSETS = 20;
/** 작성본 한 절의 저장 상한(부록 A 3번). */
const MAX_SECTION_CHARS = 20_000;

type Parsed<T> = { ok: true; body: T } | { ok: false; reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v);

function pickEnum<T extends string>(
  value: unknown,
  allowed: Record<T, string>,
): T | null {
  return typeof value === "string" && value in allowed ? (value as T) : null;
}

/** 인터뷰 답을 읽는다. 모양이 틀리면 null. 문자열은 trim 하고 빈 선택 문항은 버린다. */
function parseAnswers(raw: unknown): InterviewAnswers | null {
  if (!isRecord(raw) || typeof raw.q1 !== "string") return null;
  const out: InterviewAnswers = { q1: raw.q1.trim() };

  if (raw.q2 !== undefined && raw.q2 !== null) {
    const q2 = pickEnum<InterviewTaskType>(raw.q2, INTERVIEW_TASK_TYPE_LABELS);
    if (!q2) return null;
    out.q2 = q2;
  }
  if (raw.q3 !== undefined) {
    if (!Array.isArray(raw.q3)) return null;
    const q3: InterviewSourceType[] = [];
    for (const v of raw.q3) {
      const one = pickEnum<InterviewSourceType>(v, INTERVIEW_SOURCE_LABELS);
      if (!one) return null;
      if (!q3.includes(one)) q3.push(one);
    }
    out.q3 = q3;
  }
  if (raw.q5 !== undefined && raw.q5 !== null) {
    const q5 = pickEnum<InterviewEnding>(raw.q5, INTERVIEW_ENDING_LABELS);
    if (!q5) return null;
    out.q5 = q5;
  }
  for (const key of ["q4", "q6", "q7"] as const) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return null;
    out[key] = v.trim();
  }
  return out;
}

function parseItem(raw: unknown): AssetInput | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "record") {
    return typeof raw.activityRecordId === "string"
      ? { kind: "record", activityRecordId: raw.activityRecordId.trim() }
      : null;
  }
  if (raw.kind === "oneline") {
    return typeof raw.text === "string"
      ? { kind: "oneline", text: raw.text.trim() }
      : null;
  }
  if (raw.kind === "interview") {
    const answers = parseAnswers(raw.answers);
    if (!answers || !Array.isArray(raw.gaps)) return null;
    if (!raw.gaps.every((g) => typeof g === "string")) return null;
    const gaps = [
      ...new Set(
        (raw.gaps as string[]).map((g) => g.trim()).filter((g) => g !== ""),
      ),
    ];
    return { kind: "interview", answers, gaps };
  }
  return null;
}

export type AssetsBody = {
  sessionId: string;
  items: AssetInput[];
  planItemId: string | null;
};

export function validateAssetsBody(body: unknown): Parsed<AssetsBody> {
  if (!isRecord(body))
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  if (!isUuid(body.sessionId))
    return { ok: false, reason: "sessionId 가 올바르지 않아요." };
  if (!Array.isArray(body.items))
    return { ok: false, reason: "items 는 배열이어야 해요." };
  if (body.items.length > MAX_ASSETS) {
    return { ok: false, reason: `자산은 ${MAX_ASSETS}건까지 고를 수 있어요.` };
  }
  if (body.planItemId !== null && typeof body.planItemId !== "string") {
    return { ok: false, reason: "planItemId 는 문자열 또는 null 이어야 해요." };
  }
  const items: AssetInput[] = [];
  for (const [index, raw] of body.items.entries()) {
    const item = parseItem(raw);
    if (!item)
      return { ok: false, reason: `items[${index}] 모양이 올바르지 않아요.` };
    items.push(item);
  }
  return {
    ok: true,
    body: { sessionId: body.sessionId, items, planItemId: body.planItemId },
  };
}

/** 입력 순서가 position 이다(0 이 기본 출발 활동). 신뢰도는 모델이 아니라 경로에서 정한다. */
export function toAssetRows(items: AssetInput[]): NewAssetRow[] {
  return items.map((item, position) => ({
    kind: item.kind,
    reliability: reliabilityOf(item.kind),
    position,
    activity_record_id: item.kind === "record" ? item.activityRecordId : null,
    interview_answers: item.kind === "interview" ? item.answers : null,
    gaps: item.kind === "interview" ? item.gaps : null,
    oneline_text: item.kind === "oneline" ? item.text : null,
  }));
}

export type SubmissionBody = {
  sessionId: string;
  sections: SubmissionSections;
};

export function validateSubmissionBody(body: unknown): Parsed<SubmissionBody> {
  if (!isRecord(body))
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  if (!isUuid(body.sessionId))
    return { ok: false, reason: "sessionId 가 올바르지 않아요." };
  const sections = normalizeSections(body.sections);
  if (!sections)
    return { ok: false, reason: "sections 는 절별 문자열 객체여야 해요." };
  const clipped = Object.fromEntries(
    Object.entries(sections).map(([id, text]) => [
      id,
      Array.from(text).slice(0, MAX_SECTION_CHARS).join(""),
    ]),
  ) as SubmissionSections;
  return { ok: true, body: { sessionId: body.sessionId, sections: clipped } };
}

/** GET /api/inquiry/reports 쿼리. sessionId 가 없으면 목록, 있으면 상세다. */
export function parseReportsQuery(
  query: Record<string, unknown>,
): { ok: true; sessionId: string | undefined } | { ok: false; reason: string } {
  const raw = query.sessionId;
  if (raw === undefined) return { ok: true, sessionId: undefined };
  if (!isUuid(raw))
    return { ok: false, reason: "sessionId 가 올바르지 않아요." };
  return { ok: true, sessionId: raw };
}
