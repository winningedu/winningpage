// 서버 STEP_LABELS(api/_lib/growth/report/types.ts)와 같은 문구. 화면은 서버가 준 label 이 아니라
// 이 상수를 단계 번호로 읽는다(진행 목록이 항상 8줄로 고정되고, 응답이 비어도 줄이 사라지지 않는다).
export const STEP_COUNT = 8;

export const STEP_LABELS: Record<number, string> = {
  1: "활동 읽기",
  2: "학년, 과목, 영역별 분류",
  3: "반복 주제와 흐름 찾기",
  4: "학생 조사 응답 대조",
  5: "방향 일관성 계산",
  6: "위닝 A부터 E 5축 진단",
  7: "학년별 방향 설계",
  8: "리포트 확정",
};
