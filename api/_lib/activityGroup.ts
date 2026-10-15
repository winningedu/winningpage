// activity_records.subject_group 공용 어휘. 심화탐구, 자기평가, 성장설계가 같은 값을 쓴다.
// 허용 값은 교과, 자율, 동아리, 진로 네 가지(업로드 추출의 null 은 허용).
// 교과면 subject 에 과목명, 창체면 subject 에 활동명(없으면 null)을 둔다.
// DB 제약(activity_records_subject_group_check)과 같은 목록이다.

export const SUBJECT_GROUP = "교과";

export const EXTRACURRICULAR_GROUPS = ["자율", "동아리", "진로"] as const;

export const ACTIVITY_GROUPS = [
  SUBJECT_GROUP,
  ...EXTRACURRICULAR_GROUPS,
] as const;

export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

/** 영역 접두어. 창체와 봉사는 자율활동 범주로 모은다. */
const AREA_PREFIXES: readonly [string, ActivityGroup][] = [
  ["자율", "자율"],
  ["동아리", "동아리"],
  ["진로", "진로"],
  ["창체", "자율"],
  ["봉사", "자율"],
];

/**
 * 직접 입력한 "과목 또는 영역" 문자열을 subject_group 과 subject 로 나눈다.
 * 영역 접두어로 시작하면 그 영역(subject 는 null), 그 밖에는 교과와 입력값(과목명)이다.
 * 빈 값은 null 이다.
 */
export function normalizeActivityGroup(
  input: string | null | undefined,
): { subjectGroup: ActivityGroup; subject: string | null } | null {
  const text = input?.trim() ?? "";
  if (text === "") return null;
  const area = AREA_PREFIXES.find(([prefix]) => text.startsWith(prefix));
  if (area) return { subjectGroup: area[1], subject: null };
  return { subjectGroup: SUBJECT_GROUP, subject: text };
}

/** 화면과 프롬프트에 보일 이름. 교과면 과목명(없으면 교과), 그 밖에는 영역 이름이다. */
export function activityGroupLabel(
  group: string | null,
  subject: string | null,
): string | null {
  if (group == null) return null;
  if (group === SUBJECT_GROUP) return subject?.trim() || group;
  return group;
}
