// 수행평가 제출 스키마 — 8종 판별 + 글자 수 계산 (서버 소유).
//
// 외부 앱(`/Users/hyunsoo/uwellnow/suhaengpyeong`)의 `index.html:2059-2229`
// (인라인 script — 라이브 코드. `_script.js`는 한 번도 로드되지 않는 데드코드다)를
// **판정 결과가 1건도 달라지지 않게** 옮긴 것이다.
//   · `makeSubmissionField`          ← `index.html:2059-2061`
//   · `defaultSubmissionSchema`      ← `index.html:2063-2074`
//   · `extractAssessmentQuestions`   ← `index.html:2091-2107`  → **이식하지 않음**(아래 ③)
//   · `inferLengthBasedSchema`       ← `index.html:2109-2139`
//   · `inferSubmissionSchema`        ← `index.html:2141-2229`
//   · `normalizeSubmissionSchema`    ← `index.html:2231-2244`  (범위 밖이지만 DB 왕복에 필요)
//
// 근거 문서: docs/수행평가-상세-명세.md §12.2(이식 — 도메인 규칙 코드) 3행,
//            §10.2 P11(「제출 스키마 판별 8종 이식 — **서버로 이동**」), §8.3, §8.6.
//
// ─────────────────────────────────────────────────────────────────────
// 왜 파일을 새로 만들었나 / 왜 이 이름인가
// ─────────────────────────────────────────────────────────────────────
// 기존 4모듈의 분할 기준은 "무엇을 담느냐"다 — `prompts.js`(모델에 넣는 문자열),
// `knowledge.js`(RAG 검색측), `embeddings.js`(문서측 임베딩),
// `guide-structure.js`(안내문 평문 → 설계 리포트용 구조 판정).
//
// 여기 담기는 것은 `guide-structure.js`와 **입력은 같고 산출물이 다르다.** 저쪽은
// 설계 리포트 프롬프트에 들어갈 `{type, reason, writingFrame}` 문자열 3종을 만들고,
// 이쪽은 STEP5 제출폼이 렌더할 **필드 목록**과 `performance_sessions.submission_schema`
// 에 영속화될 JSON을 만든다. 두 판정은 유형 목록도 우선순위도 다르다(아래 ②). 합치면
// 어느 한쪽 회귀 검증이 다른 쪽을 잡지 못하는 상태로 조용히 섞인다.
//
// 이름은 **DB 컬럼명을 그대로 따랐다** — `performance_sessions.submission_schema`
// (`sql/54_performance_app.sql:135`). §12.2 표도 이 자산을 「제출 스키마 8종」으로
// 지목한다. `guide-` 접두를 붙이지 않은 이유는 이 산출물이 안내문의 성질이 아니라
// **제출폼의 계약**이기 때문이다.
//
// `prompts.js`는 건드리지 않는다 — §12.1(프롬프트 1바이트 불변)의 검증 대상 파일이라
// 판별 코드가 섞이면 대조 경계가 흐려진다.
//
// ─────────────────────────────────────────────────────────────────────
// 외부와 달라진 3가지 (전부 명세 근거가 있다)
// ─────────────────────────────────────────────────────────────────────
// ① **판별 시점이 클라이언트 → 서버다.**
//    외부는 브라우저가 스키마를 만들어 DOM `data-schema` 속성에 JSON을 박고, 제출 시
//    그 속성을 다시 파싱해 서버로 보냈다(`index.html:2376`, `:2426-2432`). 즉 학생이
//    devtools로 필드를 바꿔치기할 수 있었고, 결합 텍스트(`buildSubmissionText`
//    `:2246-2252`)까지 클라이언트가 조립했다. §12.2 3행이 「추론 시점을 클라이언트 →
//    서버로 이동하고 `performance_sessions.submission_schema`에 영속화(현행은 DOM
//    `data-schema` 왕복이라 위조 가능)」, §8.6 L1828이 「평문 결합 텍스트를 클라이언트가
//    조립해 보내지 않는다」고 못박았다. 그래서 이 모듈은 **서버에서만** 돌고, 클라이언트는
//    `fields:{[key]:value}`만 올린다.
//
// ② **`rows`를 이식하지 않는다.**
//    외부 필드는 `{key,label,helper,rows,required}` 5속성이고 `rows`는 textarea의
//    문자 단위 높이였다(`renderComposerField` `:2255`가 `rows>=16 ? 'body' : …`로
//    CSS 클래스까지 갈랐다). §12.2 3행이 「`rows`(문자 단위 높이)는 폐기하고 시안 고정
//    높이 + 내부 스크롤」이라 규정했고, §5.14 실측도 Textarea 전부 10rem(160) 고정이다.
//    필드는 `{key,label,helper,required}` 4속성만 남는다.
//    → `api/_lib/performance/submission-schema.test.ts`(옛 scripts/verify-performance-submission-schema.mjs)가 **`rows`가 유일한 차이임**을
//      매번 증명한다(원본 필드에서 `rows`만 뺀 것과 완전 일치).
//
// ③ **`isRubricLikeQuestion`/문항 추출을 두 벌로 두지 않는다.**
//    외부에는 같은 판정이 두 곳에 복제돼 있다 — `index.html:2076-2089`(클라이언트)와
//    `api/find-resources.js:211-224`(서버). **두 버전은 공백·괄호 스타일만 다르고
//    토큰 단위로 완전히 동일하다**(검증 스크립트가 매번 대조한다). 문항 추출도 마찬가지로
//    `extractAssessmentQuestions`(`index.html:2091-2107`)와
//    `extractAnswerQuestions`(`find-resources.js:226-239`)가 중간 변수 이름만 다르다.
//    그래서 P10이 이미 옮겨 둔 `guide-structure.js` 것을 import해 쓴다. 사본을 만들면
//    한쪽만 고쳐지는 순간 제출폼과 설계 리포트가 서로 다른 문항 목록을 보게 된다.
//
// ─────────────────────────────────────────────────────────────────────
// 손대지 않은 것 (전부 의도적이다)
// ─────────────────────────────────────────────────────────────────────
// 정규식·어휘 목록·판정 우선순위·`type`/`label`/`notice`/필드 라벨·헬퍼 문구는 **원문
// 그대로**다. 특히 `label`/`notice`는 시안이 그대로 렌더하는 문자열이다 — §5.14 카드
// 본문 실측이 `안내문 분석 결과: 기본 보고서형` / `안내문에서 별도 제출 형식이 뚜렷하지
// 않아 기본 서론·본론·결론 구조로 제시합니다.`로 `defaultSubmissionSchema()`의
// `label`·`notice`와 바이트 단위로 일치한다. 문구를 다듬으면 시안과 어긋난다.
//
// 남겨둔 성질 3가지 — 고치지 않았고, 고치려면 명세 결정이 먼저다:
//
//   (가) **판정 우선순위가 `inferAssessmentStructure`와 다르다.** 같은 안내문이 두
//        판정에서 서로 다른 유형으로 갈릴 수 있다.
//
//          제출 스키마(이 파일, `index.html:2141`)
//            1 문항형 → 2 분량형 → 3 카드뉴스 → 4 발표 → 5 칼럼 → 6 독서 → 7 보고서 → 8 기본
//          설계 리포트(`guide-structure.js`, `find-resources.js:241`)
//            1 문항형 → 2 카드뉴스 → 3 발표 → 4 칼럼 → 5 분량형 → 6 보고서 → 7 기본
//                                                     ↑ 독서·서평형 자체가 없다
//
//        즉 「카드뉴스를 800자 이상」 안내문은 제출폼에서 **분량형**, 설계 리포트에서
//        **카드뉴스형**으로 판정된다. §12.2 3행이 「공용 모듈 1개로 단일화(합집합 8종,
//        Q64)」를 지시하지만, 그 단일화는 **어느 우선순위를 정본으로 삼느냐**는 정책
//        결정을 요구한다(Q64는 유형 집합만 정했고 순서는 정하지 않았다). 결정 전까지는
//        **각자 원본 순서를 유지**한다 — 임의로 맞추면 그 순간 한쪽 판정이 조용히 뒤집히고,
//        어느 쪽도 "원본과 같다"고 증명할 수 없게 된다. 두 판정은 소비처가 다르므로
//        (설계 리포트 프롬프트 vs 제출폼 필드) 갈려 있어도 즉시 깨지지는 않는다.
//
//   (나) 문항형이 질문 **1건**으로 발동한다(`index.html:2147` `questions.length >= 1`).
//        `guide-structure.js` (나)와 같은 미결 항목이다. 두 파일이 같은 임계값을
//        쓰고 있으므로 정책이 정해지면 **함께** 올려야 한다.
//
//   (다) `inferLengthBasedSchema`의 `hasLengthRule` 정규식에 `\d+\s*자`가 있어
//        `100자`처럼 **분량 조건이 아닌 맥락의 "N자"**도 잡는다(`index.html:2113`).
//        오탐 방향이 "분량형으로 잡힌다"라 피해가 작고, 고치면 판정이 갈리므로 둔다.

