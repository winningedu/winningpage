// 과목 색 정본 매핑 헬퍼 — 코드 검수 지적사항 §1/§2.
// tailwind.config.js `goal.subject.*`(배경/칩 전용 파스텔) + `goal.subjectStrong.*`(도트·진행바
// 채움 전용 진한 톤) 두 계층을 이 파일 한 곳에서만 관리한다. 기존에 4곳(studyRecordOptions.js
// SUBJECT_DOT_CLASS / TomorrowPlanCard.jsx SUBJECT_TONE / EffortSubjectCard.jsx SUBJECT_COLOR /
// AchievementChart.jsx 로컬 hex)으로 흩어져 서로 다른 색으로 어긋나 있던 매핑을 통합한다.
//
// 과목 id(korean/math/english/science/social/history/second_lang/etc)와 한글명
// (국어/수학/영어/탐구/사회/한국사/제2외국어) 두 키 형태를 모두 받는다(QA B9로 5종→8종 확장).

const SUBJECT_ID_BY_NAME: Record<string, string> = {
  국어: "korean",
  수학: "math",
  영어: "english",
  탐구: "science",
  사회: "social",
  한국사: "history",
  제2외국어: "second_lang",
};

const KNOWN_SUBJECT_IDS = [
  "korean",
  "math",
  "english",
  "science",
  "social",
  "history",
  "second_lang",
  "etc",
];

// 키(id 또는 한글명)를 과목 id로 정규화한다. 미지정/미매칭은 'etc'로 폴백.
export function resolveSubjectId(key?: string | null) {
  if (!key) return "etc";
  if (KNOWN_SUBJECT_IDS.includes(key)) return key;
  return SUBJECT_ID_BY_NAME[key] ?? "etc";
}

// id 별 한글 라벨. api/_lib/goal/repo.ts SUBJECT_CODE_TO_LABEL과 글자 단위로 같다
// (서버 파일은 클라이언트 번들에 끌어올 수 없어 — service_role 키를 물고 있는
// supabaseAdmin.js를 재수출하게 된다 — 여기 별도로 둔다).
const SUBJECT_LABELS = {
  korean: "국어",
  math: "수학",
  english: "영어",
  science: "탐구",
  social: "사회",
  history: "한국사",
  second_lang: "제2외국어",
  etc: "기타",
};

export function getSubjectLabel(key?: string | null) {
  return SUBJECT_LABELS[resolveSubjectId(key)] ?? SUBJECT_LABELS.etc;
}

// goal_workbooks(문제집)만 쓰는 5종 — goal_plan_tasks/goal_subject_targets/
// goal_timer_sessions 세 테이블은 QA B9(2026-08-31, supabase/migrations/
// 20260831020405_goal_timer_subjects.sql)로 8종까지 넓어졌지만 goal_workbooks의
// CHECK 제약(supabase/migrations/20260821000000_baseline.sql
// goal_workbooks_subject_check)은 그때 같이 넓히지 않아 여전히 5종이다(마이그레이션
// 주석이 "세 테이블"만 명시). api/goal/workbooks.ts SUBJECT_IDS와 parity 테스트로
// 묶여 있다 — "나의 노력" 화면(과목 카드 목록, 문제집 등록/수정 모달)은 8종 카탈로그가
// 아니라 반드시 이 배열만 써야 한다(그 외 과목으로 등록 시도 시 서버 400).
export const WORKBOOK_SUBJECT_IDS = [
  "korean",
  "math",
  "english",
  "science",
  "etc",
];

// 배경(칩) 전용 파스텔 톤 클래스 — src/index.css `--color-goal-subject-*`.
//
// Tailwind v4는 소스에 문자 그대로 적힌 클래스만 생성한다 — 템플릿 문자열
// (`bg-goal-subject-${id}`)로 조립하면 CSS가 아예 만들어지지 않아 배경이 투명이 된다
// (2026-09-02 나의 노력 책장 E2E에서 책등이 안 보이던 원인). 그래서 과목별 리터럴
// 맵으로 고정하고, 함수는 그 맵을 조회만 한다.
const SUBJECT_BG_CLASSES: Record<string, string> = {
  korean: "bg-goal-subject-korean",
  math: "bg-goal-subject-math",
  english: "bg-goal-subject-english",
  science: "bg-goal-subject-science",
  social: "bg-goal-subject-social",
  history: "bg-goal-subject-history",
  second_lang: "bg-goal-subject-second_lang",
  etc: "bg-goal-subject-etc",
};

