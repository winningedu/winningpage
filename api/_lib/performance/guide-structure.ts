// 수행평가 안내문 — 도메인 규칙 모듈 (루브릭 판별 + 제출 구조 7유형 판정).
//
// 외부 앱(`/Users/hyunsoo/uwellnow/suhaengpyeong`)의 `api/find-resources.js:211-299`
// 를 **판정 결과가 1건도 달라지지 않게** 옮긴 것이다.
//   · `isRubricLikeQuestion`   ← `find-resources.js:211-224`
//   · `extractAnswerQuestions` ← `find-resources.js:226-239`
//   · `inferAssessmentStructure` ← `find-resources.js:241-299`
//
// 근거 문서: docs/수행평가-상세-명세.md §12.2(이식 — 도메인 규칙 코드) 2·3행.
//
// ─────────────────────────────────────────────────────────────────────
// 왜 파일을 새로 만들었나 / 왜 이 이름인가
// ─────────────────────────────────────────────────────────────────────
// 기존 3모듈은 "무엇을 담느냐"로 갈려 있다 — `prompts.js`(모델에 넣는 문자열),
// `knowledge.js`(RAG 검색측), `embeddings.js`(문서측 임베딩). 여기 담기는 것은 셋 중
// 어디에도 속하지 않는다. **모델을 부르지 않고 안내문 평문만 보고 결정론적으로 내리는
// 판정**이라서, 프롬프트 자산과 섞이면 §12.1(프롬프트 1바이트 불변)과 §12.2(도메인 규칙)
// 의 검증 대상 경계가 흐려진다.
// 이름은 이 저장소가 안내문을 부르는 말(`guide_input_mode`/`guide_freetext`/`guide_json`,
// `api/_routes/performance/analyze-guide.js`)을 따라 `guide-` 접두를 쓰고, 판정 산출물이
// "제출 구조"라서 `-structure`를 붙였다. 외부의 함수명 `inferAssessmentStructure`는
// 그대로 둔다 — §12.2 표가 그 이름으로 자산을 지목하고 있어 대조 시 검색어가 된다.
//
// ─────────────────────────────────────────────────────────────────────
// 손대지 않은 것 (전부 의도적이다)
// ─────────────────────────────────────────────────────────────────────
// 정규식·어휘 목록·판정 우선순위·`type`/`reason`/`writingFrame` 문구는 **원문 그대로**다.
// 이 값들은 안내문 실물을 보며 굳은 현장 튜닝의 산물이고, "더 나은 정규식"으로 바꾸면
// 판정이 조용히 뒤집힌다(그리고 아무 에러도 나지 않는다).
// `api/_lib/performance/guide-structure.test.ts`(옛 scripts/verify-performance-guide-structure.mjs)가 원본 함수를 직접 실행해 같은
// 입력·같은 출력을 매 `npm run verify`마다 대조한다.
//
// 남겨둔 성질 2가지 — 고치지 않았고, 고치려면 명세 결정이 먼저다:
//
//   (가) `isRubricLikeQuestion('')`는 `true`다(`find-resources.js:213`).
//        "빈 문자열은 루브릭이다"는 의미상 이상하지만, 이 함수의 **유일한 호출부**는
//        `extractAnswerQuestions`의 `.filter((q) => !isRubricLikeQuestion(q.text))`이고
//        거기서 `true`는 곧 **제외**를 뜻한다. 즉 이 반환값의 실제 의미는 "루브릭이다"가
//        아니라 "답변 문항으로 채택하지 마라"이며, 빈 문항을 버리는 것은 옳다.
//        (애초에 앞단 `.filter((q) => q.text && …)`가 빈 텍스트를 이미 걸러서 이 경로는
//        현재 도달 불가능한 방어선이다.) 함수를 단독으로 다른 곳에서 쓰게 될 때만
//        의미가 문제되므로, **판정을 바꾸지 않고** 이 주석으로 계약을 고정한다.
//
//   (나) 문항형이 질문 **1건**으로 발동한다(`find-resources.js:246` `if (questions.length)`).
//        §12.2 3행이 "임계값은 정책 결정 필요"로 열어둔 항목이다. 결정 전까지 원본과
//        같은 1건 임계값을 유지한다 — 임의로 2건으로 올리면 그 순간 판정이 갈린다.
//
//   (다) `writingFrame`은 **학생이 올린 안내문 원문**이다(`문항 N: <원문 그대로>` 최대 12줄).
//        그리고 그 값이 `buildDesignReportSystem`의 `[안내문 구조 판정] - 우선 작성 틀:`로
//        보간되므로, 사용자 입력이 **system 프롬프트 문맥으로 승격되는 경로가 실재한다.**
//        그대로 두는 근거는 "범위가 자해에 그친다"는 것이다:
//          · 같은 안내문 전문이 어차피 user 메시지에도 들어간다(권한이 새로 생기지 않는다).
//          · 나머지 주입원은 어드민 큐레이션 DB(`knowledge.js`)와 본인 프로필로 잠긴 과거
//            세션(`match_student_performance_sessions`의 `filter_profile_id`)뿐이라
//            **타 학생·타 세션으로 번지는 경로가 없다.** 최악은 자기 리포트를 자기가 망치는 것.
//          · 자료 카드는 서버가 DB 행으로 채우므로 오염되지 않는다(design-report.js §3).
//        방어를 넣는다면 줄당 길이 상한 + 개행 정규화 정도가 적절하고, **정규식으로 문구를
//        걸러내는 것은 금지**다 — 그 순간 §12.2의 "판정이 1건도 달라지지 않는다"가 깨진다.