import {
  extractAnswerQuestions,
  guideTextFromSession,
} from "./guide-structure.js";
import { checkFieldsMinLength, countFieldsChars } from "./submission-chars.js";

// 재수출 — 제출폼 쪽 호출부가 판정 함수를 쓰려고 `guide-structure.js`를 따로 import 하면
// 사본을 만들고 싶은 유혹이 생긴다. 진입점을 하나로 모아 그 유혹을 없앤다(파일 상단 ③).
export {
  extractAnswerQuestions,
  guideTextFromSession,
  isRubricLikeQuestion,
} from "./guide-structure.js";

// 문항형 필드 상한 — `index.html:2152` `questions.slice(0, 20)`.
// §12.2 3행이 「문항형 20개 상한 유지」로 명시적으로 지정한 값이다.
export const MAX_QUESTION_FIELDS = 20;

// 제출물 최소 길이(`api/evaluate-text.js:38` `submission_text.trim().length < 100`)와
// 글자 수 계산식은 **`submission-chars.js`가 정본**이다 — STEP5 제출폼(브라우저)이 같은
// 규칙을 읽어야 해서 의존 0인 잎 모듈로 내렸다(파일 하단 「글자 수」 절 참고).
// 여기서는 그대로 재수출해 기존 import 경로를 유지한다.

// 제출 스키마 8종의 `type` 값. DB(`performance_sessions.submission_schema.type`)와
// 클라이언트 분기가 함께 읽는 열거라 상수로 고정한다.
export const SUBMISSION_SCHEMA_TYPES = Object.freeze([
  "question_based",
  "length_based_report",
  "cardnews",
  "presentation",
  "column",
  "book_review",
  "research_report",
  "basic_report",
]);

// ─────────────────────────────────────────────────────────────────────
// 이하 원문 이식 구간 — 정규식/어휘/문구/순서 변경 금지
// ─────────────────────────────────────────────────────────────────────

/**
 * 제출 필드 1개 — `index.html:2059-2061` 원문 이식(단, `rows` 제외. 파일 상단 ②).
 *
 * `required`는 전 8종에서 항상 `true`지만 인자를 남긴다 — `normalizeSubmissionSchema`가
 * DB에서 읽어온 값에 `required:false`가 섞여 있어도 그대로 보존해야 하기 때문이다.
 */
export type SubmissionField = {
  key: string;
  label: string;
  helper: string;
  /** 학생이 따라 쓸 수 있는 가상 작성 예시(2~3줄). 이전 배포본이 저장한 값에는 없을 수 있어 빈 문자열이다. */
  example: string;
  required: boolean;
};

/** 제출 스키마 8종의 공통 모양. */
export type SubmissionSchema = {
  type: string;
  label: string;
  notice: string;
  fields: SubmissionField[];
};

