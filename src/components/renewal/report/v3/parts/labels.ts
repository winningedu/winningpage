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

/** "01" style page number of the PDF toc and page eyebrows. */
export const twoDigitPage = (page: number) => String(page).padStart(2, "0");

export const REPORT_LABELS = {
  reportName: "학습진단 리포트",
  /** PDF cover */
  coverHeadline: "이번 진단의 한 줄",
  coverToc: "목차",
  coverStudent: "학생명",
  coverGradeSchool: "학년 \u00b7 학교유형",
  coverDate: "진단일",
  /** PDF p1 cards */
  profile: "학생 프로필",
  profileGradeSchool: "학년 / 학교",
  profileTarget: "목표",
  profileGpa: "내신 평균",
  profileTrend: "성적 흐름",
  profilePeriod: "진단 기간",
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
  /** 22 r35 wording for an empty rung */
  ladderEmpty: "빈 칸",
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
