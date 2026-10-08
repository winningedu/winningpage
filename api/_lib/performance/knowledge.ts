// 수행평가 RAG — 검색측 모듈 (질의 → 프롬프트 주입 문자열).
//
// 외부 앱(`/Users/hyunsoo/uwellnow/suhaengpyeong`)의 `api/_lib/dynamic-knowledge.js`
// (위닝DB 지식 검색) + `api/_lib/reports.js:162-238`(학생 과거 수행 검색) 두 갈래를
// 이 저장소로 이식한 것이다. 문서측 임베딩은 짝 모듈 `embeddings.js`가 담당한다.
//
// 근거 문서: docs/수행평가-상세-명세.md §8.7(RAG 인프라), §12.2(도메인 규칙 코드),
//            §12.3(RAG 검색·임베딩 튜닝값)
//
// ─────────────────────────────────────────────────────────────────────
// 2-DB 교차가 사라져서 달라진 것
// ─────────────────────────────────────────────────────────────────────
// 외부는 Supabase가 2개였다 — 신분·지식베이스는 `winningSupabaseAdmin`, 세션·리포트는
// `supabaseAdmin`. 그래서 원본에는 (ㄱ) 두 클라이언트 팩토리, (ㄴ) `WINNING_SUPABASE_*`
// ↔ `SUPABASE_*` 상호 폴백 env 체인(`config.js:4-25`), (ㄷ) 클라이언트가 없을 때
// `'홈페이지 Supabase 위닝DB 연결 환경변수 없음'`이라는 **한국어 문장을 검색 결과로
// 반환**하는 경로(`dynamic-knowledge.js:350-352`)가 있었다. 여기서는 셋 다 없다
// (§12.4 「Supabase 2개 교차 + 상호 폴백 env 체인」 폐기). 클라이언트는
// `createSupabaseAdmin()` 하나이고, env가 없으면 그 함수가 즉시 throw한다.
// 지식베이스와 학생 세션이 같은 DB에 있으므로 조인 불가 문제도 사라졌다.
//
// ─────────────────────────────────────────────────────────────────────
// 반환 타입을 문자열 → 객체로 바꿨다 (§8.7 「제안(관측성)」)
// ─────────────────────────────────────────────────────────────────────
// 원본은 실패를 **프롬프트 문자열로 위장**했다 — 검색이 죽으면
// `'홈페이지 Supabase 위닝DB 지식 조회 실패 또는 테이블 미생성'`이 반환값이 되어 지식
// 블록 자리에 그대로 박힌다(`:351`, `:388`, `:391`). 모델은 그것을 자료로 읽고, 그
// 시점에 외부 앱은 회차를 이미 차감한 뒤였다.
//   → `{ text, source, hitCount, injectedChars, degraded }`를 돌려주고, 실패 시 `text`는
//     **빈 문자열**로 둔다. 프롬프트 빌더가 `NO_KNOWLEDGE_TEXT`로 채우므로 모델은
//     "자료 없음"만 보고, `degraded=true`는 로그·응답 메타로만 흐른다.
// (우리 구현의 차감은 애초에 AI 호출 성공 이후 1회뿐이다 — §9.3.)
//
// ─────────────────────────────────────────────────────────────────────
// dev 지식베이스가 0행인 것은 현재 정상이다
// ─────────────────────────────────────────────────────────────────────
// 코퍼스 적재는 별도 작업이다. 검색이 빈 결과를 돌려주는 것은 버그가 아니라
// `source:'none'`이며, 이때 프롬프트에는 원문 그대로 `관련 위닝DB 항목 없음`이 들어간다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../supabaseAdmin.js";
import type { AiTrace } from "../telemetry/trace.js";
import { embedText } from "./embeddings.js";
import { buildKnowledgeKeywordQuery } from "./knowledgeKeywords.js";
import { NO_KNOWLEDGE_TEXT, NO_STUDENT_HISTORY_TEXT } from "./prompts.js";

/** 위닝DB 지식 항목 행 — 이 파일이 실제로 읽는 필드만 담은 최소 형태. */
export type KnowledgeRow = {
  id?: string;
  knowledge_type?: string;
  grade?: string;
  subject?: string;
  career_field?: string;
  title?: string;
  content?: string;
  source?: string;
  source_link?: string;
  memo?: string;
  created_at?: string;
  similarity?: number;
};

/** 지식베이스 테이블. `api/performance/admin-embed.js`의 상수와 같은 값이다. */
const KNOWLEDGE_TABLE = "winning_assessment_knowledge_items";

// ─────────────────────────────────────────────────────────────────────
// threshold — RPC 기본값(0.52)과 다르므로 **항상 명시 전달한다**
// ─────────────────────────────────────────────────────────────────────
// §8.7 BLOCK: 명시하지 않으면 리콜이 조용히 줄고 벡터 0건 → 폴백으로 떨어져 품질이
// 무성의하게 저하되는데 **오류가 나지 않아 발견이 늦다.** 그래서 상수로 고정한다.
// 두 값 모두 §12.3의 현장 튜닝값이다.

/** `topic_pattern` 검색 임계값(§12.3). 원문 `dynamic-knowledge.js:245`. */
export const TOPIC_MATCH_THRESHOLD = 0.5;

/** `verified_resource` 검색 임계값(§12.3). 원문 `dynamic-knowledge.js:245`. */
export const RESOURCE_MATCH_THRESHOLD = 0.48;

/** 학생 과거 수행 검색 임계값 — **주제 추천 기준 0.48**(§12.3, 원문 `recommend-topics.js:104`). */
export const STUDENT_HISTORY_MATCH_THRESHOLD = 0.48;

/**
 * 학생 과거 수행 검색 임계값 — 설계 리포트 기준 0.46(원문 `find-resources.js:373`).
 * 주제 추천(0.48)과 값이 다른 것이 의도인지 오타인지 미확인이다(§11 Q72). P10이 쓴다.
 */