export function makeSubmissionField(
  key: string,
  label: string,
  helper: string,
  required = true,
  example = "",
): SubmissionField {
  return { key, label, helper, example, required };
}

/** 문항형은 문항 문구가 안내문마다 달라 필드별 예시를 쓸 수 없다. 모든 문항에 같은 답변 예시를 보여준다. */
const QUESTION_EXAMPLE =
  "[예시] 제가 고른 주제는 급식 잔반 줄이기입니다. 학교 잔반량이 하루 120kg이라는 자료를 보고 문제라고 느꼈고, 이를 줄일 방법을 찾고 싶었기 때문입니다.";

/**
 * 기본 보고서형 —`index.html:2063-2074` 원문 이식.
 *
 * 8종 중 마지막 폴백이자, `normalizeSubmissionSchema`가 깨진 입력에 돌려주는 값이다.
 * `label`/`notice`/필드 3개의 라벨·헬퍼는 §5.14 시안 카드 본문 실측과 바이트 일치한다.
 */
export function defaultSubmissionSchema(): SubmissionSchema {
  return {
    type: "basic_report",
    label: "기본 보고서형",
    notice:
      "안내문에서 별도 제출 형식이 뚜렷하지 않아 기본 서론·본론·결론 구조로 제시합니다.",
    fields: [
      makeSubmissionField(
        "intro",
        "서론",
        "문제의식, 주제 선정 이유, 탐구 목적을 중심으로 작성하세요.",
        true,
        "[예시] 미세먼지 농도가 높은 날 기침 환자가 늘었다는 뉴스를 보고, 농도와 호흡기 질환의 관계가 궁금해져 이 주제를 골랐습니다. 이를 수치로 확인해 보는 것이 목적입니다.",
      ),
      makeSubmissionField(
        "body",
        "본론",
        "교과 개념, 자료 분석, 사례 적용, 자신의 해석을 충분히 담아 작성하세요.",
        true,
        "[예시] 환경부 통계에서 월별 미세먼지 농도와 병원 호흡기 환자 수를 표로 비교했습니다. 농도가 높은 달에 환자 수도 늘었고, 이는 상관관계 개념으로 해석할 수 있었습니다.",
      ),
      makeSubmissionField(
        "conclusion",
        "결론",
        "탐구 결과 정리, 느낀 점, 진로 연계, 후속 탐구 방향을 정리하세요.",
        true,
        "[예시] 농도가 오르면 환자가 늘어나는 경향을 확인했습니다. 다만 계절 요인은 따지지 못해, 다음에는 같은 기온대의 달만 골라 다시 비교해 보고 싶습니다.",
      ),
    ],
  };
}

/**
 * 안내문 맞춤 작성형 — `index.html:2109-2139` 원문 이식.
 *
 * 8종 중 유일하게 **필드 구성이 안내문에 따라 달라지는** 유형이다(1~4필드). 게이트는
 * `분량 조건 ∧ (탐구 내용 ∨ 배우고 느낀 점)`이고, 게이트를 통과하면 4개 후보 필드를
 * 각자의 정규식으로 조건부 추가한다. 게이트가 `exploration`/`reflection` 둘 중 하나를
 * 이미 보장하므로 `fields`가 빈 배열로 끝나는 경로는 도달 불가능하지만, 원본의 방어선
 * (`if(!fields.length) return null`)은 그대로 남긴다.
 *
 * 조건 불충족 시 `null`을 돌려주고 호출부가 다음 유형으로 넘어간다.
 */
export function inferLengthBasedSchema(raw = ""): SubmissionSchema | null {
  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  const hasExploration = /탐구\s*내용|조사\s*내용|활동\s*내용/.test(text);
  const hasReflection = /배우고\s*느낀\s*점|느낀점|소감/.test(text);
  const hasLengthRule = /\d+\s*자\s*이상|\d+\s*자|분량|띄어쓰기/.test(text);

  if (!(hasLengthRule && (hasExploration || hasReflection))) return null;

  const fields: SubmissionField[] = [];
  if (/선정\s*이유|탐구\s*동기|주제\s*선정/.test(text)) {
    fields.push(
      makeSubmissionField(
        "motive",
        "주제 선정 이유",
        "안내문에서 요구한 주제 선정 이유와 교과·진로 연결성을 먼저 정리하세요.",
        true,
        "[예시] 수업에서 배운 삼투 현상이 김장 절임 과정과 같다는 것을 알고, 일상 속 과학이 궁금해져 이 주제를 정했습니다. 생명과학 진로와도 이어집니다.",
      ),
    );
  }
  if (hasExploration) {
    fields.push(
      makeSubmissionField(
        "exploration",
        "탐구 내용",
        "안내문이 요구한 분량 조건을 확인하고, 교과 개념·자료 근거·분석 과정을 중심으로 작성하세요.",
        true,
        "[예시] 소금 농도를 3단계로 달리해 배추를 절이고 시간별 무게 변화를 쟀습니다. 농도가 높을수록 빨리 줄었고, 이는 삼투압 차이로 설명할 수 있었습니다.",
      ),
    );
  }
  if (hasReflection) {
    fields.push(
      makeSubmissionField(
        "reflection",
        "배우고 느낀 점",
        "새롭게 알게 된 점, 기존 생각과 달라진 점, 진로 또는 후속 탐구 방향을 정리하세요.",
        true,
        "[예시] 교과서 그림으로만 알던 삼투를 직접 확인해 이해가 깊어졌습니다. 앞으로는 설탕 농도에서도 같은 결과가 나오는지 확인해 보고 싶습니다.",
      ),
    );
  }
  if (/출처|참고\s*문헌|참고자료/.test(text)) {
    fields.push(
      makeSubmissionField(
        "references",
        "참고자료 및 출처",
        "실제로 활용한 자료명과 출처 링크를 정확히 적으세요. 확인되지 않은 자료는 쓰지 마세요.",
        true,
        "[예시] 교육부, 고등학교 생명과학Ⅰ 교과서, 2023. 농촌진흥청 누리집 배추 절임 기준 자료(https://www.rda.go.kr), 2024년 3월 12일 확인.",
      ),
    );
  }

  if (!fields.length) return null;

  return {
    type: "length_based_report",
    label: "안내문 맞춤 작성형",
    notice:
      "안내문에 제시된 제출 항목과 분량 조건을 우선 반영해 작성 폼을 구성했습니다.",
    fields,
  };
}

