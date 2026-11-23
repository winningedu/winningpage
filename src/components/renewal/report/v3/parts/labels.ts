// Fixed layout labels of the v3 report. 22_리포트요소 lists content only, so
// these come from the improved report PDF layout (page chrome, card titles);
// no sheet cell holds them. Content strings always come from the payload.

import type { MockSubjectCode, SubjectVerdict } from "@/lib/diagnosis-v3/types";

/**
 * Footer total. judge-report R9: numbering stays fixed at 16 even when M3
 * drops page 7 (명세 123행: cover + 16 pages).
 */
export const TOTAL_PAGES = 16;

/**
 * 22_리포트요소 D44 subject names (국어, 수학, 영어, 사회, 과학); 한국사 is
 * the q6m extra of judge-report R3 and has no sheet cell.
 */
export const SUBJECT_LABELS: Readonly<Record<MockSubjectCode, string>> = {
  KOR: "국어",
  MATH: "수학",
  ENG: "영어",
  SOC: "사회",
  SCI: "과학",
  HIST: "한국사",
};

/** 22 D44 verdicts, the suffixes of the SUBJ_J_ copy ids. */
export const VERDICT_LABELS: Readonly<Record<SubjectVerdict, string>> = {
  PRIORITY: "우선 보완",
  CHECK: "점검",
  STRENGTH: "강점",
  KEEP: "유지",
};

/**
 * Page titles of the improved report PDF (page 1 toc and each page header).
 * No sheet cell holds them (22_리포트요소 only names sections), so the UI owns
 * them as layout labels. Keys are the fixed page numbers (judge-report R9).
 */
export const PAGE_TITLES: Readonly<Record<number, string>> = {
  1: "진단 요약",
  2: "목표 진단",
  3: "성적 진단",
  4: "7단계 학습관리 사이클",
  5: "방해 요인과 마음 상태",
  6: "학교생활\u00b7입시 준비도",
  7: "입시 준비도 \u00b7 목표 대학",
  8: "재미로 보는 MBTI 학습 궁합",
  9: "나의 기질 프로파일",
  10: "기질 기반 입시 설계",
  11: "진단 후 4주 실행 플랜",
  12: "1주차 목표과제 플래너",
  13: "2주차 목표과제 플래너",
  14: "3주차 목표과제 플래너",
  15: "4주차 목표과제 플래너",
  16: "추천 서비스와 다음 단계",
};

/** Title of a fixed page; an unknown page is an error, not a blank. */
export const pageTitle = (page: number) => {
  const title = PAGE_TITLES[page];
  if (title === undefined)
    throw new Error(`v3 report has no title for page ${page}`);
  return title;
};

/** "01" style page number of the PDF toc and page eyebrows. */
export const twoDigitPage = (page: number) => String(page).padStart(2, "0");

/** PDF p13-p16 planner layout words (spec row 122, 22 r111-r112); no sheet cell holds them. */
export const PLANNER_LABELS = {
  /** task table columns */
  columns: ["영역", "과제", "마감", "완료 기준", "완료일"],
  planMinutes: "계획 ____분",
  actualMinutes: "실제 ____분",
  weekendCheck: "주말 점검",
  weekendItems: ["실행률", "밀린 요일\u00b7과목", "다음 주 조정"],
} as const;

/** PDF p12 (report page 11) layout words; 22 r103-r107 hold no display cell for them. */
export const PLAN_LABELS = {
  eventsWithin: "4주 안의 일정 \u2192 해당 주차 과제로 반영",
  eventsAfter: "4주 이후 일정 \u2192 참고 표시만",
  /** table corner and the "1주" row suffix */
  week: "주차",
  weekSuffix: "주",
  reducedWeek: "일정 주 \u00b7 축소",
  minutes: "분",
  logCaption: "매일 밤 기록",
  arrow: "\u2192",
  percent: "%",
  rateCaption: "주차별 목표 실행률",
  /** checkpoint n of 1..4 reads "n주 점검" */
  checkSuffix: "주 점검",
  /** checkpoints past the re-diagnosis day are Day 29..42 events (22 r107) */
  afterLabel: "4주 이후 일정",
} as const;

