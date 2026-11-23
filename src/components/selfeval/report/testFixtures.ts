// 리포트 화면 테스트 재료. v4.2 샘플 PDF(수학 자기평가서)를 옮겼다: 기록 8건(D2 진행 중), 수기 5건, 본문 9문장.
// 학생 이름은 payload 에 없다(명세 No.90, 134).
import type {
  ReportCh02Row,
  ReportCh03Row,
  ReportCh04Row,
  ReportPayload,
  ReportSentence,
} from "@/lib/selfeval/reportTypes";

const s = (n: number, text: string, tags: string[]): ReportSentence => ({
  n,
  text,
  tags,
  needsConfirm: false,
});

const row = (
  over: Partial<ReportCh02Row> & Pick<ReportCh02Row, "tag" | "kind">,
): ReportCh02Row => ({
  recordId: `rec-${over.tag}`,
  title: null,
  submittedOn: null,
  inProgress: false,
  summary: null,
  sentenceNumbers: [],
  role: "main",
  roleLabel: "주요 근거",
  dots: 0,
  reasonCode: null,
  reasonLabel: null,
  reasonText: null,
  recommendation: null,
  ...over,
});

const memo = (
  over: Partial<ReportCh04Row> & Pick<ReportCh04Row, "tag" | "writtenOn">,
): ReportCh04Row => ({
  logId: `log-${over.tag}`,
  text: "",
  sentenceNumbers: [],
  reflected: true,
  explanation: null,
  reasonLabel: null,
  ...over,
});

const rel = (
  over: Partial<ReportCh03Row> & Pick<ReportCh03Row, "tag" | "kind">,
): ReportCh03Row => ({
  recordId: `rec-${over.tag}`,
  title: null,
  subject: null,
  submittedOn: null,
  role: "core",
  relation: "inherit",
  relationLabel: "계승",
  strengthLabel: "기록에 명시",
  sentenceNumbers: [],
  explanation: null,
  ...over,
});

const mathRows: ReportCh02Row[] = [
  row({
    tag: "P1",
    kind: "performance",
    title: "이차함수의 최대, 최소 실생활 적용 보고서",
    submittedOn: "2026.06.18",
    summary:
      "매점 간식 가격과 이익 문제를 이차함수로 세우고 꼭짓점으로 최적 가격을 구함.",
    sentenceNumbers: [1, 2, 5, 8],
    role: "core",
    roleLabel: "핵심 근거",
    dots: 4,
  }),
  row({
    tag: "P2",
    kind: "performance",
    title: "설문 데이터로 일차 수요식 세우기",
    submittedOn: "2026.07.09",
    summary:
      "1학년 120명 설문 결과를 좌표평면에 나타내고, 가격과 구매자 수 사이의 일차 관계식을 도출함.",
    sentenceNumbers: [3, 5],
    dots: 3,
  }),
  row({
    tag: "D1",
    kind: "deep",
    title: "매출 최대 가격과 이익 최대 가격은 왜 다른가",
    submittedOn: "2026.09.24",
    summary: "원가를 반영한 이익 함수를 완전제곱식으로 변형해 비교.",
    sentenceNumbers: [4, 6, 7],
    role: "core",
    roleLabel: "핵심 근거",
    dots: 4,
  }),
  row({
    tag: "D2",
    kind: "deep",
    title: "곡선형 수요 모델로의 확장 설계",
    inProgress: true,
    summary: "수요가 직선이 아닐 때를 가정하고 모델을 바꾸는 탐구 계획서.",
    role: "in_progress",
    roleLabel: "진행 중, 반영 안 함",
  }),
];

