// POST /api/performance/design-report
// Authorization: Bearer <supabase access token>
//
// 명세서 §8.6 엔드포인트 표 계약:
//   { sessionId, topicId }  — 주제 확정 + 리포트 생성을 **한 트랜잭션**으로
//     (+ 이 저장소 확장분 `regenerate?: true` — 아래 「멱등 재생 vs 재생성」)
//   → 200 { reportId, structure{type,reason,writingFrame}, sections, resources[],
//           quotaRemaining, charged:false }
//   → 409 { error:{code:'TOPIC_ALREADY_CONFIRMED'}, reportId }   (멱등)
//   → 409 { error:{code:'SESSION_NOT_CHARGED'} }
//   → 429 { error:{code:'RATE_LIMITED'}, limit:2 }
//   계약 표에 없는 추가분(형제 라우트 관례를 그대로 따른 것):
//   → 400 INVALID_SESSION_ID / INVALID_TOPIC_ID / SESSION_INCOMPLETE / GUIDE_REQUIRED
//   → 401 UNAUTHENTICATED  → 403 NO_ENTITLEMENT / NOT_SESSION_OWNER
//   → 404 TOPIC_NOT_IN_SESSION (§8.6 session.js PATCH 행이 정의한 코드를 그대로 쓴다)
//   → 429 DESIGN_ATTEMPT_LIMIT (아래 게이트 ③)
//   → 422 MODEL_CONTRACT_VIOLATION  → 503 MODEL_UNAVAILABLE
//   **위 실패 전부 무차감이다.** 애초에 이 파일에는 차감 코드가 없다(아래 「회차」).
//
// ─────────────────────────────────────────────────────────────────────
// 1. 단일 트랜잭션 — 이 슬라이스의 핵심
// ─────────────────────────────────────────────────────────────────────
// 외부 앱은 주제 확정과 리포트 생성이 **2회 왕복**이었다:
//   ① `POST /api/save-topic-selection` → `api_sessions.selected_topic` 갱신
//   ② `POST /api/find-resources`       → 리포트 생성
// 그리고 프론트가 ①의 실패를 무시하고 ②를 불렀다(§8.6). 그래서 "주제는 확정 안 됐는데
// 리포트만 있는" 세션과 그 반대가 둘 다 만들어졌다. 게다가 ②는 자기 안에서 다시
// `updateSession` → `dbSaveConversation` → `incrementCallCount` → 모델 호출 →
// `saveAssessmentReport`를 순서대로 쏘는 비트랜잭션 열이라(`find-resources.js:318-527`)
// 중간 어디서 죽어도 반쪽 상태가 남았다.
//
// 여기서는 요청이 `{ sessionId, topicId }` 하나이고, **모든 사용자 가시 write가
// `commit_performance_design_report` RPC(sql/57 (4)) 한 트랜잭션 안**에서 일어난다:
//     performance_topics.selected 재설정
//   + performance_sessions.selected_topic_id / current_step / completed_steps
//   + performance_sessions.design_generation_count
//   + performance_reports upsert(세션당 design 1행)
// 전부 성립하거나 전부 없던 일이 된다. supabase-js에 다중 문장 트랜잭션이 없으므로
// 핸들러에서 update를 순서대로 쏘는 방식으로는 이 보장을 만들 수 없다.
//
// RPC **밖**에 남는 write는 `design_attempt_count` +1 하나뿐이다(게이트 ③). 그것은
// 사용자에게 보이는 상태가 아니라 남용 카운터이고, 실패 경로에서 반쪽으로 남는 것이
// 오히려 옳다 — 모델을 부른 것은 사실이기 때문이다.
//
//   실패 지점별 잔여 상태 (전부 무차감)
//   ──────────────────────────────────────────────────────────────────
//   인증/이용권/소유권/주제 404/SESSION_NOT_CHARGED/각종 상한  → 아무것도 안 남음
//   attempt +1 이후 RAG 실패                                   → attempt +1만
//   모델 호출 실패(503) / 구조 위반(422)                        → attempt +1만
//   RPC 실패(500)                                              → attempt +1만.
//        주제 미확정 · 리포트 없음 — **반쪽 상태가 원리적으로 없다**
//   RPC 성공 후 응답 직렬화 중 함수 종료                        → 전부 커밋됨.
//        재요청하면 아래 멱등 재생이 저장분을 그대로 돌려준다(모델 재호출 없음)
//
// ─────────────────────────────────────────────────────────────────────
// 2. 멱등 재생(replay) vs 재생성(regenerate)
// ─────────────────────────────────────────────────────────────────────
// 더블클릭·새로고침·응답 유실 재요청이 모델을 다시 부르면 안 된다. P8
// (`recommend-topics.js`)이 "이미 있는 라운드를 요청하면 저장분을 그대로 돌려준다"로
// 푼 것과 같은 문제이고 같은 방식으로 푼다:
//   · 같은 `topicId` + 이미 design 리포트 있음 → **200 재생**(`reused:true`, 모델 미호출)
//   · 다른 `topicId` + 이미 design 리포트 있음 → **409 TOPIC_ALREADY_CONFIRMED{reportId}**
//     (§8.6이 이 코드에 "멱등"이라 달아 둔 이유가 이것이다 — 확정된 주제는 바뀌지 않는다)
//   · 정말 다시 만들려면 `regenerate:true`를 **명시**한다. `analyze-guide.js`의
//     `force:true`와 같은 관례다.
// 재생 경로는 모델도 임베딩도 부르지 않으므로 `design_attempt_count`도
// `design_generation_count`도 올리지 않는다.
//
// ─────────────────────────────────────────────────────────────────────
// 3. 자료 소유권 재설계 — 모델은 id만 고르고 서버가 DB 행으로 채운다 (§10.2 P10, Q63)
// ─────────────────────────────────────────────────────────────────────
// 외부 앱은 모델이 자료 정보(제목·출처·URL)를 **생성**하게 뒀고, 그 다음 자기가 만든
// 프롬프트 문자열을 정규식으로 되파싱해(`extractDbResources`, `find-resources.js:113-150`)
// 자료 섹션을 통째로 치환하려 했다(`replaceResourceSectionWithDbOnly`, `:193-209`).
// 세 분기가 전부 모델 서식에 의존해서, 모델이 번호 접두어를 빼는 순간 후처리가
// 무력화되고 자료 섹션이 **두 번** 렌더된다 — 시안 `3754:4722`가 그 실패의 스크린샷이다
// (§8.4 BLOCK, ~~Q13~~). 그리고 실패가 조용해서 학생은 존재하지 않는 URL을 실제 자료로
// 믿는다.
//
// 여기서는 문자열이 오가는 통로 자체를 없앤다:
//   ⓐ RAG가 프롬프트 문자열과 **행 배열을 동시에** 돌려준다(knowledge.js `rows`,
//      §12.4 「RAG 레이어가 `{rows, promptText}` 동시 반환」). 되파싱이 없다.
//   ⓑ 각 행에 `R1`·`R2` … 짧은 핸들을 붙여 `[사용 허용 자료명 목록]`으로 넣는다
//      (`buildAllowedResourceList`). uuid 36자를 넣지 않는 이유는 프롬프트 모듈 주석 참조.
//   ⓒ `responseSchema`의 자료 필드는 **`{resource_id, use_point}` 배열**이다
//      (`DESIGN_REPORT_SCHEMA.chosen_resources`). 자료명·출처·링크를 담을 필드가
//      **스키마에 아예 없다** — 모델이 지어낼 자리가 물리적으로 없다.
//   ⓓ 서버는 반환된 id를 후보 맵에서 조회한다. 맵에 없는 id는 **버리고 경고 로그**를
//      남긴다(조용히 버리지 않는다). 응답의 자료명·출처 정보·출처 링크는 전부
//      `resourceById.get(handle)`이 돌려준 **DB 행 필드**이고, 모델 문자열이 들어가는
//      칸은 `활용 포인트`(`use_point`) 하나뿐이다(§8.5 자료 카드 필드 표의 `source:'model'`).
//   그래서 **자료 카드에 한해** "모델이 URL을 환각한다"가 실패 모드로 존재할 수 없다.
//
// ⚠ 위 보장의 범위는 **`추천 자료 및 활용 포인트` 섹션의 카드 6필드까지다.** 리포트 본문
//   에는 모델 원문이 그대로 실리는 칸이 더 있고, 그 칸에 모델이 자료명·기관명·URL을 적는
//   것을 스키마가 막지는 못한다:
//     · `chosen_resources[].use_point`(`resolveChosenResources`) — 카드 안의 유일한 모델 칸.
//     · `writing_structure.steps[].rows[]`의 라벨·본문(`buildWritingStructureBlocks`).
//       특히 **문항형 분기 원문이 `- 활용 가능한 자료:` 행을 직접 요구한다**
//       (`prompts.js DESIGN_WRITING_BRANCHES.question`).
//     · `overall_direction`의 4행.
//   막는 것은 프롬프트 원칙 10·13조뿐이고 서버 검증은 없다(§12.4가 폐기한 "출력 텍스트를
//   정규식으로 수술하기"를 되살리지 않기로 한 결과다). 다만 `href`는 서버가 `kvRow`의 3번째
//   인자로만 붙이므로 이 칸들의 문자열이 **클릭 가능한 앵커가 되지는 않는다** — 렌더는 평문
//   이다. 「모델이 지어낸 자료명이 평문으로 섞일 수 있다」는 `핵심 개념`(Q73)과 나란한
//   **알려진 부채**이며, 실질 방어가 필요하다고 판정되면 정규식 후처리가 아니라
//   "URL 패턴이 검출된 행을 거부"하는 게이트로 넣어야 한다(수술이 아니라 거부라 §12.4와
//   충돌하지 않는다).
//
// ⚠ `핵심 개념`(`core_concepts`)은 §8.5 표상 `source:'db'`인데 **어느 필드를 쓸지가 미결이다.**
//   행 자체는 이미 손에 있다 — 후보 맵이 들고 있는 위닝DB 행에 `content` 컬럼이 실려 온다
//   (`knowledge.js`의 select 목록). 문제는 그 `content`가 `1. 자료 성격 / 2. 핵심 개념 /
//   3. 수행평가에서 활용` 번호 템플릿이라는 **강제되지 않는 관행** 위에 있다는 것이다. 외부는
//   그것을 정규식으로 잘라 썼는데(`find-resources.js:32-105`) §12.4가 그 파서를 폐기로 지목했고
//   (「깨진 행은 학생에게 무내용 기본 문구가 나간다」) 대체안인 「구조화 컬럼 신설 + 어드민 폼
//   분리」는 §11-Q73이 **미결**로 남아 있다.
//   → 결정 전까지 `DESIGN_RESOURCE_FIELD_FALLBACKS.core_concepts`(원문 `find-resources.js:169`
//     문구)로 채운다. Q73이 정해지면 그 컬럼(또는 `content` 앞 N자 절단)을 읽는 한 줄로
//     바뀐다. **이것은 알려진 부채이며 보고에 적어 두었다** — 지금은 자료 3건의 이 행이 전부
//     같은 문장으로 찍힌다.
//
// ─────────────────────────────────────────────────────────────────────
// 4. 회차 — 이 파일은 차감하지 않는다 (이중 차감 불가 증명)
// ─────────────────────────────────────────────────────────────────────
// §9.3 표: 「설계 리포트 생성·재생성 | 없음」. 차감 지점은 저장소 전체에서
// `recommend-topics` 최초 성공 1곳뿐이다. 그래서 이 파일은
//   · `consume_performance_credit`을 **호출하지 않는다**(import조차 없다),
//   · `program_access.meta`를 **쓰지 않는다**(읽기 스냅샷만, 안내용 `quotaRemaining`),
//   · `performance_credit_ledger`를 **읽기만** 한다(아래 게이트 ①).
// 이중 차감 불가의 1차 근거는 "차감 코드가 없다"이고, 2차 근거는 설령 실수로 RPC를
// 부르더라도 `performance_credit_ledger.session_id` UNIQUE가 이미 차감된 세션에
// `already_charged`(=`charged:false`)를 돌려준다는 것이다(sql/54 1-7). 즉 규율이 아니라
// 스키마가 막는다.
//
// 게이트 ①(`SESSION_NOT_CHARGED`)이 요구하는 것은 그 반대 방향이다 — 설계 리포트는
// **이미 차감된 세션에서만** 만들 수 있다. 정상 흐름에서 주제가 존재하는 세션은 반드시
// 차감을 거쳤으므로(주제는 `recommend-topics` 성공 경로에서만 저장된다) 이 게이트는
// 방어선이지 통상 경로가 아니다. §8.6이 명시한 코드라 그대로 구현한다.
//
// ─────────────────────────────────────────────────────────────────────
// 5. 상한 2축 (§9.2 「과금과 남용 방지를 분리한다」 — 차감을 늘려 막지 않는다)
// ─────────────────────────────────────────────────────────────────────
// P8에서 발견한 것과 **같은 구멍이 여기에도 있다**: 구조 실패(422/503)는 무차감이고
// `performance_reports`에도 아무것도 남기지 않으므로 "성공 생성 수" 상한이 영원히 오르지
// 않는다. 그래서 56번이 주제 추천에서 한 것과 같이 축을 둘로 나눈다(sql/57 (3)).
//   · `design_generation_count`(성공만) ≥ 3  → 429 RATE_LIMITED{limit:2}
//        §9.3 「재생성 상한 2회」 = 최초 1 + 재생성 2 = 총 3회 생성.
//        §8.6이 응답에 싣기로 한 `limit:2`는 **재생성 상한**이라 그 값을 그대로 싣고,
//        총량은 `maxGenerations`로 따로 준다(둘을 한 필드에 섞으면 프론트가 오해한다).
//   · `design_attempt_count`(성공·실패 모두) ≥ 10 → 429 DESIGN_ATTEMPT_LIMIT
//        `analyze-guide`(`MAX_ANALYSIS_PER_SESSION`)·`recommend-topics`
//        (`MAX_MODEL_ATTEMPTS_PER_SESSION`)와 같은 수치를 쓴다.
//
// ─────────────────────────────────────────────────────────────────────
// 6. Gemini 결함 완화 (§8.4 ⓐ~ⓓ — P8과 동일 패턴)
// ─────────────────────────────────────────────────────────────────────
//   ⓐ 스키마에 `number` 타입 필드가 하나도 없다. 체크리스트 번호도 분석 포인트 번호도
//      자료 순번도 **서버가 배열 인덱스로 붙인다**(`DESIGN_REPORT_SCHEMA` 주석).
//   ⓑ `maxOutputTokens`는 아래 상수 주석에 산정 근거를 적었다(P8 값 재사용 아님).
//   ⓒ `finishReason === 'MAX_TOKENS'`면 **파싱하지 않고** 재시도한다. 반쯤 온 JSON을
//      살리려는 시도가 곧 §12.4가 폐기한 텍스트 수술이다.
//   ⓓ 모델 원문은 서버 로그에만 남긴다. 응답 본문에 싣지 않는다.
//   그리고 **텍스트 파서 폴백을 만들지 않는다**(§8.4). 이 파일의 유일한 파싱은
//   `JSON.parse` 한 줄이고, 형식 강제는 `responseSchema`가 한다.

