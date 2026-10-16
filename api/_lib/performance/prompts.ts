// 수행평가 앱 프롬프트 정본 — docs/수행평가-상세-명세.md §12.1.
//
// §12.1이 "프롬프트 모듈은 `api/_lib/performance/prompts.js` 한 곳에 두고 4곳(주제 추천/
// 평가/안내문 분석/설계 리포트)에서 import"하라고 규정한 그 파일이다. 지금은 안내문 분석
// (P7)만 들어 있고 나머지 3종은 P8/P10/P11이 이 파일에 덧붙인다.
//
// ─────────────────────────────────────────────────────────────────────
// ⚠️ 이 파일의 문자열은 **1바이트도 바꾸지 마라** (§12.1 「1바이트도 변경 금지」)
// ─────────────────────────────────────────────────────────────────────
// 외부 앱(`/Users/hyunsoo/uwellnow/suhaengpyeong`)에서 원문 그대로 옮긴 현장 튜닝의
// 산물이다. 특히 안내문 추출 프롬프트의 `[답변 문항 목록 - 절대 누락 금지]` 판별 규칙
// (`~하였는가`/`~포함했는가` 형태는 평가기준이지 답변 문항이 아니라는 규칙)은 오분류를
// 잡으려고 쌓인 문장들이라 요약·정리하는 순간 회귀한다.
//
// 문구를 고쳐야 할 일이 생기면 그때 `*_PROMPT_VERSION` 문자열을 함께 올리고, 어느 버전이
// 어떤 산출물을 만들었는지 DB에 남긴다(아래 참조).
//
// ─────────────────────────────────────────────────────────────────────
// 버전 문자열을 어디에 기록하는가 (§8.3)
// ─────────────────────────────────────────────────────────────────────
//   · `performance_reports.prompt_version` — 리포트 3종(P10/P11)이 쓰는 정식 컬럼.
//   · 안내문 분석은 리포트 행을 만들지 않는다. 그래서 `GUIDE_PROMPT_VERSION`은
//     `performance_sessions.guide_json` 봉투 안에 `promptVersion` 키로 함께 저장한다
//     (`api/performance/analyze-guide.js`). `performance_attachments`에는 버전 컬럼이
//     없다(sql/54_performance_app.sql 1-3) — 세션 쪽 봉투가 그 역할을 겸한다.

// ─────────────────────────────────────────────────────────────────────
// CORE_PRINCIPLES — AI 수행평가 코치 핵심 원칙 6조
// ─────────────────────────────────────────────────────────────────────
// 원문: `suhaengpyeong/api/_lib/config.js:32-58`(본문 33-57). **1바이트도 변경 금지**(§12.1).
//
// 외부 앱의 실제 주입 지점은 3곳뿐이다 —
//   `api/recommend-topics.js:113` / `api/evaluate-text.js:63` / `api/analyze-assessment-storage.js:71`.
// 그중 이 파일이 지금 쓰는 곳은 세 번째(안내문 분석)이며, 아래 `GUIDE_EXTRACTION_SYSTEM`이
// 원본 `:71`과 같은 자리에 같은 방식으로 끼워 넣는다.
//
// 설계 리포트(P10)는 외부에 없던 **4번째 주입 지점**이 된다(§11 ~~Q83~~ 결정) — 외부
// `api/find-resources.js`는 import조차 하지 않는다. 그 주입은 이 파일 아래쪽
// 「CORE_PRINCIPLES ↔ 16원칙 병합」 절에서 병합 검토를 마친 뒤 이뤄졌다
// (`buildDesignReportSystem`, `CORE_PRINCIPLES_DESIGN_BRIDGE`).
export const CORE_PRINCIPLES = `
[AI 수행평가 코치 핵심 원칙]

1. 이전 주제의 심화·확장 주제를 최우선으로 선정한다.
- 학생이 이전에 탐구한 주제가 있다면 단순 반복하지 않고 한 단계 더 깊이 들어가거나, 반대 관점·한계·문제점을 탐구하는 방향으로 연결한다.
- 이전 주제가 없을 경우 이 원칙은 자연스럽게 생략한다.

2. 추후 더 깊은 탐구로 이어질 수 있는 주제를 최우선으로 선정한다.
- 선정한 주제는 반드시 "~에 흥미를 느껴 ~을 탐구했다. 이 주제는 ~와 연결되어 있으며, 이후 ~한 활동으로 심화할 계획이다."라는 서사가 자연스럽게 성립해야 한다.

3. 표절 방지를 철저히 안내한다.
- 인터넷·논문·책에서 그대로 가져온 문장이 의심될 경우 반드시 경고하고, 학생 자신의 언어로 재작성하도록 안내한다.
- 자료는 참고용으로만 활용하도록 안내한다.

4. 평가 기준의 모든 항목을 반드시 충족하도록 안내한다.
- 수행평가 안내문에 명시된 평가 항목과 배점을 항상 기준으로 삼는다.
- 빠진 평가 항목이 있으면 반드시 지적한다.

5. 학년별 탐구 방향을 반드시 고려한다.
- 고1: 과목 개념 이해, 기초 탐구, 진로 탐색 가능성 중심
- 고2: 희망 진로와 과목 개념의 직접 연결 중심
- 고3: 희망학과·전공과 연결되는 심층 탐구 중심

6. 불확실한 정보는 절대 단정하지 않는다.
- 사실 여부가 불확실한 수치·사례·연구 결과는 제시하지 않는다.
- 확실하지 않으면 확인이 필요하다고 안내한다.
`.trim();

// ─────────────────────────────────────────────────────────────────────
// 안내문 추출 (P7)
// ─────────────────────────────────────────────────────────────────────
// 원문: `suhaengpyeong/api/analyze-assessment-storage.js:70-111`. **1바이트도 변경 금지.**
//
// **출력 계약은 평문이다.** §8.4가 구조화 출력(`responseSchema`)을 결정한 대상은 주제
// 추천·설계 리포트·평가 리포트 3종이고, 안내문 분석은 그 표에 스키마 요지만 적혀 있을 뿐
// 이 슬라이스(P7)의 이식 계약은 원본 그대로의 평문이다. 그래서 이 프롬프트의 대괄호 섹션
// 뼈대(`[수행평가 기본 정보]` … `[자료/도서/영상 목록 - 절대 누락 금지]`)는 **포맷 강제용
// 지시가 아니라 지금 유일한 출력 계약**이므로 그대로 둔다.
//
// **미결(§11 Q53)** — "개인 식별 정보(학번·이름)는 추출하지 말라" 지시를 넣을지 아직
// 결정되지 않았다. 현행 원문에는 그 지시가 없고, 결정 전에 임의로 문장을 더하면 위의
// 1바이트 규정을 어기는 것이므로 **넣지 않는다.** 결정이 나면 그때 버전을 올린다.
export const GUIDE_EXTRACTION_SYSTEM = `
${CORE_PRINCIPLES}

당신은 고등학교 수행평가 안내문 분석 전문가입니다.
반드시 아래 형식으로 정확히 추출하세요:

[수행평가 기본 정보]
- 교과/과목:
- 학년:
- 수행평가 유형:
- 주제/제목:
- 제출 형식:
- 제출 기한:

[평가 기준 및 배점]
(항목별 배점 정리)

[세부 요구사항]
- 필수 포함 내용:
- 특이사항:

[답변 문항 목록 - 절대 누락 금지]
학생이 실제로 답안에 작성해야 하는 번호형 질문/문항이 있는 경우에만 아래 형식으로 전부 추출하세요.
질문 1: (안내문 원문에 있는 학생 답변 문항 그대로)
질문 2: (안내문 원문에 있는 학생 답변 문항 그대로)
질문 3: (안내문 원문에 있는 학생 답변 문항 그대로)
...
엄격한 판정 규칙:
- 원문에 학생이 직접 답해야 하는 문항이 명확히 있을 때만 "질문 n:"으로 적으세요.
- 평가기준, 채점기준, 체크리스트, 성취기준, 루브릭의 "~하였는가", "~포함했는가", "~제시했는가", "~작성했는가" 문장은 절대 답변 문항으로 바꾸지 마세요.
- "도서명, 탐구 주제, 관련 단원을 구체적으로 제시하였는가?" 같은 문장은 평가기준이지 답변 문항이 아닙니다.
- 원문이 평가기준만 제시하고 실제 답변 문항이 불명확하면 반드시 "질문 목록 없음"으로 표시하세요.
- 예시 문장을 실제 질문처럼 출력하지 마세요.
답변 문항 목록이 없으면 반드시 "질문 목록 없음"으로 표시하세요.

[자료/도서/영상 목록 - 절대 누락 금지]
안내문에 학생이 선택해야 할 자료/도서/영상 목록이 있으면 전부 추출하세요.
없으면 "없음"으로 표시하세요.

확인 안 되는 항목은 '정보 없음'으로 표시하세요.
불확실한 정보는 절대 임의로 추가하지 마세요.
`.trim();

/**
 * 사용자 프롬프트(이미지 뒤에 붙는 텍스트 파트). 원문 `analyze-assessment-storage.js:117`.
 * 1장일 때는 이 문장 그대로 나간다.
 */
export const GUIDE_EXTRACTION_USER_PROMPT =
  "수행평가 안내문의 모든 정보를 추출해주세요.";

/**
 * 여러 장을 **한 번의 호출로** 분석할 때 위 문장 앞에 붙는 한 줄.
 *
 * 원문에는 없는 문장이다. 외부 앱은 장당 1회씩 호출하고 결과 문자열을 이어 붙였기 때문에
 * (`suhaengpyeong/index.html:1660-1681`) "이 사진들이 한 건의 안내문"이라는 사실을 모델에
 * 알릴 필요가 없었다. §8.8 「다중 분석」 결정으로 단일 호출로 바꾸면서 필요해진 문장이며,
 * **1장일 때는 붙이지 않는다** — 그 경우 프롬프트가 원문과 완전히 같아야 하기 때문이다.
 *
 * @param {number} pageCount 이미지 장수
 */
export function buildGuideExtractionUserPrompt(pageCount) {
  if (!(pageCount > 1)) return GUIDE_EXTRACTION_USER_PROMPT;

  return [
    `아래 사진 ${pageCount}장은 순서대로 이어지는 하나의 수행평가 안내문입니다. 모든 장의 내용을 종합해 한 벌로 정리하세요.`,
    GUIDE_EXTRACTION_USER_PROMPT,
  ].join("\n");
}

/**
 * 안내문 추출 프롬프트 버전. 프롬프트 문자열을 손대면 반드시 함께 올린다.
 * 기록 위치는 이 파일 상단 「버전 문자열을 어디에 기록하는가」 참조.
 */
export const GUIDE_PROMPT_VERSION = "guide-v1";

// ─────────────────────────────────────────────────────────────────────
// CROSS_SUBJECT_CONNECTION_GUIDE — 교과 연계 매트릭스 11조
// ─────────────────────────────────────────────────────────────────────
// 원문: `suhaengpyeong/api/_lib/config.js:60-81`(본문 61-80). **1바이트도 변경 금지**(§12.1).
// `api/_lib/performance/prompts.test.ts`(옛 scripts/verify-performance-prompt-parity.mjs)가 원본 파일과 `Buffer.equals`로 대조한다.
//
// §12.1 「원문 유지. 10조는 스키마로 강제 불가한 의미 제약이므로 서버 후검증을 두지 않는다
// (오탐 위험)」 — 즉 `추천 3개 중 최소 1개는 같은 과목 심화`(10조)를 코드로 재검사하지
// 않는다. 모델에게만 맡기는 것이 결정 사항이다.
//
// 주입 지점은 주제 추천 system 프롬프트 한 곳뿐이다(외부도 동일 —
// `grep CROSS_SUBJECT_CONNECTION_GUIDE` → `api/recommend-topics.js:126` 단 1건).
export const CROSS_SUBJECT_CONNECTION_GUIDE = `
[다른 과목 선배 데이터 연계 판단 기준]

1. 같은 진로 분야라도 현재 과목의 성격과 맞지 않으면 사용하지 않는다.
2. 다른 과목 데이터를 그대로 반복하지 말고, 현재 과목의 방식으로 재해석할 수 있을 때만 사용한다.
3. 과학 → 영어 연계:
- 과학 원리 설명을 반복하지 않는다.
- 영문 기사, 국제기구 자료, 캠페인 문구, 과학 커뮤니케이션, 영어 발표·에세이 구조로 재해석한다.
4. 과학 → 국어 연계:
- 과학 개념 설명보다 비문학 글의 논증 구조, 표현 전략, 관점 분석으로 바꾼다.
5. 과학 → 사회 연계:
- 과학 지식을 사회 문제, 정책, 이해관계자, 윤리 쟁점으로 확장한다.
6. 사회 → 국어 연계:
- 사회 쟁점을 글의 설득 방식, 표현 전략, 담론 구조 분석으로 바꾼다.
7. 국어 → 영어 연계:
- 국어에서 다룬 주제를 영문 자료 분석, 영어 발표, 영어 에세이로 확장한다.
8. 수학 → 과학 연계:
- 수학적 모델, 그래프, 통계, 변화량, 확률을 과학 탐구의 분석 도구로 사용한다.
9. 연계가 자연스럽지 않으면 "연계하지 않음"으로 판단하고 현재 과목 주제만 추천한다.
10. 추천 3개 중 최소 1개는 같은 과목 이전 수행이 있으면 같은 과목 심화 주제로 구성한다.
11. 다른 과목 선배 데이터는 선택 사항이며, 억지로 반드시 반영하지 않는다.
`.trim();