const SUBJECT_STRONG_CLASSES: Record<string, string> = {
  korean: "bg-goal-subjectStrong-korean",
  math: "bg-goal-subjectStrong-math",
  english: "bg-goal-subjectStrong-english",
  science: "bg-goal-subjectStrong-science",
  social: "bg-goal-subjectStrong-social",
  history: "bg-goal-subjectStrong-history",
  second_lang: "bg-goal-subjectStrong-second_lang",
  etc: "bg-goal-subjectStrong-etc",
};

export function getSubjectBgClass(key?: string | null) {
  return SUBJECT_BG_CLASSES[resolveSubjectId(key)] ?? "bg-goal-subject-etc";
}

// 도트·진행바 채움 전용 진한 톤 클래스 — src/index.css `--color-goal-subjectStrong-*`.
export function getSubjectStrongClass(key?: string | null) {
  return (
    SUBJECT_STRONG_CLASSES[resolveSubjectId(key)] ?? "bg-goal-subjectStrong-etc"
  );
}

// "나의 노력" 카드 전용(Figma 4026:6046) — 진행바 채움/완독 버튼/책 스택 책등 색.
// WORKBOOK_SUBJECT_IDS 5종만 대상이다(social/history/second_lang은 워크북 자체가 없어
// 토큰도 안 만든다) — 그 3종이 들어오면 etc로 접는다. 위 SUBJECT_BG_CLASSES 등과 마찬가지
// 이유(Tailwind v4 리터럴 스캔)로 템플릿 문자열이 아니라 맵 조회로 고정한다.
// 사용처: EffortWorkbookRow(진행바 채움, 완독 버튼 배경) + BookStack(책 바 배경).
const BOOK_LIGHT_BG_CLASSES: Record<string, string> = {
  korean: "bg-goal-book-korean-light",
  math: "bg-goal-book-math-light",
  english: "bg-goal-book-english-light",
  science: "bg-goal-book-science-light",
  etc: "bg-goal-book-etc-light",
};

// 사용처: BookStack 책등(좌측 8px 세로 바)만. 진행바/완독 버튼은 쓰지 않는다.
const BOOK_DARK_BG_CLASSES: Record<string, string> = {
  korean: "bg-goal-book-korean-dark",
  math: "bg-goal-book-math-dark",
  english: "bg-goal-book-english-dark",
  science: "bg-goal-book-science-dark",
  etc: "bg-goal-book-etc-dark",
};

// 사용처: EffortWorkbookRow 완독 버튼 텍스트 + BookStack 책 제목 텍스트.
const BOOK_DARK_TEXT_CLASSES: Record<string, string> = {
  korean: "text-goal-book-korean-dark",
  math: "text-goal-book-math-dark",
  english: "text-goal-book-english-dark",
  science: "text-goal-book-science-dark",
  etc: "text-goal-book-etc-dark",
};

/** 진행바 트랙 채움/완독 버튼 배경 — 과목 라이트 톤. */
export function getBookLightBgClass(key?: string | null) {
  const id = resolveSubjectId(key);
  return BOOK_LIGHT_BG_CLASSES[id] ?? BOOK_LIGHT_BG_CLASSES.etc;
}

/** 책 스택 책등 배경 — 과목 다크 톤. */
export function getBookDarkBgClass(key?: string | null) {
  const id = resolveSubjectId(key);
  return BOOK_DARK_BG_CLASSES[id] ?? BOOK_DARK_BG_CLASSES.etc;
}

/** 완독 버튼/책 스택 제목 텍스트 — 과목 다크 톤. */
export function getBookDarkTextClass(key?: string | null) {
  const id = resolveSubjectId(key);
  return BOOK_DARK_TEXT_CLASSES[id] ?? BOOK_DARK_TEXT_CLASSES.etc;
}