import type { VercelResponse } from "@vercel/node";
import { generateWithRetry, PERFORMANCE_MODEL } from "../_lib/ai/gemini.js";
import {
  performanceTraceContext,
  retryReasonOf,
  validationOf,
} from "../_lib/ai/telemetry/performanceContext.js";
import { createAiTrace } from "../_lib/ai/telemetry/trace.js";
import { defineHandler, requireUserId } from "../_lib/handler.js";
import { sendError } from "../_lib/httpResponse.js";
import {
  guideTextFromSession,
  inferGuideStructure,
} from "../_lib/performance/guide-structure.js";
import {
  formatRelevantStudentSessionsForPrompt,
  loadDynamicAssessmentKnowledge,
  loadRelevantStudentSessions,
  RESOURCE_MAX_CHARS,
  RESOURCE_MAX_ITEMS,
  STUDENT_HISTORY_DESIGN_MATCH_THRESHOLD,
  STUDENT_HISTORY_PROMPT_LIMIT,
} from "../_lib/performance/knowledge.js";
import {
  buildDesignReportSystem,
  buildDesignReportUser,
  DESIGN_CONCLUSION_DEFAULT_ROWS,
  DESIGN_EMPTY_RESOURCE_ROWS,
  DESIGN_GENERATION_DEFAULTS,
  DESIGN_MAX_OUTPUT_TOKENS_RETRY,
  DESIGN_REPORT_SCHEMA,
  DESIGN_REPORT_SECTIONS,
  DESIGN_RESOURCE_CARD_FIELDS,
  DESIGN_RESOURCE_FIELD_FALLBACKS,
  DESIGN_SECTION_ROW_LABELS,
  NO_PREVIOUS_TOPIC_TEXT,
  resolveDesignPromptVersion,
  resolveDesignWritingBranch,
} from "../_lib/performance/prompts.js";
import {
  findProgramAccessRow,
  hasPaidServiceAccess,
  readQuotaSnapshot,
  SERVICE_CONFIGS,
} from "../_lib/serviceAccess.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";

const SERVICE_KEY = "suhaeng";

/**
 * 설계 리포트 **성공 생성** 상한. §9.3 「설계 리포트 생성·재생성 | 없음 (재생성 상한
 * 2회)」 = 최초 1회 + 재생성 2회. §9.2 단가 근거의 `3(설계)`와 같은 셈법이며,
 * P8이 `MAX_ROUNDS = 3`을 정한 근거와 동일하다.
 */
const MAX_DESIGN_GENERATIONS = 3;

/** §8.6이 `429 RATE_LIMITED{limit:2}`로 응답에 싣기로 한 값 = **재생성** 상한. */
const MAX_DESIGN_REGENERATIONS = MAX_DESIGN_GENERATIONS - 1;

/**
 * 세션당 **모델 호출 시도** 상한(sql/57 (3), `design_attempt_count`).
 * `MAX_DESIGN_GENERATIONS`와는 다른 축이다 — 저쪽은 성공해서 리포트가 남은 것만 센다.
 * 구조 실패는 리포트를 남기지 않으므로 그 축이 오르지 않고, 그대로 두면 같은 세션에서
 * 무한 반복이 가능하다(1회당 임베딩 2회 + 최대 6회의 Gemini 생성 호출).
 * `analyze-guide.js`/`recommend-topics.js`와 같은 10을 쓴다.
 */
const MAX_MODEL_ATTEMPTS_PER_SESSION = 10;

/**
 * 모델 호출 총 예산. `generateWithRetry`의 과부하 재시도와 아래 구조 재시도가 **모두**
 * 이 한 신호를 공유하므로 시한은 시도당이 아니라 총합이다(gemini.js `abortSignal` 주석).
 * 플랫폼이 함수를 죽이기 전에 우리가 502/503을 만들어 돌려주는 것이 목적이며,
 * 파일 끝 `maxDuration: 60`을 전제로 잡은 값이다.
 */
