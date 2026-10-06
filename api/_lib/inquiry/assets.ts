// 세션 자산 규칙(명세 No.31, 36~43). DB 없이 입력과 후보 목록만 다루는 순수 함수다.
import { MAX_RECORD_CANDIDATES, ONELINE_MAX_CHARS } from "./constants.js";
import { validateInterview } from "./gaps.js";
import type {
  AssetInput,
  AssetKind,
  RecordCandidate,
  Reliability,
} from "./types.js";

/** 교과 활동 구분값. activity_records.subject_group 의 고정 문자열. */
const SUBJECT_GROUP = "교과";
const UNCLASSIFIED = "미분류";

const RELIABILITY: Record<AssetKind, Reliability> = {
  record: "A",
  interview: "B",
  oneline: "C",
};

/** 자산 경로에서 신뢰도를 정한다(No.38). 모델 응답 값은 쓰지 않는다. */
export function reliabilityOf(kind: AssetKind): Reliability {
  return RELIABILITY[kind];
}

export type AssetValidation =
  | { ok: true }
  | { ok: false; code: string; index?: number };

/** 첫 번째로 잘못된 자산을 알려 준다. 빈 배열은 통과(활동 0건 허용, No.4). */
export function validateAssetInputs(items: AssetInput[]): AssetValidation {
  for (const [index, item] of items.entries()) {
    if (item.kind === "record") {
      if (item.activityRecordId.trim() === "") {
        return { ok: false, code: "RECORD_ID_REQUIRED", index };
      }
    } else if (item.kind === "interview") {
      const result = validateInterview(item.answers, item.gaps);
      if (!result.ok) return { ok: false, code: result.code, index };
    } else {
      const length = item.text.trim().length;
      if (length === 0) return { ok: false, code: "ONELINE_REQUIRED", index };
      if (length > ONELINE_MAX_CHARS) {
        return { ok: false, code: "ONELINE_TOO_LONG", index };
      }
    }
  }
  return { ok: true };
}

const isBlank = (value: string | null | undefined): boolean =>
  value == null || value.trim() === "";

/**
 * 선택한 record 자산에 대한 경고 코드(중복 없음).
 * NO_SUBJECT_ASSET: 교과가 아닌 것만 있다(No.42). record 가 없으면 교과 여부를 알 수 없어 경고하지 않는다.
 * LINK_MATERIAL_LACKING: concept 와 limitation 이 둘 다 빈 record 가 있다(No.41).
 */
export function assetWarnings(
  items: AssetInput[],
  records: RecordCandidate[],
): string[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const selected: RecordCandidate[] = [];
  for (const item of items) {
    if (item.kind !== "record") continue;
    const found = byId.get(item.activityRecordId);
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

function recordTime(record: RecordCandidate): number {
  const time = Date.parse(record.confirmedAt ?? record.createdAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** 출발 활동 후보 정렬(No.36). planned 제외, 세션 과목 먼저, 최신순, 20건. */
export function sortRecordCandidates(
  records: RecordCandidate[],
  subject: string | null,
): RecordCandidate[] {
  const wanted = subject?.trim() || null;
  const sameSubject = (r: RecordCandidate): boolean =>
    wanted !== null && r.subject?.trim() === wanted;

  return records
    .filter((r) => r.status !== "planned")
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      const subjectGap =
        Number(sameSubject(b.record)) - Number(sameSubject(a.record));
      if (subjectGap !== 0) return subjectGap;
      const timeA = recordTime(a.record);
      const timeB = recordTime(b.record);
      if (timeA !== timeB) return timeB > timeA ? 1 : -1;
      return a.index - b.index;
    })
    .slice(0, MAX_RECORD_CANDIDATES)
    .map((entry) => entry.record);
}

/** 과목 버튼용 건수(No.37). subject 가 없으면 "미분류". 건수 내림차순 뒤 이름순. */
export function subjectCounts(
  records: RecordCandidate[],
): { subject: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = r.subject?.trim() || UNCLASSIFIED;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort(
      (a, b) => b.count - a.count || a.subject.localeCompare(b.subject, "ko"),
    );
}