/**
 * 안내문 평문 → 제출 스키마 8종 판정 — `index.html:2141-2229` 원문 이식.
 *
 * 외부는 전역 `assessmentInfo`를 읽었지만(`:2142`) 여기서는 인자로 받는다 — 서버에는
 * 전역 세션 상태가 없고, 명시적 입력이라야 검증 스크립트가 원본과 대조할 수 있다.
 *
 * **우선순위는 정규식보다 중요하다**(먼저 맞는 것이 이긴다). 파일 상단 (가)의 표 참조.
 * 특히 8번 `보고서`는 거의 모든 안내문에 등장하는 단어라 마지막 직전에 있다 — 순서를
 * 올리면 2~7번 대부분이 7번으로 빨려 들어간다.
 *
 * 판정은 공백을 1칸으로 접은 `raw`에 대해 하지만, **문항 추출만 줄바꿈이 살아 있는
 * `sourceText`**에 대해 한다(`extractAnswerQuestions`의 정규식이 `m` 플래그 행 앵커라
 * 개행을 뭉개면 문항형 판정이 통째로 죽는다). 이 비대칭이 원문 그대로다.
 */
export function inferSubmissionSchema(assessmentInfo = ""): SubmissionSchema {
  const sourceText = String(assessmentInfo || "");
  const raw = sourceText.replace(/\s+/g, " ").trim();
  const questions = extractAnswerQuestions(sourceText);
  const lengthBasedSchema = inferLengthBasedSchema(sourceText);

  // 1. 문항별 답변형 — 번호형 문항이 1건이라도 있으면 (파일 상단 (나))
  if (questions.length >= 1) {
    return {
      type: "question_based",
      label: "문항별 답변형",
      notice:
        "안내문에 실제 답변해야 할 번호형 문항이 있어 문항별 답변 폼으로 제시합니다.",
      // 상한 20 — `index.html:2152`. 정렬(오름차순)·중복 제거는 extractAnswerQuestions
      // 가 이미 끝냈으므로 여기 slice는 **번호가 작은 20개**를 남긴다.
      // 키는 배열 인덱스가 아니라 **문항 번호**를 쓴다(`question_3`). 안내문에 1·3·7번만
      // 있으면 키도 그 번호를 따라가므로, 필드 키만 봐도 원래 문항 번호를 알 수 있다.
      fields: questions
        .slice(0, MAX_QUESTION_FIELDS)
        .map((q) =>
          makeSubmissionField(
            `question_${q.no}`,
            `문항 ${q.no}`,
            q.text,
            true,
            QUESTION_EXAMPLE,
          ),
        ),
    };
  }

  // 2. 안내문 맞춤 작성형 — 설계 리포트 판정과 순서가 다른 지점이다(파일 상단 (가))
  if (lengthBasedSchema) return lengthBasedSchema;

  // 3. 카드뉴스·홍보물형
  if (/카드뉴스|홍보물|포스터|뉴스레터/.test(raw)) {
    return {
      type: "cardnews",
      label: "카드뉴스·홍보물형",
      notice:
        "안내문에 카드뉴스/홍보물 제작 흐름이 있어 제작 의도와 카드별 구성을 중심으로 제시합니다.",
      fields: [
        makeSubmissionField(
          "purpose",
          "제작 의도",
          "왜 이 주제를 카드뉴스/홍보물로 전달하려는지 작성하세요.",
          true,
          "[예시] 학교 급식 잔반이 많다는 점을 알리고 싶어 카드뉴스를 만들었습니다. 같은 학교 친구들이 잔반 줄이기를 실천하도록 돕는 것이 목적입니다.",
        ),
        makeSubmissionField(
          "card_plan",
          "카드별 구성",
          "카드 1, 카드 2처럼 화면별 핵심 문구와 들어갈 자료를 정리하세요.",
          true,
          "[예시] 카드 1: 하루 잔반 120kg, 표지 문구와 급식판 사진. 카드 2: 잔반 처리 비용 그래프. 카드 3: 잔반 줄이는 방법 세 가지를 넣습니다.",
        ),
        makeSubmissionField(
          "evidence",
          "근거 자료 및 교과 연결",
          "안내문 조건, 교과 개념, 활용 자료의 근거를 연결하세요.",
          true,
          "[예시] 사회 교과의 자원 배분 개념을 바탕으로 음식물 쓰레기가 비용을 늘린다고 설명합니다. 근거는 학교 영양사 선생님께 받은 월별 잔반량 자료입니다.",
        ),
        makeSubmissionField(
          "message",
          "마무리 메시지",
          "독자가 얻어야 할 핵심 의미와 후속 행동을 정리하세요.",
          true,
          "[예시] 한 끼 남기지 않기가 모이면 큰 변화가 됩니다. 독자는 먹을 만큼만 받기를 실천하고, 학급 잔반 줄이기 캠페인에 참여하면 좋겠습니다.",
        ),
      ],
    };
  }

  // 4. 발표·PPT형
  if (/발표|ppt|피피티|대본|프레젠테이션/.test(raw)) {
    return {
      type: "presentation",
      label: "발표·PPT형",
      notice:
        "안내문에 발표/PPT 성격이 있어 발표 흐름과 대본을 함께 잡는 폼으로 제시합니다.",
      fields: [
        makeSubmissionField(
          "opening",
          "발표 도입",
          "인사, 주제 소개, 문제의식, 발표 순서를 간단히 작성하세요.",
          true,
          "[예시] 안녕하세요, 2학년 3반 김하나입니다. 오늘은 우리 동네 버스 배차 간격이 길다는 문제의식에서 시작한 조사 결과를 세 부분으로 발표하겠습니다.",
        ),
        makeSubmissionField(
          "main_flow",
          "발표 핵심 내용",
          "슬라이드 순서에 맞춰 핵심 개념, 자료, 분석 내용을 정리하세요.",
          true,
          "[예시] 슬라이드 2는 노선별 배차 간격 표, 슬라이드 3은 승객 설문 그래프, 슬라이드 4는 두 자료를 합친 분석입니다. 수학 통계 개념을 사용했습니다.",
        ),
        makeSubmissionField(
          "script_point",
          "대본 포인트",
          "말로 설명해야 할 연결 문장과 강조할 표현을 작성하세요.",
          true,
          "[예시] 그래프로 넘어갈 때는 이제 설문 결과를 보겠습니다라고 연결합니다. 평균 대기 시간 18분이라는 수치는 천천히 또박또박 강조합니다.",
        ),
        makeSubmissionField(
          "closing",
          "발표 마무리",
          "결론, 느낀 점, 진로 또는 후속 탐구 방향을 정리하세요.",
          true,
          "[예시] 배차 간격을 10분으로 줄이면 대기 시간이 절반이 됩니다. 조사하며 데이터로 설득하는 법을 배웠고, 교통 정책 분야를 더 공부하고 싶습니다.",
        ),
      ],
    };
  }

  // 5. 칼럼·논술형
  if (/칼럼|논설|비평|에세이|주장하는 글|논술/.test(raw)) {
    return {
      type: "column",
      label: "칼럼·논술형",
      notice:
        "안내문에 칼럼/논술 성격이 있어 주장과 근거 중심의 글 구조로 제시합니다.",
      fields: [
        makeSubmissionField(
          "issue",
          "문제 제기",
          "사회적·학문적 쟁점, 주제의 필요성, 관점을 제시하세요.",
          true,
          "[예시] 교실에서 스마트폰을 전면 금지하는 것이 옳은가라는 논쟁이 계속되고 있습니다. 학습 집중과 자율성이 부딪히는 문제여서 짚어 볼 필요가 있습니다.",
        ),
        makeSubmissionField(
          "argument",
          "핵심 주장",
          "자신의 중심 주장을 한 방향으로 분명히 정리하세요.",
          true,
          "[예시] 저는 수업 중에는 보관하고 쉬는 시간에는 사용하도록 하는 부분 허용이 가장 알맞다고 주장합니다. 집중과 자율을 함께 지킬 수 있기 때문입니다.",
        ),
        makeSubmissionField(
          "grounds",
          "근거 및 분석",
          "자료, 교과 개념, 사례를 바탕으로 주장을 뒷받침하세요.",
          true,
          "[예시] 사회 교과의 기본권 개념에 따라 자율권은 보장되어야 합니다. 또 국내 설문에서 수업 중 사용 학생의 집중도가 낮았다는 결과가 이를 뒷받침합니다.",
        ),
        makeSubmissionField(
          "proposal",
          "결론 및 제언",
          "주장의 의미, 한계, 후속 탐구 또는 실천 방향을 제시하세요.",
          true,
          "[예시] 부분 허용은 규칙 지키기를 전제로 하므로 감독 부담이 한계입니다. 학생회가 규칙을 직접 정하는 방안을 시범 운영해 보자고 제안합니다.",
        ),
      ],
    };
  }

  // 6. 독서·서평형 — `guide-structure.js`(설계 리포트 판정)에는 **없는** 8번째 유형이다.
  //    §12.2 3행 「합집합 8종(Q64)」의 '합집합'이 가리키는 바로 그 차이.
  if (/독서|도서|책|서평|감상문/.test(raw)) {
    return {
      type: "book_review",
      label: "독서·서평형",
      notice:
        "안내문에 독서/서평 성격이 있어 자료 이해와 자신의 해석을 분리한 폼으로 제시합니다.",
      fields: [
        makeSubmissionField(
          "book_info",
          "자료 선택 이유",
          "도서/자료를 선택한 이유와 주제와의 관련성을 작성하세요.",
          true,
          "[예시] 『코스모스』를 선택한 이유는 물리 수업에서 배운 별의 탄생을 더 넓게 이해하고 싶었기 때문입니다. 천문학자라는 제 진로와도 관련이 깊습니다.",
        ),
        makeSubmissionField(
          "summary",
          "핵심 내용 요약",
          "자료의 핵심 내용을 과도하게 베끼지 말고 자신의 말로 정리하세요.",
          true,
          "[예시] 저자는 우주가 오래된 시간 속에서 천천히 만들어졌다고 설명합니다. 별의 재료가 우리 몸의 원소와 같다는 대목이 핵심이라고 이해했습니다.",
        ),
        makeSubmissionField(
          "analysis",
          "교과 개념 및 진로 연결 분석",
          "수업 개념, 진로 관심, 새롭게 알게 된 점을 연결하세요.",
          true,
          "[예시] 수업에서 배운 핵융합 개념이 책의 별 이야기와 연결됩니다. 책 덕분에 원소의 기원이 별이라는 점을 알게 되어 천문학 진로가 더 구체적으로 그려졌습니다.",
        ),
        makeSubmissionField(
          "reflection",
          "느낀 점 및 확장 질문",
          "탐구 후 달라진 생각과 다음에 확인하고 싶은 질문을 정리하세요.",
          true,
          "[예시] 우주를 알수록 지구가 특별해 보였습니다. 다음에는 별이 죽을 때 어떤 원소가 만들어지는지, 어디서 확인할 수 있는지 알아보고 싶습니다.",
        ),
      ],
    };
  }

  // 7. 탐구보고서형 — `보고서`가 흔한 단어라 거의 마지막이다
  if (/실험|탐구보고서|탐구 보고서|실험보고서|조사 보고서|보고서/.test(raw)) {
    return {
      type: "research_report",
      label: "탐구보고서형",
      notice:
        "안내문에 보고서 성격이 있어 기본 구조를 유지하되 자료 분석을 더 강조한 폼으로 제시합니다.",
      fields: [
        makeSubmissionField(
          "intro",
          "서론",
          "탐구 동기, 문제의식, 주제 선정 이유를 작성하세요.",
          true,
          "[예시] 체육 시간에 맥박이 빨리 뛰는 정도가 친구마다 달랐습니다. 운동 강도와 심박수의 관계가 궁금해 이 탐구를 시작했습니다. 이를 직접 재 보기로 했습니다.",
        ),
        makeSubmissionField(
          "concept",
          "교과 개념 정리",
          "수행평가와 연결되는 교과 개념을 먼저 정리하세요.",
          true,
          "[예시] 심박수는 1분 동안 심장이 뛰는 횟수입니다. 운동하면 근육이 산소를 더 필요로 해 심박수가 오른다는 보건 교과 개념을 먼저 정리했습니다.",
        ),
        makeSubmissionField(
          "analysis",
          "자료·사례 분석",
          "자료 근거, 실험/조사 과정, 분석 결과, 자신의 해석을 작성하세요.",
          true,
          "[예시] 제자리 걷기, 가볍게 뛰기, 전력 달리기 후 심박수를 3회씩 쟀습니다. 평균이 각각 85, 120, 160회였고, 강도와 심박수는 비례한다고 해석했습니다.",
        ),
        makeSubmissionField(
          "conclusion",
          "결론",
          "탐구 결과, 느낀 점, 진로 또는 후속 탐구 방향을 작성하세요.",
          true,
          "[예시] 운동 강도가 커질수록 심박수가 오르는 것을 확인했습니다. 측정 인원이 5명뿐이라 한계가 있어, 다음에는 학년 전체로 넓혀 보고 싶습니다.",
        ),
      ],
    };
  }

  // 8. 기본 보고서형
  return defaultSubmissionSchema();
}