// ─────────────────────────────────────────────────────────────────────
// 주제 추천 (P8)
// ─────────────────────────────────────────────────────────────────────
// 원문: `suhaengpyeong/api/recommend-topics.js:112-183`(system) / `:185-205`(user).
//
// 이 프롬프트만은 **1바이트 규정의 명시적 예외**다(§8.4 「결정(§11-~~Q69~~ — 프롬프트
// 원문 이식 원칙의 예외 승인)」). 출력 계약이 평문 → 구조화 JSON(`responseSchema`)으로
// 바뀌기 때문이다. 다만 예외의 **경계가 §8.4·§12.1에 못박혀 있고**, 그 경계를 넘으면
// 다시 1바이트 규정 위반이다. 아래 세 목록이 그 경계의 전부다.
//
// ── ⓐ 원문 그대로 유지 (한 글자도 바꾸지 않았다) ────────────────────
//   · `CORE_PRINCIPLES` 6조 주입                       (원문 `:113`)
//   · 역할 3줄 `당신은 … 사용하지 않습니다.`           (원문 `:115-117`)
//   · RAG 소스 주입 블록 3개 헤더                      (원문 `:119`, `:122`, `:125`)
//   · `CROSS_SUBJECT_CONNECTION_GUIDE` 11조 주입       (원문 `:126`)
//   · 다른 과목 활용 규칙 **1~3조**                    (원문 `:128-131`)
//   · 2022 개정 교육과정 및 학교 유형 반영 규칙 8조    (원문 `:135-143`)
//   · 출력 규칙 중 **의미 규칙 5개**                   (원문 `:146`,`:147`,`:148`,`:149`,`:151`)
//   · user 메시지 블록 라벨·작업 지시 8조              (원문 `:186-205`)
//
// ── ⓑ JSON 계약 전환으로 **문구를 교체**한 2줄 ──────────────────────
//   원문 `:132` `4. 사용한 경우 "다른 과목 연계 포인트" 항목에서 …`
//     → `4. 사용한 경우 cross_subject 필드에 …`
//   원문 `:133` `5. 사용하지 않는 경우 굳이 언급하지 않는다.`
//     → `5. 연계하지 않는 경우 cross_subject 필드에 정확히 '연계하지 않음'만 적는다.`
//   사유(§12.1 「주제 추천 — 다른 과목 선배 데이터 활용 규칙 5조」 행 명시): 평문 시절의
//   `"다른 과목 연계 포인트" 항목`은 출력 뼈대의 4번 줄을 가리키는 말이라 뼈대가 사라지면
//   지시 대상이 사라진다. 5조는 `cross_subject`가 스키마 required 필드라 **"언급하지 않기"가
//   구조적으로 불가능**하므로 `config.js:78`(9조)의 표현 `연계하지 않음`과 일치시킨다.
//
// ── ⓒ `responseSchema`로 대체해 **삭제**한 것 ───────────────────────
//   원문 `:150` `5. 추천 3개가 끝나면 추가 안내를 쓰지 않는다.`   (종료 마커)
//   원문 `:152` `7. 반드시 추천 1, 추천 2, 추천 3 세 개 블록을 …`  (3블록 필수 마커)
//   원문 `:153` `8. 각 추천 블록의 첫 줄은 정확히 '추천 1:' …`     (헤더 형식 강제)
//   원문 `:155-182` `반드시 아래 형식으로 3개 추천:` + 번호 뼈대 3벌
//   → 전부 `minItems:3/maxItems:3` + required 필드 집합이 구조적으로 보장한다. 남겨 두면
//     모델이 JSON 문자열 값 안에 `추천 1:` 같은 접두어를 넣는 부작용이 난다.
//   ⚠ 남은 출력 규칙의 **번호만 1~5로 재부여**했다(§12.1 「원문 유지, 번호만 1~5로 재부여」).
//     문장 본문은 그대로다.
//
// ── ⚠ 마크다운 금지(원문 `:146`)는 삭제 대상이 아니다 ───────────────
//   §8.4·§12.1이 두 번 못박은 예외다. `responseSchema`는 JSON **구조**만 강제할 뿐
//   문자열 필드 값 안의 `**강조**`를 막지 못하고, 외부 클라이언트의 `stripMarkdown`
//   폴백(`index.html:3094`)은 §12.4로 함께 폐기된다 — 이 한 줄이 유일한 방어선이다.
//
// ── 뼈대 7항목 → 스키마 6필드: `5. 추천 이유`가 사라진 이유 ─────────
//   원문 뼈대는 `0.선정 근거 / 1.핵심 내용 / 2.이전 주제와의 연결 / 3.다른 과목 연계 포인트 /
//   4.추후 심화 방향 / 5.추천 이유 / 6.점수 강점` 7항목인데, 시안 상세 모달
//   `3754:4872`(§5.11 실측)의 섹션은 `선정 근거 / 핵심 내용 / 이전 주제와의 연결 /
//   다른 과목 연계 포인트 / 점수 강점 / 추후 심화 방향` **6개**이고 `추천 이유`가 없다.
//   §8.4의 스키마 정의도 6필드다. `추천 이유`는 `선정 근거`와 의미가 겹쳐 시안이 합친
//   것으로 보고 **스키마에서 제외**한다 — 렌더 자리가 없는 필드를 모델에게 시키면
//   토큰만 쓰고 버려진다. 순서도 시안 순서(점수 강점 → 추후 심화 방향)를 따른다.

/** 위닝DB RAG 결과가 비었을 때 프롬프트에 렌더하는 문구. 원문 `dynamic-knowledge.js:388`. */
export const NO_KNOWLEDGE_TEXT = "관련 위닝DB 항목 없음";

/** 학생 과거 수행 RAG 결과가 비었을 때 렌더하는 문구. 원문 `reports.js:222`. */
export const NO_STUDENT_HISTORY_TEXT = "관련 학생 과거 수행 기록 없음";

/** 값이 없는 학생 컨텍스트 필드에 렌더하는 리터럴. 평가 프롬프트와 통일(§12.1). */
export const UNKNOWN_FIELD_TEXT = "미입력";

/**
 * `previous_topic` 기본값. **원문 리터럴 `'없음'`을 유지한다**(§12.1) — user 지시 2조
 * (`같은 과목 이전 주제가 있으면 …`)가 이 문자열을 보고 분기하고, `performance_sessions`
 * 주석도 "'없음'은 「입력하지 않았다」가 아니라 「이전 주제가 없다고 답했다」"라고
 * 두 상태의 구분을 규정한다(sql/54_performance_app.sql 1-1).
 */
export const NO_PREVIOUS_TOPIC_TEXT = "없음";

/**
 * 주제 추천 system 프롬프트.
 *
 * @param {object} params
 * @param {string} [params.topicKnowledgeText] `loadDynamicAssessmentKnowledge()`의 `text`
 * @param {string} [params.studentHistoryText] `formatRelevantStudentSessionsForPrompt()` 결과
 */
export function buildTopicRecommendationSystem({
  topicKnowledgeText = "",
  studentHistoryText = "",
}: {
  topicKnowledgeText?: string;
  studentHistoryText?: string;
} = {}) {
  // 블록 순서는 캐시 할인 조건에 맞춘다. 요청마다 같은 고정 블록(핵심 원칙, 역할, 연계
  // 기준, 활용 규칙, 교육과정 규칙, 출력 규칙)을 앞에 모으고, 검색 결과가 들어가는 가변
  // 블록 2개를 맨 뒤에 둔다. 모델 입력은 앞부분이 직전 요청과 같을 때 그 부분이 캐시로
  // 과금되므로 고정 블록이 가변 블록 뒤에 있으면 할인을 받지 못한다. 고정 블록 가운데
  // 가변 블록을 "위"나 "아래"로 가리키는 문장은 없어서 지시문을 따로 옮기지 않았다.
  return `
${CORE_PRINCIPLES}

당신은 고등학교 수행평가 주제 추천 전문가입니다.
이 단계에서는 주제 추천용 데이터만 사용합니다.
자료 추천용 데이터나 평가용 데이터는 사용하지 않습니다.

[다른 과목 연계 판단 기준]
${CROSS_SUBJECT_CONNECTION_GUIDE}

다른 과목 선배 데이터 활용 규칙:
1. 다른 과목 후보는 반드시 먼저 연계 가능성을 판단한다.
2. 현재 과목의 수행평가 방식으로 재해석할 수 있을 때만 사용한다.
3. 억지 연계이면 사용하지 않는다.
4. 사용한 경우 cross_subject 필드에 어떤 과목의 어떤 흐름을 현재 과목 방식으로 바꾸었는지 설명한다.
5. 연계하지 않는 경우 cross_subject 필드에 정확히 '연계하지 않음'만 적는다.

2022 개정 교육과정 및 학교 유형 반영 규칙:
1. 학교 유형은 과목명이 아니므로 주제 추천의 직접 기준으로 삼지 않는다. 주제 추천의 핵심 기준은 실제 선택 과목명과 수행평가 안내문이다.
2. 학교 유형이 자율형 사립고 또는 특수목적고인 경우, 전문교과 과목이 선택될 수 있으므로 과목 수준을 더 구체적으로 확인한다.
3. 과목명이 "과학 / 고급 생명과학"처럼 입력되면 앞의 "과학"은 교과군, 뒤의 "고급 생명과학"은 실제 과목명으로 본다.
4. 공통국어, 공통수학, 공통영어, 한국사, 통합사회, 통합과학, 과학탐구실험은 기초 개념과 탐구 경험 중심으로 추천한다.
5. 일반 선택 과목은 교과 개념 적용, 자료 분석, 개념 확장 중심으로 추천한다.
6. 진로 선택 또는 융합 선택 과목은 진로 연계 심화 탐구와 융합적 문제 해결 중심으로 추천한다.
7. 전문교과 과목은 고급 개념을 그대로 나열하지 말고, 학생이 수행평가에서 실제로 수행 가능한 수준으로 조정한다.
8. 학교별 교육과정 편성 차이가 있으므로 학년만 보고 과목 수준을 단정하지 말고, 선택 과목명과 수행평가 안내문을 함께 기준으로 삼는다.

출력 규칙:
1. *, **, ##, ### 같은 마크다운 기호를 절대 사용하지 않는다.
2. 영어 단어나 영어 표현을 괄호 안에 넣지 않는다.
3. 주제명은 반드시 수행평가에서 실제로 탐구할 수 있는 구체적인 한국어 주제명으로 작성한다.
4. 안내문에 없는 질문을 만들어내지 않는다.
5. 학생이 그대로 제출할 수 있는 완성문을 작성하지 않는다.

[홈페이지 위닝 수행 주제 DB]
${topicKnowledgeText || NO_KNOWLEDGE_TEXT}

[학생 과거 수행 RAG]
${studentHistoryText || NO_STUDENT_HISTORY_TEXT}
`.trim();
}

/**
 * 주제 추천 user 메시지. 원문 `recommend-topics.js:185-205`.
 *
 * 필드 소스 매핑(§12.1 「주제 추천 — user 메시지 작업 지시 8조」 행의 결정 그대로):
 *   · `학년/학기` ← `performance_sessions.grade_label` + `semester` (STEP1 폼 입력, Q10)
 *     외부는 `고1 1학기` 결합 문자열 1컬럼이었고 여기서는 분리 저장 후 **표시 시점 결합**이다.
 *   · `학교 유형` ← `performance_sessions.school_type` (`profiles` 세션 시점 스냅샷, Q61-ⓔ)
 *     ⚠ 원문 `:188`의 `${school_type || '일반고'}` 폴백은 **이식 금지**다. 값이 없으면
 *       `미입력`을 렌더한다 — 사실이 아닌 '일반고'가 에러 없이 프롬프트에 박히고 그
 *       결과가 리포트에 그대로 남기 때문이다(sql/54_performance_app.sql 결정 ②).
 *   · `선택 과목` ← `subject_group / subject` 결합. 교육과정 규칙 3조가
 *     `"과학 / 고급 생명과학"` 형태를 전제하므로 결합 형태를 유지해야 그 조항이 산다.
 *   · `이전에 한 주제` ← `previous_topic`, 없으면 `'없음'`(위 리터럴 규정).
 *
 * @param {object} params
 * @param {string} [params.gradeLabel] `고1` 등
 * @param {string} [params.semester] `1학기` 등
 * @param {string} [params.schoolType]
 * @param {string} [params.subjectGroup] 교과군
 * @param {string} [params.subject] 과목명
 * @param {string} [params.career] 희망 진로
 * @param {string} [params.previousTopic]
 * @param {string} [params.assessmentText] 수행평가 안내문 본문(구조화 `guide_json`을
 *   평문으로 편 결과 또는 직접 입력 원문). 직렬화는 호출부 몫이다.
 */
export function buildTopicRecommendationUser({
  gradeLabel = "",
  semester = "",
  schoolType = "",
  subjectGroup = "",
  subject = "",
  career = "",
  previousTopic = "",
  assessmentText = "",
}: {
  gradeLabel?: string;
  semester?: string;
  schoolType?: string;
  subjectGroup?: string;
  subject?: string;
  career?: string;
  previousTopic?: string;
  assessmentText?: string;
} = {}) {
  const gradeText =
    [gradeLabel, semester]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ") || UNKNOWN_FIELD_TEXT;

  const subjectText =
    [subjectGroup, subject]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" / ") || UNKNOWN_FIELD_TEXT;

  return `
[학생 정보]
- 학년/학기: ${gradeText}
- 학교 유형: ${String(schoolType || "").trim() || UNKNOWN_FIELD_TEXT}
- 선택 과목: ${subjectText}
- 희망 진로: ${String(career || "").trim() || UNKNOWN_FIELD_TEXT}
- 같은 과목에서 이전에 한 주제: ${String(previousTopic || "").trim() || NO_PREVIOUS_TOPIC_TEXT}

[수행평가 안내문]
${String(assessmentText || "").trim() || "수행평가 안내문 정보 없음"}

작업:
1. 수행평가 안내문 조건을 최우선으로 반영한다.
2. 같은 과목 이전 주제가 있으면 추천 1은 반드시 심화·확장 주제로 제시한다.
3. 홈페이지 위닝 수행 주제 DB의 현재 과목 데이터는 적극 참고한다.
4. 다른 과목 선배 데이터는 연계 가능할 때만 선택적으로 활용한다.
5. 학생 과거 수행 RAG를 참고하여 이미 했던 주제는 반복하지 말고, 가능하면 심화·확장 방향으로 제안한다.
6. 다른 과목 과거 수행은 현재 과목 방식으로 재해석 가능할 때만 활용한다.
7. 다른 과목 데이터를 활용하더라도 현재 과목의 과목성이 약해지면 안 된다.
8. 안내문에 없는 질문이나 자료를 임의로 만들지 않는다.
`.trim();
}

/**
 * 재추천(round ≥ 2) 전용 **증분 블록**. 이전 라운드에서 이미 제시한 주제명을 프롬프트에
 * 넣어 같은 주제가 다시 나오는 것을 막는다(§8.3 `performance_topics.round` 정의 —
 * "재추천 시 이전 라운드 title 배제에 사용", §10.2 P8 「재추천(round 배제 + 상한 3)」).
 *
 * **원문 작업 지시 8조를 건드리지 않는다.** 8조는 §12.1이 원문 유지로 못박은 자산이고,
 * 배제 규칙은 외부 앱에 아예 없던 신규 요구(외부 재추천은 같은 프롬프트를 그대로 다시
 * 호출할 뿐이라 같은 주제가 반복됐다)라 **별도 블록으로 덧붙이기만** 한다. round 1에서는
 * 이 블록이 붙지 않으므로 최초 추천 프롬프트는 원문과 바이트 동일하다 —
 * `TOPIC_PROMPT_VERSION`을 올리지 않는 근거다.
 *
 * @param {string[]} titles 이전 라운드에서 제시한 주제명(중복 제거·순서 유지는 호출부 몫)
 * @returns {string} 붙일 블록. 배제할 주제가 없으면 빈 문자열.
 */
export function buildTopicExclusionBlock(titles: string[] = []) {
  const list = (Array.isArray(titles) ? titles : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!list.length) return "";

  return `
[이미 추천한 주제 — 재추천 대상에서 제외]
${list.map((title) => `- ${title}`).join("\n")}

재추천 규칙:
1. 위 목록에 있는 주제, 그리고 사실상 같은 주제(표현만 바꾼 주제)는 다시 제안하지 않는다.
2. 관점, 다루는 자료, 탐구 범위 중 최소 하나가 분명히 달라야 한다.
3. 배제 때문에 안내문 조건이나 과목성을 벗어나서는 안 된다. 안내문 조건이 여전히 최우선이다.
`.trim();
}