const MODEL_TIMEOUT_MS = 50 * 1000;

/** 구조 실패(절단·파싱 실패·계약 위반) 시 재시도 횟수. §8.4 「1회 재요청 후 실패 처리」. */
const STRUCTURE_RETRY = 1;

/**
 * `작성 구조 설계`에 결론 단계가 없을 때 기본 결론 블록을 덧붙일지 판정하는 정규식.
 * 원문 `ensureConclusionSection`의 트리거(`find-resources.js:18`)와 같은 어휘를 쓰되
 * **적용 대상이 다르다** — 원문은 리포트 평문 전체를 봤고(그래서 본문 아무 데나
 * `결론`이 있으면 발동하지 않아 실제 누락을 못 잡았다) 여기서는
 * `writing_structure.steps[].title`만 본다.
 */
const CONCLUSION_STEP_RE = /결론|마무리|후속\s*탐구/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `출처 링크`를 클릭 가능한 `<a href>`로 승격해도 되는가(§8.5 「출처 링크 → `{label, href}`」).
 *
 * `winning_assessment_knowledge_items.source_link`는 CHECK 제약 없는 자유 텍스트다.
 * `sql/53_performance.sql:278` 백필이 http(s)만 넣는 것은 **비어 있던 행에 한정**이라
 * (`where source_link is null or btrim(source_link) = ''`) 어드민이 수기로 넣은
 * `없음` · `국립중앙도서관 소장` · `p.132` 같은 값이 그대로 남아 있을 수 있다. 그런 값을
 * `href`로 승격하면 ⓐ `<a href="없음">`이 SPA 내부 상대경로로 이동해 리포트 모달이
 * 통째로 날아가고 ⓑ `javascript:` 스킴이면 React 18이 경고만 내고 렌더한다.
 * 외부 원본은 이 칸을 평문으로만 렌더하며 `resource.link !== '없음'` 가드까지 뒀다
 * (`find-resources.js:168`) — 링크 승격은 우리가 새로 만든 표면이므로 게이트도 우리가 만든다.
 *
 * 통과하지 못한 값은 **버린다**(빈 문자열). 그러면 `buildResourceBlocks`가 기존
 * `DESIGN_RESOURCE_FIELD_FALLBACKS.link`('출처 링크 확인 필요') 문구를 `href` 없이 렌더한다 —
 * 문구는 남고 앵커만 붙지 않는 동작이라 `kvRow` 주석이 이미 명시한 의도와 정확히 같다.
 */
const HTTP_URL_RE = /^https?:\/\//i;

const SESSION_COLUMNS = [
  "id",
  "profile_id",
  "status",
  "current_step",
  "completed_steps",
  "grade_label",
  "semester",
  "school_type",
  "subject_group",
  "subject",
  "career_goal",
  "previous_topic",
  "guide_input_mode",
  "guide_freetext",
  "guide_json",
  "selected_topic_id",
  // sql/57 (3). 두 컬럼 없이 배포하면 PostgREST 42703으로 라우트 전체가 죽는다 —
  // 55번 `guide_analysis_count` / 56번 `topic_attempt_count`와 같은 선행 조건이다.
  "design_generation_count",
  "design_attempt_count",
].join(",");

const REPORT_COLUMNS =
  "id,topic_id,sections,model,prompt_version,created_at,updated_at";

/** 세션 SELECT 컬럼(SESSION_COLUMNS)과 정확히 대응하는 최소 필드 형태. */
type SessionRow = {
  id: string;
  profile_id: string;
  status: string;
  current_step: number | null;
  completed_steps: unknown;
  grade_label: string | null;
  semester: string | null;
  school_type: string | null;
  subject_group: string | null;
  subject: string | null;
  career_goal: string | null;
  previous_topic: string | null;
  guide_input_mode: string | null;
  guide_freetext: string | null;
  guide_json: unknown;
  selected_topic_id: string | null;
  design_generation_count: number | null;
  design_attempt_count: number | null;
};

/** performance_reports SELECT 컬럼(REPORT_COLUMNS)과 대응하는 최소 필드 형태. */
type ReportRow = {
  id: string;
  topic_id: string | null;
  sections: unknown;
  model: string | null;
  prompt_version: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/** 위닝DB 후보 자료 행 — 이 파일이 실제로 읽는 필드만. */
type KnowledgeRow = Record<string, unknown> & {
  id?: string;
  title?: string;
  source?: string;
  source_link?: string;
};

/** `kvRow`/`keyValueBlock`이 다루는 행 계약(§8.5). */
type KeyValueRow = { label: string; content: string; href?: string };

/** `resolveChosenResources`가 만드는 자료 카드(§8.5 자료 카드 필드 표). */
type ResourceCard = {
  id: unknown;
  title: string;
  source: string;
  link: string;
  coreConcepts: string;
  usePoint: string;
  caution: string;
};

function fail(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  sendError(res, "coded", status, message, code, extra);
}

const trimmed = (value: unknown): string => String(value ?? "").trim();

/**
 * 잔여 회차 **읽기 전용** 스냅샷. 이 엔드포인트는 차감 RPC를 부르지 않으므로
 * (§9.3 「설계 리포트 | 없음」) 응답의 `quotaRemaining`은 안내용 조회로만 채운다.
 * 조회가 실패해도 리포트 응답을 죽이지 않는다 — null이면 §5.20 배너가 "정보 없음"으로
 * 떨어질 뿐이다.
 */
async function readQuota(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
) {
  try {
    return await readQuotaSnapshot(
      supabaseAdmin,
      userId,
      await findProgramAccessRow(
        supabaseAdmin,
        userId,
        // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
        SERVICE_CONFIGS[SERVICE_KEY]!,
      ),
    );
  } catch (error) {
    console.error("performance/design-report quota lookup 실패(무시):", error);
    return await readQuotaSnapshot(supabaseAdmin, userId, null);
  }
}

/**
 * 확정 주제의 6요소 상세를 평문으로 편다 — `buildDesignReportUser`의
 * `[선택 주제 상세]` 자리에 들어간다.
 *
 * 직렬화를 호출부가 맡는 것은 P8이 `assessmentText`를 다룬 방식과 같다(프롬프트 모듈은
 * 문자열 조립 규칙만 갖고 데이터 모양을 모른다). `performance_topics.detail`은
 * `[{id,label,text} × 6]` 고정 배열이라(sql/54 1-4) 라벨을 그대로 살려 옮긴다.
 */
function flattenTopicDetail(detail: unknown): string {
  const list = (Array.isArray(detail) ? detail : []) as {
    label?: unknown;
    text?: unknown;
  }[];
  return list
    .map((section) => {
      const label = trimmed(section?.label);
      const text = trimmed(section?.text);
      if (!label || !text) return "";
      return `- ${label}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * RAG가 돌려준 위닝DB 행 → 모델에게 줄 후보 목록 + 서버가 들고 있는 핸들 맵.
 *
 * **핸들(`R1`, `R2` …)은 요청 1건 안에서만 의미를 갖는 임시 이름**이다. uuid를 그대로
 * 노출하지 않는 이유는 프롬프트 모듈 `buildAllowedResourceList` 주석 그대로다 —
 * 토큰을 먹고, 모델이 한 글자 틀리면 자료가 통째로 사라진다.
 *
 * 제목 중복은 여기서 접는다. 외부도 `seen` 집합으로 같은 일을 했고
 * (`find-resources.js:127`), 접지 않으면 같은 책이 `자료 1`과 `자료 2`로 두 번 나온다.
 * 유사도 내림차순이라 **먼저 온 행(더 유사한 행)을 남긴다.**
 */
function buildResourceCandidates(rows: unknown) {
  const byHandle = new Map<string, KnowledgeRow>();
  const seenTitle = new Set<string>();
  const allowed: { id: string; title: string }[] = [];

  for (const row of (Array.isArray(rows) ? rows : []) as KnowledgeRow[]) {
    const title = trimmed(row?.title);
    if (!title || seenTitle.has(title)) continue;

    seenTitle.add(title);
    const handle = `R${allowed.length + 1}`;

    byHandle.set(handle, row);
    allowed.push({ id: handle, title });
  }

  return { byHandle, allowed };
}

/**
 * 모델이 고른 id → **DB 행에서 채운 자료 카드**. 자료 소유권 재설계의 실행부다.
 *
 * 여기서 모델 문자열이 들어가는 칸은 `usePoint` **하나뿐**이다. `title`/`source`/`link`는
 * 전부 `candidates.byHandle`이 돌려준 위닝DB 행 필드이고, `coreConcepts`/`caution`은
 * 서버 상수다. 즉 모델이 자료를 지어낼 수 있는 표면이 없다.
 *
 * 후보에 없는 id는 **버리고 경고를 남긴다**(조용히 버리지 않는다). 이 경로가 실제로
 * 밟히면 프롬프트의 `[사용 허용 자료명 목록]` 지시가 먹지 않았다는 신호라 관측할 값이 있다.
 */
function resolveChosenResources(
  chosen: unknown,
  candidates: ReturnType<typeof buildResourceCandidates>,
) {
  const resources: ResourceCard[] = [];
  const rejected: string[] = [];
  const usedHandles = new Set<string>();

  const items = (Array.isArray(chosen) ? chosen : []) as {
    resource_id?: unknown;
    use_point?: unknown;
  }[];

  for (const item of items) {
    if (resources.length >= 3) break;

    // 대소문자·공백 흔들림만 흡수한다. 그 이상 "비슷한 id 찾아주기"는 하지 않는다 —
    // 그 순간 이 함수가 모델 출력 파서가 된다(§8.4).
    const handle = trimmed(item?.resource_id).toUpperCase();
    const row = candidates.byHandle.get(handle);

    if (!row) {
      rejected.push(trimmed(item?.resource_id) || "(빈 값)");
      continue;
    }
    if (usedHandles.has(handle)) continue;
    usedHandles.add(handle);

    // DB 행이라도 **스킴은 검증한다** — 자유 텍스트 컬럼이라 URL이 아닌 값이 섞일 수 있고,
    // 그 값을 `href`로 승격하는 것은 우리가 새로 만든 표면이다(`HTTP_URL_RE` 주석).
    const rawLink = trimmed(row.source_link);
    const link = HTTP_URL_RE.test(rawLink) ? rawLink : "";

    if (rawLink && !link) {
      console.warn(
        `[design-report] 자료 출처 링크가 http(s)가 아니라 링크를 붙이지 않았습니다 (knowledge_item=${row.id})`,
      );
    }

    resources.push({
      id: row.id,
      // ── 아래 4개는 전부 DB 행. 모델 산출물이 아니다.
      title: trimmed(row.title),
      source: trimmed(row.source) || DESIGN_RESOURCE_FIELD_FALLBACKS.source,
      link,
      // ⚠ Q73 미결. **행 자체는 있다** — `candidates.byHandle`이 들고 있는 위닝DB 행에
      //   `content` 컬럼이 실려 온다(`knowledge.js` select 목록). 미결인 것은 "어느 필드를
      //   어떤 형태로 이 칸에 넣을 것인가"다: 외부는 `content`의 `1. 자료 성격 / 2. 핵심 개념 /
      //   3. 수행평가에서 활용` 번호 템플릿을 정규식으로 잘라 썼는데(`summarizeResourceContent`,
      //   `find-resources.js:32-105`) 그 파서를 §12.4가 폐기로 지목했고, 대체안(구조화 컬럼
      //   신설 + 어드민 폼 분리)이 §11-Q73 미결이다. 결정 전까지 원문 기본 문구를 쓴다.
      coreConcepts: DESIGN_RESOURCE_FIELD_FALLBACKS.core_concepts,
      // ── 유일한 모델 산출물.
      usePoint:
        trimmed(item?.use_point) || DESIGN_RESOURCE_FIELD_FALLBACKS.use_point,
      // ── 서버 상수(원문 `find-resources.js:172`).
      caution: DESIGN_RESOURCE_FIELD_FALLBACKS.caution,
    });
  }

  return { resources, rejected };
}