/**
 * DB/외부에서 읽어온 스키마를 신뢰 가능한 형태로 정규화 — `index.html:2231-2244` 이식.
 *
 * 외부에서는 DOM `data-schema` 왕복 때문에 **매 렌더·매 제출마다** 호출되는 방어선이었다.
 * 우리 구조에서는 판별이 서버 소유라 그 위조 경로가 없지만, 이 함수는 여전히 필요하다 —
 * `performance_sessions.submission_schema`는 jsonb라 스키마 진화·수동 수정·이전 배포본이
 * 남긴 값이 그대로 들어올 수 있고, 그때 제출폼이 빈 필드 목록으로 뜨는 것보다 기본 보고서형
 * 으로 떨어지는 편이 낫다.
 *
 * 폴백 문구(`custom`/`맞춤 제출형`/`안내문 분석 결과에 맞춰 제출 항목을 제시합니다.`)와
 * 키/라벨 자동 생성 규칙(`field_${idx+1}`/`항목 ${idx+1}`)은 원문 그대로다.
 * `rows` 보정(`Number(f.rows || 10)`)만 ②에 따라 빠졌다.
 *
 * ⚠️ **원문과 다른 점 하나 — 키 유일성 보장(검토 P11).**
 * `inferSubmissionSchema`의 문항형은 필드 키를 **문항 번호**로 만드는데
 * (`question_${q.no}`), `extractAnswerQuestions`의 중복 제거 키는 `${no}:${text}`라
 * **같은 번호에 다른 본문**이 두 줄 있으면 두 문항이 모두 살아남아 키가 겹친다
 * (원본 `index.html:2152`도 같은 생성식이다 — 판정 자체는 원본과 동일하다).
 * 외부는 게이트가 결합 문자열 길이였고 렌더도 문자열 HTML이라 겹친 키가 드러나지
 * 않았지만, 이식본에서는 겹친 키가 곧 결함이다:
 *   ⓐ `countFieldsChars`가 같은 키를 두 번 세어 total이 이중 계상 → 100자 게이트가
 *      실제로는 50자로 뚫린다(서버·클라이언트가 같은 함수라 둘 다 통과시킨다),
 *   ⓑ 제출폼이 중복 React key와 중복 DOM id(`…-question_1`)로 렌더해 라벨이 다른 두
 *      textarea가 한 값을 공유한다,
 *   ⓒ `buildSubmissionText`가 같은 답변을 두 번 프롬프트에 싣는다.
 * 그래서 **여기서만** 뒤에 온 중복 키에 `_2`/`_3` 접미어를 붙인다. §12.2 3행의
 * 「판정이 1건도 달라지지 않는다」는 `type`/`label`/`notice`/필드 순서·라벨·헬퍼에
 * 대한 보장이고 그중 어느 것도 바뀌지 않는다. 판정 함수(`inferSubmissionSchema`)는
 * 원문 그대로 두고 정규화 단계 하나에서만 처리하므로, 원문 대조 검증
 * (`api/_lib/performance/submission-schema.test.ts`(옛 scripts/verify-performance-submission-schema.mjs) ①~⑤)도 그대로 성립한다.
 * 영속화 전에 이 함수를 반드시 통과하므로(`resolveSessionSubmissionSchema`)
 * `performance_sessions.submission_schema`에는 유일한 키만 저장된다.
 */