export const SAMPLE_PAYLOAD: ReportPayload = {
  version: 1,
  composeMissing: false,
  composePartial: false,
  cover: {
    gradeLabel: "고등학교 1학년",
    savedAt: "2026. 11. 10",
    serviceTier: "individual",
    subjectTitle: "수학 자기평가서",
    academicYear: 2026,
    steps: {
      diagnosis: true,
      goal: true,
      growth: true,
      performance: true,
      inquiry: true,
      selfeval: true,
    },
  },
  ch01: {
    paragraphs: [
      {
        sentences: [
          s(
            1,
            "매점 도우미 활동 중 친구의 질문을 계기로 간식 가격과 이익 사이의 관계를 탐구하는 과제를 시작함.",
            ["H1", "P1"],
          ),
          s(
            2,
            "수업에서 배운 이차함수의 최대, 최소 개념을 활용하여 가격 변화에 따른 이익의 균형점을 찾고자 함.",
            ["P1"],
          ),
          s(
            3,
            "1학년 120명을 대상으로 간식 가격에 따른 구매 의향을 설문하고, 그 자료로 가격과 구매자 수의 관계식을 세움.",
            ["P2", "H2", "P4"],
          ),
          s(
            4,
            "매출 함수와 원가를 고려한 이익 함수를 만들어 각각 최대가 되는 가격을 비교함.",
            ["D1"],
          ),
        ],
      },
      {
        sentences: [
          s(
            5,
            "설문 결과를 좌표평면에 나타내 수요식을 구하고, 매출과 이익 함수를 완전제곱식으로 변형하여 꼭짓점을 찾음.",
            ["P2", "P1"],
          ),
          s(
            6,
            "엑셀 그래프로 계산 결과를 검산하며 매출 최대 가격과 이익 최대 가격이 다름을 확인함.",
            ["P3", "H3", "D1"],
          ),
          s(
            7,
            "현재 가격 1,000원에서 1,300원으로 올리면 하루 예상 이익이 약 24% 늘어난다는 결론을 얻음.",
            ["D1"],
          ),
        ],
      },
      {
        sentences: [
          s(
            8,
            "이 탐구를 통해 이차함수 개념이 실생활 문제 해결에 유용함을 깨달음.",
            ["P1"],
          ),
          s(
            9,
            "설문 응답이 실제 구매와 다를 수 있다는 한계를 인식하고, 예측을 실제 판매량과 대조하고자 매점에 판매 장부 열람을 요청함.",
            ["D3", "H4"],
          ),
        ],
      },
    ],
    charCount: { withSpace: 493, withoutSpace: 400 },
    targetChars: 500,
    targetCharsMode: "with_space",
    diffPercent: -1.4,
    paragraphCount: 3,
    sentenceCount: 9,
  },
  ch02: {
    subjects: [
      {
        subject: "수학",
        label: "수학 (공통수학1)",
        writing: true,
        counts: { performance: 2, deep: 2, activity: 0 },
        inProgress: { performance: 0, deep: 1, activity: 0 },
        reflectedSentenceCount: 8,
        rows: mathRows,
      },
      {
        subject: "정보",
        label: "정보",
        writing: false,
        counts: { performance: 1, deep: 0, activity: 0 },
        inProgress: { performance: 0, deep: 0, activity: 0 },
        reflectedSentenceCount: 1,
        rows: [
          row({
            tag: "P3",
            kind: "performance",
            title: "스프레드시트로 데이터 시각화하기",
            submittedOn: "2026.05.30",
            summary:
              "엑셀 차트, 수식 기능을 익힌 과제. 이 기능을 수학 탐구의 계산 결과 검산 도구로 그대로 활용함.",
            sentenceNumbers: [6],
            role: "support",
            roleLabel: "보조 근거 (교과 연계)",
            dots: 1,
          }),
        ],
      },
      {
        subject: "통합사회",
        label: "통합사회",
        writing: false,
        counts: { performance: 1, deep: 1, activity: 0 },
        inProgress: { performance: 0, deep: 0, activity: 0 },
        reflectedSentenceCount: 2,
        rows: [
          row({
            tag: "P4",
            kind: "performance",
            title: "시장 가격 결정과 수요 법칙 탐구",
            submittedOn: "2026.06.25",
            summary: "가격이 오르면 수요량이 줄어드는 원리를 정리.",
            sentenceNumbers: [3],
            role: "indirect",
            roleLabel: "간접 근거 (교과 연계)",
            dots: 1,
          }),
          row({
            tag: "D3",
            kind: "deep",
            title: "설문조사 표본의 대표성과 한계",
            submittedOn: "2026.10.15",
            summary: "응답 의향과 실제 행동의 차이, 표본 편향을 다룸.",
            sentenceNumbers: [9],
            role: "reflection",
            roleLabel: "성찰 근거 (교과 연계)",
            dots: 1,
          }),
        ],
      },
      {
        subject: "국어",
        label: "국어",
        writing: false,
        counts: { performance: 1, deep: 0, activity: 0 },
        inProgress: { performance: 0, deep: 0, activity: 0 },
        reflectedSentenceCount: 0,
        rows: [
          row({
            tag: "P5",
            kind: "performance",
            title: "논설문 쓰기, 학교 매점 운영 개선 제안",
            submittedOn: "2026.09.11",
            summary:
              "같은 매점 소재지만 수학 문항과 직접 관련이 없어 이번 자기평가에서는 선택되지 않음.",
            role: "unreflected",
            roleLabel: "미반영",
            reasonCode: "unrelated",
            reasonLabel: "문항과 관련 없음",
            recommendation: "국어 자기평가 추천",
          }),
        ],
      },
    ],
  },
  ch03: {
    rows: [
      rel({
        tag: "P1",
        kind: "performance",
        title: "이차함수의 최대, 최소 실생활 적용 보고서",
        submittedOn: "2026.06.18",
        sentenceNumbers: [1, 2, 5, 8],
        explanation:
          "보고서의 문제 상황(매점 가격)과 핵심 개념(꼭짓점)을 자기평가 문단 1, 2의 출발점으로 그대로 사용했습니다.",
      }),
      rel({
        tag: "P2",
        kind: "performance",
        title: "설문 데이터로 일차 수요식 세우기",
        submittedOn: "2026.07.09",
        role: "main",
        strengthLabel: "학생 확인",
        sentenceNumbers: [3, 5],
        explanation: "P2에서 구한 수요식이 D1 이익 함수의 입력값이 됩니다.",
      }),
      rel({
        tag: "D1",
        kind: "deep",
        title: "매출 최대 가격과 이익 최대 가격은 왜 다른가",
        submittedOn: "2026.09.24",
        relation: "deepen",
        relationLabel: "심화",
        sentenceNumbers: [4, 6, 7],
        explanation:
          "수행평가에서는 매출만 보았던 것을 원가까지 넣은 이익 함수로 발전시킨 보고서입니다.",
      }),
      rel({
        tag: "D3",
        kind: "deep",
        title: "설문조사 표본의 대표성과 한계",
        subject: "통합사회",
        submittedOn: "2026.10.15",
        role: "reflection",
        relation: "complement",
        relationLabel: "보완",
        strengthLabel: "학생 확인",
        sentenceNumbers: [9],
        explanation:
          "수학 보고서들에는 없던 관점을 다른 교과에서 가져와 새로 더했습니다.",
      }),
    ],
  },
  ch04: {
    rows: [
      memo({
        tag: "H1",
        writtenOn: "2026.05.14",
        text: '매점 도우미 하는데 친구가 "가격 올리면 더 버는 거야?" 물어봄. 바로 대답 못 했음.',
        sentenceNumbers: [1],
        explanation: "탐구의 실제 계기가 된 기록입니다.",
      }),
      memo({
        tag: "H2",
        writtenOn: "2026.06.02",
        text: "설문지 문항 10개 만들고 담임쌤 허락 받아서 1학년 4개 반에 돌림. 회수 120장.",
        sentenceNumbers: [3],
        explanation: "120명이라는 표본 규모의 출처입니다.",
      }),
      memo({
        tag: "H3",
        writtenOn: "2026.06.20",
        text: "손으로 구한 꼭짓점이랑 엑셀 그래프 최고점이 50원 차이 남. 계수 반올림해서 그런 거였음. 다시 계산함.",
        sentenceNumbers: [6],
        explanation: "엑셀로 검산했다는 문장의 구체적인 과정입니다.",
      }),
      memo({
        tag: "H4",
        writtenOn: "2026.09.05",
        text: "2학년 선배들도 설문하고 싶음. 매점 이모님께 실제 판매 장부 보여주실 수 있는지 여쭤봄.",
        sentenceNumbers: [9],
        explanation: "판매 장부 열람 요청의 출처입니다.",
      }),
      memo({
        tag: "H5",
        writtenOn: "2026.10.02",
        text: "수학 동아리 발표 순서 정함. 나는 3번째.",
        reflected: false,
        explanation:
          "동아리 운영 기록으로, 이번 문항과 직접 관련이 없어 사용하지 않았습니다.",
        reasonLabel: "문항과 관련 없음",
      }),
    ],
    reflectedCount: 4,
    totalCount: 5,
    sentenceTotal: 9,
    sentenceNumbers: [1, 3, 6, 9],
    summary:
      "수기 메모가 자기평가 9문장 중 4문장(①③⑥⑨)의 근거가 됐습니다. 특히 H1, H4는 보고서에 없던 동기와 실천을 보여 줍니다.",
  },
  ch05: {
    counts: {
      completedReports: 7,
      subjectCount: 4,
      reflectedReports: 6,
      reflectedMemos: 4,
      linkedSubjects: ["수학", "정보", "통합사회"],
    },
    cards: {
      diagnosis: {
        state: "ok",
        text: "함수 단원 개념 이해는 양호, 실생활 적용 경험 부족으로 진단",
        date: "2026.09.01",
      },
      goal: {
        state: "ok",
        text: "이상 서울대 수학교육과, 최소 연세대 수학과",
        date: null,
      },
      growth: { state: "none", text: null, date: null },
      performance: {
        items: [
          { tag: "P1", subject: "수학" },
          { tag: "P2", subject: "수학" },
          { tag: "P3", subject: "정보" },
          { tag: "P4", subject: "통합사회" },
        ],
        inProgressTags: [],
      },
      inquiry: {
        items: [
          { tag: "D1", subject: "수학" },
          { tag: "D3", subject: "통합사회" },
        ],
        inProgressTags: ["D2"],
      },
      selfeval: {
        total: 9,
        linked: 9,
        allLinked: true,
        text: "9문장 중 9문장 모두 근거 연결 완료",
      },
    },
    nextSteps: [
      {
        key: "memo_detail",
        tag: "H3",
        text: "H3의 반올림으로 생긴 50원 차이를 찾아 고친 과정을 문단 2에 한 문장 추가하면 과정 서술이 더 구체적이 됩니다.",
      },
      {
        key: "finish_in_progress",
        tag: "D2",
        text: "D2는 진행 중이라 이번 자기평가에는 반영하지 않았습니다.",
      },
      {
        key: "verify_action",
        tag: "H4",
        text: "H4에서 시작한 판매 장부 자료를 확보해 설문 기반 예측과 비교하면 좋습니다.",
      },
      {
        key: "use_elsewhere",
        tag: "P5",
        text: "매점 운영 개선 논설문은 국어 자기평가의 근거로 쓰면 좋습니다.",
      },
    ],
  },
};
