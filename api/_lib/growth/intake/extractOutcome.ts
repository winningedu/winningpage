// 업로드 추출 결과 조립과 시간, 상한 판단(순수 함수). DB, Storage, 모델 호출은 핸들러가 맡는다.

import {
  type ActivityRow,
  filterMaterialActivities,
  UPLOAD_LIMIT_PER_SEMESTER,
  type UploadRow,
} from "./collectSummary.js";
import {
  type Extracted,
  type ExtractionParse,
  toActivityRecordFromExtraction,
  type UploadText,
} from "./extraction.js";

/** 추출 요청 전체(다운로드, 해석, 모델 호출) 마감. 함수 maxDuration 60초 안에 응답을 남긴다. */
export const EXTRACT_BUDGET_MS = 50_000;

/** 요청 시작 시각 기준 남은 예산(ms). 마감이 지났으면 0. */
export function remainingBudgetMs(
  startedAt: number,
  now: number,
  total: number = EXTRACT_BUDGET_MS,
): number {
  return Math.max(0, total - (now - startedAt));
}

/**
 * 방금 등록한 행까지 포함해 같은 학기 업로드가 상한을 넘었는지 본다. failed 는 세지 않는다.
 * 동시 요청이 사전 조회를 함께 통과했을 때 insert 뒤 재집계로 초과분을 되돌리는 용도다.
 */
export function exceedsUploadLimit(
  rows: readonly UploadRow[],
  gradeLabel: "고1" | "고2" | "고3",
  semester: 1 | 2,
  limit: number = UPLOAD_LIMIT_PER_SEMESTER,
): boolean {
  const used = rows.filter(
    (u) =>
      u.grade_label === gradeLabel &&
      u.semester === semester &&
      u.extraction_status !== "failed",
  ).length;
  return used > limit;
}

/** 업로드 내용 종류에 따라 모델 호출 방식을 정한다. */
export function decideExtractionMode(
  uploadText: UploadText,
): "text" | "vision" | "unsupported" {
  if (uploadText.kind === "text") return "text";
  if (uploadText.kind === "binary") return "vision";
  return "unsupported";
}

export type ExtractOutcomeContext = {
  uploadId: string;
  profileId: string;
  fileName: string;
  gradeLabel: string;
  semester: number;
  now: string;
};

export type ExtractResponse = {
  ok: true;
  uploadId: string;
  status: "ok" | "failed";
  extracted?: Extracted;
  error?: string;
  activityId?: string;
};

/**
 * 파싱 결과를 업로드 행 갱신값, 활동 행, 응답으로 조립한다. activityId 는 insert 뒤 호출자가 붙인다.
 * 상태 전이: pending(업로드 등록) 다음 processing(추출 선점) 다음 ok 또는 failed.
 * uploadUpdate 는 processing 행에만 적용한다(호출자가 상태 조건을 붙인다).
 */
export function buildExtractOutcome(
  parse: ExtractionParse,
  ctx: ExtractOutcomeContext,
) {
  if (!parse.ok) {
    return {
      uploadUpdate: {
        extraction_status: "failed" as const,
        extraction_error: parse.reason,
        updated_at: ctx.now,
      },
      activityRow: null,
      response: {
        ok: true,
        uploadId: ctx.uploadId,
        status: "failed",
        error: parse.reason,
      } satisfies ExtractResponse,
    };
  }
  return {
    uploadUpdate: {
      extraction_status: "ok" as const,
      extracted: parse.extracted,
      updated_at: ctx.now,
    },
    activityRow: toActivityRecordFromExtraction({
      profileId: ctx.profileId,
      uploadId: ctx.uploadId,
      fileName: ctx.fileName,
      gradeLabel: ctx.gradeLabel,
      semester: ctx.semester,
      extracted: parse.extracted,
    }),
    response: {
      ok: true,
      uploadId: ctx.uploadId,
      status: "ok",
      extracted: parse.extracted,
    } satisfies ExtractResponse,
  };
}

/** 활동 선택 화면용 응답 행. planned 는 분석 재료가 아니라 뺀다(No.121). */
export function toActivityView(
  rows: readonly (ActivityRow & { topic: string | null })[],
) {
  return filterMaterialActivities(rows).map((r) => ({
    id: r.id,
    source: r.source_program,
    status: r.status,
    gradeLabel: r.grade_label,
    semester: r.semester,
    subjectGroup: r.subject_group,
    subject: r.subject,
    topic: r.topic,
  }));
}