/** DB/외부에서 읽어온, 아직 정규화되지 않은 스키마 형태. */
export type StoredSubmissionSchema = {
  type?: string;
  label?: string;
  notice?: string;
  fields?: {
    key?: string;
    label?: string;
    helper?: string;
    example?: string;
    required?: boolean;
  }[];
};

export function normalizeSubmissionSchema(
  schema?: StoredSubmissionSchema | null,
): SubmissionSchema {
  if (!schema || !Array.isArray(schema.fields) || !schema.fields.length)
    return defaultSubmissionSchema();

  const seenKeys = new Set<string>();

  return {
    type: schema.type || "custom",
    label: schema.label || "맞춤 제출형",
    notice: schema.notice || "안내문 분석 결과에 맞춰 제출 항목을 제시합니다.",
    fields: schema.fields.map((f, idx) =>
      makeSubmissionField(
        uniqueFieldKey(seenKeys, f.key || `field_${idx + 1}`),
        f.label || `항목 ${idx + 1}`,
        f.helper || "",
        f.required !== false,
        f.example || "",
      ),
    ),
  };
}

/**
 * 이미 쓰인 키면 `_2`, `_3`… 를 붙여 유일하게 만든다(위 ⚠️).
 * 접미어를 붙인 결과가 또 겹칠 수 있으므로(`question_1`,`question_1`,`question_1_2`)
 * 비어 있는 번호를 찾을 때까지 올린다.
 */