/**
 * 주제 상세 6섹션 라벨. 시안 `3754:4872` 실측 순서·문자열(§5.11 표)이며 스키마
 * `propertyOrdering`과 같은 순서다.
 *
 * **삭제한 출력 뼈대의 라벨이 여기로 옮겨 온 것이다.** 프롬프트에서 라벨을 빼는 대신
 * 데이터로 보존해야 상세 모달이 무엇을 어떤 순서로 렌더할지 한 곳에서 정해진다.
 */
export const TOPIC_DETAIL_SECTIONS = [
  { id: "selection_basis", label: "선정 근거" },
  { id: "core_content", label: "핵심 내용" },
  { id: "previous_link", label: "이전 주제와의 연결" },
  { id: "cross_subject", label: "다른 과목 연계 포인트" },
  { id: "score_strength", label: "점수 강점" },
  { id: "deepening", label: "추후 심화 방향" },
];

/**
 * 주제 추천 `responseSchema`(§8.4 표 「주제 추천」 행).
 *
 * `minItems:3, maxItems:3`이 원문 출력 규칙 7(3블록 필수)을 대체하고, required 필드
 * 집합이 뼈대 7항목을 대체한다. `propertyOrdering`은 시안 순서 고정 —
 * Gemini 구조화 출력은 이 배열 순서로 필드를 생성한다.
 *
 * **number 타입 필드를 두지 않는다**(§8.4 완화책 ⓐ). 이 스키마는 전부 string이라
 * `gemini-2.5-flash`의 숫자 리터럴 반복 루프 결함과 무관하지만, 나중에 점수류 필드를
 * 더할 때도 string으로 받아 서버에서 파싱해야 한다.
 */
export const TOPIC_RECOMMENDATION_SCHEMA = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          selection_basis: { type: "string" },
          core_content: { type: "string" },
          previous_link: { type: "string" },
          cross_subject: { type: "string" },
          score_strength: { type: "string" },
          deepening: { type: "string" },
        },
        required: [
          "title",
          "selection_basis",
          "core_content",
          "previous_link",
          "cross_subject",
          "score_strength",
          "deepening",
        ],
        propertyOrdering: [
          "title",
          "selection_basis",
          "core_content",
          "previous_link",
          "cross_subject",
          "score_strength",
          "deepening",
        ],
      },
    },
  },
  required: ["topics"],
  propertyOrdering: ["topics"],
};

/**
 * 주제 추천 생성 파라미터. 원문 `recommend-topics.js:207-210`(§12.3 「생성 호출 파라미터」).
 *
 * **`temperature 0.25`는 원문 값 그대로다.**
 *
 * **`maxOutputTokens`는 원문 4200에서 상향했다(§8.4 완화책 ⓑ).** 근거 2가지:
 *   ① 원문 4200은 **평문 3블록** 기준으로 잡힌 값이다. 같은 내용을 JSON으로 내면
 *      키 이름·따옴표·중괄호·이스케이프가 얹히고, 한국어 본문의 `\uXXXX` 이스케이프가
 *      섞이면 오버헤드가 더 커진다. 그대로 두면 3번째 주제가 잘린다(§12.3이 「실측
 *      재조정 대상」으로 명시한 이유).
 *   ② `gemini-2.5-flash` structured output 결함 ①②(숫자 리터럴 반복 루프 / 무작위
 *      중간 절단)의 공통 징후가 `MAX_TOKENS`다(§8.4). 여유를 두면 정상 응답이
 *      절단으로 오판돼 재시도로 버려지는 경우가 줄어든다 — 재시도는 회차를 태우지는
 *      않지만(차감은 성공 이후 1곳) 지연과 비용을 그대로 문다.
 *
 * `thinkingBudget 0`은 `gemini.js:buildConfig`의 기본값이라 여기서 다시 적지 않는다.
 */
export const TOPIC_GENERATION_DEFAULTS = {
  temperature: 0.25,
  maxOutputTokens: 6144,
};

/**
 * `finishReason === 'MAX_TOKENS'` 또는 파싱 실패로 **재시도**할 때 쓰는 출력 상한
 * (§8.4 완화책 ⓑ+ⓒ). 같은 값으로 다시 부르면 같은 자리에서 다시 잘리므로 올린다.
 * 온도는 낮춰 부르는데(원문 재시도가 `0.25 → 0.2`로 낮춘 것과 같은 취지) 그 값은
 * 호출부가 정한다.
 */
export const TOPIC_MAX_OUTPUT_TOKENS_RETRY = 8192;

/**
 * 주제 추천 프롬프트 버전. `performance_reports.prompt_version`에 기록한다(§8.3).
 * 위 ⓐ/ⓑ/ⓒ 경계 중 **어느 한 줄이라도** 바뀌면 이 값을 올린다.
 * topic-v2 는 topic-v1 과 문구가 같고, 캐시 할인을 위해 고정 블록을 앞으로 가변 블록을
 * 뒤로 옮긴 판이다.
 */
export const TOPIC_PROMPT_VERSION = "topic-v2";

// ─────────────────────────────────────────────────────────────────────
// 설계 리포트 (P10)
// ─────────────────────────────────────────────────────────────────────
// 원문: `suhaengpyeong/api/find-resources.js:377-491`(system, 본문 378-490) /
//       `:493-515`(user, 본문 494-514).
//
// 주제 추천(P8)과 같은 §8.4 ~~Q69~~ 예외 아래 있다 — **출력 계약만** 평문 → 구조화
// JSON(`responseSchema`)으로 바뀌고, 도메인 규칙(16원칙·자료 사용 규칙·섹션별 서술
// 지침)은 원문 그대로다. 아래 ⓐⓑⓒ가 그 경계의 전부이며 P8의 표기 관례를 따른다.
//
// ── ⓐ 원문 그대로 유지 (한 글자도 바꾸지 않았다) ────────────────────
//   · 역할 1줄 `당신은 고등학생 … 전문가입니다.`        (원문 `:378`)
//   · `목표:` 3줄                                       (원문 `:380-382`)
//   · `중요 원칙:` + **16원칙 전문**                     (원문 `:384-400`)
//   · `[안내문 구조 판정]` 블록 라벨 4줄                 (원문 `:402-406`)
//   · `[홈페이지 위닝 수행 자료 DB]` + 빈 값 문구        (원문 `:408-409`)
//   · `[사용 허용 자료명 목록]` **헤더 문자열**          (원문 `:411`)
//   · `[학생 과거 수행 RAG]`                             (원문 `:416-417`)
//   · `출력 방식:` 헤더 + 형식 분기 지시 1줄             (원문 `:419`, `:421`)
//   · 섹션별 하위 키 목록 전문                           (원문 `:424-427`, `:430-431`,
//     `:434-437`, `:440-443`, `:486-490`)
//   · 형식별 작성 구조 3분기 본문                        (원문 `:448-461`, `:463-479`,
//     `:481-483`) — **판정 결과에 해당하는 분기만 조건부 주입**(§12.1)
//   · user 메시지 블록 라벨 + 작업 지시 4줄              (원문 `:494-514`)
//
// ── ⓑ JSON 계약 전환으로 **문구를 교체**한 것 ───────────────────────
//   ⓑ-1 원문 `:412` — `[사용 허용 자료명 목록]`의 **값**이 자료명 문자열 나열
//        (`title.join(' / ')`, 원문 `:357`)에서 **`id | 자료명` 목록**으로 바뀐다
//        (§12.1 「`:411-412`은 … 자료 id 목록으로 바꿔 모델이 id를 고르게 한다」, Q63).
//        **헤더 `:411`은 원문 그대로 둔다** — 16원칙 12조가 `사용 허용 자료명 목록`이라는
//        문자열을 그대로 인용해 "학생에게 보이는 출력에 쓰지 마라"고 지시하기 때문이다.
//        헤더를 `[사용 허용 자료 목록]`으로 고치면 12조의 지시 대상이 프롬프트에서
//        사라진다(1바이트 규정을 지키면서 지시만 무력화되는 최악의 경우).
//   ⓑ-2 원문 `:414` `주의: 2번 추천 자료 항목에는 위 […]에 있는 자료명만 쓸 수 있다.
//        목록이 '없음'이면 자료명을 만들지 말고, …`
//        → `주의: chosen_resources 필드에는 위 […]에 있는 자료 id만 쓸 수 있다.
//           목록이 '없음'이면 id를 만들지 말고 chosen_resources를 빈 배열로 두며, …`
//        사유: `2번 추천 자료 항목`은 삭제되는 번호 뼈대의 2번 줄을 가리키는 말이라
//        뼈대가 사라지면 지시 대상이 사라진다(P8 ⓑ와 완전히 같은 사유). 뒷문장
//        (`학생에게 보이는 출력에는 DB, 내부 자료, RAG, …`)은 원문 그대로다.
//
// ── ⓒ `responseSchema`로 대체해 **삭제**한 것 ───────────────────────
//   원문 `:420` `아래 번호는 기본 뼈대이지만, 4번 이후의 작성 구조는 …`  (번호 뼈대 참조)
//   원문 `:423`,`:429`,`:433`,`:439`,`:445`,`:485`의 **번호 접두어 `N. `만** 제거
//     → 섹션 id·라벨·순서는 `DESIGN_REPORT_SECTIONS`가 정하고 스키마가 강제한다.
//       **제목 문자열 자체는 원문 그대로 남는다**(`최종 주제`, `추천 자료 및 활용 포인트`
//       …) — 이 문자열이 곧 §5.13 실측 섹션 라벨이라 지우면 모델이 어느 섹션을 쓰는지
//       알 수 없게 된다.
//   원문 `:446` `안내문 구조 판정에 따라 아래 중 하나로 구성한다.`
//     → 분기를 **하나만** 주입하므로(§12.1) 고를 대상이 없다.
//   ⚠ 그 외 `:419-490` 구간은 **삭제하지 않았다.** §12.1이 「스키마로 대체할 것은
//     `:419-490`의 번호 뼈대뿐이다」라고 못박은 그대로다.
//
// ── ⚠ 마크다운 금지(16원칙 14, 원문 `:398`)는 삭제 대상이 아니다 ────
//   §12.1이 「`:398`(원칙 14) 마크다운 금지는 이식한다 — 의미 규칙이며 스키마로
//   대체되지 않는다」로 명시했다. `responseSchema`는 JSON **구조**만 강제할 뿐 문자열
//   필드 값 안의 `**강조**`를 막지 못하고, 외부 클라이언트 `stripMarkdown`
//   폴백(`index.html:3094`)은 §12.4로 폐기된다 — 이 한 줄이 유일한 방어선이다(P8 동일).
//
// ── 추천 자료 섹션을 모델 스키마에서 뺀 이유 ────────────────────────
//   `DESIGN_REPORT_SECTIONS`의 `recommended_resources`만 `authoredBy: 'server'`다.
//   모델은 `chosen_resources[{resource_id, use_point}]`만 고르고, 자료명·출처·링크·핵심
//   개념은 서버가 위닝DB 행에서 채운다. **이것은 원문의 의도를 코드로 옮긴 것이다** —
//   원문 `:430`이 이미 `이 항목은 시스템이 위닝 수행 자료 DB에서 확인된 자료만으로 최종
//   보정한다`라고 선언하고 있고, 외부 앱도 모델 출력의 2번 섹션을 통째로 버린 뒤
//   `buildDbOnlyResourceSection`(`:152-176`)으로 갈아 끼웠다. 모델이 자료명을 **문자열로
//   낼 자리 자체를 없애면** 16원칙 8~13(DB 밖 자료 생성 금지)이 프롬프트 준수가 아니라
//   구조적 불가능이 된다.

// ─────────────────────────────────────────────────────────────────────
// CORE_PRINCIPLES ↔ 16원칙 병합 (§11 ~~Q83~~ 결정 — 주입한다)
// ─────────────────────────────────────────────────────────────────────
// 외부 앱은 `CORE_PRINCIPLES`를 3곳(`recommend-topics.js:113` / `evaluate-text.js:63` /
// `analyze-assessment-storage.js:71`)에만 주입했고 설계 리포트에는 주입하지 않았다.
// Q83 결정으로 **4번째 주입 지점**이 신설된다.
//
// 조 단위 대조 결과 — 중복 3건 / 충돌 3건 / 독립 2건:
//
//   [중복]  CORE 1(이전 주제 심화·확장)      ↔ 16원칙 15·16(과거 수행 반복 금지·재구성)
//           CORE 3(표절 방지)                ↔ 16원칙 7(완성문 금지)
//           CORE 6(불확실 정보 단정 금지)    ↔ 16원칙 10·13(DB 밖 자료·검색 키워드 금지)
//           → 셋 다 같은 방향이라 병기해도 서로를 약화시키지 않는다. 16원칙 쪽이 더
//             구체적(자료·출력물 한정)이라 실제 판단은 자연히 좁은 쪽으로 수렴한다.
//
//   [충돌①] CORE 1 `이전 주제의 심화·확장 주제를 최우선으로 선정한다`
//           ↔ 설계 리포트는 **주제가 이미 확정된 뒤**의 단계다(STEP4, §5.12).
//           → 그대로 두면 모델이 확정 주제를 바꾸거나 대체 주제를 제안할 수 있다.
//   [충돌②] CORE 2의 서사 예문(`"~에 흥미를 느껴 ~을 탐구했다. …"`)
//           ↔ 16원칙 7 `학생이 그대로 제출할 수 있는 완성문을 쓰지 않는다`
//           → 예문을 리포트 본문에 그대로 옮기면 완성문 금지 위반이다.
//   [충돌③] CORE 5 학년별 탐구 방향(특히 고3 `심층 탐구 중심`)
//           ↔ 16원칙 8~13(자료는 위닝DB에 있는 것만)
//           → 심화 요구가 "DB에 없는 심층 자료를 지어내라"는 압력으로 작동할 수 있다.
//             §12.1이 병합 검토 대상으로 직접 지목한 조합이다.
//
//   [독립]  CORE 4(평가 항목 전수 충족)      — 16원칙 4와 상보적이다. 4조는 "평가기준을
//           답변 문항으로 착각하지 마라"이고 CORE 4는 "평가 항목을 기준으로 삼아라"라
//           지시가 겹치지 않는다(기준으로 쓰되 문항으로 쓰지 않는다).
//           16원칙 1~3·5·6·14 — CORE_PRINCIPLES에 대응 조항이 없다.
//
// **해소 방식 — 원문은 한 글자도 고치지 않는다.** 충돌 3건을 없애려고 CORE_PRINCIPLES나
// 16원칙 본문을 손대면 §12.1 「1바이트도 변경 금지」 위반이다. 대신 **주입 순서 + 연결
// 문장 블록**으로 해소한다:
//     `CORE_PRINCIPLES` → `CORE_PRINCIPLES_DESIGN_BRIDGE`(신규) → 원문 본문
// 연결 문장은 어느 원문에도 속하지 않는 **이 저장소의 신규 자산**이며, 충돌 3건에 각각
// 한 줄씩 대응하고 마지막 줄로 일반 우선순위(**충돌 시 16원칙 우선**)를 못박는다.
// 16원칙을 우선하는 근거: `CORE_PRINCIPLES`는 서비스 전역 코치 원칙이고 16원칙은 **이
// 산출물(설계 리포트)의 계약**이다. 좁은 계약이 넓은 원칙을 이긴다.
export const CORE_PRINCIPLES_DESIGN_BRIDGE = `
[핵심 원칙 적용 범위]
- 위 핵심 원칙은 이번 단계의 배경 기준이다. 주제는 학생이 이미 확정했으므로 다시 선정하거나 바꾸지 않는다.
- 핵심 원칙 2의 예시 문장은 주제의 서사가 성립하는지 판단하는 기준일 뿐이며, 그 문장을 리포트 본문에 그대로 쓰지 않는다.
- 학년별 탐구 방향은 탐구 내용의 깊이를 정할 때만 적용하고, 자료는 어떤 경우에도 아래 중요 원칙 8~13을 따른다.
- 위 핵심 원칙과 아래 중요 원칙이 어긋나면 아래 중요 원칙을 따른다.
`.trim();

