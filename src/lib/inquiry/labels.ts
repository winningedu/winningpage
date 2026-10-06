// 화면 라벨 상수. 값은 api/_lib/inquiry/constants.ts 의 같은 이름 상수와 글자 그대로 같다.
// src 에서 api/ 를 import 하지 않으므로 복사해 두고, labels.test.ts 가 서버 상수와 대조한다.
// 서버 쪽 문구를 바꾸면 이 파일도 같이 바꾼다(테스트가 어긋남을 잡는다).
import type {
  CoreErrorId,
  Fit,
  LinkKind,
  Reliability,
  RubricItemId,
  SectionId,
  Stage,
  SubmissionLabel,
} from "./types";

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  followup: "후속형",
  transfer: "전이형",
  critique: "비판형",
  extension: "확장형",
};

export const FIT_LABELS: Record<Fit, string> = {
  match: "맞음",
  neutral: "보통",
  off: "어긋남",
};

export const SUBMISSION_LABELS: Record<SubmissionLabel, string> = {
  ready_with_minor_edits: "소규모 보완 후 제출 가능",
  revision_needed: "수정 필요",
  major_revision_needed: "대폭 수정 필요",
  not_evaluable: "평가 불가",
};

export const SOURCE_STATUS_LABELS = {
  retrieved_verified: "확인 완료",
  supplied_unverified: "사용자 제공 미확인",
  search_target: "검색 예정",
} as const;

export const STAGE_LABELS: Record<Stage, string> = {
  seed: "씨앗",
  flower: "꽃",
  bloom: "만개",
};

/** 신뢰도 한 줄 이름(No.38). 서버 상수에는 없는 화면 전용 문구다. */
export const RELIABILITY_LABELS: Record<Reliability, string> = {
  A: "원문 확보",
  B: "회상 복원",
  C: "주제만",
};

/** 신뢰도별 설명. C 는 서버 RELIABILITY_C_NOTE 와 같다(No.43). A, B 는 화면 전용 문구다. */
export const RELIABILITY_NOTES: Record<Reliability, string> = {
  A: "기록 원문을 바탕으로 만든 주제예요.",
  B: "기억을 되살려 입력한 내용을 바탕으로 만든 주제예요.",
  C: "입력한 주제 한 줄만으로 만든 주제예요.",
};

/** 신뢰도 B, C 설계 리포트 확인 요청 안내(No.39). */
export const RELIABILITY_CHECK_NOTICE =
  "기억이나 주제 한 줄에서 출발한 설계예요. 출발 활동의 내용이 실제와 맞는지 먼저 확인해 주세요.";

/** 화면 단계 1~6의 이름. 인덱스 0 이 1단계다. */
export const STEP_NAMES = [
  "정보 입력",
  "주제 추천",
  "설계 리포트",
  "보고서 작성",
  "평가 리포트",
  "확정과 적립",
] as const;

export const ARCHIVE_LABEL = "보관함";

/** 전 화면 하단 고지 3줄(No.134). 서버 NOTICES 와 글자 그대로 같다. */
export const NOTICES: readonly string[] = [
  "이 도구는 보고서를 대신 써 주지 않아요. 설계와 평가만 제공해요.",
  "평가는 위닝 내부 기준이에요. 학교 성적, 학생부 평가, 합격 가능성을 예측하지 않아요.",
  "생활기록부 원문은 받지 않아요(초중등교육법 제25조의2). 세특 문장도 만들지 않아요. 생성에 실패하면 차감된 이용 횟수는 자동으로 복구돼요.",
];

/** 연계 유형 한 줄 정의(연계 규칙 카드). 서버 LINK_KIND_DEFINITIONS 와 같다. */
export const LINK_KIND_DEFINITIONS: Record<LinkKind, string> = {
  followup: "앞 활동이 남긴 한계를 그대로 이어받아 해결한다",
  transfer: "앞 활동에서 쓴 방법을 다른 대상에 적용한다",
  critique: "앞 활동에서 쓴 도구나 결론의 전제를 다시 검증한다",
  extension: "앞 활동의 문제의식을 공동체나 사회 범위로 넓힌다",
};

/** 주제 추천 라운드 상한(No.53): 최초 1 + 재추천 3. 서버 TOPIC_MAX_ROUNDS 와 같다. */
export const TOPIC_MAX_ROUNDS = 4;

/** mode 별 모델 호출 시도 상한(No.22). 서버 MAX_MODEL_ATTEMPTS_PER_MODE 와 같다. */
export const MAX_MODEL_ATTEMPTS = 10;