function uniqueFieldKey(seenKeys: Set<string>, key: string): string {
  let candidate = key;
  let suffix = 2;

  while (seenKeys.has(candidate)) {
    candidate = `${key}_${suffix}`;
    suffix += 1;
  }

  seenKeys.add(candidate);
  return candidate;
}

// ─────────────────────────────────────────────────────────────────────
// 세션 어댑터 — 이식 대상이 아니라 우리 저장소 배선
// ─────────────────────────────────────────────────────────────────────

/**
 * 세션 행 → 제출 스키마. 엔드포인트(다음 단계)가 부를 진입점이다.
 *
 * 이미 판정해 영속화한 값이 있으면 **다시 판정하지 않는다** — §12.2 3행의
 * 「판정 결과를 구조체로 저장해 STEP5가 재판정하지 않게 한다」와 같은 이유이고,
 * 더 실질적으로는 학생이 폼을 채우는 도중 안내문이 바뀌면(재분석) 필드 키가 갈려
 * 작성 중인 내용이 갈 곳을 잃기 때문이다.
 *
 * `{ schema, inferred }` — `inferred:true`면 호출부가 `submission_schema`에 저장해야
 * 한다는 뜻이다. 저장 자체는 여기서 하지 않는다(이 모듈은 DB를 모른다).
 */
/** 제출 스키마 판정이 실제로 읽는 세션 필드만 담은 최소 형태. */
type SubmissionSession = {
  submission_schema?: StoredSubmissionSchema | null;
  guide_input_mode?: string;
  guide_json?: { mode?: string; text?: string };
  guide_freetext?: string;
};

