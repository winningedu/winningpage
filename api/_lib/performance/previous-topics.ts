// STEP1 "같은 과목에서 이전에 한 주제" 개수와 길이 상한, 줄 단위 분해/결합 규칙.
// 프론트(`BasicInfoForm`)와 서버(`api/_routes/performance/session.ts`)가 함께
// 읽는 단일 정본이다(`guide-freetext.ts`와 같은 패턴).
//
// 근거: QA 요청 "이전 주제를 여러 개 넣을 수 있게, 글자 수 한도는 두 배로".
// DB 컬럼(`previous_topic`)은 그대로 문자열 하나이며, 주제 여러 개는 줄바꿈("\n")으로
// 이어 한 값으로 저장한다.
//
// 길이는 `value.length`(UTF-16 코드 유닛)로 잰다. 프론트가 실제로 입력을 막는
// 수단이 네이티브 `<input maxLength>`이고, 그 속성이 세는 단위가 이것이다
// (`guide-freetext.ts` 상단 주석과 같은 이유).
export const PREVIOUS_TOPIC_MAX_COUNT = 5;
export const PREVIOUS_TOPIC_MAX_LENGTH = 80;

/** 줄 단위로 나누고 각 항목을 다듬은 뒤 빈 항목을 버린다. */
export function splitPreviousTopics(
  value: string | null | undefined,
): string[] {
  return (value ?? "")
    .split("\n")
    .map((topic) => topic.trim())
    .filter(Boolean);
}

/** 항목을 다듬고 빈 항목을 버린 뒤 줄바꿈으로 잇는다(저장과 전송 형식). */
export function joinPreviousTopics(list: string[]): string {
  return list
    .map((topic) => topic.trim())
    .filter(Boolean)
    .join("\n");
}

/** 서버 게이트 판정. 개수와 항목별 길이를 한 곳에서 비교한다. 빈 값은 유효하다. */
export function isPreviousTopicValid(value: string): boolean {
  const topics = splitPreviousTopics(value);
  return (
    topics.length <= PREVIOUS_TOPIC_MAX_COUNT &&
    topics.every((topic) => topic.length <= PREVIOUS_TOPIC_MAX_LENGTH)
  );
}