// ─────────────────────────────────────────────────────────────────────
// §8.5 블록 조립 — 라벨·순서는 전부 서버 상수다
// ─────────────────────────────────────────────────────────────────────
// 모델은 **값만** 낸다. 섹션 id·라벨·순서는 `DESIGN_REPORT_SECTIONS`,
// 행 라벨은 `DESIGN_SECTION_ROW_LABELS`, 자료 카드 라벨은 `DESIGN_RESOURCE_CARD_FIELDS`가
// 정한다(P8이 `TOPIC_DETAIL_SECTIONS`로 같은 일을 했다). 그래서 §5.13 실측 문자열이
// 모델 온도에 흔들리지 않는다.

/** `KeyValueView`가 읽는 행 계약: `rows[].{label, content}` (+ 확장 `href`, §8.5). */
function kvRow(label: string, content: unknown, href?: string): KeyValueRow {
  const row: KeyValueRow = { label, content: trimmed(content) };
  // `href`는 §8.5가 「블록 뷰 확장」으로 지정한 필드다. **실제 URL일 때만** 붙인다 —
  // `출처 링크 확인 필요` 같은 폴백 문구에 링크를 걸면 클릭이 깨진 앵커가 된다.
  if (href) row.href = href;
  return row;
}

function keyValueBlock(rows: KeyValueRow[]) {
  return { kind: "keyValue", rows: rows.filter((row) => row.content) };
}

function bulletList(items: string[]) {
  return {
    kind: "plainList",
    items: items.map((text) => ({ type: "bullet", text })),
  };
}

/**
 * 번호 목록. `PlainListView`의 `ordered` 확장(§8.5 「`ordered` 분기 + `<ol>`」)을 타고
 * `<ol>`로 렌더된다 — 번호는 브라우저가 붙인다.
 */
function orderedList(items: string[]) {
  return {
    kind: "plainList",
    ordered: true,
    items: items.map((text) => ({ type: "bullet", text })),
  };
}

/** 라벨 정의(`[{key,label}]`) + 모델 객체 → keyValue 블록. */
function rowsFromLabels(
  labels: { key: string; label: string }[],
  source: Record<string, unknown> | undefined,
) {
  return keyValueBlock(
    labels.map((row) => kvRow(row.label, source?.[row.key])),
  );
}

/**
 * `분석 포인트`는 §5.13 실측상 유일한 **번호 목록**이다. 스키마에 `number` 타입 필드를
 * 두지 않으므로(§8.4 완화책 ⓐ) 모델은 문자열만 낸다.
 *
 * **번호는 `<ol>`이 붙인다**(P10, 2026-08 변경). 초판은 서버가 `1. `을 텍스트에 박았는데,
 * 그 텍스트가 `PlainListView`의 `<ul>`(disc 마커)에 들어가면 `• 1. …`로 마커가 두 개가
 * 된다 — §8.5가 제시한 두 갈래("`ordered` 분기 + `<ol>`" / "번호를 `text`에 포함") 중
 * 앞쪽으로 갈아탄 이유다. 여기서는 **모델이 습관적으로 붙여 오는 접두 번호를 걷어내기만**
 * 한다(이중 번호 방지). 이것은 출력 파싱이 아니라 라벨 정규화다.
 */
function numberedItems(items: unknown): string[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => trimmed(item).replace(/^\d+\s*[.)]\s*/, ""))
    .filter(Boolean);
}

/** `체크 1:` ~ `체크 5:` — 원문 뼈대(`find-resources.js:486-490`)의 라벨을 서버가 붙인다. */
function checklistItems(items: unknown): string[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => trimmed(item).replace(/^체크\s*\d+\s*[:：]\s*/, ""))
    .filter(Boolean)
    .map((text, index) => `체크 ${index + 1}: ${text}`);
}

/** §5.13 섹션 2 — 자료가 있으면 카드 group, 없으면 원문 폴백 3행. */
function buildResourceBlocks(resources: ResourceCard[]) {
  if (!resources.length) {
    // 원문 `find-resources.js:154-157`. `주의할 점` 행은 §12.1이 「서비스 신뢰 문구」로
    // 지목한 문장이라 그대로 쓴다.
    return [
      keyValueBlock(
        DESIGN_EMPTY_RESOURCE_ROWS.map((row) => kvRow(row.label, row.content)),
      ),
    ];
  }

  const labelOf = (key) =>
    DESIGN_RESOURCE_CARD_FIELDS.find((field) => field.key === key)?.label ||
    key;

  return resources.map((resource, index) => ({
    kind: "group",
    title: `자료 ${index + 1}`,
    children: [
      keyValueBlock([
        kvRow(labelOf("title"), resource.title),
        kvRow(labelOf("source"), resource.source),
        // 링크가 비면 폴백 **문구**만 넣고 href는 붙이지 않는다(위 kvRow 주석).
        kvRow(
          labelOf("link"),
          resource.link || DESIGN_RESOURCE_FIELD_FALLBACKS.link,
          resource.link || undefined,
        ),
        kvRow(labelOf("core_concepts"), resource.coreConcepts),
        kvRow(labelOf("use_point"), resource.usePoint),
        kvRow(labelOf("caution"), resource.caution),
      ]),
    ],
  }));
}

/**
 * §5.13 섹션 5 `작성 구조 설계` — 단계마다 group(제목) + keyValue(하위 행).
 *
 * 단계 제목과 행 라벨은 **주입된 분기 원문이 지시한 문자열**이라 서버 enum으로 고정할 수
 * 없다(형식마다 하위 키가 다르다 — 보고서형은 `역할`/`반드시 포함할 내용`, 문항형은
 * `답변 방향`/`넣을 교과 개념`…). 그래서 이 섹션만 라벨이 모델 산출물이며, 그 사실은
 * `DESIGN_REPORT_SCHEMA.writing_structure` 주석에 이미 명시돼 있다.
 *
 * 결론 단계가 없으면 `DESIGN_CONCLUSION_DEFAULT_ROWS`를 덧붙인다(§12.1 「문구만 살린다.
 * 트리거 정규식과 append는 폐기. JSON 스키마 필수 필드 + **누락 시 기본값**」).
 * **보고서형 분기에서만** 덧붙인다 — `other` 분기 원문이 「서론/본론/결론이라는 명칭을
 * 억지로 쓰지 않는다」고 못박으므로, 카드뉴스·발표 리포트에 `결론 구성 방향`을 서버가
 * 밀어 넣으면 그 지시를 우리가 깨는 셈이 된다.
 */
