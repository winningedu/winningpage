// v4.2 샘플 PDF 를 그대로 옮긴 테스트 재료: 기록 8건(D2 진행 중), 수기 5건, 본문 9문장.

import type { BuildInput, ReportMemo, ReportRecord } from "./inputs.js";

type Ev = {
  sourceType: "P" | "D" | "A" | "H" | "S";
  refId: string | null;
  item: string;
  weight: "main" | "sub";
};

const rec = (over: Partial<ReportRecord> & { id: string }): ReportRecord => ({
  sourceProgram: "performance",
  entryKind: null,
  subject: "수학",
  courseName: "공통수학1",
  topic: null,
  concept: null,
  method: null,
  result: null,
  limitation: null,
  numbers: [],
  sources: [],
  summary: null,
  reflection: null,
  recordStatus: "completed",
  submittedAt: "2026-06-18T03:00:00.000Z",
  parentRecordId: null,
  selectedRole: null,
  ...over,
});

export const SAMPLE_RECORDS: ReportRecord[] = [
  rec({
    id: "rec-p1",
    topic: "이차함수의 최대, 최소 실생활 적용 보고서",
    summary:
      "매점 간식 가격과 이익 문제를 이차함수로 세우고 꼭짓점으로 최적 가격을 구함.",
    submittedAt: "2026-06-18T03:00:00.000Z",
    selectedRole: "core",
  }),
  rec({
    id: "rec-p2",
    topic: "설문 데이터로 일차 수요식 세우기",
    summary:
      "1학년 120명 설문 결과를 좌표평면에 나타내고, 가격과 구매자 수 사이의 일차 관계식을 도출함.",
    numbers: ["120명"],
    submittedAt: "2026-07-09T03:00:00.000Z",
    selectedRole: "support",
  }),
  rec({
    id: "rec-d1",
    sourceProgram: "deep",
    topic: "매출 최대 가격과 이익 최대 가격은 왜 다른가",
    summary:
      "원가를 반영한 이익 함수를 완전제곱식으로 변형해 비교. 1,300원으로 올리면 하루 이익이 약 24% 증가한다는 결론을 냄.",
    numbers: ["24%", "1,300원"],
    submittedAt: "2026-09-24T03:00:00.000Z",
    selectedRole: "support",
  }),
  rec({
    id: "rec-d2",
    sourceProgram: "deep",
    topic: "곡선형 수요 모델로의 확장 설계",
    recordStatus: "in_progress",
    submittedAt: "2026-10-20T03:00:00.000Z",
  }),
  rec({
    id: "rec-p3",
    subject: "정보",
    courseName: "정보",
    topic: "스프레드시트로 데이터 시각화하기",
    summary: "엑셀 차트와 수식 기능을 익힌 과제.",
    submittedAt: "2026-05-30T03:00:00.000Z",
    selectedRole: "support",
  }),
  rec({
    id: "rec-p4",
    subject: "통합사회",
    courseName: "통합사회",
    topic: "시장 가격 결정과 수요 법칙 탐구",
    summary: "가격이 오르면 수요량이 줄어드는 원리를 정리.",
    submittedAt: "2026-06-25T03:00:00.000Z",
    selectedRole: "support",
  }),
  rec({
    id: "rec-d3",
    sourceProgram: "deep",
    subject: "통합사회",
    courseName: "통합사회",
    topic: "설문조사 표본의 대표성과 한계",
    summary: "응답 의향과 실제 행동의 차이, 표본 편향을 다룸.",
    submittedAt: "2026-10-15T03:00:00.000Z",
    selectedRole: "support",
  }),
  rec({
    id: "rec-p5",
    subject: "국어",
    courseName: "국어",
    topic: "논설문 쓰기 학교 매점 운영 개선 제안",
    submittedAt: "2026-09-11T03:00:00.000Z",
  }),
];

export const SAMPLE_MEMOS: ReportMemo[] = [
  {
    id: "log-1",
    writtenAt: "2026-05-14",
    text: '매점 도우미 하는데 친구가 "가격 올리면 더 버는 거야?" 물어봄. 바로 대답 못 했음.',
  },
  {
    id: "log-2",
    writtenAt: "2026-06-02",
    text: "설문지 문항 10개 만들고 담임쌤 허락 받아서 1학년 4개 반에 돌림. 회수 120장.",
  },
  {
    id: "log-3",
    writtenAt: "2026-06-20",
    text: "손으로 구한 꼭짓점이랑 엑셀 그래프 최고점이 50원 차이 남. 계수 반올림해서 그런 거였음. 다시 계산함.",
  },
  {
    id: "log-4",
    writtenAt: "2026-09-05",
    text: "2학년 선배들도 설문하고 싶음. 매점 이모님께 실제 판매 장부 보여주실 수 있는지 여쭤봄.",
  },
  {
    id: "log-5",
    writtenAt: "2026-10-02",
    text: "수학 동아리 발표 순서 정함. 나는 3번째.",
  },
];