export const STUDENT_HISTORY_DESIGN_MATCH_THRESHOLD = 0.46;

/** 주제 추천 호출부 주입 상한(§8.7 표). 자료 추천은 8000이므로 혼동 금지. */
export const TOPIC_MAX_CHARS = 4500;

/** 자료(설계 리포트) 호출부 주입 상한(§8.7 표). P10이 쓴다. */
export const RESOURCE_MAX_CHARS = 8000;

/** 주제 추천 호출부(recommend-topics.ts)가 프롬프트에 넣는 위닝DB 행 수 상한. */
export const TOPIC_MAX_ITEMS = 6;

/** 설계 리포트 호출부(design-report.ts)가 프롬프트에 넣는 위닝DB 행 수 상한. */
export const RESOURCE_MAX_ITEMS = 8;

/** 지식 유형별 벡터 검색 임계값. 학생 요청 경로와 관리자 검색 테스트가 함께 쓴다. */
export function knowledgeMatchThreshold(knowledgeType: string): number {
  return knowledgeType === "verified_resource"
    ? RESOURCE_MATCH_THRESHOLD
    : TOPIC_MATCH_THRESHOLD;
}

/** 벡터 검색 결과를 프롬프트 조각으로 만들 때 붙이는 라벨. */
export function knowledgeVectorLabel(knowledgeType: string): string {
  return knowledgeType === "verified_resource"
    ? "전과목 유사도 기반 위닝 수행 자료 DB"
    : "전과목 유사도 기반 위닝 수행 주제 DB";
}

// ─────────────────────────────────────────────────────────────────────
// normalizeSubject — 8교과군 정규화 사전 (원문 `dynamic-knowledge.js:5-65`)
// ─────────────────────────────────────────────────────────────────────
// **도메인 자산이다. 매핑 목록을 줄이거나 재배열하지 마라.** `화법과 언어`/`매체`→국어,
// `이산수학`→수학, `기후변화와지속가능세계`→사회, `물질과에너지`/`전자기`/`행성`→과학처럼
// 2022 개정 교육과정 과목명을 직접 겨냥한 항목들이라, 언뜻 중복돼 보이는 키워드도
// 특정 과목명 하나를 잡으려고 들어가 있다.
//
// **판정 순서가 곧 우선순위다.** 예: `한국사`는 사회 체인의 `역사`보다 먼저 걸려야
// 별도 교과군으로 분류된다. if 체인을 배열 상수로 뒤집는 리팩터링(§12.2 제안)은
// 이 순서를 보존하는 형태여야 하므로 이식 단계에서는 원문 구조를 그대로 둔다.
//
// **기본 반환 `subject || '국어'`(원문 `:64`)를 유지한 이유** — §12.2가 "오분류 유발 →
// `'공통'` 또는 원본 유지로 변경 검토"라고 적었지만 미결이고, 실제 반환식은
// `subject || '국어'`라 **입력이 있으면 원본 문자열이 그대로 나온다.** `'국어'`가 나오는
// 경우는 입력이 빈 문자열일 때뿐이다. 즉 §12.2가 지목한 오분류는 "미매칭 → 국어"가
// 아니라 "빈 입력 → 국어"이며, 빈 과목으로 검색하는 상황 자체가 상위에서 막힌다
// (STEP1 폼이 과목을 필수로 받는다). 결정 없이 바꾸면 기존 검색 분포만 흔들린다.
export function normalizeSubject(subject = ""): string {
  const s = String(subject || "").replace(/\s/g, "");

  if (
    s.includes("국어") ||
    s.includes("문학") ||
    s.includes("독서") ||
    s.includes("작문") ||
    s.includes("화법") ||
    s.includes("언어") ||
    s.includes("매체")
  )
    return "국어";

  if (
    s.includes("수학") ||
    s.includes("대수") ||
    s.includes("미적분") ||
    s.includes("기하") ||
    s.includes("확률") ||
    s.includes("통계") ||
    s.includes("이산")
  )
    return "수학";

  if (s.includes("영어") || s.includes("영미")) return "영어";

  if (s.includes("한국사")) return "한국사";

  if (
    s.includes("사회") ||
    s.includes("역사") ||
    s.includes("윤리") ||
    s.includes("지리") ||
    s.includes("경제") ||
    s.includes("정치") ||
    s.includes("법") ||
    s.includes("세계시민") ||
    s.includes("국제관계") ||
    s.includes("기후변화")
  )
    return "사회";

  if (
    s.includes("과학") ||
    s.includes("생명") ||
    s.includes("화학") ||
    s.includes("물리") ||
    s.includes("지구") ||
    s.includes("세포") ||
    s.includes("유전") ||
    s.includes("물질과에너지") ||
    s.includes("화학반응") ||
    s.includes("전자기") ||
    s.includes("양자") ||
    s.includes("역학") ||
    s.includes("행성") ||
    s.includes("우주")
  )
    return "과학";

  if (
    s.includes("정보") ||
    s.includes("데이터") ||
    s.includes("소프트웨어") ||
    s.includes("인공지능")
  )
    return "정보";

  return subject || "국어";
}

function unique(values: unknown[]): string[] {
  return [
    ...new Set(values.map((v) => String(v || "").trim()).filter(Boolean)),
  ];
}

function scoreText(text: unknown, keywords: unknown[]): number {
  const base = String(text || "").toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    const k = String(keyword || "")
      .trim()
      .toLowerCase();
    if (!k) continue;
    if (base.includes(k)) score += 3;
  }

  return score;
}