export const REPORT_LABELS = {
  reportName: "학습진단 리포트",
  /** PDF cover */
  coverHeadline: "이번 진단의 한 줄",
  coverToc: "목차",
  coverStudent: "학생명",
  coverGradeSchool: "학년 \u00b7 학교유형",
  coverDate: "진단일",
  /** PDF p1 caption under the 7 scores; HEX_CAPTION (22 r50) is the 4p diagram caption */
  coverStagesCaption:
    "7단계 학습관리 점수 \u00b7 붉은 표시는 순환이 끊기는 지점",
  /** PDF p1 cards */
  profile: "학생 프로필",
  profileGradeSchool: "학년 / 학교",
  profileTarget: "목표",
  profileGpa: "내신 평균",
  profileTrend: "성적 흐름",
  profilePeriod: "진단 기간",
  /** PDF p2 period row word before the re-diagnosis date; 22 r16 holds no copy id for it */
  redx: "재진단",
  /** PDF p2 period row length after the Day 28 date */
  periodWeeks: "(4주)",
  /** PDF p11 rule area heading words (22 r97 D basis) */
  ruleBasis: "조정 근거:",
  ruleNone: "조정 없음",
  profileTemperament: "대표 기질",
  profileReliability: "응답 신뢰도",
  cycleRadar: "7단계 학습관리",
  total: "종합",
  points: "점",
  targetLegend: "점선 = 목표",
  studentType: "학습 유형",
  traits: "이번 진단의 핵심 3가지",
  /** PDF p2 cards */
  goalSpecificity: "목표 구체성",
  goalReasons: "목표 선정 이유",
  intrinsic: "내재 동기",
  extrinsic: "외재 동기",
  count: "개",
  goalMatrix: "목표 명확도 \u00d7 동기 유형",
  matrixClear: "목표 명확",
  matrixExplore: "목표 탐색",
  matrixIn: "내재 동기 중심",
  matrixMix: "혼합",
  matrixEx: "외재 동기 중심",
  ladder: "목표 사다리",
  ladderFar: "먼 목표",
  ladderMid: "중간 목표",
  ladderNear: "가까운 목표",
  /**
   * Empty rung: no 22 or copy cell holds a display word (22 r35 E "빈 칸 0개"
   * is a rule count), so spec row 60 「비어 있음」 is used.
   */
  ladderEmpty: "비어 있음",
  ladderFilled: "채움",
  suggestion: "제안",
  /** PDF p3 cards */
  gpaAll: "내신 전체 평균",
  gpaRecent: "최근 정기고사 평균",
  gradeTrend: "성적 흐름",
  schoolGrades: "내신 과목별 등급",
  mockGrades: "최근 모의고사 등급",
  month: "월",
  subjectTable: "두 기준을 겹쳐 본 과목 진단",
  /** PDF p4 exam ops evidence line "8-15 별로 \u00b7 10번 시험장 실수 선택" */
  examRoomQuestion: "10번",
  examRoomPicked: "선택",
  subject: "과목",
  verdict: "판정",
  /** PDF p4 cards */
  myCycle: "나의 학습관리 사이클",
  breakPoints: "끊김 지점",
  /** PDF p5 cards */
  obstacles: "최근 공부를 가장 방해하는 것",
  selected: "선택함",
  mind: "마음 상태",
  interpretation: "해석",
  crossCheck: "교차 확인",
  crossOption: "고른 방해 요인",
  crossAnswers: "관련 응답",
  /** PDF p6 cards */
  hardest: "가장 어려운 부분",
  strengths: "강점 영역",
  weaknesses: "보완 영역",
  /** joins two short values on one line, as the PDF does */
  joiner: " \u00b7 ",
  studentOnly: "학생 전용",
  /** PDF p4 break mark */
  broken: "여기서 끊김",
  /** PDF p4 and p6 prescription block */
  rxTitle: "지금 \u2192 4주 목표",
  rxLever: "\u2460 지렛대",
  rxWeak: "\u2461 4주 목표",
  rxStrong: "\u2462 이미 잘하는 것",
  rxQuestion: "문항",
  rxTarget: "지금 \u2192 4주 목표",
  rxLink: "연결 과제",
} as const;