// ─────────────────────────────────────────────────────────────────────
// 판정 입력의 직렬화 (안내문 평문 한 덩어리)
// ─────────────────────────────────────────────────────────────────────
// 아래 세 함수는 전부 **줄바꿈이 살아 있는 안내문 평문 문자열** 하나를 받는다. 특히
// `extractAnswerQuestions`의 정규식은 `^…질문 n:` 을 `m` 플래그로 **행 앞**에서 찾으므로,
// JSON을 `JSON.stringify` 하거나 필드를 공백으로 이어붙이면 문항형 판정이 통째로 죽는다.
//
// 외부 앱이 넘긴 값은 `selectedSavedSession.assessment_info || ''`
// (`find-resources.js:358`)였고, 그 컬럼의 내용은
//   · 업로드 분기: vision 추출 결과 원문의 누적(`analyze-assessment-storage.js:122`
//     `${session.assessment_info || ''}\n\n${result}`.trim(), 다장이면 `index.html:1680`이
//     `[사진 n]` 머리말과 함께 이어붙임)
//   · 직접 입력 분기: 사용자가 입력한 원문 trim(`index.html:1732`)
// 두 가지뿐이다. 즉 **모델이 낸 평문/사람이 친 평문을 가공 없이** 그대로 먹였다.
//
// 이 저장소에서 그에 대응하는 값은 `guide_input_mode`에 따라 갈린다(§8.3,
// `api/_routes/performance/analyze-guide.js:273-291`, `:472-490`):
//   · `'upload'` → `performance_sessions.guide_json.text`
//        (N장을 단일 vision 호출로 종합한 평문 한 덩어리. `GUIDE_EXTRACTION_SYSTEM`이
//         외부 `analyze-assessment-storage.js:70-110`의 원문 이식이라 `[답변 문항 목록]`
//         섹션과 `질문 n:` 줄 형식이 외부와 바이트 단위로 동일하다. 외부의 `[사진 n]`
//         머리말은 단일 호출로 통합되면서 사라졌을 뿐, 정규식이 보는 앵커는 그대로다.)
//   · `'manual'` → `performance_sessions.guide_freetext`
//        (`guide_json`은 이 분기에서 null이다. 외부 `submitManualInfo`와 같은 값.)
/** 안내문 판정이 실제로 읽는 세션 필드만 담은 최소 형태. */
type GuideSession = {
  guide_input_mode?: string;
  guide_json?: { mode?: string; text?: string };
  guide_freetext?: string;
  submission_schema?: unknown;
};

export function guideTextFromSession(session: GuideSession = {}): string {
  if (!session || typeof session !== "object") return "";

  const mode = session.guide_input_mode || session.guide_json?.mode || "";

  if (mode === "manual") return String(session.guide_freetext || "").trim();

  // upload — 또는 mode가 아직 안 정해진 세션. 있는 쪽을 쓰되 upload 결과를 우선한다.
  const uploaded = session.guide_json?.text;

  return String(uploaded || session.guide_freetext || "").trim();
}