/** 위닝DB 자료 RAG 결과가 비었을 때 렌더하는 문구. 원문 `find-resources.js:409`. */
export const NO_RESOURCE_KNOWLEDGE_TEXT = "사용 가능한 내부 자료 없음";

/** 사용 허용 자료 목록이 비었을 때 렌더하는 문구. 원문 `find-resources.js:357`. */
export const NO_ALLOWED_RESOURCE_TEXT = "없음";

/** `selected_topic_detail`·`previous_topic`이 비었을 때. 원문 `:498`, `:505`. */
export const NO_TOPIC_DETAIL_TEXT = "없음";

/** 안내문 요약이 비었을 때. 원문 `:508`. */
export const NO_ASSESSMENT_INFO_TEXT = "안내문 정보 없음";

/**
 * 설계 리포트 프롬프트 버전 2종.
 *
 * §12.1·명세 L1620: 「설계 리포트는 ~~Q83~~ 결정에 따라 `design-v2`(`CORE_PRINCIPLES`
 * 주입) **고정**. 미주입 비교본(`design-v1`)은 A/B 검증용으로만 별도 기록」.
 *
 * 두 버전의 **유일한 차이**는 `CORE_PRINCIPLES` + 연결 문장 블록의 유무다. 그래야 A/B가
 * 단일 변수 비교가 된다 — `buildDesignReportSystem`은 v2 = `CORE + BRIDGE + '\n\n' + v1`을
 * 보장하고, `api/_lib/performance/prompts.test.ts`(옛 scripts/verify-performance-prompt-parity.mjs)가 `endsWith`로 그 관계를 검증한다.
 *
 * design-v3, design-v4 는 각각 design-v1, design-v2 와 문구가 같고, 캐시 할인을 위해 고정
 * 블록을 앞으로 가변 블록을 뒤로 옮긴 판이다. A/B 두 갈래 구조는 그대로 두고 두 값을 함께
 * 올렸다. 옛 순서로 되돌리는 스위치는 두지 않는다(되돌림은 git revert 로 한다). 그래서
 * 환경변수에 옛 값 design-v1 이 남아 있으면 알 수 없는 값으로 보고 기본값(design-v4)을 쓴다.
 */
export const DESIGN_PROMPT_VERSIONS = Object.freeze({
  /** `CORE_PRINCIPLES` 미주입 — 외부 앱 동작 재현본. **A/B 검증 전용.** */
  WITHOUT_CORE: "design-v3",
  /** `CORE_PRINCIPLES` 주입 — ~~Q83~~ 결정 정본. */
  WITH_CORE: "design-v4",
});

/** 기본값 = 주입본 고정(~~Q83~~). */
export const DESIGN_PROMPT_VERSION_DEFAULT = DESIGN_PROMPT_VERSIONS.WITH_CORE;

/**
 * 프롬프트 버전 전환 스위치의 이름. **서버 환경변수 한 곳뿐이다.**
 *
 * 저장소 관례상 런타임 설정은 전부 `process.env`에서 읽는다(`gemini.js:45`
 * `GEMINI_API_KEY`, `embeddings.js:57` `GEMINI_EMBEDDING_MODEL`) — 요청 body로 모델
 * 파라미터를 받는 선례가 없다. 프롬프트 선택도 같은 계층에 둔다.
 */
export const DESIGN_PROMPT_VERSION_ENV = "PERFORMANCE_DESIGN_PROMPT_VERSION";

/**
 * 이번 요청에 쓸 설계 리포트 프롬프트 버전을 **서버가** 정한다.
 *
 * **클라이언트는 이 값을 바꿀 수 없다.** 엔드포인트는 요청 body를 보지 않고 이 함수를
 * 호출해야 하며, 그래서 인자가 `env` 하나뿐이다(요청 객체를 받지 않는 시그니처 자체가
 * 계약이다). `design-v3`은 정확히 그 문자열이 환경변수에 들어 있을 때만 선택되고,
 * 오타, 빈 값, 알 수 없는 값은 전부 기본값(`design-v4`)으로 떨어진다. 스위치가 잘못
 * 설정돼도 **주입본이 기본**이라는 ~~Q83~~ 결정이 깨지지 않는다.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {'design-v3'|'design-v4'}
 */
export function resolveDesignPromptVersion(
  env: Record<string, string | undefined> = process.env,
): "design-v3" | "design-v4" {
  const raw = String(env?.[DESIGN_PROMPT_VERSION_ENV] || "").trim();

  return raw === DESIGN_PROMPT_VERSIONS.WITHOUT_CORE
    ? DESIGN_PROMPT_VERSIONS.WITHOUT_CORE
    : DESIGN_PROMPT_VERSION_DEFAULT;
}

/**
 * 설계 리포트 6섹션 — **렌더 순서의 정본**(시안 `3754:4722` 배치 순서, §5.13 「섹션 목록
 * (단정, 배치 순서 그대로)」). 모델 출력 순서와 무관하게 서버가 이 순서로 조립한다
 * (P8 `TOPIC_DETAIL_SECTIONS` 관례).
 *
 * §5.13 실측 표는 7행이지만 7번은 라벨 없이 2번이 다시 나오는 **시안 오류**로 판정됐고
 * (§5.13 「단정 (문제)」, §11-Q13), §8.4 스키마 정의도 「6섹션 고정」이다 → 6섹션.
 *
 * `authoredBy: 'server'`인 섹션은 모델 스키마에 없다(위 「추천 자료 섹션을 모델
 * 스키마에서 뺀 이유」 참조).
 */
export const DESIGN_REPORT_SECTIONS = [
  { id: "final_topic", label: "최종 주제", authoredBy: "model" },
  {
    id: "recommended_resources",
    label: "추천 자료 및 활용 포인트",
    authoredBy: "server",
  },
  {
    id: "required_format",
    label: "안내문 요구 형식 분석",
    authoredBy: "model",
  },
  { id: "overall_direction", label: "수행평가 전체 방향", authoredBy: "model" },
  { id: "writing_structure", label: "작성 구조 설계", authoredBy: "model" },
  { id: "checklist", label: "학생 작성 체크리스트", authoredBy: "model" },
];

/**
 * 키-값 섹션 3종의 행 라벨 — §5.13 「본문 내부 하위 구조 (단정 — 원문 키)」 그대로이며
 * 원문 프롬프트의 하위 키 줄(`find-resources.js:424-427`, `:434-437`, `:440-443`)과도
 * 같은 문자열이다.
 *
 * **라벨을 모델에게 시키지 않고 서버가 붙인다**(P8이 6섹션 라벨을 `TOPIC_DETAIL_SECTIONS`로
 * 뺀 것과 같은 이유). 스키마 필드는 영문 키뿐이라 모델이 라벨을 흔들 자리가 없다.
 */
export const DESIGN_SECTION_ROW_LABELS = Object.freeze({
  final_topic: [
    { key: "topic_name", label: "주제명" },
    { key: "core_meaning", label: "주제의 핵심 의미" },
    { key: "subject_link", label: "선택 과목과 연결되는 지점" },
    { key: "career_link", label: "희망 진로와 연결되는 지점" },
  ],
  required_format: [
    { key: "submission_format", label: "안내문상 제출 형식" },
    { key: "item_vs_criteria", label: "답변해야 할 항목과 평가기준의 구분" },
    { key: "report_structure", label: "이번 리포트에서 따라야 할 글 구조" },
    { key: "cautions", label: "주의할 점" },
  ],
  overall_direction: [
    { key: "core_goal", label: "중심 목표" },
    { key: "analysis_points", label: "분석 포인트" },
    { key: "concept_expression", label: "교과 개념을 드러내는 방식" },
    {
      key: "student_interpretation",
      label: "학생의 해석이 꼭 들어가야 하는 부분",
    },
  ],
});

/**
 * 자료 카드 필드 6종 — §5.13 자료 블록 하위 키, 원문 `find-resources.js:163-172`.
 * `use_point`만 모델이 채우고 나머지는 위닝DB 행에서 온다.
 * 문자열 조립(`:160-175`)은 폐기됐다(§12.1) — `resources[]` 배열이 대신한다.
 */
export const DESIGN_RESOURCE_CARD_FIELDS = Object.freeze([
  { key: "title", label: "자료명", source: "db" },
  { key: "source", label: "출처 정보", source: "db" },
  { key: "link", label: "출처 링크", source: "db" },
  { key: "core_concepts", label: "핵심 개념", source: "db" },
  { key: "use_point", label: "활용 포인트", source: "model" },
  { key: "caution", label: "작성 시 주의", source: "const" },
]);

/** 자료 카드 필드가 비었을 때 채우는 문구. 원문 `find-resources.js:167-171`. */
export const DESIGN_RESOURCE_FIELD_FALLBACKS = Object.freeze({
  source: "출처 정보 확인 필요",
  link: "출처 링크 확인 필요",
  core_concepts: "선택 주제와 직접 관련되는 핵심 개념을 중심으로 확인한다.",
  use_point:
    "자료의 사례와 분석 관점을 본론 근거로 활용하되, 학생의 해석을 덧붙인다.",
  caution:
    "자료 내용을 그대로 옮기지 말고, 선택 주제와 연결되는 부분만 근거로 사용한다.",
});

/**
 * 위닝DB 자료가 0건일 때 `추천 자료 및 활용 포인트` 섹션에 들어가는 3행.
 * 원문 `find-resources.js:154-157`(번호 뼈대 `2. ` 헤더 줄은 섹션 라벨로 흡수).
 * `주의할 점` 행의 문구는 §12.1이 「서비스 신뢰 문구」로 지목한 원문 `:157`이다.
 */
export const DESIGN_EMPTY_RESOURCE_ROWS = Object.freeze([
  {
    label: "자료 활용 기준",
    content:
      "수업 개념과 선택 주제를 직접 연결할 수 있는 도서·기사·기관 자료만 사용한다.",
  },
  {
    label: "작성 방식",
    content:
      "자료명, 저자 또는 기관, 출처 링크를 실제 확인한 뒤 본론의 근거로 정리한다.",
  },
  {
    label: "주의할 점",
    content: "확인하지 않은 자료명이나 링크를 임의로 넣지 않는다.",
  },
]);

/**
 * 마무리(결론) 기본 문구 4줄. 원문 `find-resources.js:25-28`.
 *
 * §12.1 「**문구만** 살린다. 트리거 정규식(`:18`)과 append(`:22-28`)는 폐기. JSON 스키마
 * 필수 필드 + 누락 시 기본값. 번호 접두어 `7.`은 6섹션 구조와 충돌하므로 제거」 그대로다 —
 * 원문은 결론 문단이 없어 보이면 텍스트 뒤에 `7. 마무리 구성 방향`을 통째로 이어 붙였는데
 * (정규식 트리거 → 문자열 append), 6섹션 구조에서는 7번 섹션 자리가 없다. 이 상수는
 * `writing_structure`의 결론 단계가 비었을 때 채우는 **기본값**으로만 쓴다.
 */
export const DESIGN_CONCLUSION_DEFAULT_ROWS = Object.freeze([
  {
    label: "정리 방식",
    content: "안내문 형식에 맞춰 앞에서 다룬 핵심 내용을 2~3가지로 압축한다.",
  },
  {
    label: "새롭게 알게 된 점",
    content:
      "교과 개념과 선택 주제가 실제 문제 이해에 어떻게 도움이 되었는지 정리한다.",
  },
  {
    label: "진로 또는 후속 탐구 연결",
    content:
      "희망 진로와 연결하되 과장하지 말고, 다음에 더 확인할 질문을 제시한다.",
  },
  {
    label: "피해야 할 점",
    content:
      "본문에 없던 새로운 자료나 주장을 마지막에 갑자기 추가하지 않는다.",
  },
]);

/**
 * `작성 구조 설계` 형식 분기 3종. 본문은 원문 `find-resources.js:448-461`(문항형) /
 * `:463-479`(보고서형) / `:481-483`(그 외) 그대로다.
 *
 * §12.1 「`:445-483`의 형식별 3분기는 판정 결과에 해당하는 분기만 조건부 주입」 —
 * 외부는 3분기를 전부 넣고 모델에게 고르게 했다. 하나만 넣으면 토큰이 줄고, 다른 분기의
 * 항목명(`서론`/`본론`)이 카드뉴스형 리포트에 새는 사고도 막는다.
 *
 * 분기 선택 헤더 줄(`문항별 답변형이면:` 등)은 **원문 그대로 남긴다** — 주입된 분기에
 * 대해서는 참인 조건문이고, 지우면 그 아래 항목이 무슨 형식의 것인지 모델이 알 수 없다.
 */
export const DESIGN_WRITING_BRANCHES = Object.freeze({
  question: `
문항별 답변형이면:
문항 1. [문항 내용]
- 답변 방향:
- 넣을 교과 개념:
- 활용 가능한 자료:
- 학생 해석 포인트:
- 피해야 할 점:

문항 2. [문항 내용]
- 답변 방향:
- 넣을 교과 개념:
- 활용 가능한 자료:
- 학생 해석 포인트:
- 피해야 할 점:
`.trim(),

  report: `
보고서형이면:
서론 구성 방향
- 역할:
- 반드시 포함할 내용:
- 도입 문제의식:
- 피해야 할 점:

본론 구성 방향
- 본론 항목 A:
- 본론 항목 B:
- 필요 시 본론 항목 C:

결론 구성 방향
- 탐구 결과 정리 방식:
- 새롭게 알게 된 점:
- 진로 또는 후속 탐구 연결:
- 피해야 할 점:
`.trim(),

  other: `
카드뉴스/발표/칼럼/독서감상문 등 다른 형식이면:
- 해당 형식의 항목명에 맞춰 3~5개 작성 단계를 제시한다.
- 서론/본론/결론이라는 명칭을 억지로 쓰지 않는다.
`.trim(),
});

/**
 * `inferAssessmentStructure`(원문 `find-resources.js:241-299`)의 7유형 → 분기 키.
 * 키 문자열은 원문 `:248`,`:256`,`:264`,`:272`,`:280`,`:288`,`:295`의 리터럴 그대로다
 * (판정 함수 자체의 이식은 §12.2 소관이라 여기서 다시 만들지 않는다).
 *
 * 매핑에 없는 유형은 `report`로 떨어진다 — 원문 16원칙 2조(`안내문 형식이 불명확할
 * 때만 기본 보고서 구조를 사용한다`)가 정한 기본값이 곧 판정 함수의 기본 반환
 * `기본 보고서형`(`:295`)이기 때문이다.
 */
