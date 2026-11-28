// 자기평가서 화면이 쓰는 타입과 상수. 계약 모양(응답, 본문, 검증, 요청)의 정본은 shared/selfeval 의 스키마이고
// 여기 타입은 그 z.output, z.input 에서 가져온다. 계약이 아닌 화면 전용은 아래 둘이다.
//   라벨 표(AREA_LABELS, GROWTH_STAGE_LABELS, LINK_TYPE_LABELS, ANALYSIS_FIELD_LABELS)와 화면 상수(MAX_SUPPORT_ACTIVITIES 등)
//   BODY_EVIDENCE_FIELDS (서버 types.ts 와 같은 값)
//
// 단계(current_step): 0 생성됨 / 1 기본 입력 저장 / 2 활동 선택 확정 / 3 분석 완료 /
// 4 생성 성공 / 5 검증 완료 / 6 최종 저장.

import type { z } from "zod";
import type { HighGrade } from "@/lib/growth/types";
import type {
  analyzeBody,
  analyzeEditResponse,
  analyzeRunResponse,
} from "../../../shared/selfeval/analyze.js";
import {
  ANALYSIS_FIELDS,
  type areaSchema,
  type GROWTH_STAGES,
  type sessionStepSchema,
  type targetCharsModeSchema,
} from "../../../shared/selfeval/contract.js";
import type {
  finalizeResponse,
  promotedRecord,
} from "../../../shared/selfeval/finalize.js";
import type {
  manualInputSchema,
  pickLinkResponseSchema,
  pickListResponseSchema,
  pickManualResponseSchema,
  pickSelectResponseSchema,
} from "../../../shared/selfeval/pick.js";
import type { entryResponseSchema } from "../../../shared/selfeval/reports.js";
import type {
  generationSectionsSchema,
  mandatoryFixSchema,
  sentenceSchema,
  verificationSectionsSchema,
} from "../../../shared/selfeval/sections.js";
import type {
  analysisSchema,
  SessionBasicsInput,
  sessionDetailResponseSchema,
  sessionResponseSchema,
} from "../../../shared/selfeval/session.js";
import type { verifyResponse } from "../../../shared/selfeval/verify.js";
import type {
  writeEditResponse,
  writeGenerateResponse,
} from "../../../shared/selfeval/write.js";

export { LINK_TYPES } from "../../../shared/selfeval/pick.js";
export type { HighGrade };
export { ANALYSIS_FIELDS };

// ---------------------------------------------------------------------------
// 열거값
// ---------------------------------------------------------------------------

export type SessionStep = z.output<typeof sessionStepSchema>;

/** 작성 영역(명세 No.20). subject 는 교과, 나머지는 창의적 체험활동 영역. */
export type Area = z.output<typeof areaSchema>;

export const AREA_LABELS: Record<Area, string> = {
  subject: "교과",
  autonomy: "자율",
  club: "동아리",
  career: "진로",
};

export type TargetCharsMode = z.output<typeof targetCharsModeSchema>;

export type GrowthStage = (typeof GROWTH_STAGES)[number];

export const GROWTH_STAGE_LABELS: Record<GrowthStage, string> = {
  seed: "씨앗",
  flower: "개화",
  bloom: "만개",
};

export type AnalysisField = (typeof ANALYSIS_FIELDS)[number];

/** 본문 근거로 쓸 수 있는 항목. 다음 단계(next)는 본문에 쓰지 않는다(명세 No.37). 서버 types.ts 와 같다. */
export const BODY_EVIDENCE_FIELDS: readonly AnalysisField[] =
  ANALYSIS_FIELDS.filter((f) => f !== "next");

export const ANALYSIS_FIELD_LABELS: Record<AnalysisField, string> = {
  motive: "계기",
  concept: "교과 개념",
  action: "한 일",
  method: "방법",
  result: "결과와 근거",
  role: "역할",
  collaboration: "협업",
  learning: "배운 점",
  career: "진로 연결",
  limitation: "한계",
  next: "다음 단계",
};

export type LinkType = PickListResponse["links"][number]["type"];

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  inherit: "이어받음",
  deepen: "같은 질문 심화",
  borrow_method: "방법 빌림",
  complement: "관점 보완",
  background: "배경 개념",
  area_extend: "영역 확장",
  grade_continue: "학년 이어짐",
};

// ---------------------------------------------------------------------------
// 화면 상수
// ---------------------------------------------------------------------------