// ─────────────────────────────────────────────────────────────────────
// 이하 원문 이식 구간 — 정규식/어휘/문구/순서 변경 금지
// ─────────────────────────────────────────────────────────────────────

/**
 * 루브릭(평가기준) 문장인가 — `find-resources.js:211-224` 원문 이식.
 *
 * 안내문에는 "도서명, 탐구 주제, 관련 단원을 구체적으로 제시하였는가?"처럼 **채점자용**
 * 문장이 학생 답변 문항과 같은 번호 형식으로 섞여 들어온다. 이걸 걸러내지 않으면
 * 설계 리포트가 학생에게 "평가기준에 답하라"고 시킨다.
 *
 * 판정은 2단이다.
 *   ① 어미·용어 직격 세트(`~하였는가/했는가`, 배점/채점/체크리스트 …)
 *   ② '평가 형용사 + 수행 동사 + 의문 표지 부재' 3항 동시 충족
 *      — 세 번째 항(부정 조건)이 핵심이다. `?`나 `무엇/어떻게/왜`, `~하시오`가 있으면
 *        학생에게 던진 질문으로 보고 루브릭에서 뺀다.
 *
 * `''` → `true`인 성질은 파일 상단 (가) 참조. 호출부에서 `true`는 "제외"를 뜻한다.
 */
export function isRubricLikeQuestion(text = ""): boolean {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return true;

  if (
    /하였는가|했는가|작성했는가|제시했는가|설명했는가|포함했는가|연결했는가|충족했는가|평가\s*기준|배점|점수|채점|체크\s*리스트|체크\s*\d+/i.test(
      t,
    )
  ) {
    return true;
  }

  const looksLikeCriterion =
    /(구체적|명확|충실|적절|논리적|체계적|정확)/.test(t) &&
    /(제시|작성|설명|포함|연결|활용|반영)/.test(t) &&
    !/(무엇|어떻게|왜|느낀|생각|서술하시오|작성하시오|설명하시오|제시하시오|\?)/.test(
      t,
    );

  return looksLikeCriterion;
}

/**
 * 안내문 평문에서 학생 답변 문항만 추출 — `find-resources.js:226-239` 원문 이식.
 *
 * `^ … 질문 n: …` 행 앵커(`m` 플래그)에 의존한다. 입력 직렬화 규칙은 파일 상단 참조.
 * `목록 없음|없음`은 `GUIDE_EXTRACTION_SYSTEM`이 "문항 없음"을 표기하는 리터럴이라
 * 문항이 아니라 부재 신호로 읽고 버린다.
 */