export const DESIGN_WRITING_BRANCH_BY_STRUCTURE_TYPE = Object.freeze({
  "문항별 답변형": "question",
  카드뉴스·홍보물형: "other",
  발표·PPT형: "other",
  칼럼·논술형: "other",
  "안내문 맞춤 작성형": "other",
  탐구보고서형: "report",
  "기본 보고서형": "report",
});

/** @param {string} [structureType] `inferAssessmentStructure().type` */
export function resolveDesignWritingBranch(structureType: string = "") {
  return (
    DESIGN_WRITING_BRANCH_BY_STRUCTURE_TYPE[
      String(structureType || "").trim()
    ] || "report"
  );
}

/**
 * `[사용 허용 자료명 목록]`에 들어갈 값(ⓑ-1). 자료명 나열이 아니라 **id 목록**이다.
 *
 * 모델은 `chosen_resources[].resource_id`로 여기 있는 id만 고를 수 있고, 자료명·출처·
 * 링크는 서버가 같은 id로 위닝DB 행을 찾아 채운다. 자료명을 곁들이는 이유는 id만으로는
 * 무엇을 고를지 판단할 수 없기 때문이며, 그 자료명이 출력으로 흘러나가지 않는 것은
 * 스키마에 자료명 필드가 아예 없다는 사실이 보장한다.
 *
 * ⚠ `id`는 **짧고 안정적인 핸들**(`R1`, `R2` …)을 넘겨라. uuid 36자를 그대로 넣으면
 * 토큰을 먹고, 모델이 한 글자 틀리면 그 자료가 통째로 사라진다. 핸들 ↔ 실제 행 매핑은
 * 호출부가 들고 있는다(프롬프트 모듈은 id 정책을 정하지 않는다).
 *
 * @param {Array<{id: string, title: string}>} [resources]
 */
export function buildAllowedResourceList(
  resources: Array<{ id?: string; title?: string }> = [],
) {
  const lines = (Array.isArray(resources) ? resources : [])
    .map((resource) => ({
      id: String(resource?.id || "").trim(),
      title: String(resource?.title || "").trim(),
    }))
    .filter((resource) => resource.id && resource.title)
    .map((resource) => `- ${resource.id} | ${resource.title}`);

  return lines.length ? lines.join("\n") : NO_ALLOWED_RESOURCE_TEXT;
}

/**
 * 설계 리포트 system 프롬프트 — 원문 본문(v1)과 `CORE_PRINCIPLES` 주입본(v2)을 **둘 다**
 * 빌드한다.
 *
 * @param {object} params
 * @param {'design-v3'|'design-v4'} [params.promptVersion] `resolveDesignPromptVersion()`
 *   결과를 넘겨라. 알 수 없는 값은 기본값(주입본)으로 떨어진다.
 * @param {string} [params.structureType] `inferAssessmentStructure().type` (원문 `:403`)
 * @param {string} [params.structureReason] 같은 함수의 `reason` (원문 `:404`)
 * @param {string} [params.writingFrame] 같은 함수의 `writingFrame` (원문 `:406`)
 * @param {string} [params.writingBranch] 분기 강제 지정(테스트용). 없으면 `structureType`에서 유도
 * @param {string} [params.resourceKnowledgeText] 자료 RAG 결과(`purpose:'resource'`)
 * @param {Array<{id: string, title: string}>} [params.allowedResources] 위닝DB 자료 후보
 * @param {string} [params.studentHistoryText] 학생 과거 수행 RAG 결과
 */
export function buildDesignReportSystem({
  promptVersion = DESIGN_PROMPT_VERSION_DEFAULT,
  structureType = "",
  structureReason = "",
  writingFrame = "",
  writingBranch = "",
  resourceKnowledgeText = "",
  allowedResources = [],
  studentHistoryText = "",
}: {
  promptVersion?: string;
  structureType?: string;
  structureReason?: string;
  writingFrame?: string;
  writingBranch?: string;
  resourceKnowledgeText?: string;
  allowedResources?: Array<{ id?: string; title?: string }>;
  studentHistoryText?: string;
} = {}) {
  const branchKey = writingBranch || resolveDesignWritingBranch(structureType);
  const branchText =
    DESIGN_WRITING_BRANCHES[branchKey] || DESIGN_WRITING_BRANCHES.report;

  // ⓐ 원문 본문. v1은 이것 그대로이고, v2는 이 앞에 두 블록이 더 붙을 뿐이다.
  //
  // 블록 순서는 캐시 할인 조건에 맞춘다. 문구는 그대로 두고 순서만 다음처럼 바꿨다.
  //   고정: 역할, 목표, 중요 원칙, 출력 방식부터 학생 작성 체크리스트까지의 섹션 뼈대
  //   준고정: 작성 구조 설계 + 분기 본문. 분기가 3가지뿐이라 고정 묶음 바로 뒤에 둔다.
  //   가변: 안내문 구조 판정, 자료 DB, 허용 자료 목록, 주의 문단, 학생 과거 수행 RAG
  // `주의:` 문단은 고정 문자열이지만 `위 [사용 허용 자료명 목록]`을 가리키므로 그 목록
  // 바로 뒤에 붙여 함께 옮겼다. 떼어 앞으로 보내면 "위"가 틀린 말이 된다. 중요 원칙 8조의
  // `아래 위닝 수행 자료 DB`는 자료 DB 블록이 여전히 아래에 있어 참이다. 섹션 뼈대 안에서
  // 작성 구조 설계가 체크리스트 뒤로 갔지만 섹션 순서는 응답 스키마가 정하므로 출력 순서는
  // 바뀌지 않는다.
  const body = `
당신은 고등학생 수행평가 설계 리포트 작성 전문가입니다.

목표:
학생이 선택한 주제에 대해 "통합 수행평가 설계 리포트"를 작성한다.
단, 안내문이 요구하는 제출 형식과 글 구조를 먼저 분석하고 그 구조에 맞춰 리포트를 구성한다.

중요 원칙:
1. 안내문이 문항별 답변, 카드뉴스, 발표, 칼럼, 독서감상문, 탐구보고서 등 특정 형식을 요구하면 그 형식을 우선한다.
2. 안내문 형식이 불명확할 때만 기본 보고서 구조를 사용한다.
3. 서론/본론/결론 구조를 모든 경우에 강제로 적용하지 않는다.
4. 평가 기준의 "~하였는가" 문장은 학생이 답해야 할 질문으로 착각하지 않는다.
5. "핵심 질문"은 탐구 설계를 돕기 위한 질문이지 제출폼의 문항으로 둔갑시키지 않는다.
6. 전체 분량은 너무 길게 쓰지 말고, 핵심만 압축한다.
7. 학생이 그대로 제출할 수 있는 완성문을 쓰지 않는다. 반드시 구성 방향, 포함 요소, 전개 순서로 쓴다.
8. 추천 자료는 아래 위닝 수행 자료 DB에 실제로 제시된 자료만 사용한다.
9. 위닝 수행 자료 DB에 있는 자료명, 출처, 출처 링크만 그대로 사용한다.
10. DB에 없는 자료명, 링크, 저자, 기관명, 검색 키워드는 절대 만들지 않는다.
11. 자료가 부족하면 자료 2, 자료 3을 억지로 채우지 않는다.
12. 자료 부족 여부, DB, 내부 자료, RAG, 사용 허용 자료명 목록 같은 시스템 내부 표현은 학생에게 보이는 출력에 쓰지 않는다.
13. '확인 필요 (전문 서적 또는 학술 자료 검색)'처럼 존재하지 않는 자료를 검색 키워드 형태로 만들지 않는다.
14. 출력에 *, **, ## 같은 마크다운 기호를 쓰지 않는다.
15. 학생 과거 수행 기록을 참고하여 이미 사용한 주제와 자료는 그대로 반복하지 않는다.
16. 과거 수행과 유사한 흐름이 있으면 이번 선택 주제에 맞게 심화·확장 방향으로 재구성한다.

출력 방식:
안내문이 문항별 답변형이면 문항별 작성 방향을 제시하고, 보고서형이면 서론/본론/결론 흐름을 제시하라.

최종 주제
- 주제명:
- 주제의 핵심 의미:
- 선택 과목과 연결되는 지점:
- 희망 진로와 연결되는 지점:

추천 자료 및 활용 포인트
- 이 항목은 시스템이 위닝 수행 자료 DB에서 확인된 자료만으로 최종 보정한다.
- 자료가 부족해도 검색 키워드나 가상의 자료명을 만들지 않는다.

안내문 요구 형식 분석
- 안내문상 제출 형식:
- 답변해야 할 항목과 평가기준의 구분:
- 이번 리포트에서 따라야 할 글 구조:
- 주의할 점:

수행평가 전체 방향
- 중심 목표:
- 분석 포인트:
- 교과 개념을 드러내는 방식:
- 학생의 해석이 꼭 들어가야 하는 부분:

학생 작성 체크리스트
- 체크 1:
- 체크 2:
- 체크 3:
- 체크 4:
- 체크 5:

작성 구조 설계
${branchText}

[안내문 구조 판정]
- 판정 유형: ${String(structureType || "").trim() || UNKNOWN_FIELD_TEXT}
- 판정 근거: ${String(structureReason || "").trim() || UNKNOWN_FIELD_TEXT}
- 우선 작성 틀:
${String(writingFrame || "").trim() || UNKNOWN_FIELD_TEXT}

[홈페이지 위닝 수행 자료 DB]
${String(resourceKnowledgeText || "").trim() || NO_RESOURCE_KNOWLEDGE_TEXT}

[사용 허용 자료명 목록]
${buildAllowedResourceList(allowedResources)}

주의: chosen_resources 필드에는 위 [사용 허용 자료명 목록]에 있는 자료 id만 쓸 수 있다. 목록이 '없음'이면 id를 만들지 말고 chosen_resources를 빈 배열로 두며, 학생용 표현으로 자료 확인이 필요하다고만 정리하라. 학생에게 보이는 출력에는 DB, 내부 자료, RAG, 검증 자료 부족이라는 표현을 쓰지 마라.

[학생 과거 수행 RAG]
${String(studentHistoryText || "").trim() || NO_STUDENT_HISTORY_TEXT}
`.trim();

  if (promptVersion === DESIGN_PROMPT_VERSIONS.WITHOUT_CORE) return body;

  // 기본값(=주입본). 알 수 없는 버전 문자열도 여기로 떨어진다 — ~~Q83~~ 결정이 "주입"이므로
  // 잘못 설정된 스위치가 미주입본을 켜는 방향으로 실패해서는 안 된다.
  return `${CORE_PRINCIPLES}\n\n${CORE_PRINCIPLES_DESIGN_BRIDGE}\n\n${body}`;
}

/**
 * 설계 리포트 user 메시지. 원문 `find-resources.js:493-515`.
 *
 * 필드 소스 매핑(§12.1 「설계 리포트 user 프롬프트 템플릿」 행 — `selectedSavedSession.*`
 * 의존을 세션 객체로 치환):
 *   · `학년/학기` ← `performance_sessions.grade_label` + `semester` (Q10)
 *   · `학교 유형` ← `performance_sessions.school_type` (Q61-ⓔ)
 *   · `선택 과목` ← `subject_group / subject` 결합
 *   · `이전 주제` ← `previous_topic`, 없으면 원문 리터럴 `'없음'`
 *
 * ⚠ 원문 `:339-341`의 하드코딩 폴백 3종(`grade || '고등학생'`, `subject || '국어'`,
 *   `school_type || '일반고'`)은 **하나도 이식하지 않는다.** §8.3·§12.1이 `'일반고'`에
 *   대해 못박은 규정이고, 나머지 둘도 같은 성격의 거짓값이다 — `'국어'` 폴백은 과목이
 *   비었을 때 국어 리포트를 만들어 내고 그 결과가 그대로 저장된다. 값이 없으면 전부
 *   `미입력`을 렌더한다.
 *
 * @param {object} params
 * @param {string} [params.selectedTopic] 확정 주제명
 * @param {string} [params.selectedTopicDetail] 확정 주제의 6요소 상세를 평문으로 편 결과
 *   (직렬화는 호출부 몫 — P8이 `assessmentText`를 다룬 방식과 같다)
 * @param {string} [params.gradeLabel]
 * @param {string} [params.semester]
 * @param {string} [params.schoolType]
 * @param {string} [params.subjectGroup]
 * @param {string} [params.subject]
 * @param {string} [params.career]
 * @param {string} [params.previousTopic]
 * @param {string} [params.assessmentText] 수행평가 안내문 요약
 */
export function buildDesignReportUser({
  selectedTopic = "",
  selectedTopicDetail = "",
  gradeLabel = "",
  semester = "",
  schoolType = "",
  subjectGroup = "",
  subject = "",
  career = "",
  previousTopic = "",
  assessmentText = "",
}: {
  selectedTopic?: string;
  selectedTopicDetail?: string;
  gradeLabel?: string;
  semester?: string;
  schoolType?: string;
  subjectGroup?: string;
  subject?: string;
  career?: string;
  previousTopic?: string;
  assessmentText?: string;
} = {}) {
  const gradeText =
    [gradeLabel, semester]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ") || UNKNOWN_FIELD_TEXT;

  const subjectText =
    [subjectGroup, subject]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" / ") || UNKNOWN_FIELD_TEXT;

  return `
[선택 주제]
${String(selectedTopic || "").trim() || UNKNOWN_FIELD_TEXT}

[선택 주제 상세]
${String(selectedTopicDetail || "").trim() || NO_TOPIC_DETAIL_TEXT}

[학생 정보]
- 학년/학기: ${gradeText}
- 학교 유형: ${String(schoolType || "").trim() || UNKNOWN_FIELD_TEXT}
- 선택 과목: ${subjectText}
- 희망 진로: ${String(career || "").trim() || UNKNOWN_FIELD_TEXT}
- 이전 주제: ${String(previousTopic || "").trim() || NO_PREVIOUS_TOPIC_TEXT}

[수행평가 안내문 요약]
${String(assessmentText || "").trim() || NO_ASSESSMENT_INFO_TEXT}

작업:
- 선택 주제를 기준으로 통합 수행평가 설계 리포트를 작성하라.
- 추천 자료는 확인된 자료만 사용하고, 자료가 부족하면 임의로 만들지 마라.
- 주제 관련 정보와 안내문 요구 형식에 맞춘 작성 구조를 하나의 리포트에 넣어라.
- 안내문이 기본 보고서형일 때만 서론/본론/결론을 쓰고, 문항형·카드뉴스형·발표형이면 해당 형식에 맞춰 작성 단계를 제시하라.
`.trim();
}