function buildWritingStructureBlocks(steps: unknown, branchKey: string) {
  const stepList = (Array.isArray(steps) ? steps : []) as {
    title?: unknown;
    rows?: { label?: unknown; content?: unknown }[];
  }[];

  const blocks = stepList
    .map((step) => {
      const title = trimmed(step?.title);
      const rows = (Array.isArray(step?.rows) ? step.rows : [])
        .map((row) => kvRow(trimmed(row?.label), row?.content))
        .filter((row) => row.label && row.content);

      if (!title || !rows.length) return null;
      return { kind: "group", title, children: [{ kind: "keyValue", rows }] };
    })
    .filter((block): block is NonNullable<typeof block> => Boolean(block));

  const hasConclusion = blocks.some((block) =>
    CONCLUSION_STEP_RE.test(block.title),
  );

  if (branchKey === "report" && !hasConclusion) {
    blocks.push({
      kind: "group",
      title: "결론 구성 방향",
      children: [
        keyValueBlock(
          DESIGN_CONCLUSION_DEFAULT_ROWS.map((row) =>
            kvRow(row.label, row.content),
          ),
        ),
      ],
    });
  }

  return blocks;
}

/**
 * 모델 payload + 서버 소유 자료 → §8.5 `sections[{id,label,blocks[]}]`.
 * 순서는 `DESIGN_REPORT_SECTIONS`(시안 `3754:4722` 배치 순서)가 정하며 모델 출력
 * 순서와 무관하다.
 */
function buildSections({
  payload,
  resources,
  branchKey,
}: {
  payload: Record<string, unknown>;
  resources: ResourceCard[];
  branchKey: string;
}) {
  const blocksBySection: Record<string, Record<string, unknown>[]> = {
    final_topic: [
      rowsFromLabels(
        DESIGN_SECTION_ROW_LABELS.final_topic,
        payload.final_topic as Record<string, unknown> | undefined,
      ),
    ],
    recommended_resources: buildResourceBlocks(resources),
    required_format: [
      rowsFromLabels(
        DESIGN_SECTION_ROW_LABELS.required_format,
        payload.required_format as Record<string, unknown> | undefined,
      ),
    ],
    overall_direction: (() => {
      const direction = (payload.overall_direction || {}) as Record<
        string,
        unknown
      >;
      const labels = DESIGN_SECTION_ROW_LABELS.overall_direction;
      const labelOf = (key: string) =>
        labels.find((row) => row.key === key)?.label || key;
      const points = numberedItems(direction.analysis_points);

      // §5.13 실측 순서(중심 목표 → 분석 포인트 → 교과 개념… → 학생의 해석…)를 지키려고
      // 키-값 블록을 번호 목록 앞뒤로 가른다. `KeyValueView`의 행 계약은 `{label, content}`
      // 뿐이라 한 행 안에 목록을 넣을 수 없기 때문이다(§8.5 블록 계약 표).
      //
      // **`분석 포인트`만 group title로 나가는 이유와 콜론을 여기서 붙이는 이유**
      // §5.13 원문 키는 형제 3개와 같은 `분석 포인트:`(같은 줄 위계)인데, 목록을 한 행에 넣을
      // 수 없어 구조상 group으로 가를 수밖에 없다. 표시상 콜론은 보통 `PerformanceReportSurface`
      // 가 `.admission-text-line b::after`로 붙이지만 group title(`.admission-special-title`)에는
      // 그 규칙이 걸리지 않는다 — 그 규칙을 title까지 넓히면 `자료 1`·`서론 구성 방향`에도
      // 콜론이 붙어 버린다. 그래서 **이 자리에서만** 조립 시점에 콜론을 붙인다. 라벨 상수
      // (`DESIGN_SECTION_ROW_LABELS`)는 프롬프트 원문과 바이트 동일하게 그대로 두므로
      // §12.1을 건드리지 않는다.
      // ⚠ 남은 차이: group title은 `#525252`라 형제 3행(`#6b6b6b`)보다 한 단계 진하게 보인다.
      //   §5.13에 이 자리의 색 실측이 없고, 색까지 맞추려면 `:has()` 같은 구조 의존 선택자나
      //   블록 계약 확장이 필요해 여기서는 콜론만 맞췄다.
      return [
        keyValueBlock([kvRow(labelOf("core_goal"), direction.core_goal)]),
        ...(points.length
          ? [
              {
                kind: "group",
                title: `${labelOf("analysis_points")}:`,
                children: [orderedList(points)],
              },
            ]
          : []),
        keyValueBlock([
          kvRow(labelOf("concept_expression"), direction.concept_expression),
          kvRow(
            labelOf("student_interpretation"),
            direction.student_interpretation,
          ),
        ]),
      ];
    })(),
    writing_structure: buildWritingStructureBlocks(
      (payload.writing_structure as { steps?: unknown } | undefined)?.steps,
      branchKey,
    ),
    checklist: (() => {
      const items = checklistItems(payload.checklist);
      return items.length ? [bulletList(items)] : [];
    })(),
  };

  return DESIGN_REPORT_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    blocks: (blocksBySection[section.id] || []).filter(
      (block) =>
        !(
          block.kind === "keyValue" &&
          !(block.rows as unknown[] | undefined)?.length
        ),
    ),
  })).filter((section) => section.blocks.length);
}

/**
 * 구조화 응답 검증. 통과 기준은 **필수 필드가 전부 비어 있지 않을 것** 하나뿐이다.
 * 정규식도 헤더 보정도 없다(§8.4).
 *
 * 빈 문자열을 통과시키지 않는 이유는 P8과 같다: `responseSchema`의 required는 **키의
 * 존재**만 보장하고 값이 `""`인 것을 막지 못한다. 빈 값이 통과하면 라벨만 있고 본문이
 * 없는 섹션이 모달에 뜬다.
 *
 * `chosen_resources`는 **검증하지 않는다** — 빈 배열이 정상이기 때문이다(위닝DB에
 * 자료가 0건이면 원문 원칙 11조 「자료가 부족하면 억지로 채우지 않는다」가 그렇게
 * 시킨다). id 유효성은 `resolveChosenResources`가 후보 집합으로 거른다.
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function validateDesignPayload(
  payload: unknown,
): { ok: true } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "not-an-object" };
  }

  const record = payload as Record<string, unknown>;

  for (const [sectionId, labels] of Object.entries(DESIGN_SECTION_ROW_LABELS)) {
    const source = record[sectionId];
    if (!source || typeof source !== "object") {
      return { ok: false, reason: `${sectionId}:missing` };
    }
    const sourceRecord = source as Record<string, unknown>;

    for (const row of labels) {
      const value = sourceRecord[row.key];
      // `analysis_points`만 배열이다(§5.13 번호 목록).
      if (Array.isArray(value)) {
        if (!value.some((item) => trimmed(item))) {
          return { ok: false, reason: `${sectionId}.${row.key}:empty-array` };
        }
        continue;
      }
      if (!trimmed(value))
        return { ok: false, reason: `${sectionId}.${row.key}:empty` };
    }
  }

  const steps = (record.writing_structure as { steps?: unknown } | undefined)
    ?.steps as { title?: unknown; rows?: unknown }[] | undefined;
  if (!Array.isArray(steps) || !steps.length) {
    return { ok: false, reason: "writing_structure.steps:empty" };
  }
  for (let i = 0; i < steps.length; i++) {
    if (!trimmed(steps[i]?.title))
      return { ok: false, reason: `writing_structure.steps[${i}].title:empty` };
    const rows = steps[i]?.rows as
      | { label?: unknown; content?: unknown }[]
      | undefined;
    if (
      !Array.isArray(rows) ||
      !rows.some((row) => trimmed(row?.label) && trimmed(row?.content))
    ) {
      return { ok: false, reason: `writing_structure.steps[${i}].rows:empty` };
    }
  }

  const checklist = record.checklist;
  if (
    !Array.isArray(checklist) ||
    checklist.filter((item) => trimmed(item)).length < 5
  ) {
    return { ok: false, reason: "checklist:under-5" };
  }

  return { ok: true };
}

/**
 * `performance_reports.sections`에 저장하는 봉투.
 *
 * §8.5의 저장 계약은 `{ "sections": [...] }` **객체**이므로(§8.5 JSON 예시가 그 모양이다)
 * 같은 객체에 키를 더 얹는다. 여기 함께 넣는 두 가지는 응답 계약(§8.6)이 요구하는 값이고,
 * 재생(replay) 때 모델을 다시 부르지 않고 그대로 돌려주려면 영속화돼 있어야 한다:
 *   · `structure` — §12.2 3행 「판정 결과를 구조체로 리포트 JSON에 저장해 **STEP5가
 *     재판정하지 않게** 한다」. 안내문이 나중에 바뀌어도 이 리포트가 어떤 판정 위에서
 *     쓰였는지가 남는다.
 *   · `resources` — 서버가 DB 행으로 채운 자료 카드. 위닝DB 행이 나중에 수정·삭제돼도
 *     학생이 본 리포트는 그대로여야 한다(리포트는 스냅샷이다).
 */
function buildReportEnvelope({
  structure,
  sections,
  resources,
}: {
  structure: unknown;
  sections: unknown;
  resources: unknown;
}) {
  return { v: 1, type: "design", structure, sections, resources };
}

/** 저장 봉투 → 응답 본문 공통부. 재생 경로와 신규 생성 경로가 같은 모양을 쓴다. */
function toClientReport(reportRow: ReportRow | null | undefined) {
  const envelope = (
    reportRow?.sections && typeof reportRow.sections === "object"
      ? reportRow.sections
      : {}
  ) as Record<string, unknown>;

  return {
    reportId: reportRow?.id ?? null,
    topicId: reportRow?.topic_id ?? null,
    structure: envelope.structure || null,
    sections: Array.isArray(envelope.sections) ? envelope.sections : [],
    resources: Array.isArray(envelope.resources) ? envelope.resources : [],
    promptVersion: reportRow?.prompt_version ?? null,
    model: reportRow?.model ?? null,
    createdAt: reportRow?.created_at ?? null,
    updatedAt: reportRow?.updated_at ?? null,
  };
}

