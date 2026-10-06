// 화면 라벨 상수. 값은 api/_lib/inquiry/constants.ts 의 같은 이름 상수와 글자 그대로 같다.
// src 에서 api/ 를 import 하지 않으므로 복사해 두고, labels.test.ts 가 서버 상수와 대조한다.
// 서버 쪽 문구를 바꾸면 이 파일도 같이 바꾼다(테스트가 어긋남을 잡는다).
import type {
  Fit,
  LinkKind,
  Reliability,
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
