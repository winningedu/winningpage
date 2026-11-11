// "나의 노력" 문제집 진도 계산 — 순수 함수만 모아 EffortWorkbookRow/BookStack이 공유한다
// (api/_routes/goal/workbooks.ts 응답 shape과 무관하게 클라이언트 어디서든 같은 규칙으로 계산하도록).

/**
 * 달성률(%) — totalPages가 0/null/undefined면(방어적 상황, DB CHECK상 실제로는 항상
 * >0) 0으로 나누기를 피해 0%로 접는다. currentPage가 totalPages를 넘으면 100%로
 * 클램프한다(진행바가 100%를 넘어 그려지지 않게).
 *
 * 반올림이 아니라 **내림**이다 — 239/240(99.58%)을 반올림하면 100%가 돼 "완독!"
 * 버튼이 한 쪽 남은 책에 뜨는 사고가 났다(2026-09-02 사용자 발견). 100%는 오직
 * currentPage >= totalPages일 때만 나온다(서버 computeWorkbookStatus와 같은 기준).
 */
export function computeAchievementRate(
  currentPage: number | null | undefined,
  totalPages: number | null | undefined,
): number {
  const total = totalPages ?? 0;
  if (total <= 0) return 0;
  const current = Math.max(0, currentPage ?? 0);
  return Math.min(100, Math.floor((current / total) * 100));
}

type ShelvedBook = { shelvedAt: string | null };

/**
 * BookStack 정렬 — 최신 완독이 배열 맨 앞(스택 렌더 시 맨 위)에 오도록 shelvedAt
 * 내림차순으로 정렬한다. 원본 배열은 변형하지 않는다(얕은 복사 후 정렬).
 * shelvedAt이 null인 항목(방어적 상황 — BookStack에는 항상 shelvedAt이 있는 행만
 * 전달돼야 한다)은 가장 오래된 것으로 취급해 맨 뒤로 보낸다.
 */
export function sortShelvedBooksNewestFirst<T extends ShelvedBook>(
  books: T[],
): T[] {
  return [...books].sort((a, b) => {
    const at = a.shelvedAt ? Date.parse(a.shelvedAt) : 0;
    const bt = b.shelvedAt ? Date.parse(b.shelvedAt) : 0;
    return bt - at;
  });
}
