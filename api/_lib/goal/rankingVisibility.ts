// QA 행71, "오늘의 학습 순위" 카드는 목표관리 활성(goal_students.status='active') 학생이
// 이 수 이상일 때만 노출한다(어드민 설정이 아니라 코드 상수).
export const RANKING_MIN_STUDENTS = 200;

export function isRankingVisible(activeStudentCount: number): boolean {
  return activeStudentCount >= RANKING_MIN_STUDENTS;
}
