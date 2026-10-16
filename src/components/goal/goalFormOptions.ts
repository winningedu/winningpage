// 대시보드/서브페이지 진입 모달 3종(과제 추가 · 중요일정 등록 · 모의고사 성적 추가) +
// "오늘의 목표" 카드 퀵칩이 공유하는 선택지 상수.
//
// 원래 옛 목업 파일의 `goalModalOptions`였다(mock 삭제 UoW로 이관, 2026-08-20).
// scheduleTypes·scheduleRanges 두 키는 이관하지 않았다 — 소비처가 없다(중요일정 등록 모달
// AddScheduleFullModal은 src/lib/goal/scheduleCategory.ts의 SCHEDULE_CATEGORIES를 쓴다).
//
// 시안에는 셀렉트 옵션 "목록"이 없고 표시값 1건만 실측돼 있다(예: 예상 소요 시간
// "1시간 30분", 회차 "2026년 9월 모의고사"). 실측 표시값은 그대로 포함하되 목록 구성
// 자체는 통상적인 선택지로 새로 만든 것이라 미확정이다.

import {
  flowLabel,
  MOCK_FLOW,
} from "@/components/goal/onboarding/onboardingOptions";

// QA B9(열공 타이머 과목 확장, 5종→8종)로 사회/한국사/제2외국어를 추가했다 — 코드값은
// api/_lib/goal/repo.ts TIMER_SUBJECTS와 글자 단위로 같은 카탈로그 순서.
export const TASK_SUBJECTS = [
  "국어",
  "수학",
  "영어",
  "탐구",
  "사회",
  "한국사",
  "제2외국어",
  "기타",
];

export const TASK_DURATIONS = [
  "30분",
  "1시간",
  "1시간 30분",
  "2시간",
  "2시간 30분",
  "3시간",
];

export const TASK_SCHEDULES = ["오늘만", "이번 주만", "매주 반복"];

// QA 행291 재설계(팀장 지시 항목10) — 연도 기반 라벨("2026년 10월 모의고사", 최신 4건
// 고정)에서 MOCK_FLOW(고1~고3 전 시퀀스, 고3 5・7모 포함 14건)로 바꾼다. 성적관리는
// 과거 학년 기록도 입력할 수 있어야 하므로(온보딩과 달리 "현재 학년까지 절단"을 하지
// 않는다) 14건 전부를 드롭다운에 낸다. 최신 회차가 맨 앞에 오는 기존 순서 규칙을
// 유지하기 위해 역순으로 뒤집는다. AddMockExamGradeModal의 ROUND_OPTIONS[0]는 이
// 배열이 고정 14건이라 "항상 비지 않는다"(그 파일 주석과 정합).
export const MOCK_EXAM_ROUNDS = [...MOCK_FLOW].reverse().map(flowLabel);

// 대시보드 "오늘의 목표" 카드 퀵칩 증분(시간 단위) — + 30분 / + 1시간 / + 2시간.
export const QUICK_ADD_HOURS = [0.5, 1, 2];