/**
 * 설계 리포트 `responseSchema`(§8.4 표 「설계 리포트」 행 + §8.5 블록 스키마 + §5.13 실측).
 *
 * ── 왜 `sections: Block[]` 배열이 아니라 **섹션별 이름 필드**인가 ────
 *   §8.5의 저장 계약은 `sections[{id,label,blocks[]}]`이 맞다. 하지만 그 형태를 **모델
 *   출력 스키마로 그대로 쓰면** ① 섹션 id·label·순서를 모델이 매번 다시 만들어야 하고
 *   ② `blocks[]`는 kind별로 필드가 달라 재귀/`anyOf`가 필요하며(Gemini structured output에
 *   `$ref`가 없다) ③ 라벨이 모델 손에 있으니 §5.13 실측 문자열이 흔들린다.
 *   P8이 같은 문제를 이미 이렇게 풀었다 — 모델은 **값만** 내고, 라벨·순서·구조는
 *   `TOPIC_DETAIL_SECTIONS` 상수가 서버 쪽에서 붙였다. 여기서도 모델은 값만 내고,
 *   `DESIGN_REPORT_SECTIONS` + `DESIGN_SECTION_ROW_LABELS`가 §8.5 블록으로 조립한다.
 *
 * ── `number` 타입 필드가 하나도 없다 (§8.4 완화책 ⓐ) ────────────────
 *   순번은 전부 배열 인덱스다: `analysis_points`(§5.13 「번호 목록」)도, `checklist`
 *   (`체크 1`~`체크 5`)도, `writing_structure.steps`(`문항 1.`/`문항 2.`)도 문자열
 *   배열이고 번호는 서버가 붙인다. `gemini-2.5-flash`의 숫자 리터럴 반복 루프가
 *   발동할 자리를 남기지 않는다.
 *
 * ── §5.13 대조 ────────────────────────────────────────────────────
 *   1 최종 주제              → `final_topic` 4행 (실측 4키 그대로)
 *   2 추천 자료 및 활용 포인트 → **스키마에 없음.** `chosen_resources`(id + 활용 포인트)만
 *     받고 서버가 위닝DB 행으로 카드 6필드를 조립한다(위 「모델 스키마에서 뺀 이유」)
 *   3 안내문 요구 형식 분석   → `required_format` 4행
 *   4 수행평가 전체 방향      → `overall_direction` 4행(`분석 포인트`만 배열)
 *   5 작성 구조 설계          → `writing_structure.steps[{title, rows[]}]` — 형식 분기마다
 *     하위 키가 달라(서론: 역할/반드시 포함할 내용/…, 문항형: 답변 방향/넣을 교과 개념/…)
 *     라벨을 enum으로 고정할 수 없다. 어떤 라벨을 쓸지는 주입된 분기 원문이 지시한다
 *   6 학생 작성 체크리스트    → `checklist` 5건 고정
 *   7 (라벨 없이 자료 재등장) → **시안 오류로 판정돼 스키마에 없다**(§5.13, §11-Q13)
 */
export const DESIGN_REPORT_SCHEMA = {
  type: "object",
  properties: {
    final_topic: {
      type: "object",
      properties: {
        topic_name: { type: "string" },
        core_meaning: { type: "string" },
        subject_link: { type: "string" },
        career_link: { type: "string" },
      },
      required: ["topic_name", "core_meaning", "subject_link", "career_link"],
      propertyOrdering: [
        "topic_name",
        "core_meaning",
        "subject_link",
        "career_link",
      ],
    },
    required_format: {
      type: "object",
      properties: {
        submission_format: { type: "string" },
        item_vs_criteria: { type: "string" },
        report_structure: { type: "string" },
        cautions: { type: "string" },
      },
      required: [
        "submission_format",
        "item_vs_criteria",
        "report_structure",
        "cautions",
      ],
      propertyOrdering: [
        "submission_format",
        "item_vs_criteria",
        "report_structure",
        "cautions",
      ],
    },
    overall_direction: {
      type: "object",
      properties: {
        core_goal: { type: "string" },
        // §5.13 실측: `분석 포인트:`만 번호 목록이다. 번호는 서버가 붙인다.
        analysis_points: {
          type: "array",
          minItems: 2,
          maxItems: 6,
          items: { type: "string" },
        },
        concept_expression: { type: "string" },
        student_interpretation: { type: "string" },
      },
      required: [
        "core_goal",
        "analysis_points",
        "concept_expression",
        "student_interpretation",
      ],
      propertyOrdering: [
        "core_goal",
        "analysis_points",
        "concept_expression",
        "student_interpretation",
      ],
    },
    writing_structure: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          // 문항형 안내문은 문항 수만큼 단계가 늘고, `그 외` 형식은 원문이 `3~5개`로
          // 못박는다(`find-resources.js:482`). 상한은 두지 않는다 — `steps`·`rows`처럼
          // 중첩된 배열에 `maxItems`를 걸면 Gemini가 스키마 컴파일 단계에서
          // `400 INVALID_ARGUMENT "schema produces a constraint that has too many
          // states"`로 거부해 설계 리포트가 한 번도 생성되지 않았다(2026-08-27 dev 실측).
          // 분량 상한은 `maxOutputTokens`가 맡는다.
          minItems: 1,
          items: {
            type: "object",
            properties: {
              // `서론 구성 방향` / `문항 1. [문항 내용]` 같은 단계 제목.
              title: { type: "string" },
              rows: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    content: { type: "string" },
                  },
                  required: ["label", "content"],
                  propertyOrdering: ["label", "content"],
                },
              },
            },
            required: ["title", "rows"],
            propertyOrdering: ["title", "rows"],
          },
        },
      },
      required: ["steps"],
      propertyOrdering: ["steps"],
    },
    // 원문 뼈대가 `체크 1:` ~ `체크 5:`로 5개를 고정한다(`find-resources.js:486-490`).
    checklist: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "string" },
    },
    // §8.4 「`chosen_resource_ids: string[]`(최대 3) + 자료별 `use_point`」.
    // **두 배열을 나란히 두지 않고 객체 배열 하나로 합쳤다** — 병렬 배열은 길이가
    // 어긋나는 순간 활용 포인트가 엉뚱한 자료에 붙고, 그 오류는 렌더까지 조용히 간다.
    chosen_resources: {
      type: "array",
      minItems: 0,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          resource_id: { type: "string" },
          use_point: { type: "string" },
        },
        required: ["resource_id", "use_point"],
        propertyOrdering: ["resource_id", "use_point"],
      },
    },
  },
  required: [
    "final_topic",
    "required_format",
    "overall_direction",
    "writing_structure",
    "checklist",
    "chosen_resources",
  ],
  propertyOrdering: [
    "final_topic",
    "required_format",
    "overall_direction",
    "writing_structure",
    "checklist",
    "chosen_resources",
  ],
};

/**
 * 설계 리포트 생성 파라미터. 원문 `find-resources.js:517-520`(§12.3 「생성 호출 파라미터」).
 *
 * `temperature 0.25`는 원문 값 그대로다.
 *
 * ── `maxOutputTokens` 산정 (원문 5200 → 8192). **P8 값을 그대로 쓰지 않았다.**
 *    P8(주제 추천)은 6144인데 이 엔드포인트는 출력 규모가 다르므로 §5.13 실측 높이에서
 *    새로 산정한다. 시안 `3754:4722` 본문 폭은 1128px, 행높이 21px이라 **섹션 본문 높이
 *    ÷ 21 = 줄 수**, 줄당 한국어 약 55자로 환산한다:
 *
 *      섹션                        실측 높이   ≈줄    ≈한국어 자수
 *      최종 주제                     197px      9        500
 *      안내문 요구 형식 분석          155px      7        400
 *      수행평가 전체 방향             323px     15        850
 *      작성 구조 설계                 932px     44      2,450
 *      학생 작성 체크리스트           134px      6        350
 *      추천 자료(모델 몫 = use_point ×3)  —      —        250
 *      ─────────────────────────────────────────────────────
 *      시안 규모 합계                                  ≈4,800자
 *
 *    시안보다 나쁜 경우가 **문항형 안내문**이다 — `writing_structure.steps`가 스키마 상한
 *    12단계까지 늘고(문항 12개), 단계마다 5행이면 12×5×70자 ≈ 4,200자라 저 표의 2,450을
 *    대체한다 → **최악 ≈6,550자.** 여기에 JSON 키·따옴표·중괄호·쉼표 ≈700 ASCII자가 얹힌다.
 *
 *    `gemini-2.5-flash`는 `responseMimeType:'application/json'`에서 한국어를 UTF-8 원문으로
 *    낸다(`\uXXXX` 이스케이프를 강제하지 않는다). 한국어를 **1자 = 1토큰**으로 보수적으로
 *    잡으면 6,550 + JSON 오버헤드 ≈ **6,750토큰**이 최악값이다.
 *      · 8192 → 최악 대비 여유 ≈21%, 시안 규모(≈5,000토큰) 대비 ≈64%.
 *      · 원문 5200을 그대로 두면 문항형에서 **통상적으로** 잘린다(=매번 MAX_TOKENS 재시도).
 *    §12.3이 이 값을 「실측 재조정」 대상으로 명시했으므로 운영 관측 후 다시 내린다.
 */
export const DESIGN_GENERATION_DEFAULTS = {
  temperature: 0.25,
  maxOutputTokens: 8192,
};

/**
 * 재시도용 상한(§8.4 완화책 ⓑ+ⓒ). 같은 값으로 다시 부르면 같은 자리에서 다시 잘린다.
 * 위 최악값(≈6,750토큰)의 1.8배라, 산정이 빗나가 8192에서 잘리는 경우에도 재시도 한 번으로
 * 회수된다. 이 값에서도 `MAX_TOKENS`면 절단이 아니라 결함 ①(숫자 리터럴 반복 루프)일
 * 가능성이 높으므로 더 올리지 않고 422로 끝낸다.
 */
export const DESIGN_MAX_OUTPUT_TOKENS_RETRY = 12288;

// ─────────────────────────────────────────────────────────────────────
// 평가 리포트 (P11)
// ─────────────────────────────────────────────────────────────────────
// 원문: `suhaengpyeong/api/evaluate-text.js:62-122`(system, 본문 63-121) /
//       `:124-152`(user, 본문 125-151) / `:37-41`(최소 길이 거절) /
//       `:154-158`(생성 파라미터).
//
// 외부 앱의 **2번째 `CORE_PRINCIPLES` 주입 지점**이다(`:63`) — 신설이 아니라 원문 그대로의
// 계승이라 설계 리포트(Q83)와 달리 병합 검토가 필요 없다. 다만 `CORE_PRINCIPLES` 뒤에
// 무엇이 오는지는 달라진다(아래 Q68 연결 블록).
//
// ── 원문 유지 ↔ 스키마 대체 경계 (§8.4 ~~Q69~~ 예외, §12.1 「평가 system 프롬프트」 행)
//
//   ⓐ 원문 그대로 유지 — 도메인 규칙
//        `:65-67`  역할 3줄(주제/자료 추천 데이터를 쓰지 않는다는 선언 포함)
//        `:69`     `출력 규칙:` 헤더
//        `:70`     **마크다운 금지.** §12.1이 이 줄을 명시적으로 지목한다 —
//                  `responseSchema`는 JSON **구조**만 강제할 뿐 문자열 **값 안**의
//                  `**강조**`를 막지 못하고, 클라이언트 `stripMarkdown` 폴백
//                  (`index.html:3094`)은 §12.4로 폐기됐다. 유일한 방어선이다.
//        `:73-80`  3분할 분량 지시 / 근거 제시 / 표절 지적 / 평가 기준 연결 /
//                  **제출물 부족 판정**(`:77`) / 학교 유형 참고 정보 한정 /
//                  과목 수준 판단 + 안내문 우선 / **전문교과 처리 예외**(`:80`)
//        `:83`     `평가 형식:` 헤더
//        `:86-88`, `:91-93`, `:96-98`, `:101-103`, `:106-108` 3분할 하위 키 15줄
//        `:111`    표절 항목 하위 키
//        `:114-117` 누적 기록용 요약 4키
//        `:121`    `- 총평:`
//
//   ⓑ 번호만 재부여 — 문자열 본문은 1바이트도 안 바뀐다
//        출력 규칙 `:70`,`:73`~`:80` → **1~9로 연속 재부여**(P8이 주제 추천 의미 규칙
//        5개에 쓴 것과 같은 처리, §12.1 「번호만 1~5로 재부여」).
//        평가 형식 항목 제목 8개(`:85`,`:90`,`:95`,`:100`,`:105`,`:110`,`:113`,`:119`)
//        → **번호 접두어만 제거**하고 축 이름은 그대로(P10이 설계 리포트 섹션 제목
//        6줄에 쓴 것과 같은 처리). 축 이름은 곧 렌더 라벨이라
//        `EVALUATION_REPORT_SECTIONS`가 그대로 물려받는다.
//
//   ⓒ 스키마로 대체해 **삭제** — 출력 포맷 강제 지시뿐
//        `:71`  「항목은 숫자 번호로 구분한다」 — 번호 자체가 사라졌다
//        `:72`  「반드시 1번부터 8번까지 …」  — `required` 전 필드가 대신한다
//        `:81`  「마지막 줄은 반드시 "평가 리포트 종료"」 — §12.1이 종료 마커를
//               명시적으로 폐기 대상으로 지정
//
//   ⓓ 문구 교체 1줄
//        `:120` `- 예상 점수: X점 / 100점` → `score` 필드 지시.
//        §12.1: 「8번의 `예상 점수: X점 / 100점`은 **`score` 별도 필드로 뽑는 지시
//        추가**(시안 `86/100` 카드)」.
//
//   ⓔ 신규 연결 블록 — Q68 제출 형식 주입 (아래 `EVALUATION_FORMAT_BRIDGE_RULES`)
//
// ⚠️ **텍스트 파서 폴백을 두지 않는다**(§12.4 — 프론트 텍스트 파서 전량
//    `index.html:1769-1851` 폐기). 구조화 출력이 실패하면 재시도하고, 그래도 실패하면
//    에러를 반환한다.

/**
 * 평가 리포트 7섹션 — §8.5 「평가 리포트 = 카드 1 + sections 7」.
 *
 * ⚠️ **프롬프트 항목은 8개인데 렌더 계약은 7섹션이다.** §5.16의 섹션 목록 8행은
 * *프롬프트 항목 번호* 기준 표기이며, 1번 `종합 평가 점수`는 `score`/`summary`
 * 스칼라 2개로 **승격**돼 `sections`에서 빠진다(명세 L1787 단정).
 *
 *   프롬프트 항목                    계약상 위치            kind
 *   1 종합 평가 점수                 score + summary        (sections 아님)
 *   2 평가 기준 충족도               sections[0]            triad
 *   3 주제 적합성                    sections[1]            triad
 *   4 내용 구성                      sections[2]            triad
 *   5 자료 활용                      sections[3]            triad
 *   6 진로 및 심화 탐구 연결성       sections[4]            triad
 *   7 표절 위험 문장                 sections[5]            note
 *   8 누적 기록용 요약               sections[6]            keyValue
 *
 * **7·8번에 `good/bad/improve`를 강제하면 빈 필드가 나오거나 모델이 억지로 채운다**
 * (§8.4·§5.16 실측) — 그래서 kind가 셋으로 갈린다.
 *
 * `label`은 원문 평가 형식 제목(`evaluate-text.js:85`,`:90`,`:95`,`:100`,`:105`,`:110`,
 * `:113`)에서 번호 접두어만 뗀 문자열이고, §5.16 시안 섹션 라벨과도 일치한다.
 */
