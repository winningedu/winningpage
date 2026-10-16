// 세션 응답 조립의 판단 부분(부록 A 1번). DB 없이 입력만 보고 결정하는 순수 함수다.
import {
  buildHandoff,
  type GrowthReportRow,
  type PlanItemRow,
  pickLatestCompleted,
} from "./growthHandoff.js";
import { canStartNewSession } from "./session.js";
import {
  AREAS,
  type Area,
  type GradeLabel,
  type GrowthHandoff,
  type Semester,
} from "./types.js";

const GRADE_LABELS: readonly GradeLabel[] = ["고1", "고2", "고3"];
const MAX_TEXT_CHARS = 80;

/** 문자열을 고1~3 학년으로 읽는다. 졸업, N수, 빈 값은 null. */
export function asGradeLabel(
  value: string | null | undefined,
): GradeLabel | null {
  return GRADE_LABELS.find((g) => g === value) ?? null;
}

export type SessionInfo = {
  gradeLabel: GradeLabel;
  semester: Semester;
  career: string;
  area: Area;
  /** 교과일 때만 값이 있다. */
  subject: string | null;
  /** 교과가 아닐 때만 값이 있고 비워도 된다. */
  activityName: string | null;
};

export type SessionBody =
  | { action: "resume" }
  | { action: "create"; info: SessionInfo };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const length = Array.from(text).length;
  return length >= 1 && length <= MAX_TEXT_CHARS ? text : null;
}

/** POST /api/inquiry/session 요청 본문 검증. info 는 trim 해서 돌려준다. */
export function validateSessionBody(
  body: unknown,
): { ok: true; body: SessionBody } | { ok: false; reason: string } {
  if (!isRecord(body))
    return { ok: false, reason: "요청 본문이 올바르지 않아요." };
  if (body.action === "resume") return { ok: true, body: { action: "resume" } };
  if (body.action !== "create") {
    return { ok: false, reason: "action 은 resume 또는 create 여야 해요." };
  }
  const raw = body.info;
  if (!isRecord(raw)) return { ok: false, reason: "info 가 필요해요." };

  const gradeLabel = GRADE_LABELS.find((g) => g === raw.gradeLabel);
  if (!gradeLabel) {
    return { ok: false, reason: "학년은 고1, 고2, 고3 중 하나여야 해요." };
  }
  const semester =
    raw.semester === 1 || raw.semester === 2 ? raw.semester : null;
  if (semester === null) {
    return { ok: false, reason: "학기는 1 또는 2 여야 해요." };
  }
  const career = cleanText(raw.career);
  if (career === null) {
    return { ok: false, reason: "진로는 1자 이상 80자 이하로 적어 주세요." };
  }
  // 배포 직후 옛 번들은 area 없이 보낸다. 누락과 null 은 교과로 보고 값이 있는데 틀리면 거절한다.
  const area =
    raw.area === undefined || raw.area === null
      ? "subject"
      : AREAS.find((a) => a === raw.area);
  if (!area) {
    return {
      ok: false,
      reason: "제출 영역은 교과, 자율, 동아리, 진로 중 하나여야 해요.",
    };
  }
  if (area === "subject") {
    const subject = cleanText(raw.subject);
    if (subject === null) {
      return { ok: false, reason: "과목은 1자 이상 80자 이하로 적어 주세요." };
    }
    return {
      ok: true,
      body: {
        action: "create",
        info: {
          gradeLabel,
          semester,
          career,
          area,
          subject,
          activityName: null,
        },
      },
    };
  }
  const rawName = typeof raw.activityName === "string" ? raw.activityName : "";
  const activityName = rawName.trim() === "" ? null : cleanText(rawName);
  if (rawName.trim() !== "" && activityName === null) {
    return { ok: false, reason: "활동명은 80자 이하로 적어 주세요." };
  }
  return {
    ok: true,
    body: {
      action: "create",
      info: { gradeLabel, semester, career, area, subject: null, activityName },
    },
  };
}

export type CreateDecision =
  | { kind: "create" }
  | { kind: "reuse"; sessionId: string; clearAssets: boolean }
  | { kind: "locked" }
  | { kind: "quota_exhausted" };

/**
 * create 요청의 처리 방식(부록 A 1번). 열린 세션이 있으면 설계 전까지 info 만 갱신한다.
 * 자산이 이미 있고 제출 영역, 과목, 활동명 중 하나라도 바뀌면 자산을 비운다. 없으면 잔여 회차로 새로 만들 수 있는지 본다.
 */
export function decideCreate(input: {
  openSession: {
    id: string;
    designReportId: string | null;
    area: Area;
    subject: string | null;
    activityName: string | null;
    assetCount: number;
  } | null;
  quotaRemaining: number | null;
  info: SessionInfo;
}): CreateDecision {
  const { openSession } = input;
  if (openSession) {
    if (openSession.designReportId) return { kind: "locked" };
    return {
      kind: "reuse",
      sessionId: openSession.id,
      clearAssets:
        openSession.assetCount > 0 &&
        (openSession.area !== input.info.area ||
          openSession.subject !== input.info.subject ||
          openSession.activityName !== input.info.activityName),
    };
  }
  const gate = canStartNewSession({
    openSession: false,
    quotaRemaining: input.quotaRemaining,
  });
  return gate.ok ? { kind: "create" } : { kind: "quota_exhausted" };
}

export type HandoffView = GrowthHandoff & {
  autoSelectedPlanItemId: string | null;
};

/**
 * 최신 완료 성장설계 회차의 수신 8종(부록 A 1번). 완료 회차가 없거나 학년을 알 수 없으면 null 이다.
 * 학년이 없으면 단계 불일치를 계산할 수 없어 폴백 값을 만들지 않고 비운다.
 * 과제 자동 선택은 과목 매칭이라 영역이 교과일 때만 시도한다.
 */
export function buildHandoffForSession(input: {
  reports: GrowthReportRow[];
  planItems: PlanItemRow[];
  sessionGrade: GradeLabel | null;
  /** 세션의 제출 영역과 과목. 세션이 없으면 null. */
  target: { area: Area; subject: string | null } | null;
  nowIso: string;
}): HandoffView | null {
  if (!input.sessionGrade) return null;
  const report = pickLatestCompleted(input.reports);
  if (!report) return null;
  return buildHandoff({
    report,
    planItems: input.planItems,
    sessionGrade: input.sessionGrade,
    subject: input.target?.area === "subject" ? input.target.subject : null,
    nowIso: input.nowIso,
  });
}
