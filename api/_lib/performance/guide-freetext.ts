// STEP2 안내문 직접 입력(`freetext`) 글자 수 상한 — 프론트(`ManualInfoForm`)와
// 서버(`api/_routes/performance/analyze-guide.ts`)가 함께 읽는 단일 정본이다.
//
// 근거: QA 시트 행 194(사용자 확정값 1000자).
//
// `submission-chars.ts`(제출물 STEP5 필드 글자 수)와는 대상이 다르다 — 저쪽은
// `performance_submissions`의 여러 필드 최소 길이 게이트, 이쪽은 `guide_freetext`
// 단일 값의 최대 길이 상한이다. 계산식도 공유할 이유가 없어 섞지 않는다
// (`submission-chars.ts` 상단 주석 — "이 파일에 import를 추가하지 마라"가
// 가리키는 것도 이 분리다).
//
// 길이는 `value.length`(UTF-16 코드 유닛)로 잰다 — 프론트가 실제로 입력을 막는
// 수단이 네이티브 `<textarea maxLength>`이고, 그 속성이 세는 단위가 이것이다.
// 서버가 다른 계산식(코드 포인트 등)을 쓰면 이모지가 섞인 입력에서 "브라우저는
// 통과시켰는데 서버가 거절"하는 불일치가 생긴다.
export const GUIDE_FREETEXT_MAX_LENGTH = 1000;

/** 서버 게이트 판정 — `analyze-guide.ts`가 이 함수 하나만 부른다(임계값을
 * 두 곳에서 각자 비교하면 나중에 상수만 바뀌고 비교식은 안 바뀌는 드리프트가
 * 생긴다). */
export function isGuideFreetextTooLong(freetext: string): boolean {
  return freetext.length > GUIDE_FREETEXT_MAX_LENGTH;
}