export const EVALUATION_REPORT_SECTIONS = [
  { id: "rubric_fit", label: "평가 기준 충족도", kind: "triad" },
  { id: "topic_fit", label: "주제 적합성", kind: "triad" },
  { id: "content_structure", label: "내용 구성", kind: "triad" },
  { id: "resource_use", label: "자료 활용", kind: "triad" },
  { id: "career_link", label: "진로 및 심화 탐구 연결성", kind: "triad" },
  { id: "plagiarism", label: "표절 위험 문장", kind: "note" },
  { id: "record_summary", label: "누적 기록용 요약", kind: "keyValue" },
];

/**
 * 3분할 행 라벨. 원문 `evaluate-text.js:86-88`의 `- 잘한 점:` / `- 아쉬운 점:` /
 * `- 보완할 점:`에서 `- `와 `:`만 뗀 것이며 §5.16 실측 문자열과 같다.
 * 스키마 필드명 → 렌더 라벨 사상을 여기 한 곳에서만 정한다.
 */
export const EVALUATION_TRIAD_ROW_LABELS = Object.freeze([
  { key: "good", label: "잘한 점" },
  { key: "bad", label: "아쉬운 점" },
  { key: "improve", label: "보완할 점" },
]);

/**
 * `누적 기록용 요약` 4키. 원문 `evaluate-text.js:114-117` 순서 그대로.
 * §8.4가 `minItems/maxItems:4`로 못박은 그 4행이다.
 */
export const EVALUATION_RECORD_SUMMARY_ROW_LABELS = Object.freeze([
  { key: "core_summary", label: "수행 핵심 요약" },
  { key: "keywords", label: "핵심 키워드" },
  { key: "same_subject_next", label: "같은 과목에서 다음에 심화할 방향" },
  { key: "cross_subject_next", label: "다른 과목으로 확장 가능한 방향" },
]);

/**
 * 승격된 점수 카드의 라벨 2종. 원문 `:119`(항목 제목, 번호 제거) / `:121`(하위 키).
 * §5.16 실측 헤더는 `종합 평가 점수`이고 본문에 `86/100` + `총평:`이 온다.
 */
export const EVALUATION_SCORE_CARD_LABELS = Object.freeze({
  score: "종합 평가 점수",
  summary: "총평",
});

/**
 * 제출물 최소 길이 임계값. 원문 `evaluate-text.js:37`의 **100을 그대로 유지**한다.
 *
 * ⚠️ **측정 대상만 바뀐다**(§12.2 L2373 결정 = Q35). 외부는 클라이언트가
 * `라벨 + 주제 + 본문`을 결합해 만든 문자열의 `.trim().length`를 재기 때문에
 * 라벨·주제만으로 이미 100자를 넘겨 **사실상 항상 통과**했다. 여기서는
 * `countSubmissionChars()`가 **필드 값 순수 본문의 합**만 센다.
 */
export const SUBMISSION_MIN_CHARS = 100;

/**
 * `[평가 기준]` 블록이 비었을 때 렌더하는 리터럴. 원문 `evaluate-text.js:59`.
 *
 * ⚠️ 설계 리포트의 `NO_ASSESSMENT_INFO_TEXT`(`'안내문 정보 없음'`, `find-resources.js:508`)와
 * **다른 문자열이다.** 두 원문이 서로 다른 문구를 쓰므로 통일하지 않는다 — 통일하는 순간
 * 어느 한쪽이 원문 이식이 아니게 된다.
 */
export const NO_ASSESSMENT_CRITERIA_TEXT = "평가 기준 정보 없음";

/** 원문 `evaluate-text.js:34` — 제출물이 비었을 때. `400 EMPTY_SUBMISSION`의 message. */
export const EMPTY_SUBMISSION_MESSAGE = "평가할 제출물이 필요합니다.";

/** 원문 `evaluate-text.js:39` — 최소 길이 미달. `400 SUBMISSION_TOO_SHORT`의 message. */
export const SUBMISSION_TOO_SHORT_MESSAGE =
  "제출물이 너무 짧습니다. 실제 수행평가 제출물을 입력한 뒤 평가해주세요.";

// ⚠️ **글자 수 계산 함수는 이 파일에 두지 않는다.**
//    P11 초기에 여기에도 `countSubmissionChars(fields)`가 있었는데(모든 키를 UTF-16
//    `.length`로 셈), 정본인 `submission-chars.js`의 것과 **이름은 같고 시그니처·계산식이
//    달랐다**(정본은 `(schemaFields, values)`로 스키마 선언 키만, 공백을 접어 코드 포인트로
//    센다). 이름이 겹치는 한, 실수로 이쪽을 import해 `(schema, fields)`로 부르면 인자 2개를
//    조용히 삼키고 **스키마 객체의 키들**을 세어 항상 100자를 넘는 total을 돌려준다 —
//    게이트가 무력화되는데 에러는 나지 않는다(검토 P11). 유일한 호출부였던
//    `api/_lib/performance/prompts.test.ts`(옛 scripts/verify-performance-prompt-parity.mjs)가 정본을 쓰도록 바꾸고 사본을 지웠다.
//    임계값 상수(`SUBMISSION_MIN_CHARS`)만 원문 `evaluate-text.js:37`의 기록으로 남는다.

// ─────────────────────────────────────────────────────────────────────
// Q68 — 제출 형식 주입 (연결 블록)
// ─────────────────────────────────────────────────────────────────────
// **문제.** 외부 평가 프롬프트는 제출 형식을 모른다. `평가 형식:` 8항목이 보고서를
// 전제하므로 문항형·카드뉴스형 제출물도 보고서 기준으로 채점된다. 설계 리포트(P10)는
// `inferAssessmentStructure` 판정을 프롬프트에 주입해 이 문제를 이미 풀었는데
// (`find-resources.js:402-406` 원문 `[안내문 구조 판정]` 블록), 평가 단계에는 그
// 대응물이 없다.
//
// **결정 — 주입한다.** 단 §12.1 「1바이트도 변경 금지」를 지킨다. P10이
// `CORE_PRINCIPLES_DESIGN_BRIDGE`에서 쓴 방식을 그대로 적용한다:
// **원문은 한 글자도 고치지 않고, 신규 연결 블록을 원문 사이에 끼워** 컨텍스트와
// 우선순위를 명시한다.
//
// **배치 — 출력 규칙 뒤 / `평가 형식:` 앞.** 두 원문 덩어리 사이의 이음매다. 형식
// 컨텍스트가 필요한 곳이 정확히 `평가 형식:` 8항목을 적용하는 순간이라, 바로 앞이
// 가장 가까운 자리다. 원문 두 덩어리는 각각 통짜로 남으므로 어느 쪽도 훼손되지 않는다.
//
// **8섹션 채점 축 자체는 형식별로 바꾸지 않는다.** 축을 갈아치우면 그건 이식이 아니라
// 재작성이다. 연결 블록은 "이 제출물은 X 형식이니 채점할 때 그 특성을 고려하라"는
// 컨텍스트를 줄 뿐이고, 두 번째 규칙 줄이 축 변경 금지를 명시적으로 못박는다.
//
// **판정 값의 출처**는 P10이 만든 `guide-structure.js:inferGuideStructure()`의
// `{ type, reason, writingFrame }`이다(7유형 — 문항별 답변형 / 카드뉴스·홍보물형 /
// 발표·PPT형 / 칼럼·논술형 / 안내문 맞춤 작성형 / 탐구보고서형 / 기본 보고서형).
// §12.2 3행이 「판정 결과를 구조체로 리포트 JSON에 저장해 STEP5가 재판정하지 않게
// 한다」고 규정했으므로, 평가 단계는 **설계 리포트가 저장해 둔 판정을 그대로 읽는다**
// (같은 세션에서 두 번 판정하면 안내문이 그대로여도 결과가 갈릴 여지가 생긴다).

/**
 * Q68 연결 블록의 **고정 규칙 4줄** — 어느 원문에도 속하지 않는 이 저장소의 신규 자산이다.
 *
 * 1줄: 축 불변(원문 훼손 방지). 2줄: 형식 특성 반영 방향. 3줄: 보고서 구조 강요 금지
 * (이 주입의 실제 목적). 4줄: 안내문 평가 기준 우선 — user 메시지 작업 지시
 * (`evaluate-text.js:150`)와 같은 방향이라 두 지시가 서로를 약화시키지 않는다.
 */
export const EVALUATION_FORMAT_BRIDGE_RULES = `
- 아래 평가 형식의 항목은 제출 형식과 무관하게 전부 그대로 적용한다. 항목을 빼거나 다른 항목으로 바꾸지 않는다.
- 각 항목을 판단할 때 위 제출 형식의 특성을 기준으로 본다.
- 보고서형이 아닌 제출물에 서론·본론·결론 같은 보고서 구조를 갖추라고 요구하지 않는다.
- 이 형식 판정과 수행평가 안내문의 평가 기준이 어긋나면 안내문의 평가 기준을 따른다.
`.trim();

/**
 * Q68 연결 블록 전문을 조립한다. 판정 3요소를 헤더로 얹고 고정 규칙 4줄을 붙인다.
 *
 * 값이 비면 `미입력`을 렌더한다(P10 `[안내문 구조 판정]` 블록과 같은 규칙).
 *
 * @param {object} params
 * @param {string} [params.structureType] `inferGuideStructure().type`
 * @param {string} [params.structureReason] 같은 함수의 `reason`
 * @param {string} [params.writingFrame] 같은 함수의 `writingFrame`
 */
export function buildEvaluationFormatBridge({
  structureType = "",
  structureReason = "",
  writingFrame = "",
}: {
  structureType?: string;
  structureReason?: string;
  writingFrame?: string;
} = {}) {
  return `
[제출 형식 컨텍스트]
- 판정 유형: ${String(structureType || "").trim() || UNKNOWN_FIELD_TEXT}
- 판정 근거: ${String(structureReason || "").trim() || UNKNOWN_FIELD_TEXT}
- 안내문이 요구한 작성 틀:
${String(writingFrame || "").trim() || UNKNOWN_FIELD_TEXT}
${EVALUATION_FORMAT_BRIDGE_RULES}
`.trim();
}

/**
 * 평가 system 프롬프트. 원문 `evaluate-text.js:62-122`(본문 63-121).
 *
 * 조립 순서:
 *   `CORE_PRINCIPLES`(원문 `:63` 그대로) → 원문 앞덩어리(역할 + 출력 규칙)
 *   → **Q68 연결 블록** → 원문 뒷덩어리(평가 형식)
 *
 * 위 경계표 ⓐ~ⓔ가 이 함수의 계약이고, `api/_lib/performance/prompts.test.ts`(옛
 * scripts/verify-performance-prompt-parity.mjs)[9]가 원본 파일과 직접 대조해 지킨다.
 *
 * @param {object} params
 * @param {string} [params.structureType] `inferGuideStructure().type` (Q68)
 * @param {string} [params.structureReason] 같은 함수의 `reason`
 * @param {string} [params.writingFrame] 같은 함수의 `writingFrame`
 */
export function buildEvaluationSystem({
  structureType = "",
  structureReason = "",
  writingFrame = "",
}: {
  structureType?: string;
  structureReason?: string;
  writingFrame?: string;
} = {}) {
  // ⓐ+ⓑ 원문 앞덩어리 — 역할 3줄(`:65-67`) + 출력 규칙(`:69`,`:70`,`:73-80`).
  //    삭제한 것은 `:71`·`:72`(포맷 강제)뿐이고 나머지는 번호만 1~9로 당겨졌다.
  const head = `
당신은 고등학교 수행평가 채점 전문가입니다.
이 단계에서는 주제 추천용 데이터와 자료 추천용 데이터를 사용하지 않습니다.
오직 수행평가 안내문의 평가 기준, 선택 주제, 학생 제출물을 기준으로 평가합니다.

출력 규칙:
1. 마크다운 기호를 쓰지 않는다.
2. 각 항목은 너무 길게 늘이지 말고, 잘한 점/아쉬운 점/보완할 점을 각각 2~4문장으로 작성한다.
3. 구체적 근거와 보완 방향을 제시한다.
4. 표절 위험이 있으면 반드시 지적한다.
5. 평가 기준과 연결해서 판단한다.
6. 실제 제출물이 아닌 주제명, 자료 추천 결과, 빈 문장, 단순 메모처럼 보이는 경우 평가하지 말고 제출물 부족으로 안내한다.
7. 학교 유형은 평가 기준이 아니라 참고 정보로만 활용한다.
8. 과목명이 구체적으로 입력되어 있으면 해당 과목의 수준과 성격을 기준으로 판단한다. 단, 수행평가 안내문의 평가 기준이 더 구체적이면 안내문을 우선한다.
9. 전문교과 과목이라도 학생이 실제 수행평가에서 다룰 수 있는 범위를 기준으로 평가한다.
`.trim();

  // ⓐ+ⓑ+ⓓ 원문 뒷덩어리 — `평가 형식:`(`:83`) + 8항목.
  //    항목 제목 8개는 번호 접두어만 제거했고 하위 키 줄은 전부 원문 그대로다.
  //    유일한 문구 교체가 `:120`(예상 점수 → score 필드 지시)이다.
  const format = `
평가 형식:

평가 기준 충족도
- 잘한 점:
- 아쉬운 점:
- 보완할 점:

주제 적합성
- 잘한 점:
- 아쉬운 점:
- 보완할 점:

내용 구성
- 잘한 점:
- 아쉬운 점:
- 보완할 점:

자료 활용
- 잘한 점:
- 아쉬운 점:
- 보완할 점:

진로 및 심화 탐구 연결성
- 잘한 점:
- 아쉬운 점:
- 보완할 점:

표절 위험 문장
- 특이사항 없음 또는 의심되는 부분:

누적 기록용 요약
- 수행 핵심 요약:
- 핵심 키워드:
- 같은 과목에서 다음에 심화할 방향:
- 다른 과목으로 확장 가능한 방향:

종합 평가
- 예상 점수: score 필드에 0부터 100 사이의 정수만 숫자로 쓴다. 단위, 기호, 설명을 함께 쓰지 않는다.
- 총평:
`.trim();

  const bridge = buildEvaluationFormatBridge({
    structureType,
    structureReason,
    writingFrame,
  });

  // 캐시 할인을 위한 블록 재배치는 이 함수에 적용하지 않는다. 가변 블록인 연결 블록의
  // 고정 규칙이 `아래 평가 형식`과 `위 제출 형식`을 함께 가리키므로, 고정 블록인 평가 형식을
  // 연결 블록 앞으로 옮기면 `아래`가 틀린 말이 된다. 연결 블록은 판정 값과 규칙을 한 문단으로
  // 조립하므로 규칙만 떼어 옮길 수도 없다. 그래서 순서와 EVALUATION_PROMPT_VERSION 을 둔다.
  return `${CORE_PRINCIPLES}\n\n${head}\n\n${bridge}\n\n${format}`;
}

