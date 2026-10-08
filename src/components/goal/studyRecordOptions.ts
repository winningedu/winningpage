// 목표관리 앱 서브페이지 2종(열공 타이머 #25 · 오늘의 공부 기록 #26) 전용 옵션 상수 정본.
// #24(TargetUniversity.tsx)는 실데이터로 전환됐다(mock 삭제 UoW, 2026-08-20) — 이 파일은
// #25·#26에 필요한 데이터만 남아 있다. 과거 src/data/goalStudyMock.ts 에서 이관·rename
// (2026-08-20, FF 응집도 — 사용처 옆 배치).

// 과목 색 매핑은 src/components/goal/subjectTokens.js로 정본화했다(코드 검수 §1) —
// #25/#26을 포함한 앱 전체가 그 헬퍼를 공유한다. 여기서는 더 이상 로컬 매핑을 두지 않는다.

// 열공 타이머(#25) 카드 기본 4장 + 오늘의 공부 기록(#26) 과목별 순공 시간 섹션이 공유하는
// 기본 노출 순서(id만 — 시간·목표·진행 상태는 실 데이터, api/goal/timer.js). 카드 배치 순서
// (수학→국어→영어→탐구)는 part-09 §60 그리드 좌표(수학 x=384/국어 x=824/영어
// x=384,y=561/탐구 x=824,y=561) 순서를 그대로 따른다.
//
// QA B9(2026-08-27)로 "4과목 고정"이 아니게 됐다 — 학생이 "+ 과목 추가"로 카탈로그
// (TIMER_SUBJECT_CATALOG) 중에서 더 노출할 수 있다. 이 상수는 이제 "행이 없는 학생에게
// 보여줄 기본값"만 의미하고, 실제 노출 목록은 GET /api/goal/timer의 visibleSubjects가
// 정본이다(api/_lib/goal/repo.ts DEFAULT_TIMER_SUBJECTS와 글자 단위로 같다).
export const DEFAULT_TIMER_SUBJECTS = ["math", "korean", "english", "science"];

// "+ 과목 추가" 모달의 선택 카탈로그 8종(전체 표시 순서), api/_lib/goal/repo.ts
// TIMER_SUBJECTS와 글자 단위로 같다. 'etc'(기타)도 카탈로그에 포함하되 다른 7종을 전부
// 추가한 뒤에야 고를 여지가 남는다(자유 입력 없음, 설계 확정 옵션 A).
export const TIMER_SUBJECT_CATALOG = [
  "korean",
  "math",
  "english",
  "science",
  "social",
  "history",
  "second_lang",
  "etc",
];

// 섹션2 "오늘의 컨디션" — 단일 선택. part-09 §180 카피 전문.
export const CONDITION_OPTIONS = [
  { value: "great", emoji: "😆", label: "아주 좋음" },
  { value: "normal", emoji: "🙂", label: "보통" },
  { value: "tired", emoji: "😣", label: "피곤함" },
  { value: "exhausted", emoji: "😫", label: "힘듦" },
];

// 섹션3 "방해 요인" — 다중 선택. `없었음`은 다른 항목과 상호배타(part-09 §247 추정).
// part-09 §230 카피 전문.
export const DISTURBANCE_OPTIONS = [
  { value: "academySchedule", label: "수업 · 학원 일정" },
  { value: "smartphone", label: "스마트폰" },
  { value: "fatigue", label: "피로 · 수면 부족" },
  { value: "distraction", label: "집중 안 됨" },
  { value: "none", label: "없었음" },
];

// 섹션4 "오늘 완료한 핵심 학습 항목" — 다중 선택. part-09 §232 카피 전문.
export const STUDY_ITEM_OPTIONS = [
  { value: "concept", label: "개념 학습" },
  { value: "academyHomework", label: "학원 숙제" },
  { value: "wrongAnswerReview", label: "오답 정리" },
  { value: "schoolSubject", label: "내신 과목" },
  { value: "mockExam", label: "기출/모의고사" },
  { value: "etc", label: "기타" },
];