export function resolveSessionSubmissionSchema(
  session: SubmissionSession = {},
): { schema: SubmissionSchema; inferred: boolean } {
  const stored = session?.submission_schema;

  if (stored && Array.isArray(stored.fields) && stored.fields.length) {
    return { schema: normalizeSubmissionSchema(stored), inferred: false };
  }

  return {
    schema: normalizeSubmissionSchema(
      inferSubmissionSchema(guideTextFromSession(session)),
    ),
    inferred: true,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 글자 수 — 시안 카운터와 최소 길이 판정이 **같은 계산식**을 쓴다
// ─────────────────────────────────────────────────────────────────────
//
// §8.3 `performance_submissions.char_counts`: 「필드별 글자수. 시안 카운터(`356자`)와
// **동일 계산식 공유**(§9.3 최소 길이 판정에도 사용)」.
// §12.2 마지막 행 결정(Q35): 「임계값 100 유지하되 **측정 대상 변경 필수** — 현행은
// 라벨·주제가 포함된 결합 문자열이라 사실상 통과한다. 필드 값 순수 본문 합계로 재고
// 시안 카운터와 같은 계산식 공유」.
//
// 외부가 무엇을 쟀는가
// --------------------
// `api/evaluate-text.js:38`은 `submission_text.trim().length < 100`을 봤는데, 그
// `submission_text`는 클라이언트 `buildSubmissionText`(`index.html:2246-2252`)가 만든
//     주제: {topic}
//     (빈 줄)
//     [제출 형식] {schema.label}
//     (빈 줄) [{field.label}] {value} … 필드 수만큼
// 결합 문자열이다. 기본 보고서형 기준 **본문을 한 글자도 안 써도 라벨만으로 40자를
// 넘고**, 주제명(보통 30~50자)까지 얹히면 100자를 그냥 넘긴다. 즉 이 방어선은 사실상
// 작동하지 않았다 — 「주제명만 붙여넣고 회차를 태우는 오용」을 막으려던 규정인데 정확히
// 그 케이스가 통과한다.
//
// 무엇을 재는가 (결정)
// --------------------
//   · **스키마에 선언된 필드의 값만** 센다. 주제·라벨·헬퍼·`notice`는 세지 않는다.
//     `fields`에 스키마 밖 키가 섞여 와도 무시한다 — 아니면 클라이언트가 임의 키로
//     길이를 채워 게이트를 우회할 수 있다.
//   · 정규화는 **`replace(/\s+/g, ' ').trim()`** — 연속 공백/개행/탭을 1칸으로 접고
//     양끝을 자른다. 근거 2가지:
//       ① 이 저장소의 안내문 판정 전체가 이미 같은 정규화를 쓴다
//          (`isRubricLikeQuestion`, `inferAssessmentStructure`, `inferLengthBasedSchema`).
//          "본문 한 덩어리"를 세는 방식이 파일마다 다르면 어느 게 맞는지 알 수 없다.
//       ② 접지 않으면 개행 100번으로 게이트가 뚫린다. 이 함수의 존재 이유가 오용 차단
//          이므로 공백 패딩이 통과하면 안 된다.
//     남은 단일 공백은 **센다** — 한국어 원고에서 띄어쓰기는 분량의 일부이고, 외부
//     `inferLengthBasedSchema`도 `띄어쓰기`를 분량 조건 어휘로 취급한다.
//   · 길이는 `[...s].length`(코드 포인트) — `.length`(UTF-16 단위)면 이모지 1개가
//     2자로 세어진다. 한글은 둘이 같지만, 학생이 이모지를 쓰면 카운터가 실제와 어긋난다.
//
// UI 표기
// -------
// §5.14 실측: 카운터는 **필드마다** 텍스트영역 하단에 `{n}자` 한 줄이고
// (`356자`/`840자`/`421자`), **최소·최대 기준선 표기가 없다.** 그래서 `perField`가
// 화면이 쓰는 값이고 `total`은 게이트 전용이다. 시안에 없는 `/100자` 같은 기준선을
// 새로 그리지 않는다 — 필요해지면 §5.14를 고치는 게 먼저다.
//
// ⚠️ **계산 본체는 `submission-chars.js`로 내려갔다** — §8.3이 요구하는 「시안 카운터와
//    동일 계산식 공유」의 상대편이 브라우저(STEP5 제출폼)이기 때문이다. 이 파일 전체를
//    클라이언트 번들에 끌고 오는 대신, 의존이 0인 잎 모듈로 규칙만 내리고 여기서는
//    **스키마 정규화를 먼저 태운 뒤 위임**한다(기존 시그니처·반환 모양은 그대로다).
//    사본을 만들지 마라 — 두 벌이 되는 순간 "카운터는 통과인데 서버가 거절"이 생긴다.

// 잎 모듈 재수출 — 기존 import 경로(`submission-schema.js`)를 그대로 유지하기 위함이다.
export { countFieldChars, SUBMISSION_MIN_CHARS } from "./submission-chars.js";

/**
 * 스키마 선언 필드만 골라 필드별·합계 글자 수를 낸다.
 *
 * 반환 `perField`는 그대로 `performance_submissions.char_counts`에 넣는 모양이고
 * (스키마에 있는 키는 값이 비어도 `0`으로 존재한다 — 화면이 카운터를 그리려면 키가
 * 있어야 한다), `total`은 최소 길이 판정 입력이다.
 */
export function countSubmissionChars(
  schema: StoredSubmissionSchema | null | undefined,
  fields: Record<string, unknown> = {},
) {
  return countFieldsChars(normalizeSubmissionSchema(schema).fields, fields);
}

/**
 * 제출 게이트 — 필수 필드 누락 + 최소 길이(§9.3/§12.2 Q35).
 *
 * 두 가지를 한 번에 보는 이유는 호출부가 하나이기 때문이다(제출 엔드포인트). 순서는
 * **필수 누락 먼저** — 학생에게 "무엇을 안 썼는지"가 "몇 자 모자라는지"보다 먼저 필요한
 * 정보다. `missingRequired`는 라벨 배열이라 그대로 안내 문구에 넣을 수 있다.
 *
 * 반환만 하고 throw 하지 않는다. HTTP 응답 형태(§8.6 L1811 `{ error:{code,message} }`)는
 * 엔드포인트가 정한다.
 */
export function checkSubmissionMinLength(
  schema: StoredSubmissionSchema | null | undefined,
  fields: Record<string, unknown> = {},
) {
  return checkFieldsMinLength(normalizeSubmissionSchema(schema).fields, fields);
}

// ─────────────────────────────────────────────────────────────────────
// 프롬프트에 들어갈 제출물 평문 — **서버가 조립한다**
// ─────────────────────────────────────────────────────────────────────
//
// §8.6 `evaluate` 행: 「평문 결합 텍스트를 클라이언트가 조립해 보내지 않는다」.
// 외부는 브라우저 `buildSubmissionText`(`index.html:2246-2252`)가 만든 문자열을
// `submission_text`로 올려보냈고, 서버는 그것을 그대로 프롬프트 `[학생 제출물]`에
// 넣고 **동시에 100자 게이트의 측정 대상으로도 썼다**(`api/evaluate-text.js:38`).
// 즉 게이트가 재는 대상을 클라이언트가 만들었다. 여기서는
//   · 조립은 서버(`api/performance/evaluate.js`가 이 함수를 부른다),
//   · 게이트는 조립 결과가 아니라 **필드 값 순수 본문**(`countSubmissionChars`)
// 으로 갈라 놓았다(Q35). 두 관심사가 한 문자열을 공유하던 것이 외부 결함의 원인이다.
//
// 형식은 원문 그대로다 — 줄 구성·라벨 대괄호·빈 줄 위치를 바꾸면 모델이 보는 입력이
// 달라진다(프롬프트 자산에 준해 취급한다).
//     주제: {topic}
//     (빈 줄)
//     [제출 형식] {schema.label}
//     (빈 줄) [{field.label}] {value}  … 필드 수만큼
//   ※ 원문은 `[{field.label}]`과 값이 **서로 다른 줄**이다(`lines.push('', '[라벨]', 값)`).
//
// 원문과 다른 점은 하나뿐이다: 스키마를 `normalizeSubmissionSchema`로 한 번 통과시켜
// DB에서 읽어온 값이 깨져 있어도 필드 목록이 비지 않게 한다(외부는 DOM에서 막 만든
// 객체라 그럴 일이 없었다). 필드 값은 원문과 같이 `fields[key] || ''`이며, 스키마에
// 없는 키는 애초에 순회 대상이 아니다.
export function buildSubmissionText(
  topic: unknown,
  schema: StoredSubmissionSchema | null | undefined,
  fields: Record<string, unknown> = {},
): string {
  const safe = normalizeSubmissionSchema(schema);
  const source = fields && typeof fields === "object" ? fields : {};
  const lines = [
    `주제: ${String(topic ?? "")}`,
    "",
    `[제출 형식] ${safe.label}`,
  ];

  safe.fields.forEach((field) => {
    lines.push("", `[${field.label}]`, String(source[field.key] || ""));
  });

  return lines.join("\n").trim();
}