export const MAX_SUPPORT_ACTIVITIES = 2;
export const MAX_REGENERATIONS = 3;
export const MAX_MODEL_ATTEMPTS_PER_STEP = 10;
export const DEFAULT_TARGET_CHARS = 500;
export const TARGET_TOLERANCE = 0.05;

// ---------------------------------------------------------------------------
// 진입, 세션 조회(shared/selfeval/reports.ts, session.ts)
// ---------------------------------------------------------------------------

export type EntryResponse = z.output<typeof entryResponseSchema>;
export type EntryProfile = NonNullable<EntryResponse["entry"]["profile"]>;
export type GrowthBanner = NonNullable<
  EntryResponse["entry"]["growth"]
>["banner"];
export type SessionListItem = EntryResponse["sessions"][number];

export type SessionDetailResponse = z.output<
  typeof sessionDetailResponseSchema
>;
export type SessionView = SessionDetailResponse["session"];
export type GrowthSnapshot = NonNullable<SessionView["growthSnapshot"]>;
export type SessionActivityView = SessionDetailResponse["activities"][number];
export type ActivityRole = SessionActivityView["role"];
export type ActivityRecordLike = SessionActivityView["record"];
export type EvidenceMemoView = SessionDetailResponse["memos"][number];

/** 세션 생성과 수정 바디(shared/selfeval/session.ts 의 요청 스키마 입력). */
export type SessionInput = SessionBasicsInput;

export type SessionResponse = z.output<typeof sessionResponseSchema>;

// ---------------------------------------------------------------------------
// 활동 선택(shared/selfeval/pick.ts)
// ---------------------------------------------------------------------------

export type ManualInput = z.input<typeof manualInputSchema>;

export type PickListResponse = z.output<typeof pickListResponseSchema>;
export type PickLinkResponse = z.output<typeof pickLinkResponseSchema>;
export type PickSelectResponse = z.output<typeof pickSelectResponseSchema>;
export type PickManualResponse = z.output<typeof pickManualResponseSchema>;

export type CandidateRow = PickListResponse["candidates"][number];
export type CandidateLinkState = NonNullable<CandidateRow["linkState"]>;
export type RecordLink = PickListResponse["links"][number];
export type LinkStrength = RecordLink["strength"];
/** pending 판정 전, ok 판정 끝, unchecked 호출 실패나 시도 소진. */
export type LinkStatus = PickListResponse["linkStatus"];
export type SourceCounts = PickListResponse["sourceCounts"];

// ---------------------------------------------------------------------------
// 분석, 생성, 검증, 최종 저장(shared/selfeval/analyze.ts, write.ts, verify.ts, finalize.ts)
// ---------------------------------------------------------------------------

export type Analysis = z.output<typeof analysisSchema>;
export type ConflictRow = Analysis["conflicts"][number];
/** 항목 값의 출처. record 는 기록에서, student 는 학생 입력, empty 는 비움. */
export type FieldSource = Analysis["sources"][AnalysisField];

export type AnalyzeRunResponse = z.output<typeof analyzeRunResponse>;
export type AnalyzeEditResponse = z.output<typeof analyzeEditResponse>;
export type ConflictChoice = Extract<
  z.input<typeof analyzeBody>,
  { action: "resolve-conflict" }
>["choice"];

export type Sentence = z.output<typeof sentenceSchema>;
export type SentenceEvidence = Sentence["evidence"][number];
/** 근거 출처 유형(명세 No.145): P 수행평가, D 심화탐구, A 창체 활동, H 수기 메모, S 학생 입력. */
export type EvidenceSourceType = SentenceEvidence["sourceType"];
export type GenerationSections = z.output<typeof generationSectionsSchema>;
export type CharCount = WriteGenerateResponse["report"]["charCount"];

export type WriteGenerateResponse = z.output<typeof writeGenerateResponse>;
export type WriteEditResponse = z.output<typeof writeEditResponse>;

export type VerificationSections = z.output<typeof verificationSectionsSchema>;
export type MandatoryFix = z.output<typeof mandatoryFixSchema>;
export type VerifyResponse = z.output<typeof verifyResponse>;

/** 활동 기록으로 남길 7항목(명세 No.43, No.63). */
export type PromotedRecord = z.input<typeof promotedRecord>;

export type FinalizeResponse = z.output<typeof finalizeResponse>;
export type FinalizeReply = FinalizeResponse["reply"];