/**
 * 행의 출처 링크. 원문 `getRowSourceLink`(`dynamic-knowledge.js:110-146`)의
 * **10키 탐색 + `meta`/`metadata`/`extra` JSON 파싱 + `row.source` 정규식**을
 * `source_link` 단일 참조로 정리했다.
 *
 * 그 다중 폴백은 목적지 테이블에 링크 컬럼이 하나도 없어서 생긴 우회이고 실효 경로가
 * 정규식 1줄뿐이었는데(§8.7 WARN), `sql/53_performance.sql`이 `source_link text` 컬럼을
 * 신설하고 **그 정규식을 SQL로 그대로 옮겨 기존 행을 백필**했으므로 근거가 사라졌다.
 * RPC도 `source_link`를 반환 컬럼에 포함한다. `buildKnowledgeSearchText`가 같은 이유로
 * 이미 단일 참조로 정리돼 있어(embeddings.js) 검색측도 같은 규칙으로 맞춘다.
 */
function getRowSourceLink(row: KnowledgeRow = {}): string {
  return String(row?.source_link || "").trim();
}

/**
 * 행 1건 → 프롬프트 조각. **문자 단위 원문 이식**(§12.3 「RAG 질의문 조립 + 결과 직렬화」).
 * 라벨과 필드 순서를 바꾸면 하위 파싱이 깨진다.
 */
function rowToText(row: KnowledgeRow, label = "위닝DB 항목"): string {
  const sourceLink = getRowSourceLink(row);
  const similarity =
    typeof row.similarity === "number"
      ? `\n- 유사도: ${row.similarity.toFixed(4)}`
      : "";

  return `
[${label}]
- 학년: ${row.grade || ""}
- 과목: ${row.subject || ""}
- 진로분야: ${row.career_field || ""}
- 자료명: ${row.title || ""}
- 출처: ${row.source || ""}
- 출처 링크: ${sourceLink || "없음"}${similarity}
- 내용:
${row.content || ""}
`.trim();
}

/**
 * 상한(`maxChars`)까지 조각을 채운다. 원문 `:167-181`.
 *
 * **break이지 continue가 아니다** — 한 조각이 상한을 넘기면 그 뒤 조각은 더 짧더라도
 * 버린다. 유사도 내림차순 순서를 유지하기 위한 의도된 동작이므로 "빈틈 채우기"로
 * 고치지 마라(§12.3 「`packRows`의 break 동작은 유지」).
 *
 * **반환이 `{piece, row}` 쌍인 이유**(§12.4 「`extractDbResources` 텍스트 왕복 파서 →
 * RAG 레이어가 `{rows, promptText}` 동시 반환」): 외부 앱은 이 함수가 만든 문자열을
 * 나중에 정규식으로 되파싱해 자료 행을 복원했다(`find-resources.js:113-150`). 라벨 한
 * 글자만 바뀌면 자료 0건이 되고 그 실패가 조용했다. 여기서는 **프롬프트에 실제로 들어간
 * 행 그 자체**를 함께 돌려주므로 되파싱할 이유가 없다.
 *
 * 상한에 걸려 잘린 행을 함께 버리는 것이 중요하다 — 프롬프트에 내용이 들어가지 않은
 * 자료를 호출부가 "모델이 고를 수 있는 후보"로 제시하면, 모델은 제목만 보고 고르게 된다.
 */
export function packRows(
  rows: KnowledgeRow[],
  maxChars: number,
  label: string,
): { piece: string; row: KnowledgeRow }[] {
  const packed: { piece: string; row: KnowledgeRow }[] = [];
  let total = 0;

  for (const row of rows) {
    const piece = rowToText(row, label);

    if (total + piece.length > maxChars) break;

    packed.push({ piece, row });
    total += piece.length;
  }

  return packed;
}

/**
 * 레거시 키워드 경로가 `grade`에 넣는 후보 목록. 원문 `:183-205`.
 * `공통`/`전체`/`고등학생`/`확인 필요`가 들어가는 이유는 미분류 지식을 잃지 않기
 * 위해서다(벡터 경로에서는 RPC 본문의 인라인 목록이 같은 일을 한다).
 */
export function getGradeCandidates(grade: unknown): string[] {
  const gradeText = String(grade || "").trim();

  const baseGrade = gradeText.includes("고1")
    ? "고1"
    : gradeText.includes("고2")
      ? "고2"
      : gradeText.includes("고3")
        ? "고3"
        : gradeText;

  const gradeAlias =
    baseGrade === "고1"
      ? "1학년"
      : baseGrade === "고2"
        ? "2학년"
        : baseGrade === "고3"
          ? "3학년"
          : "";

  return unique([
    gradeText,
    baseGrade,
    gradeAlias,
    "공통",
    "전체",
    "고등학생",
    "확인 필요",
  ]);
}

/**
 * RPC `filter_grade`에 넘길 단일값. 원문 `:207-215`. **벡터 경로에 필요한 학년 함수는
 * 이것 하나뿐이다**(§12.2).
 *
 * `null`을 반환하면 학년 필터가 통째로 무력화된다(RPC의 `filter_grade is null or …`).
 * 미분류 지식(`확인 필요`) 보존은 이 함수가 아니라 **RPC 본문의 인라인 목록**
 * (`sql/53_performance.sql` — `or w.grade in ('공통','전체','확인 필요')`)이 책임진다.
 */