/**
 * 평가 user 메시지. 원문 `evaluate-text.js:124-152`(본문 125-151).
 *
 * **8블록 순서·라벨은 원문 그대로다** — `[평가 기준][선택 주제][희망 진로][학년/학기]
 * [학교 유형][선택 과목][이전에 했던 주제][학생 제출물]`. 마지막 작업 지시 2줄도
 * 원문 그대로이며, 특히 **「내부 위닝DB 자료는 사용하지 말고」(`:151`)를 반드시
 * 유지한다** — 평가 단계는 설계 단계와 정반대 계약이라 여기서 자료를 끌어오면 채점이
 * 오염된다. 그래서 이 함수는 RAG 텍스트 인자를 **아예 받지 않는다**(시그니처가 계약이다).
 *
 * 필드 소스 매핑(§12.1 「평가 user 메시지 템플릿」 행 — 「필드 소스를
 * `performance_sessions` 컬럼으로 매핑만 교체」):
 *   · `[학년/학기]`   ← `grade_label` + `semester` (Q10, 외부는 결합 컬럼 `grade`)
 *   · `[학교 유형]`   ← `school_type` (Q61-ⓔ)
 *   · `[선택 과목]`   ← `subject_group / subject` 결합 (외부는 결합 컬럼 `subject`)
 *   · 나머지는 동명 컬럼
 *
 * ⚠ 원문 `:49`의 `school_type || '일반고'` 폴백은 **이식하지 않는다**(§8.3·§12.1).
 *   값이 없으면 다른 필드와 같이 `미입력`을 렌더한다. `[이전에 했던 주제]`의
 *   원문 리터럴 `'없음'`(`:144`)은 그대로 유지한다 — 「입력하지 않았다」와
 *   「이전 주제가 없다고 답했다」는 다른 상태다.
 *
 * @param {object} params
 * @param {string} [params.assessmentText] 안내문 요약. 원문 기본값 `'평가 기준 정보 없음'`(`:59`)
 * @param {string} [params.selectedTopic]
 * @param {string} [params.career]
 * @param {string} [params.gradeLabel]
 * @param {string} [params.semester]
 * @param {string} [params.schoolType]
 * @param {string} [params.subjectGroup]
 * @param {string} [params.subject]
 * @param {string} [params.previousTopic]
 * @param {string} [params.submissionText] 제출 필드 값을 서버가 조립한 본문
 *   (§8.6 — 「평문 결합 텍스트를 클라이언트가 조립해 보내지 않는다」)
 */
export function buildEvaluationUser({
  assessmentText = "",
  selectedTopic = "",
  career = "",
  gradeLabel = "",
  semester = "",
  schoolType = "",
  subjectGroup = "",
  subject = "",
  previousTopic = "",
  submissionText = "",
}: {
  assessmentText?: string;
  selectedTopic?: string;
  career?: string;
  gradeLabel?: string;
  semester?: string;
  schoolType?: string;
  subjectGroup?: string;
  subject?: string;
  previousTopic?: string;
  submissionText?: string;
} = {}) {
  const gradeText =
    [gradeLabel, semester]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ") || UNKNOWN_FIELD_TEXT;

  const subjectText =
    [subjectGroup, subject]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" / ") || UNKNOWN_FIELD_TEXT;

  return `
[평가 기준]
${String(assessmentText || "").trim() || NO_ASSESSMENT_CRITERIA_TEXT}

[선택 주제]
${String(selectedTopic || "").trim() || UNKNOWN_FIELD_TEXT}

[희망 진로]
${String(career || "").trim() || UNKNOWN_FIELD_TEXT}

[학년/학기]
${gradeText}

[학교 유형]
${String(schoolType || "").trim() || UNKNOWN_FIELD_TEXT}

[선택 과목]
${subjectText}

[이전에 했던 주제]
${String(previousTopic || "").trim() || NO_PREVIOUS_TOPIC_TEXT}

[학생 제출물]
${String(submissionText || "")}

작업:
수행평가 안내문의 평가 기준을 최우선으로 하여 제출물을 평가하세요.
내부 위닝DB 자료는 사용하지 말고, 제출물 자체와 평가 기준만 판단하세요.
`.trim();
}

/**
 * 평가 리포트 `responseSchema`(§8.4 표 「평가 리포트」 행 + §8.5 「카드 1 + sections 7」).
 *
 * ── 왜 `sections: Section[]` + `oneOf`가 아닌가 ─────────────────────
 *   §8.4는 렌더/저장 계약을 `sections[]`의 **kind 분기 3종**(`triad`/`note`/`keyValue`)
 *   으로 규정한다. 그 계약은 그대로 지키되, **모델 출력 스키마만** 섹션별 이름 필드로
 *   편다. 이유 3가지:
 *     ① Gemini structured output에 `oneOf`가 없다. `anyOf`로 흉내 내면 모델이 어느
 *        분기를 골랐는지가 매 섹션마다 자유도가 되고, 7섹션이 5+1+1로 정확히 갈리는
 *        고정 배치를 지킬 강제력이 사라진다.
 *     ② `kind`·`key`·`label`을 모델이 매번 다시 만들어야 한다 — §5.16 실측 라벨이
 *        모델 손에 들어가면 흔들린다.
 *     ③ P10이 설계 리포트에서 이미 같은 판단을 내렸다(`DESIGN_REPORT_SCHEMA` 주석
 *        「모델은 값만 내고, 라벨·순서·구조는 상수가 붙인다」). 두 리포트가 다른
 *        방식을 쓸 이유가 없다.
 *   서버는 이 출력을 `EVALUATION_REPORT_SECTIONS` + `EVALUATION_TRIAD_ROW_LABELS` +
 *   `EVALUATION_RECORD_SUMMARY_ROW_LABELS`로 §8.4가 규정한 kind 3종 형태로 조립한다.
 *   즉 **다운스트림 계약은 §8.4 그대로이고, 달라지는 것은 모델에게 요구하는 형태뿐**이다.
 *
 * ── `number` 타입 필드가 하나도 없다 (§8.4 완화책 ⓐ) ────────────────
 *   `score`가 유일한 수치 필드인데 `string` + `pattern:'^\\d{1,3}$'`로 받고 서버가
 *   `parseEvaluationScore()`로 파싱·범위 검증한다. `gemini-2.5-flash`의 숫자 리터럴
 *   반복 루프 결함(§8.4 결함 ①)이 발동할 자리를 남기지 않는다.
 *
 * ── 7·8번에 3분할을 강제하지 않는다 ─────────────────────────────────
 *   `plagiarism`은 단일 문자열, `record_summary`는 4키 고정 객체다. §8.4:
 *   「7·8번에 `good/bad/improve`를 강제하면 빈 필드가 나오거나 모델이 억지로 채운다」.
 */
/**
 * 3분할 섹션 1개의 모델 출력 형태. 5섹션이 완전히 같은 모양이라 팩토리로 만든다 —
 * 객체 리터럴 하나를 5곳에서 **공유하면** 나중에 누가 한 곳을 손대는 순간 다섯 곳이
 * 같이 바뀐다(그리고 그 사실이 코드에 안 보인다). 호출마다 새 객체를 낸다.
 *
 * 필드명 → 렌더 라벨 사상은 `EVALUATION_TRIAD_ROW_LABELS`가 쥔다.
 */
function evaluationTriadField() {
  return {
    type: "object",
    properties: {
      good: { type: "string" },
      bad: { type: "string" },
      improve: { type: "string" },
    },
    required: ["good", "bad", "improve"],
    propertyOrdering: ["good", "bad", "improve"],
  };
}

export const EVALUATION_REPORT_SCHEMA = {
  type: "object",
  properties: {
    // §8.4 완화책 ⓐ — number 금지. 0~100 범위 검증은 서버(`parseEvaluationScore`).
    // 스키마의 `pattern`은 1차 방어일 뿐이며 서버 검증을 대신하지 않는다.
    score: { type: "string", pattern: "^\\d{1,3}$" },
    summary: { type: "string" },
    rubric_fit: evaluationTriadField(),
    topic_fit: evaluationTriadField(),
    content_structure: evaluationTriadField(),
    resource_use: evaluationTriadField(),
    career_link: evaluationTriadField(),
    plagiarism: { type: "string" },
    record_summary: {
      type: "object",
      properties: {
        core_summary: { type: "string" },
        keywords: { type: "string" },
        same_subject_next: { type: "string" },
        cross_subject_next: { type: "string" },
      },
      required: [
        "core_summary",
        "keywords",
        "same_subject_next",
        "cross_subject_next",
      ],
      propertyOrdering: [
        "core_summary",
        "keywords",
        "same_subject_next",
        "cross_subject_next",
      ],
    },
  },
  required: [
    "score",
    "summary",
    "rubric_fit",
    "topic_fit",
    "content_structure",
    "resource_use",
    "career_link",
    "plagiarism",
    "record_summary",
  ],
  // 원문 평가 형식 항목 순서(1 종합 평가 → 2~8)를 그대로 따른다. Gemini는 이 배열
  // 순서로 필드를 생성하므로, 점수를 먼저 내게 해서 8항목 끝까지 못 가고 잘려도
  // 점수 카드가 살아남는 쪽에 건다.
  propertyOrdering: [
    "score",
    "summary",
    "rubric_fit",
    "topic_fit",
    "content_structure",
    "resource_use",
    "career_link",
    "plagiarism",
    "record_summary",
  ],
};

/**
 * 모델이 낸 `score` 문자열을 정수로 승격한다(§10.2 P11 「score 승격」).
 *
 * ── 왜 서버 파싱인가 ────────────────────────────────────────────────
 *   외부는 종합 점수가 평문 안에 문자열로 섞여 있어(`종합 점수는 86점입니다`, §5.17)
 *   시안의 `86/100` 카드를 만들 수 없다. 그래서 구조화 필드로 승격해야 하는데, 그것을
 *   `number`로 받으면 §8.4 완화책 ⓐ와 정면 충돌한다(숫자 리터럴 반복 루프).
 *   **해결: 스키마는 `string`, 승격은 서버.** 명세 L1619가 같은 결론을 이미 못박았다 —
 *   「모델 응답 스키마는 `string`으로 받고 서버가 `parseInt` 후 이 컬럼에 저장」.
 *
 * ── 파싱 실패 시 동작 ───────────────────────────────────────────────
 *   `null`을 돌려준다. 호출부는 이를 **모델 계약 위반**으로 다뤄 §8.4 완화책 ⓒ·ⓓ대로
 *   재시도하고, 재시도도 실패하면 §8.6이 `evaluate`에 정의한 `502 MODEL_FAILED`로
 *   끝낸다. **점수 없는 평가 리포트를 저장하지 않는다** — `종합 평가 점수`는 §5.16
 *   모달의 1번 카드라 비면 화면이 무너진다.
 *   (`performance_reports.score`가 `null` 허용인 것은 점수가 없는 나머지 리포트 2종
 *    — `design`/`final_submission` — 때문이지, 평가 리포트의 결측 허용이 아니다.
 *    `sql/54_performance_app.sql:322`, `:335-336`)
 *   §12.4대로 **텍스트에서 숫자를 긁어내는 폴백은 두지 않는다.** `86점`·`86/100`
 *   같은 문자열을 정규식으로 건지기 시작하면 폐기한 텍스트 파서가 되살아난다.
 *
 * @param {unknown} raw 모델의 `score` 값
 * @returns {number|null} 0~100 정수, 아니면 `null`
 */
export function parseEvaluationScore(raw: unknown): number | null {
  if (typeof raw !== "string") return null;

  const text = raw.trim();

  // 스키마 `pattern`과 같은 형태만 받는다. `86점`·`86/100`·`팔십육`은 전부 실패다.
  if (!/^\d{1,3}$/.test(text)) return null;

  const score = Number.parseInt(text, 10);

  return Number.isInteger(score) && score >= 0 && score <= 100 ? score : null;
}

/**
 * 평가 리포트 생성 파라미터. 원문 `evaluate-text.js:154-158`(§12.3 「생성 호출 파라미터」).
 *
 * `temperature 0.25`는 원문 값 그대로다.
 *
 * ── `maxOutputTokens` 산정 (원문 5200 → 6144) ──────────────────────
 *    §12.3은 원문 5200을 「8섹션×3분할을 끝까지 내게 하려고 올린 값이라 낮추면 잘린다」고
 *    기록하고 동시에 「실측 재조정」 대상으로 지정했다. 우리 출력은 규모가 달라졌으므로
 *    다시 센다 — **출력 뼈대 라벨이 JSON 키로 바뀌었을 뿐 본문 분량은 그대로**다.
 *
 *      산출물                          근거                              ≈한국어 자수
 *      3분할 5섹션 × 3필드             출력 규칙 2조 「각각 2~4문장」,
 *                                      4문장 상한 × 45자 = 180자/필드         2,700
 *      표절 위험 문장(단문)            §5.16 실측 단문                          200
 *      누적 기록용 요약 4키            키당 80자                                320
 *      총평                            §5.16 본문 1블록                         300
 *      score                           3자                                        3
 *      ────────────────────────────────────────────────────────────────────────────
 *      최악(전 필드 4문장 상한)                                              ≈3,520자
 *
 *    여기에 JSON 키·따옴표·중괄호·쉼표 ≈250 ASCII자가 얹힌다. 한국어를 **1자 = 1토큰**
 *    으로 보수적으로 잡으면 **≈3,800토큰**이 최악값이다.
 *      · 6144 → 최악 대비 여유 ≈62%. 원문 5200으로도 들어가지만(여유 ≈37%),
 *        §8.4 완화책 ⓑ가 여유를 요구한다 — 정상 응답이 `MAX_TOKENS`로 오판돼 재시도로
 *        버려지면 지연·비용을 그대로 문다(차감은 이 단계에 없어 회차 손실은 없다).
 *      · P8(주제 추천)과 같은 6144다. 최악값이 P10(설계 8192)의 절반쯤이라 그보다 낮다.
 *    §12.3이 「실측 재조정」 대상으로 명시했으므로 운영 관측 후 다시 내린다.
 */
export const EVALUATION_GENERATION_DEFAULTS = {
  temperature: 0.25,
  maxOutputTokens: 6144,
};

/**
 * 재시도용 상한(§8.4 완화책 ⓑ+ⓒ). 같은 값으로 다시 부르면 같은 자리에서 다시 잘린다.
 * 최악값(≈3,800토큰)의 2배가 넘으므로, 여기서도 `MAX_TOKENS`면 절단이 아니라 결함 ①
 * (숫자 리터럴 반복 루프)일 가능성이 높다 — 더 올리지 않고 실패로 끝낸다.
 */
export const EVALUATION_MAX_OUTPUT_TOKENS_RETRY = 8192;

/**
 * 평가 프롬프트 버전. `performance_reports.prompt_version`에 기록한다(§8.3).
 *
 * Q68 연결 블록은 외부에 없는 신규 주입이지만 **A/B 버전을 두지 않는다** — 설계
 * 리포트의 `design-v1`/`v2`는 §12.1이 「주입 전후 비교」를 명시적으로 요구했기 때문이고
 * (~~Q83~~), Q68에는 그런 요구가 없다. 미주입본은 문항형 제출물을 보고서 기준으로
 * 채점하는 알려진 오작동이라 비교 대상이 아니다.
 *
 * 위 ⓐ~ⓔ 경계 중 **어느 한 줄이라도** 바뀌면 이 값을 올린다.
 */
export const EVALUATION_PROMPT_VERSION = "eval-v1";