export function extractAnswerQuestions(
  text = "",
): { no: number; text: string }[] {
  const seen = new Set<string>();
  return (
    [
      ...String(text || "").matchAll(
        /^\s*(?:[-*•]\s*)?질문\s*(\d+)\s*[:：]\s*([^\n]+)/gm,
      ),
    ]
      // m[2]는 정규식 캡처그룹 2번 — 매치가 존재하면(matchAll 결과) 항상 존재한다.
      .map((m) => ({ no: Number(m[1]), text: m[2]!.trim() }))
      .filter((q) => q.text && !/목록\s*없음|없음/.test(q.text))
      .filter((q) => !isRubricLikeQuestion(q.text))
      .filter((q) => {
        const key = `${q.no}:${q.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.no - b.no)
  );
}

/**
 * 안내문 → 제출 구조 7유형 판정 — `find-resources.js:241-299` 원문 이식.
 *
 * 반환 `{ type, reason, writingFrame }`은 설계 리포트(P10) 프롬프트에 그대로 들어가는
 * 문자열이라 문구가 곧 계약이다.
 *
 * **우선순위는 정규식보다 중요하다**(먼저 맞는 것이 이긴다):
 *   1. 문항별 답변형   — 번호형 문항이 1건이라도 있으면 (파일 상단 (나))
 *   2. 카드뉴스·홍보물형 — 카드뉴스|홍보물|포스터|뉴스레터
 *   3. 발표·PPT형       — 발표|ppt|피피티|대본|프레젠테이션
 *   4. 칼럼·논술형      — 칼럼|논설|비평|에세이|주장하는 글|논술
 *   5. 안내문 맞춤 작성형 — 탐구 내용|배우고 느낀 점|느낀점|N자 이상|분량
 *   6. 탐구보고서형     — 실험|탐구보고서|…|보고서
 *   7. 기본 보고서형    — 그 외
 * 6번의 `보고서`는 대부분의 안내문에 등장하는 흔한 단어라 **거의 마지막**에 놓여 있다.
 * 순서를 바꾸면 5·6·7 대부분이 6번으로 빨려 들어간다.
 *
 * 판정은 공백을 1칸으로 접은 `compact`에 대해 하지만, 문항 추출은 **줄바꿈이 살아 있는
 * `raw`**에 대해 한다(2·6행 정규식이 `compact`, 문항만 `raw`인 것이 원문 그대로다).
 */
/** 제출 구조 7유형 판정 결과. */
type AssessmentStructure = {
  type: string;
  reason: string;
  writingFrame: string;
};

export function inferAssessmentStructure(
  assessmentInfo = "",
): AssessmentStructure {
  const raw = String(assessmentInfo || "");
  const compact = raw.replace(/\s+/g, " ").trim();
  const questions = extractAnswerQuestions(raw);

  if (questions.length) {
    return {
      type: "문항별 답변형",
      reason:
        "안내문에 학생이 실제로 답해야 하는 번호형 문항이 확인됨. 단, 평가기준형 질문은 제외함.",
      writingFrame: questions
        .slice(0, 12)
        .map((q) => `문항 ${q.no}: ${q.text}`)
        .join("\n"),
    };
  }

  if (/카드뉴스|홍보물|포스터|뉴스레터/.test(compact)) {
    return {
      type: "카드뉴스·홍보물형",
      reason: "안내문이 글 보고서보다 시각 자료 제작을 요구함.",
      writingFrame:
        "제작 의도 → 카드별 핵심 문구/자료 → 교과 개념 연결 → 마무리 메시지",
    };
  }

  if (/발표|ppt|피피티|대본|프레젠테이션/.test(compact)) {
    return {
      type: "발표·PPT형",
      reason: "안내문이 발표 자료 또는 발표 대본 구성을 요구함.",
      writingFrame:
        "도입 → 슬라이드별 핵심 내용 → 말로 설명할 연결 문장 → 결론",
    };
  }

  if (/칼럼|논설|비평|에세이|주장하는 글|논술/.test(compact)) {
    return {
      type: "칼럼·논술형",
      reason: "안내문이 탐구 사실 나열보다 주장과 근거 중심의 글을 요구함.",
      writingFrame:
        "문제 제기 → 핵심 주장 → 근거 분석 → 반론/한계 → 결론 및 제언",
    };
  }

  if (
    /탐구\s*내용|배우고\s*느낀\s*점|느낀점|\d+\s*자\s*이상|분량/.test(compact)
  ) {
    return {
      type: "안내문 맞춤 작성형",
      reason: "안내문에 특정 작성 항목이나 분량 조건이 제시되어 있음.",
      writingFrame:
        "안내문에 제시된 항목명과 분량 조건을 우선하고, 필요한 경우 주제 선정 이유 → 탐구 내용 → 배우고 느낀 점 → 출처 순서로 구성",
    };
  }

  if (
    /실험|탐구보고서|탐구 보고서|실험보고서|조사 보고서|보고서/.test(compact)
  ) {
    return {
      type: "탐구보고서형",
      reason: "안내문에서 별도 문항형 답변보다 보고서 성격이 강함.",
      writingFrame: "서론 → 교과 개념 정리 → 자료·사례 분석 → 결론",
    };
  }

  return {
    type: "기본 보고서형",
    reason: "안내문에서 특정 제출 형식이 뚜렷하게 확인되지 않음.",
    writingFrame: "서론 → 본론 → 결론",
  };
}

/**
 * 세션 행 → 판정 결과. P10 설계 리포트가 부를 진입점이다.
 *
 * §12.2 3행 「판정 결과를 구조체로 리포트 JSON에 저장해 STEP5가 재판정하지 않게 한다」에
 * 따라 반환 구조체를 그대로 영속화할 수 있게 판정 근거(`mode`)를 함께 돌려준다.
 */
export function inferGuideStructure(
  session: GuideSession = {},
): AssessmentStructure & { mode: string | null } {
  const text = guideTextFromSession(session);

  return {
    ...inferAssessmentStructure(text),
    mode: session?.guide_input_mode || session?.guide_json?.mode || null,
  };
}
