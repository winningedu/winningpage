// 정보 입력 화면(1단계)의 순수 로직. 화면 컴포넌트는 이 파일의 결과만 그린다.
// 계약: docs/deep-inquiry-dev-plan.md 부록 A(session, assets), 부록 C, §0-3.
import { GENERIC_ERROR_MESSAGE } from "@/lib/inquiry/apiResult";
import { STAGE_LABELS } from "@/lib/inquiry/labels";
import type {
  AssetInput,
  AssetView,
  GradeLabel,
  HandoffView,
  InterviewAnswers,
  RecordCandidate,
  Reliability,
  Semester,
  SessionInfo,
  SessionView,
} from "@/lib/inquiry/types";

// ── 기본 정보 폼 ──────────────────────────────────────────────────────

export const FIELD_MAX_CHARS = 80;

export type InfoForm = {
  gradeLabel: GradeLabel | null;
  semester: Semester | null;
  career: string;
  subject: string;
};

export type InfoFormErrors = Partial<Record<keyof InfoForm, string>>;

export type InfoValidation =
  | { ok: true; value: SessionInfo }
  | { ok: false; errors: InfoFormErrors };

function textError(value: string, emptyMessage: string): string | null {
  const length = value.trim().length;
  if (length === 0) return emptyMessage;
  if (length > FIELD_MAX_CHARS)
    return `${FIELD_MAX_CHARS}자 안으로 적어 주세요.`;
  return null;
}

/** 진로, 과목명 필수(No.147, 148). 값은 trim 해서 돌려준다. */
export function validateInfoForm(form: InfoForm): InfoValidation {
  const errors: InfoFormErrors = {};
  if (form.gradeLabel === null) errors.gradeLabel = "학년을 선택해 주세요.";
  if (form.semester === null) errors.semester = "학기를 선택해 주세요.";
  const careerError = textError(form.career, "희망 진로를 적어 주세요.");
  if (careerError) errors.career = careerError;
  const subjectError = textError(form.subject, "과목명을 적어 주세요.");
  if (subjectError) errors.subject = subjectError;

  if (
    Object.keys(errors).length > 0 ||
    form.gradeLabel === null ||
    form.semester === null
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      gradeLabel: form.gradeLabel,
      semester: form.semester,
      career: form.career.trim(),
      subject: form.subject.trim(),
    },
  };
}

/** 폼 초기값. 열린 세션 값이 student_profiles 값보다 먼저다. 값이 없으면 비운다. */
export function initialForm({
  session,
  profile,
}: {
  session: Pick<
    SessionView,
    "gradeLabel" | "semester" | "career" | "subject"
  > | null;
  profile: {
    gradeLabel: GradeLabel | null;
    semester: Semester | null;
    career: string | null;
  } | null;
}): InfoForm {
  return {
    gradeLabel: session?.gradeLabel ?? profile?.gradeLabel ?? null,
    semester: session?.semester ?? profile?.semester ?? null,
    career: session?.career ?? profile?.career ?? "",
    subject: session?.subject ?? "",
  };
}

// ── 선택 자산 목록(로컬 상태) ───────────────────────────────────────────
// 첫 번째 항목이 출발 활동(primary)이다. "주제 3개 추천받기" 때 한 번에 postAssets 로 보낸다.

export const ONELINE_MAX_CHARS = 200;

export type LocalAsset = {
  /** 목록 안에서 유일한 키. 기록은 record:{id}, 나머지는 {kind}:{번호}. */
  key: string;
  input: AssetInput;
  reliability: Reliability;
  /** 목록에 보일 한 줄. 기록은 주제, 인터뷰는 1번 답, 한 줄은 본문. 없으면 빈 문자열. */
  summary: string;
};

export function recordAsset(record: RecordCandidate): LocalAsset {
  return {
    key: `record:${record.id}`,
    input: { kind: "record", activityRecordId: record.id },
    reliability: "A",
    summary: record.topic ?? "",
  };
}

export function onelineAsset(text: string, key: string): LocalAsset {
  const trimmed = text.trim();
  return {
    key,
    input: { kind: "oneline", text: trimmed },
    reliability: "C",
    summary: trimmed,
  };
}

export function interviewAsset(
  answers: InterviewAnswers,
  gaps: string[],
  key: string,
): LocalAsset {
  return {
    key,
    input: { kind: "interview", answers, gaps },
    reliability: "B",
    summary: answers.q1,
  };
}

/** 한 줄 입력 검증 메시지. 통과면 null. */
export function validateOneline(text: string): string | null {
  const length = text.trim().length;
  if (length === 0) return "주제를 한 줄 적어 주세요.";
  if (length > ONELINE_MAX_CHARS) {
    return `${ONELINE_MAX_CHARS}자 안으로 적어 주세요.`;
  }
  return null;
}

/** 끝에 붙인다. 이미 같은 key 가 있으면(같은 기록) 그대로 둔다. */
export function addAsset(list: LocalAsset[], asset: LocalAsset): LocalAsset[] {
  if (list.some((item) => item.key === asset.key)) return list;
  return [...list, asset];
}