export default defineHandler({
  methods: ["POST"],
  auth: "user",
  errorShape: "coded",
  methodNotAllowedMessage: "POST만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "설계 리포트 생성에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/design-report",
  headers: { "Cache-Control": "no-store" },
  handler: async (req, res, ctx) => {
    const supabaseAdmin = ctx.supabaseAdmin;
    const userId = requireUserId(ctx);

    // 아래 본문 처리 중 던져지는 예외는 원래(마이그레이션 전)와 동일하게
    // `{charged:false}` extra를 실은 채 500으로 응답해야 한다 — 공통
    // defineHandler 최상위 catch는 그 extra를 모른다. 그래서 이 지점부터는
    // 로컬 try/catch로 감싸 기존 catch 블록의 동작을 그대로 재현한다
    // (배치-2 이슈로 별도 기록).
    try {
      // ── 이용권 재판정(§8.6 공통 규약). 클라이언트 가드 통과 여부를 신뢰하지 않는다.
      //    잔여 회차는 보지 않는다 — 설계 리포트는 무차감이고(§9.3), 이미 차감된 세션은
      //    소진·만료 뒤에도 계속 진행하는 것이 규정이다(§9.3 정정 「막는 것은 새 세션
      //    시작뿐」). 여기서 잔여로 막으면 학생이 값을 지불한 세션이 중간에 끊긴다.
      const { allowed: hasAccess } = await hasPaidServiceAccess(
        supabaseAdmin,
        userId,
        // SERVICE_KEY("suhaeng")는 SERVICE_CONFIGS에 항상 존재하는 상수 키.
        SERVICE_CONFIGS[SERVICE_KEY]!,
      );
      if (!hasAccess) {
        return fail(
          res,
          403,
          "NO_ENTITLEMENT",
          "유료 이용권을 결제하신 뒤 이용할 수 있습니다.",
        );
      }

      const body = req.body && typeof req.body === "object" ? req.body : {};
      const sessionId =
        typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      const topicId =
        typeof body.topicId === "string" ? body.topicId.trim() : "";
      const regenerate = body.regenerate === true;

      if (!UUID_RE.test(sessionId)) {
        return fail(
          res,
          400,
          "INVALID_SESSION_ID",
          "sessionId가 올바르지 않습니다.",
          { charged: false },
        );
      }
      if (!UUID_RE.test(topicId)) {
        return fail(
          res,
          400,
          "INVALID_TOPIC_ID",
          "topicId가 올바르지 않습니다.",
          { charged: false },
        );
      }

      // ── 세션 소유권. 없는 세션과 남의 세션을 같은 응답으로 묶어 id 존재 여부가 새지
      //    않게 한다(P8·RPC 단계 1과 같은 취지).
      const { data: sessionRowRaw, error: sessionError } = await supabaseAdmin
        .from("performance_sessions")
        .select(SESSION_COLUMNS)
        .eq("id", sessionId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (sessionError)
        throw new Error(`세션 조회 실패: ${sessionError.message}`);
      if (!sessionRowRaw) {
        return fail(res, 403, "NOT_SESSION_OWNER", "세션을 찾을 수 없습니다.", {
          charged: false,
        });
      }

      // `SESSION_COLUMNS`가 런타임 조립 문자열이라 supabase-js가 리터럴 파싱 기반 열
      // 추론을 못 하고 `GenericStringError`로 떨어진다(recommend-topics.ts와 같은 사유).
      const sessionRow = sessionRowRaw as unknown as SessionRow;

      // ── 주제 소유권(§8.6 `404 TOPIC_NOT_IN_SESSION`). **세션 id로 묶어서** 조회하므로
      //    남의 세션 주제 id를 넣으면 애초에 행이 나오지 않는다.
      const { data: topicRow, error: topicError } = await supabaseAdmin
        .from("performance_topics")
        .select("id,round,idx,title,detail")
        .eq("id", topicId)
        .eq("session_id", sessionRow.id)
        .maybeSingle();

      if (topicError) throw new Error(`주제 조회 실패: ${topicError.message}`);
      if (!topicRow) {
        return fail(
          res,
          404,
          "TOPIC_NOT_IN_SESSION",
          "이 수행평가의 주제가 아니에요.",
          { charged: false },
        );
      }

      // ── 기존 설계 리포트(세션당 최대 1행, sql/57 (2)).
      const { data: existingReport, error: existingError } = await supabaseAdmin
        .from("performance_reports")
        .select(REPORT_COLUMNS)
        .eq("session_id", sessionRow.id)
        .eq("report_type", "design")
        .maybeSingle();

      if (existingError)
        throw new Error(`설계 리포트 조회 실패: ${existingError.message}`);

      if (existingReport) {
        // 확정된 주제를 바꾸려는 요청 → 409(§8.6). 주제 확정과 리포트가 한 트랜잭션으로
        // 커밋되므로 "리포트가 있다 = 주제가 확정됐다"이고, 그 확정은 되돌리지 않는다.
        if (
          existingReport.topic_id &&
          existingReport.topic_id !== topicRow.id
        ) {
          return fail(
            res,
            409,
            "TOPIC_ALREADY_CONFIRMED",
            "이미 다른 주제로 확정한 수행평가예요.",
            {
              reportId: existingReport.id,
              confirmedTopicId: existingReport.topic_id,
              charged: false,
            },
          );
        }

        // 같은 주제 재요청 = 더블클릭·새로고침·응답 유실. **모델을 부르지 않는다.**
        if (!regenerate) {
          const quota = await readQuota(supabaseAdmin, userId);

          res.status(200).json({
            ...toClientReport(existingReport),
            quotaRemaining: quota.quotaRemaining,
            charged: false,
            reused: true,
            generationCount: Number(sessionRow.design_generation_count) || 0,
            maxGenerations: MAX_DESIGN_GENERATIONS,
          });
          return;
        }
      }

      // ── STEP1/STEP2 선행 조건. 없으면 `미입력`투성이 프롬프트가 쓸모없는 리포트를
      //    만들고 그것이 그대로 저장된다. 둘 다 무차감이다.
      const missingBasic = [
        "grade_label",
        "semester",
        "subject_group",
        "subject",
        "career_goal",
      ].find((column) => !trimmed(sessionRow[column]));

      if (missingBasic) {
        return fail(
          res,
          400,
          "SESSION_INCOMPLETE",
          "기본 정보를 먼저 입력해 주세요.",
          {
            step: 1,
            field: missingBasic,
            charged: false,
          },
        );
      }

      // sessionRow는 GuideSession이 실제로 읽는 필드를 전부 포함하는 DB 행이다(unknown 캐스트 경유).
      const assessmentText = guideTextFromSession(
        sessionRow as Parameters<typeof guideTextFromSession>[0],
      );
      if (!assessmentText) {
        return fail(
          res,
          400,
          "GUIDE_REQUIRED",
          "수행평가 안내문을 먼저 입력해 주세요.",
          {
            step: 2,
            charged: false,
          },
        );
      }

      // ─────────────────────────────────────────────────────────────────
      // 모델을 부르기 전 게이트 3개. 전부 무차감이고 전부 비용 방어다.
      // ─────────────────────────────────────────────────────────────────

      // ── 게이트 ① 차감된 세션인가 (§8.6 `409 SESSION_NOT_CHARGED`)
      //    `performance_credit_ledger.session_id`가 UNIQUE라 행 존재 = 차감 완료다
      //    (sql/54 1-7). 이 파일은 차감하지 않으므로 **읽기만** 한다.
      //    정상 흐름에서 주제가 있는 세션은 반드시 차감을 거쳤다(주제는 recommend-topics
      //    성공 경로에서만 저장된다) — 그래서 이건 통상 경로가 아니라 방어선이다.
      const { data: ledgerRow, error: ledgerError } = await supabaseAdmin
        .from("performance_credit_ledger")
        .select("id")
        .eq("session_id", sessionRow.id)
        .maybeSingle();

      if (ledgerError)
        throw new Error(`차감 원장 조회 실패: ${ledgerError.message}`);

      if (!ledgerRow) {
        return fail(
          res,
          409,
          "SESSION_NOT_CHARGED",
          "주제 추천을 먼저 받아 주세요.",
          {
            step: 3,
            charged: false,
          },
        );
      }

      // ── 게이트 ② 생성 상한(§9.3 재생성 2회, §8.6 `429 RATE_LIMITED{limit:2}`).
      //    사용자에게 보이는 상한이며 **성공한 생성만** 센다.
      //    ⚠ read-then-write다 — 여기서 읽는 값은 요청 시작 시점의 스냅샷이고 실제 +1은 모델
      //    호출이 끝난 뒤 커밋 RPC 안에서 일어난다(sql/57). 그 사이(최대 `MODEL_TIMEOUT_MS`)에
      //    같은 세션으로 동시 요청이 2건 들어오면 둘 다 이 게이트를 통과한 뒤 각각 +1 해서
      //    **예산이 과다 소진될 수 있다**(아래 attempt 카운터와 같은 경합이며 방향은 fail-safe —
      //    덜 세는 쪽이 아니라 더 세는 쪽으로 틀린다). 리포트 행이 2개가 되지는 않는다:
      //    부분 UNIQUE + upsert가 세션당 design 1행을 강제한다(sql/57).
      //    UI 경로에서는 나지 않는다(확정 버튼은 클릭 즉시 언마운트, `handleRetryDesign`에
      //    `designPhase === 'loading'` 가드) — 멀티탭·직접 API 호출에서만 재현된다. 정밀 회계가
      //    필요해지면 판정을 커밋 RPC 안으로 내려 같은 트랜잭션에서 판정+증가해야 한다.
      const generationCount = Number(sessionRow.design_generation_count) || 0;
      if (generationCount >= MAX_DESIGN_GENERATIONS) {
        return fail(
          res,
          429,
          "RATE_LIMITED",
          `설계 리포트는 최대 ${MAX_DESIGN_REGENERATIONS}번까지 다시 만들 수 있어요.`,
          {
            limit: MAX_DESIGN_REGENERATIONS,
            maxGenerations: MAX_DESIGN_GENERATIONS,
            generationCount,
            reportId: existingReport?.id ?? null,
            charged: false,
          },
        );
      }

      // ── 게이트 ③ 세션당 모델 시도 상한(sql/57 (3)).
      //    게이트 ②가 세지 못하는 축이다 — 구조 실패는 리포트를 남기지 않아
      //    `design_generation_count`가 오르지 않는다(56번 `topic_attempt_count`와 동일 논리).
      const attemptCount = Number(sessionRow.design_attempt_count) || 0;
      if (attemptCount >= MAX_MODEL_ATTEMPTS_PER_SESSION) {
        return fail(
          res,
          429,
          "DESIGN_ATTEMPT_LIMIT",
          "이 수행평가에서 설계 리포트를 너무 여러 번 요청했어요. 잠시 후 새 수행평가로 다시 시작해 주세요.",
          { maxAttempts: MAX_MODEL_ATTEMPTS_PER_SESSION, charged: false },
        );
      }

      // 모델(임베딩 포함)을 실제로 부르기 **직전**에 올린다. 성공/실패 어느 쪽이든 비용이
      // 발생하므로 실패도 세야 상한이 의미를 갖는다 — 이 게이트가 겨냥하는 것이 애초에
      // "실패만 반복하는" 경로다. (동시 요청 2건이 같은 값을 읽어 한 번 덜 셀 수 있으나
      //  이 값은 정밀 회계가 아니라 남용 상한이다. recommend-topics·analyze-guide와 동일 판단.)
      const { error: attemptCounterError } = await supabaseAdmin
        .from("performance_sessions")
        .update({ design_attempt_count: attemptCount + 1 })
        .eq("id", sessionRow.id);

      if (attemptCounterError) {
        throw new Error(
          `설계 리포트 시도 횟수 갱신 실패: ${attemptCounterError.message}`,
        );
      }

      // ── 안내문 구조 판정. **모델을 부르지 않는 결정론적 판정**이라 여기서 미리 한다
      //    (§12.2 이식분, `guide-structure.js`). 결과는 프롬프트에도 들어가고 응답·저장
      //    봉투에도 그대로 실린다 — STEP5가 재판정하지 않게 하기 위함이다(§12.2 3행).
      const structure = inferGuideStructure(
        sessionRow as Parameters<typeof inferGuideStructure>[0],
      );
      const branchKey = resolveDesignWritingBranch(structure.type);

      const gradeLabel = trimmed(sessionRow.grade_label);
      const subject = trimmed(sessionRow.subject);
      const career = trimmed(sessionRow.career_goal);
      const previousTopic =
        trimmed(sessionRow.previous_topic) || NO_PREVIOUS_TOPIC_TEXT;
      const selectedTopic = trimmed(topicRow.title);

      // ── RAG 질의문 결합 규칙은 P8과 **같다**(§12.3 문자 단위 이식). 외부는 프론트가
      //    `${교과군} / ${과목}`·`${학년} ${학기}` 결합 문자열 하나를 만들어 프롬프트와
      //    RAG에 똑같이 넘겼고, 우리는 컬럼을 분리 저장하므로 사용 시점에 결합한다.
      //    맨 과목명만 임베딩하면 threshold 튜닝의 전제가 무너진다
      //    (recommend-topics.js의 같은 자리 주석 참조).
      const ragSubject = [sessionRow.subject_group, subject]
        .map(trimmed)
        .filter(Boolean)
        .join(" / ");
      const ragGrade = [gradeLabel, trimmed(sessionRow.semester)]
        .filter(Boolean)
        .join(" ");

      // 계기판 기록. RAG 와 모델 호출 구간 전체를 try/finally 로 감싸 어떤 경로로
      // 빠져나가도 응답 직전에 한 번 내보낸다. 기록 실패는 요청에 영향을 주지 않는다.
      const trace = createAiTrace(
        performanceTraceContext({
          feature: "design_report",
          sessionId: sessionRow.id,
          profileId: userId,
          promptVersion: resolveDesignPromptVersion(),
        }),
      );
      try {
        // ── 자료 RAG. **`includeOtherSubjects:false`가 이 호출의 핵심**이다(§8.7 표) —
        //    이 플래그가 벡터 경로의 `filter_subject`로 연결돼 있어(knowledge.js
        //    `resolveFilterSubject`) 국어 리포트에 `연잎 효과 초발수 표면`이 섞이던 원인을
        //    막는다. `selectedTopic`은 이제 **확정된 주제**다(주제 추천 때의 `previous_topic`이
        //    아니다) — 자료 검색이 겨냥해야 하는 것이 그것이다.
        const knowledge = await loadDynamicAssessmentKnowledge({
          supabase: supabaseAdmin,
          grade: ragGrade,
          subject: ragSubject,
          career,
          selectedTopic,
          assessmentInfo: assessmentText,
          purpose: "resource",
          maxItems: RESOURCE_MAX_ITEMS,
          maxChars: RESOURCE_MAX_CHARS,
          includeOtherSubjects: false,
          telemetry: trace,
        });

        const candidates = buildResourceCandidates(knowledge.rows);

        // ── 학생 과거 수행 RAG. threshold가 주제 추천(0.48)과 다른 **0.46**인 것이 원문이다
        //    (§8.7 표 「학생 과거 수행 … 설계리포트 0.46」). 검색 실패는 빈 배열로 흡수되지만
        //    `profileId` 누락은 프로그래밍 오류로 던지므로 여기서만 감싼다.
        let studentSessions: Awaited<
          ReturnType<typeof loadRelevantStudentSessions>
        > = [];
        try {
          studentSessions = await loadRelevantStudentSessions({
            supabase: supabaseAdmin,
            profileId: userId,
            grade: ragGrade,
            subject: ragSubject,
            career,
            selectedTopic,
            assessmentInfo: assessmentText,
            matchThreshold: STUDENT_HISTORY_DESIGN_MATCH_THRESHOLD,
            telemetry: trace,
          });
        } catch (historyError) {
          console.error(
            "performance/design-report 과거 수행 RAG 실패(무시):",
            historyError,
          );
        }

        // 프롬프트 버전은 **서버가** 정한다. 요청 body를 보지 않는다(prompts.js
        // `resolveDesignPromptVersion` 시그니처 자체가 그 계약이다).
        const promptVersion = resolveDesignPromptVersion();

        const system = buildDesignReportSystem({
          promptVersion,
          structureType: structure.type,
          structureReason: structure.reason,
          writingFrame: structure.writingFrame,
          writingBranch: branchKey,
          resourceKnowledgeText: knowledge.text,
          allowedResources: candidates.allowed,
          studentHistoryText: formatRelevantStudentSessionsForPrompt(
            studentSessions.slice(0, STUDENT_HISTORY_PROMPT_LIMIT),
            // **여기만 맨 `subject`다(결합값 금지).** 이 인자는 검색 질의문이 아니라
            // `performance_session_vectors.subject`와의 등가 비교 대상이다
            // (knowledge.js `sameSubject`). 결합값을 넘기면 `같은 과목` 판정이 영구히 false다.
            subject,
          ),
        });

        const userMsg = buildDesignReportUser({
          selectedTopic,
          selectedTopicDetail: flattenTopicDetail(topicRow.detail),
          gradeLabel,
          // buildDesignReportUser는 값을 `|| ""`로 다루므로 null→"" 치환은 결과에 영향 없다.
          semester: sessionRow.semester || "",
          schoolType: sessionRow.school_type || "",
          subjectGroup: sessionRow.subject_group || "",
          subject,
          career,
          previousTopic,
          assessmentText,
        });

        // ── 모델 호출. 실패 형태 3가지를 각각 다르게 다룬다(§8.4 ⓑ·ⓒ·ⓓ).
        const abortController = new AbortController();
        const abortTimer = setTimeout(
          () => abortController.abort(),
          MODEL_TIMEOUT_MS,
        );

        let payload: Record<string, unknown> | null = null;
        let lastFailure = "unknown";

        try {
          for (let attempt = 0; attempt <= STRUCTURE_RETRY; attempt++) {
            const isRetry = attempt > 0;
            trace.beginAttempt(retryReasonOf(isRetry, lastFailure));

            let response: Awaited<ReturnType<typeof generateWithRetry>>;
            try {
              response = await generateWithRetry(
                {
                  model: PERFORMANCE_MODEL,
                  contents: userMsg,
                  config: {
                    systemInstruction: system,
                    // 재시도는 원문 재시도와 같은 취지로 온도를 낮춘다
                    // (`suhaengpyeong/api/recommend-topics.js:221` — 0.25 → 0.2).
                    temperature: isRetry
                      ? 0.2
                      : DESIGN_GENERATION_DEFAULTS.temperature,
                    // 같은 상한으로 다시 부르면 같은 자리에서 다시 잘린다 → 올려서 재시도.
                    maxOutputTokens: isRetry
                      ? DESIGN_MAX_OUTPUT_TOKENS_RETRY
                      : DESIGN_GENERATION_DEFAULTS.maxOutputTokens,
                    thinkingConfig: { thinkingBudget: 0 },
                    responseMimeType: "application/json",
                    responseSchema: DESIGN_REPORT_SCHEMA,
                    abortSignal: abortController.signal,
                  },
                },
                2,
                trace,
              );
            } catch (modelError) {
              // 과부하 재시도(700ms×2^n, 2회)는 generateWithRetry가 이미 소진했다.
              // 여기까지 오면 상류가 실제로 죽었거나 우리 시한이 끝난 것이다. **무차감**.
              console.error(
                "performance/design-report 모델 호출 실패:",
                modelError,
              );
              return fail(
                res,
                503,
                "MODEL_UNAVAILABLE",
                "설계 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
                {
                  charged: false,
                },
              );
            }

            const finishReason = response?.candidates?.[0]?.finishReason;

            // ⓒ — 절단된 응답은 **파싱하지 않는다.**
            if (finishReason === "MAX_TOKENS") {
              lastFailure = "finish-reason:MAX_TOKENS";
              console.warn(
                `performance/design-report MAX_TOKENS 절단 (attempt ${attempt + 1})`,
              );
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            if (finishReason && finishReason !== "STOP") {
              lastFailure = `finish-reason:${finishReason}`;
              console.warn(
                `performance/design-report 비정상 종료 ${finishReason} (attempt ${attempt + 1})`,
              );
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            const rawText = trimmed(response?.text);
            if (!rawText) {
              lastFailure = "empty-response";
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            let parsed: unknown;
            try {
              // 유일한 파싱이다. `responseMimeType:'application/json'`이 형식을 보장하므로
              // 코드펜스 제거·헤더 보정 같은 전처리를 두지 않는다(§8.4).
              parsed = JSON.parse(rawText);
            } catch (parseError) {
              lastFailure = "json-parse-failed";
              // ⓓ — 원문은 서버 로그에만 남긴다.
              console.error(
                "performance/design-report JSON 파싱 실패:",
                parseError?.message,
                rawText.slice(0, 400),
              );
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            const check = validateDesignPayload(parsed);
            if (!check.ok) {
              // tsconfig strict:false(strictNullChecks 꺼짐)에서 이 boolean 판별
              // 유니온이 `!check.ok`만으로 좁혀지지 않는다(recommend-topics.ts와 같은
              // 격리 재현 결과) — 그래서 여기서만 명시적으로 좁힌다.
              const { reason } = check as { ok: false; reason: string };
              lastFailure = `contract:${reason}`;
              console.warn(
                `performance/design-report 계약 위반 ${reason} (attempt ${attempt + 1})`,
              );
              trace.annotateLastCall(validationOf(false, lastFailure));
              continue;
            }

            payload = parsed as Record<string, unknown>;
            trace.annotateLastCall(validationOf(true, ""));
            break;
          }
        } finally {
          clearTimeout(abortTimer);
        }

        if (!payload) {
          // 재시도까지 실패. **무차감**이고 주제도 확정되지 않는다(RPC를 부르지 않았다).
          console.error(
            `performance/design-report 계약 위반 확정: ${lastFailure}`,
          );
          return fail(
            res,
            422,
            "MODEL_CONTRACT_VIOLATION",
            "설계 리포트를 정리하지 못했어요. 다시 시도해 주세요.",
            {
              charged: false,
            },
          );
        }

        // ── 자료 소유권 재설계 실행부. 여기서부터 응답에 실리는 자료 문자열은 전부 DB 행이다.
        const { resources, rejected } = resolveChosenResources(
          payload.chosen_resources,
          candidates,
        );
        trace.recordCitations(
          resources.map((r) => String(r.id)).filter(Boolean),
        );

        if (rejected.length) {
          // 조용히 버리지 않는다 — 후보 밖 id가 실제로 나온다면 `[사용 허용 자료명 목록]`
          // 지시가 먹지 않았다는 신호다(관측 가치가 있다). 사용자 응답에는 싣지 않는다(ⓓ).
          console.warn(
            `performance/design-report 후보 밖 자료 id 폐기 session=${sessionRow.id} rejected=${JSON.stringify(rejected)} allowed=${candidates.allowed.length}건`,
          );
        }

        const sections = buildSections({ payload, resources, branchKey });
        const structureForClient = {
          type: structure.type,
          reason: structure.reason,
          writingFrame: structure.writingFrame,
        };

        // ─────────────────────────────────────────────────────────────────
        // 커밋 — 주제 확정 + 리포트 저장이 **한 트랜잭션**이다(sql/57 (4)).
        // 이 지점까지 오지 못하면 주제도 확정되지 않고 리포트도 남지 않는다.
        // ─────────────────────────────────────────────────────────────────
        const { data: commitRaw, error: commitError } = await supabaseAdmin.rpc(
          "commit_performance_design_report",
          {
            p_session_id: sessionRow.id,
            p_profile_id: userId,
            p_topic_id: topicRow.id,
            p_sections: buildReportEnvelope({
              structure: {
                ...structureForClient,
                mode: structure.mode ?? null,
              },
              sections,
              resources,
            }),
            p_model: PERFORMANCE_MODEL,
            p_prompt_version: promptVersion,
          },
        );

        if (commitError) {
          console.error(
            "performance/design-report 커밋 RPC 실패:",
            commitError,
          );
          return fail(
            res,
            500,
            "INTERNAL",
            "설계 리포트 저장에 실패했습니다.",
            {
              charged: false,
            },
          );
        }

        const commit =
          commitRaw && typeof commitRaw === "object" ? commitRaw : {};
        const commitStatus = String(commit.status || "");

        // 소유권은 위에서 이미 확인했으므로 아래 두 상태는 경합(세션·주제가 그 사이에
        // 지워짐)에서만 나온다. RPC가 판정 권위를 갖는 지점이라 그대로 전달한다.
        if (commitStatus === "session_not_found") {
          return fail(
            res,
            403,
            "NOT_SESSION_OWNER",
            "세션을 찾을 수 없습니다.",
            {
              charged: false,
            },
          );
        }
        if (commitStatus === "topic_not_in_session") {
          return fail(
            res,
            404,
            "TOPIC_NOT_IN_SESSION",
            "이 수행평가의 주제가 아니에요.",
            { charged: false },
          );
        }
        if (commitStatus !== "committed" || !commit.report_id) {
          console.error(
            "performance/design-report 알 수 없는 커밋 상태:",
            commitStatus,
          );
          return fail(
            res,
            500,
            "INTERNAL",
            "설계 리포트 저장에 실패했습니다.",
            {
              charged: false,
            },
          );
        }

        const quota = await readQuota(supabaseAdmin, userId);

        res.status(200).json({
          reportId: commit.report_id,
          topicId: topicRow.id,
          structure: structureForClient,
          sections,
          resources,
          quotaRemaining: quota.quotaRemaining,
          // §8.6이 이 엔드포인트 응답에 못박은 값이다. 이 파일에는 차감 코드가 없다.
          charged: false,
          generationCount:
            Number(commit.generation_count) || generationCount + 1,
          maxGenerations: MAX_DESIGN_GENERATIONS,
          promptVersion,
          model: PERFORMANCE_MODEL,
          knowledge: {
            source: knowledge.source,
            hitCount: knowledge.hitCount,
            degraded: knowledge.degraded,
            candidateCount: candidates.allowed.length,
            chosenCount: resources.length,
            rejectedCount: rejected.length,
            studentHistoryCount: Math.min(
              studentSessions.length,
              STUDENT_HISTORY_PROMPT_LIMIT,
            ),
          },
        });
      } finally {
        await trace.flush(supabaseAdmin);
      }
    } catch (error) {
      // 원 예외 메시지를 응답에 싣지 않는다(§8.6 공통 규약 「실패 응답」).
      console.error("performance/design-report error:", error);
      return fail(res, 500, "INTERNAL", "설계 리포트 생성에 실패했습니다.", {
        charged: false,
      });
    }
  },
});

// ── 실행 시간 (형제 라우트와 동일)
//    `MODEL_TIMEOUT_MS`(50초)는 **`maxDuration: 60`을 전제로 잡은 총 예산**이다. 이 선언이
//    없으면 Fluid compute가 꺼진 프로젝트의 기본 실행시간(Hobby 10초 / Pro 15초)이 적용돼
//    50초 AbortController는 발화조차 못 하고 플랫폼이 먼저 함수를 죽인다. 그러면
//      ① 설계 리포트는 주제 추천보다 출력이 커서(아래 산정 근거) **통상 경로가** 본문 없는
//         504로 끊기고, 클라이언트의 `response.json().catch(()=>null)`이 null이 되어 원인이
//         사용자에게도 로그에도 남지 않는다.
//      ② 더 나쁜 경우: 커밋 RPC는 자체 트랜잭션으로 이미 성립했는데 응답 직렬화 중 함수가
//         죽으면 사용자는 "리포트는 저장됐는데 화면엔 실패"를 본다. 재요청하면 멱등 재생이
//         복구하지만, 상단 주석이 계약으로 선언한 "플랫폼이 죽이기 전에 우리가 응답을 만들어
//         돌려준다"가 성립하지 않는다.
//    `analyze-guide.js` / `recommend-topics.js` / `admin-embed.js` / `cleanup-attachments.js`와
//    같은 60초를 쓴다(P8에서 이 선언 누락이 BLOCK으로 지적된 항목이다).
export const config = { runtime: "nodejs", maxDuration: 60 };