export function getBaseGradeForRpc(grade: unknown): string | null {
  const text = String(grade || "").trim();

  if (text.includes("고1") || text.includes("1학년")) return "고1";
  if (text.includes("고2") || text.includes("2학년")) return "고2";
  if (text.includes("고3") || text.includes("3학년")) return "고3";

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// filter_subject를 넘기는가 — **`includeOtherSubjects === false`일 때만 넘긴다**
// ─────────────────────────────────────────────────────────────────────
// `sql/53_performance.sql`이 RPC에 `filter_subject text default null`을 신설했지만
// 외부 앱은 이 인자를 넘긴 적이 없다(파라미터 자체가 없었다). 넘길지 말지의 근거는
// 명세서 §8.7 「단정 (WARN — **자료 RAG**에 과목 필터가 없다)」에 그대로 있다:
//
//   "`includeOtherSubjects:false`는 **레거시 키워드 경로에서만** 쓰이고 벡터 경로에는
//    전달조차 되지 않는다(`dynamic-knowledge.js:307-309`). 시안의 국어 주제 리포트에
//    `연잎 효과 초발수 표면`·`항생제 내성 관리대책`이 섞인 원인이다."
//
// 즉 이 WARN이 지목한 결함은 "과목 필터가 없다"가 아니라 **"이미 존재하는
// `includeOtherSubjects:false` 의사표시가 벡터 경로에서 무시된다"**이다. 그래서 고치는
// 방법도 필터를 새로 강제하는 게 아니라 **그 플래그를 벡터 경로에 연결하는 것**이다.
//
// 호출부별 귀결(§8.7 표):
//   · 주제 추천(P8)   `includeOtherSubjects: true`  → `filter_subject = null` = 현행 동작 보존
//   · 자료/설계(P10)  `includeOtherSubjects: false` → `filter_subject = normalizeSubject(subject)`
//
// 주제 추천에서 과목을 좁히면 안 되는 이유는 프롬프트 자체가 반증한다 —
// `CROSS_SUBJECT_CONNECTION_GUIDE` 11조와 `다른 과목 선배 데이터 활용 규칙` 5조는
// **다른 과목 후보가 검색 결과에 들어온다는 전제**로 쓰인 지시다. 여기서 과목을 좁히면
// 그 두 자산이 통째로 사문(死文)이 되고, 10조("3개 중 최소 1개는 같은 과목 심화")가
// 전제하는 "나머지는 다른 과목일 수 있다"도 성립하지 않는다.
//
// **threshold 재튜닝 문제도 이 선택이 회피한다.** §8.7은 "적용 후 threshold 재측정"을
// 요구하고 §11 Q72는 그 재튜닝을 미결(정답 세트 없음 + dev 코퍼스 0행이라 측정 불가)로
// 남겼다. 주제 추천 경로에 필터를 걸지 않으면 0.50은 **튜닝된 그 조건 그대로** 유효하다.
// 자료 경로(P10)는 필터가 붙으므로 그때 재측정 대상이 되며, 이 사실은 P10 착수 시점의
// 알려진 부채다.
export function resolveFilterSubject({
  includeOtherSubjects,
  subject,
}: {
  includeOtherSubjects?: boolean;
  subject?: string;
}): string | null {
  if (includeOtherSubjects) return null;

  // RPC는 `filter_subject`가 값이면 해당 과목 + `'공통'/'전체'/'확인 필요'`를 통과시킨다
  // (`grade` 절과 같은 모양). 정확 일치로 좁히면 과목 무관 태그 행이 조용히 빠지는데,
  // 그 폴백이 RPC 본문에 들어 있어 여기서는 정규화된 교과군만 넘기면 된다.
  return normalizeSubject(subject) || null;
}

/** `loadByVectorSearch`/`loadByLegacyKeywordSearch`가 공유하는 검색 조건. */
type KnowledgeSearchArgs = {
  grade?: string;
  subject?: string;
  career?: string;
  selectedTopic?: string;
  assessmentInfo?: string;
  knowledgeType: string;
  maxItems: number;
  maxChars: number;
  includeOtherSubjects?: boolean;
};

type KnowledgeSearchResult = {
  text: string;
  hitCount: number;
  rows: KnowledgeRow[];
  /** 계기판용: 검색이 돌려준 원 행 수(패킹 전). */
  rawHits: number;
  /** 계기판용: 첫 행의 유사도. 키워드 검색은 null. */
  topScore: number | null;
  /** 계기판용: 질의 임베딩에 걸린 시간(ms). 키워드 검색은 null. */
  embedMs: number | null;
};

/**
 * 벡터 검색 질의문. 6줄과 안내문 **2500자** 절단은 문자 단위 원문이다(§12.3).
 * 학생 요청 경로와 관리자 검색 테스트가 같은 문자열을 쓰도록 순수 함수로 둔다.
 */
export function buildKnowledgeQueryText({
  grade,
  subject,
  career,
  selectedTopic,
  assessmentInfo,
}: {
  grade?: string | undefined;
  subject?: string | undefined;
  career?: string | undefined;
  selectedTopic?: string | undefined;
  assessmentInfo?: string | undefined;
}): string {
  return [
    `학년: ${grade || ""}`,
    `현재 과목: ${subject || ""}`,
    `정규화 과목군: ${normalizeSubject(subject)}`,
    `희망 진로: ${career || ""}`,
    `선택 또는 이전 주제: ${selectedTopic || ""}`,
    `수행평가 안내문: ${String(assessmentInfo || "").slice(0, 2500)}`,
  ].join("\n");
}

/**
 * 하이브리드 RPC 의 단어 질의. 과목이 비면 normalizeSubject 의 기본값('국어')이 질의에
 * 섞이지 않게 정규화 교과군도 비운다. 학생 요청 경로와 관리자 검색 테스트가 같이 쓴다.
 */
export function buildKnowledgeKeywordQueryFor({
  subject,
  career,
  selectedTopic,
}: {
  subject?: string | undefined;
  career?: string | undefined;
  selectedTopic?: string | undefined;
}): string {
  return buildKnowledgeKeywordQuery({
    subject,
    normalizedSubject: subject ? normalizeSubject(subject) : "",
    career,
    selectedTopic,
  });
}

/** 질의 임베딩과 그 소요 시간. 하이브리드와 벡터 경로가 한 번 만든 값을 같이 쓴다. */
type QueryEmbedding = { embedding: number[]; embedMs: number };

/**
 * 질의문 임베딩. 질의문 6줄과 안내문 **2500자** 절단은 문자 단위 원문이다(§12.3).
 * 학생 과거 수행 경로의 2000자와 다르므로 혼동하지 않는다.
 */
async function embedKnowledgeQuery(
  args: KnowledgeSearchArgs,
): Promise<QueryEmbedding> {
  const queryText = buildKnowledgeQueryText(args);
  const embedStartedAt = Date.now();
  const embedding = await embedText(queryText);
  return { embedding, embedMs: Date.now() - embedStartedAt };
}

/** 두 벡터 계열 RPC 가 같이 받는 필터 인자. */
function knowledgeRpcFilterArgs({
  grade,
  subject,
  knowledgeType,
  maxItems,
  includeOtherSubjects,
}: KnowledgeSearchArgs) {
  return {
    filter_knowledge_type: knowledgeType,
    filter_grade: getBaseGradeForRpc(grade),
    match_count: Math.max(maxItems * 2, 10),
    match_threshold: knowledgeMatchThreshold(knowledgeType),
    // includeOtherSubjects/subject는 falsy 취급이 undefined와 동일해 값 대체가 안전하다.
    filter_subject: resolveFilterSubject({
      includeOtherSubjects: Boolean(includeOtherSubjects),
      subject: subject ?? "",
    }),
  };
}

/**
 * RPC 결과 행을 maxItems 로 자르고 packRows 로 채운다. 하이브리드와 벡터 경로가 같이 쓴다.
 * topScore 는 행 중 유사도 최댓값이다. 하이브리드는 RRF 순서라 1위가 최댓값이 아닐 수 있다.
 */
function packSearchRows(
  data: KnowledgeRow[] | null,
  { knowledgeType, maxItems, maxChars }: KnowledgeSearchArgs,
  embedMs: number,
): KnowledgeSearchResult {
  const all = data || [];
  const rows = all.slice(0, maxItems);
  const rawHits = all.length;
  const similarities = all
    .map((row) => row.similarity)
    .filter((value): value is number => typeof value === "number");
  const topScore = similarities.length ? Math.max(...similarities) : null;

  if (!rows.length) {
    return { text: "", hitCount: 0, rows: [], rawHits, topScore, embedMs };
  }

  const packed = packRows(rows, maxChars, knowledgeVectorLabel(knowledgeType));

  return {
    text: packed.map((entry) => entry.piece).join("\n\n"),
    hitCount: packed.length,
    // 프롬프트에 **실제로 들어간** 행만 돌려준다(packRows 주석 참조).
    rows: packed.map((entry) => entry.row),
    rawHits,
    topScore,
    embedMs,
  };
}

/**
 * 하이브리드 검색(1차 경로). 의미 순위와 PGroonga 단어 순위를 RPC 안에서 RRF 로 합친다.
 * 필터와 threshold 는 벡터 경로와 같다. threshold 는 의미 쪽에만 걸리므로 단어로만 걸린
 * 행은 유사도가 threshold 아래일 수 있고, 그 행도 실제 유사도와 함께 직렬화된다.
 */
async function loadByHybridSearch(
  db: SupabaseClient,
  args: KnowledgeSearchArgs,
  query: QueryEmbedding,
): Promise<KnowledgeSearchResult> {
  const { data, error } = await db.rpc("match_winning_suhaeng_hybrid", {
    query_embedding: query.embedding,
    query_keywords: buildKnowledgeKeywordQueryFor(args),
    ...knowledgeRpcFilterArgs(args),
  });

  if (error) throw error;

  return packSearchRows(data, args, query.embedMs);
}

/**
 * 벡터 검색(하이브리드 실패 시 2차 경로). 원문 `loadByVectorSearch`(`dynamic-knowledge.js:217-260`).
 */
async function loadByVectorSearch(
  db: SupabaseClient,
  args: KnowledgeSearchArgs,
  query: QueryEmbedding,
): Promise<KnowledgeSearchResult> {
  const { data, error } = await db.rpc("match_winning_suhaeng_all_subjects", {
    query_embedding: query.embedding,
    ...knowledgeRpcFilterArgs(args),
  });

  if (error) throw error;

  return packSearchRows(data, args, query.embedMs);
}

/**
 * 키워드 검색 폴백. 원문 `loadByLegacyKeywordSearch`(`dynamic-knowledge.js:262-337`).
 *
 * 원문 대비 2가지를 바꿨다(둘 다 §8.7 「제안(키워드 폴백 축소)」):
 *   ① `select('*')` → 명시 컬럼. 원문은 768차원 `embedding`과 `search_text`까지 최대
 *      160행 통째로 끌어왔다. 스코어링에 쓰지 않는 데이터다.
 *   ② `rag_use` 필터 추가. 원문에는 빠져 있어 **RPC에서 제외되는 항목이 폴백에서는
 *      프롬프트로 샜다.** RPC와 같은 술어(`coalesce(rag_use, true) = true`)를
 *      PostgREST `or`로 옮긴다 — 이 컬럼은 옵트아웃(기본 true)이라 null도 통과다.
 *
 * 스코어링(substring +3)과 후보 목록 조립은 원문 그대로다. §8.7이 "안내문 앞 300자를
 * 통째로 키워드로 쓰므로 사실상 점수가 붙지 않는다"고 지적하지만 대체 랭킹이 결정되지
 * 않았고, 이 경로는 **벡터 검색이 throw했을 때만** 도는 비상구다.
 */
async function loadByLegacyKeywordSearch(
  db: SupabaseClient,
  {
    grade,
    subject,
    career,
    selectedTopic,
    assessmentInfo,
    knowledgeType,
    maxItems,
    maxChars,
    includeOtherSubjects,
  }: KnowledgeSearchArgs,
): Promise<KnowledgeSearchResult> {
  const normalizedSubject = normalizeSubject(subject);
  const gradeCandidates = getGradeCandidates(grade);
  const subjectParts = String(subject || "")
    .split("/")
    .map((v) => v.trim())
    .filter(Boolean);

  // 어드민 옵션은 '사회역사', `normalizeSubject`의 반환은 '사회'라 값이 어긋난다.
  // 원문 `:280`이 폴백 경로에만 두었던 임시 보정이며 그대로 옮긴다(§12.2).
  const legacySubject = normalizedSubject === "사회" ? "사회역사" : "";

  const subjectCandidates = unique([
    normalizedSubject,
    legacySubject,
    subject,
    ...subjectParts,
    "공통",
    "전체",
  ]);

  const keywords = unique([
    career,
    selectedTopic,
    normalizedSubject,
    subject,
    String(assessmentInfo || "").slice(0, 300),
  ]);

  const baseSelect = db
    .from(KNOWLEDGE_TABLE)
    .select(
      "id, knowledge_type, grade, subject, career_field, title, content, source, source_link, memo, created_at",
    )
    .eq("is_active", true)
    .or("rag_use.is.null,rag_use.eq.true")
    .eq("knowledge_type", knowledgeType)
    .in("grade", gradeCandidates)
    .order("created_at", { ascending: false });

  const { data: rows = [], error } = includeOtherSubjects
    ? await baseSelect.limit(160)
    : await baseSelect.in("subject", subjectCandidates).limit(80);

  if (error) throw error;

  // supabase 타입상 data는 null일 수 있으나(에러 없으면 실제로는 항상 배열),
  // 위 기본값(`data: rows = []`)이 undefined만 커버하므로 null도 여기서 방어한다.
  const scored = (rows ?? [])
    .map((row) => {
      const blob = [
        row.subject,
        row.career_field,
        row.title,
        row.content,
        row.source,
        row.memo,
        getRowSourceLink(row),
      ].join(" ");

      return {
        row,
        score: scoreText(blob, keywords),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems)
    .map((item) => item.row);

  const rawHits = (rows ?? []).length;

  if (!scored.length) {
    return {
      text: "",
      hitCount: 0,
      rows: [],
      rawHits,
      topScore: null,
      embedMs: null,
    };
  }

  const packed = packRows(scored, maxChars, "위닝DB 후보");

  return {
    text: packed.map((entry) => entry.piece).join("\n\n"),
    hitCount: packed.length,
    rows: packed.map((entry) => entry.row),
    rawHits,
    topScore: null,
    embedMs: null,
  };
}

/**
 * 위닝DB 지식 검색 단일 진입점. 원문 `loadDynamicAssessmentKnowledge`(`:339-393`).
 *
 * 경로는 3단이다. 1차는 하이브리드(match_winning_suhaeng_hybrid), 그것이 throw 하면
 * 벡터(match_winning_suhaeng_all_subjects), 그것도 throw 하면 레거시 키워드 검색이다.
 * 2단과 3단은 결과가 나와도 degraded 로 표시한다.
 *
 * **폴백 발동 조건이 원문과 다르다.** 원문은 벡터 결과가 비기만 해도 키워드 검색으로
 * 떨어졌다(`if (vectorResult) return …` 이후 무조건 진행). 여기서는 **앞 경로가
 * throw한 경우에만** 폴백한다 — 빈 결과는 정상적인 "관련 항목 없음"이기 때문이다
 * (§8.7 「제안(키워드 폴백 축소)」). 지금 dev 코퍼스가 0행이라 원문 동작을 그대로 두면
 * 매 요청마다 160행 스캔이 헛돈다.
 *
 * @param params
 *   `supabase` 미지정 시 `createSupabaseAdmin()`. RPC는 SECURITY INVOKER이고 테이블
 *   RLS가 `is_admin()`이라 **service_role 클라이언트여야 결과가 나온다.**
 *
 * `rows`는 **프롬프트 문자열(`text`)에 실제로 들어간 위닝DB 행 그 자체**다(§12.4
 * 「RAG 레이어가 `{rows, promptText}` 동시 반환」). 설계 리포트(P10)의 자료 소유권
 * 재설계가 이 값을 쓴다 — 모델은 자료 id만 고르고, 응답에 실리는 자료명·출처·링크는
 * 서버가 이 배열의 행에서 직접 채운다. 프롬프트 문자열을 되파싱하지 않는다.
 */
export async function loadDynamicAssessmentKnowledge({
  supabase,
  grade = "고등학생",
  subject = "국어",
  career = "",
  selectedTopic = "",
  assessmentInfo = "",
  purpose = "topic",
  maxItems = 6,
  maxChars = TOPIC_MAX_CHARS,
  includeOtherSubjects = true,
  telemetry,
}: {
  supabase?: SupabaseClient;
  grade?: string;
  subject?: string;
  career?: string;
  selectedTopic?: string;
  assessmentInfo?: string;
  purpose?: "topic" | "resource";
  maxItems?: number;
  maxChars?: number;
  includeOtherSubjects?: boolean;
  /** 계기판 기록 객체(선택). 검색 동작에는 영향이 없다. */
  telemetry?: AiTrace;
} = {}): Promise<{
  text: string;
  source: "hybrid" | "vector" | "keyword" | "none";
  hitCount: number;
  injectedChars: number;
  degraded: boolean;
  rows: KnowledgeRow[];
}> {
  const startedAt = Date.now();
  const db = supabase || createSupabaseAdmin();
  const knowledgeType =
    purpose === "resource" ? "verified_resource" : "topic_pattern";

  const args = {
    grade,
    subject,
    career,
    selectedTopic,
    assessmentInfo,
    knowledgeType,
    maxItems,
    maxChars,
    includeOtherSubjects,
  };

  // 세 반환 지점을 한 곳으로 모아 반환 직전에 한 번만 기록한다.
  const finish = (
    result: {
      text: string;
      source: "hybrid" | "vector" | "keyword" | "none";
      hitCount: number;
      injectedChars: number;
      degraded: boolean;
      rows: KnowledgeRow[];
    },
    meta: {
      rawHits: number | null;
      topScore: number | null;
      embedMs: number | null;
      status: "ok" | "error";
      errorMessage?: string | null;
    },
  ) => {
    try {
      telemetry?.recordSearch({
        kind: "knowledge",
        knowledgeType,
        threshold: knowledgeMatchThreshold(knowledgeType),
        matchCountRequested: Math.max(maxItems * 2, 10),
        rawHits: meta.rawHits,
        packedHits: result.hitCount,
        topScore: meta.topScore,
        source: result.source,
        degraded: result.degraded,
        injectedChars: result.injectedChars,
        embedMs: meta.embedMs,
        startedAt,
        latencyMs: Date.now() - startedAt,
        status: meta.status,
        errorMessage: meta.errorMessage ?? null,
        hitResourceIds: result.rows
          .map((row) => row.id)
          .filter((id): id is string => Boolean(id)),
      });
    } catch (recordError) {
      console.warn("[ai-telemetry] 기록 실패:", recordError);
    }
    return result;
  };

  // 검색 결과 하나를 반환값으로 바꾼다. 행이 없으면 NO_KNOWLEDGE_TEXT 와 source none 이다.
  const finishSearch = (
    search: KnowledgeSearchResult,
    source: "hybrid" | "vector",
    degraded: boolean,
  ) =>
    finish(
      search.hitCount
        ? {
            text: search.text,
            source,
            hitCount: search.hitCount,
            injectedChars: search.text.length,
            degraded,
            rows: search.rows,
          }
        : {
            text: NO_KNOWLEDGE_TEXT,
            source: "none",
            hitCount: 0,
            injectedChars: 0,
            degraded,
            rows: [],
          },
      {
        rawHits: search.rawHits,
        topScore: search.topScore,
        embedMs: search.embedMs,
        status: "ok",
      },
    );

  // 질의 임베딩은 한 번만 만든다. 임베딩이 실패하면 두 벡터 계열 경로가 같은 오류로 떨어진다.
  const queryEmbedding = embedKnowledgeQuery(args);
  // 두 경로가 모두 throw 하는 경우에도 처리되지 않은 거부로 남지 않게 한다.
  queryEmbedding.catch(() => {});

  try {
    return finishSearch(
      await loadByHybridSearch(db, args, await queryEmbedding),
      "hybrid",
      false,
    );
  } catch (error) {
    console.error("위닝DB 하이브리드 검색 실패, 벡터 검색으로 대체:", error);
  }

  try {
    // 하이브리드가 죽어서 여기까지 온 것 자체가 성능 저하다. 결과가 나와도 표시한다.
    return finishSearch(
      await loadByVectorSearch(db, args, await queryEmbedding),
      "vector",
      true,
    );
  } catch (error) {
    console.error(
      "전과목 RAG 위닝DB 검색 실패, 기존 키워드 검색으로 대체:",
      error,
    );
  }

  try {
    const keyword = await loadByLegacyKeywordSearch(db, args);
    const meta = {
      rawHits: keyword.rawHits,
      topScore: keyword.topScore,
      embedMs: keyword.embedMs,
      status: "ok" as const,
    };

    if (keyword.hitCount) {
      return finish(
        {
          text: keyword.text,
          source: "keyword",
          hitCount: keyword.hitCount,
          injectedChars: keyword.text.length,
          // 벡터가 죽어서 여기까지 온 것 자체가 성능 저하다. 결과가 나와도 표시한다.
          degraded: true,
          rows: keyword.rows,
        },
        meta,
      );
    }

    return finish(
      {
        text: NO_KNOWLEDGE_TEXT,
        source: "none",
        hitCount: 0,
        injectedChars: 0,
        degraded: true,
        rows: [],
      },
      meta,
    );
  } catch (error) {
    console.error("위닝DB 지식 조회 오류:", error);

    // 실패 문구를 프롬프트에 흘리지 않는다(§8.7 「제안(관측성)」).
    return finish(
      {
        text: "",
        source: "none",
        hitCount: 0,
        injectedChars: 0,
        degraded: true,
        rows: [],
      },
      {
        rawHits: null,
        topScore: null,
        embedMs: null,
        status: "error",
        errorMessage: String((error as { message?: string })?.message ?? error),
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// 학생 과거 수행 RAG (원문 `api/_lib/reports.js:162-238`)
// ─────────────────────────────────────────────────────────────────────
// 검색 대상이 `assessment_reports`(리포트 4종 각각 임베딩) → `performance_session_vectors`
// (세션 1건 = 벡터 1개)로 바뀌었다. 외부는 상위 4건이 전부 같은 주제의 리포트 4종으로
// 채워질 수 있었다(sql/54_performance_app.sql (5) 「이식하지 않는 것」).
//
// **소유자 격리는 RPC가 3중으로 한다** — `filter_profile_id` NOT NULL 검사(누락 시 예외),
// `auth.uid()` 일치 검사, where 절 + SECURITY INVOKER RLS. 호출부의 유일한 책임은
// **정확한 `profileId`를 넘기는 것**이다.

/** 학생 과거 수행 세션 벡터 행 — 이 파일이 실제로 읽는 필드만 담은 최소 형태. */
type StudentSessionRow = {
  subject?: string;
  topic_title?: string;
  career_goal?: string;
  summary_text?: string;
  similarity?: number;
};

/** 요약 압축. 원문 `reports.js:4-7`. */
function compactText(text: unknown, max = 1200): string {
  const value = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

/**
 * 학생 과거 수행 검색. 원문 `loadRelevantAssessmentReports`(`reports.js:162-219`).
 * 질의문 5줄과 안내문 **2000자** 절단은 문자 단위 원문이다(위닝DB 경로의 2500자와 다르다).
 *
 * **원문의 `mainId` 폴백 분기(`:200-212`)는 이식하지 않는다.** `studentCode`가 비면
 * 테이블을 직접 조회해 최신 N건을 돌려주는 경로였는데, 필터가 빠진 조회가 조용히
 * 성립하는 구조 자체가 §8.2 결함 #4다. 여기서는 `profileId`가 없으면 호출 자체를
 * 프로그래밍 오류로 보고 던진다(RPC도 같은 이유로 null을 예외 처리한다).
 *
 * @returns RPC 행 배열. 검색 실패는 빈 배열이다 — 과거 수행은
 *   프롬프트 보조 입력이라 이것 때문에 주제 추천 전체가 죽으면 안 된다(원문과 동일).
 */
export async function loadRelevantStudentSessions({
  supabase,
  profileId,
  grade = "",
  subject = "",
  career = "",
  selectedTopic = "",
  assessmentInfo = "",
  matchCount = 8,
  matchThreshold = STUDENT_HISTORY_MATCH_THRESHOLD,
  telemetry,
}: {
  supabase?: SupabaseClient;
  profileId?: string;
  grade?: string;
  subject?: string;
  career?: string;
  selectedTopic?: string;
  assessmentInfo?: string;
  matchCount?: number;
  matchThreshold?: number;
  /** 계기판 기록 객체(선택). 검색 동작에는 영향이 없다. */
  telemetry?: AiTrace;
} = {}): Promise<StudentSessionRow[]> {
  if (!profileId) {
    throw new Error(
      "loadRelevantStudentSessions: profileId가 필요합니다(소유자 격리 필수).",
    );
  }

  const db = supabase || createSupabaseAdmin();
  const startedAt = Date.now();

  // 성공과 실패 어느 쪽이든 반환 직전에 한 번 기록한다. 기록 예외는 삼킨다.
  const record = (meta: {
    rawHits: number | null;
    topScore: number | null;
    embedMs: number | null;
    status: "ok" | "error";
    errorMessage?: string | null;
  }) => {
    try {
      telemetry?.recordSearch({
        kind: "student_history",
        knowledgeType: null,
        threshold: matchThreshold,
        matchCountRequested: matchCount,
        rawHits: meta.rawHits,
        packedHits: meta.rawHits,
        topScore: meta.topScore,
        source: "vector",
        degraded: meta.status === "error",
        embedMs: meta.embedMs,
        startedAt,
        latencyMs: Date.now() - startedAt,
        status: meta.status,
        errorMessage: meta.errorMessage ?? null,
        hitResourceIds: null,
      });
    } catch (recordError) {
      console.warn("[ai-telemetry] 기록 실패:", recordError);
    }
  };

  try {
    const queryText = [
      `학년: ${grade || ""}`,
      `현재 과목: ${subject || ""}`,
      `희망 진로: ${career || ""}`,
      `현재 또는 선택 주제: ${selectedTopic || ""}`,
      `수행평가 안내문: ${String(assessmentInfo || "").slice(0, 2000)}`,
    ].join("\n");

    const embedStartedAt = Date.now();
    const queryEmbedding = await embedText(queryText);
    const embedMs = Date.now() - embedStartedAt;

    const { data, error } = await db.rpc("match_student_performance_sessions", {
      // pgvector 인자: 생성 타입이 확장 타입을 몰라 string으로 나오지만
      // supabase-js는 number[]를 그대로 직렬화해 정상 전달한다
      // (api/performance/admin-embed.ts:220-221과 동일 패턴).
      query_embedding: queryEmbedding as unknown as string,
      filter_profile_id: profileId,
      match_count: matchCount,
      match_threshold: matchThreshold,
    });

    if (error) throw error;

    record({
      rawHits: (data || []).length,
      topScore: data?.[0]?.similarity ?? null,
      embedMs,
      status: "ok",
    });
    return data || [];
  } catch (error) {
    console.error("학생 과거 수행 RAG 검색 오류:", error);
    record({
      rawHits: null,
      topScore: null,
      embedMs: null,
      status: "error",
      errorMessage: String((error as { message?: string })?.message ?? error),
    });
    return [];
  }
}

/**
 * 검색 결과 → 프롬프트 조각. 원문 `formatRelevantAssessmentReportsForPrompt`(`:221-238`).
 * 라벨·필드 순서·`현재 과목과의 관계` 문구는 문자 단위 원문이다(§12.3).
 *
 * 필드 매핑만 새 컬럼으로 바뀐다:
 *   `r.selected_topic || r.title` → `r.topic_title`
 *   `r.career`                    → `r.career_goal`
 *   `r.report_content || r.submission_text || r.evaluation_result` → `r.summary_text`
 * (설계+평가 본문을 세션 단위로 미리 합쳐 둔 컬럼이라 3중 폴백이 필요 없다.)
 *
 * **주입은 상위 4건까지**가 규칙이다(§12.3 — 검색은 8건, 주입은 4건). 자르기는
 * 호출부에서 `reports.slice(0, 4)`로 한다. 원문과 같은 책임 분배다.
 */
export function formatRelevantStudentSessionsForPrompt(
  sessions: StudentSessionRow[] = [],
  currentSubject = "",
): string {
  if (!sessions.length) return NO_STUDENT_HISTORY_TEXT;

  const render = (r: StudentSessionRow, i: number) => {
    const sameSubject =
      r.subject && currentSubject && r.subject === currentSubject;

    return `
[학생 과거 수행 ${i + 1}]
- 과목: ${r.subject || "미입력"}
- 현재 과목과의 관계: ${sameSubject ? "같은 과목" : "다른 과목 또는 전과목 유사도 기반 참고"}
- 주제: ${r.topic_title || "미입력"}
- 진로: ${r.career_goal || "미입력"}
- 내용 요약: ${compactText(r.summary_text, 900)}
`.trim();
  };

  return sessions.map(render).join("\n\n");
}

/** 프롬프트에 주입하는 과거 수행 상한(§12.3 「프롬프트 주입 상위 4건」). */
export const STUDENT_HISTORY_PROMPT_LIMIT = 4;