export function removeAsset(list: LocalAsset[], key: string): LocalAsset[] {
  return list.filter((item) => item.key !== key);
}

export function moveAsset(
  list: LocalAsset[],
  key: string,
  direction: "up" | "down",
): LocalAsset[] {
  const index = list.findIndex((item) => item.key === key);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as LocalAsset);
  return next;
}

/** 기록 체크박스용. 없으면 넣고 있으면 뺀다. */
export function toggleRecord(
  list: LocalAsset[],
  record: RecordCandidate,
): LocalAsset[] {
  const asset = recordAsset(record);
  return list.some((item) => item.key === asset.key)
    ? removeAsset(list, asset.key)
    : addAsset(list, asset);
}

/** `{prefix}:{n}` 형태 키 중 겹치지 않는 다음 번호. */
export function nextKey(list: LocalAsset[], prefix: string): string {
  let max = 0;
  for (const item of list) {
    const [head, tail] = item.key.split(":");
    if (head !== prefix) continue;
    const n = Number(tail);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}:${max + 1}`;
}

export function toAssetInputs(list: LocalAsset[]): AssetInput[] {
  return list.map((item) => item.input);
}

/** 저장된 자산(AssetView)을 로컬 목록으로 되돌린다(재진입 복원). position 순, 필수 값이 빠진 행은 건너뛴다. */
export function fromAssetViews(views: AssetView[]): LocalAsset[] {
  const out: LocalAsset[] = [];
  const sorted = [...views].sort((a, b) => a.position - b.position);
  for (const view of sorted) {
    if (view.kind === "record") {
      if (!view.activityRecordId) continue;
      out.push({
        key: `record:${view.activityRecordId}`,
        input: { kind: "record", activityRecordId: view.activityRecordId },
        reliability: view.reliability,
        summary: view.summary,
      });
    } else if (view.kind === "oneline") {
      if (!view.onelineText) continue;
      out.push({
        key: nextKey(out, "oneline"),
        input: { kind: "oneline", text: view.onelineText },
        reliability: view.reliability,
        summary: view.summary,
      });
    } else {
      if (!view.interviewAnswers) continue;
      out.push({
        key: nextKey(out, "interview"),
        input: {
          kind: "interview",
          answers: view.interviewAnswers,
          gaps: view.gaps,
        },
        reliability: view.reliability,
        summary: view.summary,
      });
    }
  }
  return out;
}

// ── 과목 버튼과 필터 ───────────────────────────────────────────────────

export type SubjectChip = { value: string | null; label: string };

/** 서버가 센 subjectCounts 에 "전체" 칩을 앞에 붙인다. 과목 칩은 "이름 건수". */
export function subjectChips(
  counts: { subject: string; count: number }[],
): SubjectChip[] {
  return [
    { value: null, label: "전체" },
    ...counts.map((c) => ({
      value: c.subject,
      label: `${c.subject} ${c.count}`,
    })),
  ];
}

/** 서버 subjectCounts 가 과목 없는 기록을 묶는 이름. */
const UNCLASSIFIED = "미분류";

export function filterRecords(
  records: RecordCandidate[],
  subject: string | null,
): RecordCandidate[] {
  if (subject === null) return records;
  return records.filter((r) => (r.subject?.trim() || UNCLASSIFIED) === subject);
}

// ── 경고(No.41, 42) ─────────────────────────────────────────────────────
// 서버 assets.ts assetWarnings 와 같은 규칙이다(infoLogic.test.ts 가 같은 입력으로 대조한다).

const SUBJECT_GROUP = "교과";
const isBlank = (value: string | null | undefined): boolean =>
  value == null || value.trim() === "";

export function localWarnings(
  list: LocalAsset[],
  records: RecordCandidate[],
): string[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const selected: RecordCandidate[] = [];
  for (const item of list) {
    if (item.input.kind !== "record") continue;
    const found = byId.get(item.input.activityRecordId);
    if (found) selected.push(found);
  }
  const warnings: string[] = [];
  if (
    selected.length > 0 &&
    !selected.some((r) => r.subjectGroup === SUBJECT_GROUP)
  ) {
    warnings.push("NO_SUBJECT_ASSET");
  }
  if (selected.some((r) => isBlank(r.concept) && isBlank(r.limitation))) {
    warnings.push("LINK_MATERIAL_LACKING");
  }
  return warnings;
}

const WARNING_MESSAGES: Record<string, string> = {
  NO_SUBJECT_ASSET:
    "고른 활동에 교과 활동이 없어요. 교과 심화탐구는 교과 활동에서 출발할 때 가장 잘 이어져요. 그대로 진행할 수도 있어요.",
  LINK_MATERIAL_LACKING:
    "고른 활동에 개념과 한계가 비어 있어 연계 재료가 부족해요. 주제가 덜 구체적일 수 있어요.",
};

/** 경고 코드를 문장으로 바꾼다. 모르는 코드는 버린다. */
export function warningMessages(codes: string[]): string[] {
  return codes.flatMap((code) => {
    const message = WARNING_MESSAGES[code];
    return message ? [message] : [];
  });
}

// ── 성장설계 배너(No.107~109) ───────────────────────────────────────────

export type GrowthBannerView = {
  theme: string | null;
  stageLabel: string | null;
  chips: string[];
  /** "2026.09.14" 형태 발행일. 읽을 수 없으면 null. */
  issuedLabel: string | null;
  notices: string[];
};

function issuedLabelOf(issuedAt: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(issuedAt);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

export function growthBannerView(
  handoff: HandoffView | null,
): GrowthBannerView | null {
  if (!handoff) return null;
  const notices: string[] = [];
  if (handoff.stale) {
    notices.push(
      "성장설계 리포트를 발행한 지 오래됐어요. 최신 상태가 아닐 수 있어요.",
    );
  }
  if (handoff.stageMismatch) {
    notices.push("리포트의 학년 단계와 이번 세션의 학년이 달라요.");
  }
  return {
    theme: handoff.theme,
    stageLabel: handoff.stage ? STAGE_LABELS[handoff.stage] : null,
    chips: handoff.subthemes.map((s) => `${s.grade} ${s.text}`),
    issuedLabel: issuedLabelOf(handoff.issuedAt),
    notices,
  };
}

/**
 * 과제 후보 라디오 초기값. 성장설계에서 넘어온 과제(growth:handoff)가 후보에 있으면 먼저 쓰고,
 * 다음은 세션에 저장된 값(해제했으면 null 그대로), 세션이 없으면 서버 자동 선택값이다.
 */
export function initialPlanItemId({
  handoff,
  session,
  storedPlanItemId,
}: {
  handoff: HandoffView | null;
  session: Pick<SessionView, "planItemId"> | null;
  storedPlanItemId: string | null;
}): string | null {
  if (!handoff) return null;
  const candidates = new Set(handoff.planItems.map((item) => item.id));
  if (storedPlanItemId !== null && candidates.has(storedPlanItemId)) {
    return storedPlanItemId;
  }
  if (session) return session.planItemId;
  return handoff.autoSelectedPlanItemId;
}

// ── 제출 동작 결정 ──────────────────────────────────────────────────────

export type SubmitDecision =
  | { kind: "locked" }
  | { kind: "confirm-empty" }
  | { kind: "proceed"; createSession: boolean };

function sameInfo(
  session: Pick<SessionView, "gradeLabel" | "semester" | "career" | "subject">,
  info: SessionInfo,
): boolean {
  return (
    session.gradeLabel === info.gradeLabel &&
    session.semester === info.semester &&
    session.career === info.career &&
    session.subject === info.subject
  );
}

/**
 * 제출 시 무엇을 할지 정한다. 설계 리포트가 있으면 잠김, 자산 0건이면 먼저 확인 창,
 * 세션이 없거나 정보가 바뀌었으면 create(생성 또는 갱신)를 먼저 부른다.
 */
export function decideSubmit({
  session,
  info,
  assetCount,
  emptyConfirmed,
}: {
  session: SessionView | null;
  info: SessionInfo;
  assetCount: number;
  emptyConfirmed: boolean;
}): SubmitDecision {
  if (session?.designReportId) return { kind: "locked" };
  if (assetCount === 0 && !emptyConfirmed) return { kind: "confirm-empty" };
  return {
    kind: "proceed",
    createSession: session === null || !sameInfo(session, info),
  };
}

/** 기록 행의 수행 시기("2026-07"). 확정일, 없으면 생성일. 읽을 수 없으면 null. */
export function recordPeriod(record: RecordCandidate): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(record.confirmedAt ?? record.createdAt);
  return match ? `${match[1]}-${match[2]}` : null;
}

// ── 제출 오류 분기 ──────────────────────────────────────────────────────

export type SubmitErrorView =
  | { kind: "quota" }
  | { kind: "entitlement" }
  | { kind: "locked"; text: string }
  | { kind: "message"; text: string };

export const LOCKED_MESSAGE =
  "설계 리포트를 만든 뒤에는 출발 활동과 정보를 바꿀 수 없어요. 새 세션은 확정 뒤에 시작할 수 있어요";

const TIMEOUT_MESSAGE = "응답이 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.";

/** postSession, postAssets 의 실패 결과를 화면 분기로 바꾼다. */
export function submitErrorView(
  result:
    | { kind: "timeout" }
    | { kind: "error"; status: number; code: string; message: string },
): SubmitErrorView {
  if (result.kind === "timeout")
    return { kind: "message", text: TIMEOUT_MESSAGE };
  if (result.status === 429 && result.code === "QUOTA_EXHAUSTED") {
    return { kind: "quota" };
  }
  if (result.status === 409 && result.code === "SESSION_LOCKED") {
    return { kind: "locked", text: LOCKED_MESSAGE };
  }
  if (result.status === 403 && result.code === "NO_ENTITLEMENT") {
    return { kind: "entitlement" };
  }
  if (result.status === 400 && result.message.trim() !== "") {
    return { kind: "message", text: result.message };
  }
  return { kind: "message", text: GENERIC_ERROR_MESSAGE };
}