const e = (
  sourceType: Ev["sourceType"],
  refId: string,
  item: string,
  weight: Ev["weight"] = "main",
): Ev => ({ sourceType, refId, item, weight });

const S = (text: string, evidence: Ev[]) => ({ text, evidence });

/** 문장 1번부터 9번. 근거 배열의 순서가 화면 칩 순서다. */
export const SAMPLE_BODY = {
  paragraphs: [
    {
      sentences: [
        S(
          "매점 도우미 활동 중 친구의 질문을 계기로 간식 가격과 이익 사이의 관계를 탐구하는 과제를 시작함.",
          [e("H", "log-1", "motive"), e("P", "rec-p1", "motive", "sub")],
        ),
        S(
          "수업에서 배운 이차함수의 최대, 최소 개념을 활용하여 가격 변화에 따른 이익의 균형점을 찾고자 함.",
          [e("P", "rec-p1", "concept")],
        ),
        S(
          "1학년 120명을 대상으로 간식 가격에 따른 구매 의향을 설문하고, 그 자료로 가격과 구매자 수의 관계식을 세움.",
          [
            e("P", "rec-p2", "method"),
            e("H", "log-2", "method", "sub"),
            e("P", "rec-p4", "concept", "sub"),
          ],
        ),
        S(
          "매출 함수와 원가를 고려한 이익 함수를 만들어 각각 최대가 되는 가격을 비교함.",
          [e("D", "rec-d1", "action")],
        ),
      ],
    },
    {
      sentences: [
        S(
          "설문 결과를 좌표평면에 나타내 수요식을 구하고, 매출과 이익 함수를 완전제곱식으로 변형하여 꼭짓점을 찾음.",
          [e("P", "rec-p2", "method"), e("P", "rec-p1", "method", "sub")],
        ),
        S(
          "엑셀 그래프로 계산 결과를 검산하며 매출 최대 가격과 이익 최대 가격이 다름을 확인함.",
          [
            e("P", "rec-p3", "method"),
            e("H", "log-3", "action", "sub"),
            e("D", "rec-d1", "result", "sub"),
          ],
        ),
        S(
          "현재 가격 1,000원에서 1,300원으로 올리면 하루 예상 이익이 약 24% 늘어난다는 결론을 얻음.",
          [e("D", "rec-d1", "result")],
        ),
      ],
    },
    {
      sentences: [
        S(
          "이 탐구를 통해 이차함수 개념이 실생활 문제 해결에 유용함을 깨달음.",
          [e("P", "rec-p1", "learning")],
        ),
        S(
          "설문 응답이 실제 구매와 다를 수 있다는 한계를 인식하고, 예측을 실제 판매량과 대조하고자 매점에 판매 장부 열람을 요청함.",
          [e("D", "rec-d3", "limitation"), e("H", "log-4", "action", "sub")],
        ),
      ],
    },
  ],
};

export function sampleInput(over: Partial<BuildInput> = {}): BuildInput {
  return {
    session: {
      academicYear: 2026,
      area: "subject",
      subject: "수학",
      activityName: null,
      gradeLabel: "고1",
      targetChars: 500,
      targetCharsMode: "with_space",
    },
    bodySections: SAMPLE_BODY,
    charCount: { withSpace: 493, withoutSpace: 380 },
    savedAt: "2026-11-10T03:00:00.000Z",
    serviceTier: "individual",
    profileGrade: "고1",
    records: SAMPLE_RECORDS,
    memos: SAMPLE_MEMOS,
    links: [],
    completedSubjects: ["수학"],
    steps: {
      diagnosis: true,
      goal: true,
      growth: true,
      performance: true,
      inquiry: true,
      selfeval: true,
    },
    stages: {
      diagnosis: { state: "none" },
      goal: { state: "none" },
      growth: { state: "none" },
    },
    topImprovement: null,
    tagMap: null,
    ...over,
  };
}