/** 예비 주제 안내(No.4, 146). 서버 PROVISIONAL_TOPIC_NOTE 와 같다. */
export const PROVISIONAL_TOPIC_NOTE =
  "고른 활동이 없어 관심 기반 예비 주제를 보여 드려요. 이전 활동과 이어지지 않아 연계 점수는 0점이에요.";

/** 작성 화면 금지 항목 상시 노출(No.80). 서버 WRITING_FORBIDDEN 과 같다. */
export const WRITING_FORBIDDEN: readonly string[] = [
  "확인하지 않은 수치와 연구 결과",
  "출처 없이 옮겨 적은 문장",
  "하지 않은 실험을 한 것처럼 쓴 서술",
  "상관을 인과로 바꾼 결론",
];

/** 가설 기각 안내(No.74). 서버 HYPOTHESIS_NOTICE 와 같다. */
export const HYPOTHESIS_NOTICE = {
  title: "가설이 틀려도 돼요",
  body: "왜 예상과 달랐는지를 설명하는 대목에서 사고 과정이 가장 잘 드러나요. 결과를 가설에 맞춰 고치지 마세요.",
} as const;

/** 평가 실행(재평가 포함) 상한. 서버 MAX_EVALUATIONS 와 같다. 남은 재평가는 이 값에서 1을 뺀다(No.22). */
export const MAX_EVALUATIONS = 4;

/** 평가 리포트 하단 "이 평가가 하지 않는 것" 칩. 서버 NOT_PRODUCED 와 같다. */
export const NOT_PRODUCED: readonly string[] = [
  "인공지능 작성 판정",
  "합격 가능성",
  "교사 예상 점수",
  "학생부 등급",
  "생활기록부 문장 생성",
  "보고서 대필",
];

/** 평가표 항목 이름과 배점(No.82). 서버 RUBRIC 의 label, maxScore 와 같다. */
export const RUBRIC_ITEM_LABELS: Record<
  RubricItemId,
  { label: string; maxScore: number }
> = {
  linkage: { label: "기존 활동과의 연계 및 탐구 동기", maxScore: 20 },
  question: { label: "질문의 구체성과 심화성", maxScore: 20 },
  method: { label: "탐구 방법과 학생의 분석", maxScore: 25 },
  evidence: { label: "근거와 내용의 정확성", maxScore: 15 },
  conclusion: { label: "결론과 한계 인식", maxScore: 10 },
  structure: { label: "구성과 표현", maxScore: 10 },
};

/** 핵심 오류 6종의 이름(No.85). 서버 CORE_ERRORS 의 label 과 같다. */
export const CORE_ERROR_LABELS: Record<CoreErrorId, string> = {
  variable_mismatch: "질문과 측정변수가 맞지 않아요",
  proxy_undeclared: "대리 지표를 쓰면서 밝히지 않았어요",
  correlation_as_cause: "상관을 인과로 단정했어요",
  overclaim: "증거를 넘어선 단정이 있어요",
  unsourced_number: "출처 없는 수치 주장이 있어요",
  placeholder_left: "아직 쓰지 않은 자리가 남아 있어요",
};

/** 체크리스트 13 항목 이름(No.66). 서버 CHECKLIST 의 text 와 같다. */
export const CHECKLIST_LABELS: Record<string, string> = {
  c01: "출발 활동 이름",
  c02: "확인하지 않고 넘어간 것",
  c03: "이번 질문이 필요한 이유",
  c04: "질문 한 문장",
  c05: "가설 1과 2",
  c06: "출처와 기준 시점",
  c07: "가공 방법과 단위 통일",
  c08: "확인한 값만",
  c09: "가설 판정",
  c10: "한 문장 정리",
  c11: "진로 연결은 직무의 성격으로",
  c12: "한계 두 가지 이상",
  c13: "후속 탐구의 활동",
};

/** 평가 화면에서 쓰는 절 이름(위치 표시와 자리표시자 안내). */
export const EVAL_SECTION_LABELS: Record<SectionId, string> = {
  I: "Ⅰ절 탐구 동기",
  II: "Ⅱ절 탐구 질문과 가설",
  III: "Ⅲ절 탐구 방법",
  IV: "Ⅳ절 탐구 결과",
  V: "Ⅴ절 해석",
  VI: "Ⅵ절 한계",
  VII: "Ⅶ절 후속 탐구",
  VIII: "Ⅷ절 참고 자료",
};
