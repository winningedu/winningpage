import type { ReactNode, RefObject } from "react";
import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router";
import AiLoadingBubble from "@/components/performance/chat/AiLoadingBubble";
import ChatTimeline, {
  type PerformanceChatMessage,
} from "@/components/performance/chat/ChatTimeline";
import InlineCard from "@/components/performance/chat/InlineCard";
import { PERFORMANCE_LOADING_COPY } from "@/components/performance/chat/loadingCopy";
import { deriveStepStates } from "@/components/performance/deriveStepStates";
import QuotaExhaustedCard from "@/components/performance/quota/QuotaExhaustedCard";
import ResumeChoiceCard from "@/components/performance/resume/ResumeChoiceCard";
import BasicInfoForm from "@/components/performance/step1/BasicInfoForm";
import GuideUploadCard from "@/components/performance/step2/GuideUploadCard";
import ManualInfoForm from "@/components/performance/step2/ManualInfoForm";
import type { Topic } from "@/components/performance/step3/TopicCard";
import TopicCardList from "@/components/performance/step3/TopicCardList";
import TopicDetailModal from "@/components/performance/step3/TopicDetailModal";
import DesignReportModal, {
  type DesignReport,
} from "@/components/performance/step4/DesignReportModal";
import EvaluationBranchActions from "@/components/performance/step5/EvaluationBranchActions";
import EvaluationReportModal, {
  type EvaluationReport,
} from "@/components/performance/step5/EvaluationReportModal";
import SubmissionForm, {
  type SubmissionFieldValues,
  type SubmissionSchema,
} from "@/components/performance/step5/SubmissionForm";
import { usePerformanceShell } from "@/context/PerformanceShellContext";
import { useSession } from "@/context/SessionContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { requestDesignReport } from "@/lib/performance/designReport";
import {
  finalizeSubmission,
  requestEvaluation,
} from "@/lib/performance/evaluation";
import {
  analyzeGuideUpload,
  submitManualGuide,
  uploadGuidePhotos,
} from "@/lib/performance/guideUpload";
import { pickKnownSchoolType } from "@/lib/performance/schoolType";
import { fetchSessionDetail } from "@/lib/performance/session";
import {
  fetchSubmissionForm,
  saveSubmission,
} from "@/lib/performance/submission";
import { recommendTopics } from "@/lib/performance/topics";
import {
  performanceBootstrapQueryOptions,
  queryClient,
} from "@/lib/queryClient";

// STEP1~STEP5 채팅 화면 — docs/수행평가-상세-명세.md §5.5(`3754:3206`) / §5.6(`3754:3261`) /
// §5.7(`3754:3315`) / §5.8(`3754:3370`·`3754:3431`) / §5.9(`3754:3562`·`3754:3493`) /
// §5.10(`3754:3629`·`3754:3746`) / §5.12·§5.13(설계) / §5.14(제출폼 `3754:3992`·`3754:4119`) /
// §5.15(평가 로딩) / §5.16(평가 리포트 모달 `3754:4512`) / §5.17(분기 3버튼 `3754:4349`) /
// §5.20(시안 없음) 문구 원문 조립.
// `App.jsx`의 `/app/performance` 라우트가 `PerformancePlaceholder` 대신 이 컴포넌트를 쓴다.
//
// **이 페이지가 하는 일**: bootstrap으로 인사말에 쓸 이름을 얻고, 타임라인을 단계별로
// 누적하면서 서버 호출을 붙인다 —
//   STEP1 제출 → `POST /api/performance/session`
//   STEP2 업로드 분기 → `upload-url` ×N → `uploadToSignedUrl` ×N → `analyze-guide`
//                       (묶음 처리와 실패 롤백은 `src/lib/performance/guideUpload.js`)
//   STEP2 직접 입력 분기 → `analyze-guide`의 `{ sessionId, freetext }` 분기
//   STEP3 주제 추천 → `POST /api/performance/recommend-topics`
//                     (호출·실패 분류는 `src/lib/performance/topics.js`)
//   STEP4 주제 확정 → `POST /api/performance/design-report` (`src/lib/performance/designReport.js`)
//   STEP5 폼 재료  → `GET /api/performance/submission`
//        저장·제출 → `PUT /api/performance/submission` (`src/lib/performance/submission.js`)
//        평가·확정 → `POST /api/performance/evaluate` / `finalize`
//                     (`src/lib/performance/evaluation.js`)
//
// **타임라인 누적 규칙**(§5.6/§5.8/§5.9 실측)
//   · STEP1 폼 카드는 세션이 만들어지면 사라지고, 그 자리에 입력 요약 **사용자 말풍선**이
//     들어간다(`3754:3261`에 폼 카드가 없다).
//   · `안내문 없이 시작하기`를 누르면 **업로드 카드가 타임라인에서 제거되고**(축소·비활성
//     잔존이 아니라 노드 자체가 없다) 직전 AI2 말풍선은 그대로 남으며, 사용자 말풍선
//     `안내문 없이 시작할게요` + AI3 + 직접 입력 폼이 이어 붙는다(§5.8 단정).
//   · STEP2를 제출하면 **직접 입력 경로에 한해** 폼 카드와 **직전 AI3 말풍선까지 함께**
//     타임라인에서 빠진다(§5.9 단정 — `3754:3493`에 둘 다 없다. AI2 안내 말풍선은 남는다).
//     업로드 경로(`3754:3562`)는 애초에 AI3가 없고 업로드 카드만 빠진다.
//   · 제출 결과는 사용자 말풍선으로 남는다 — 업로드 경로는 `안내문 {n}장을 업로드했어요`
//     (§5.9 제안대로 장수 동적 치환), 직접 입력 경로는 입력한 원문 그대로다(`3754:3493`).
//
// **§5.4 재방문 분기(P13, 이번 슬라이스)**
//   bootstrap의 `lastSession`이 있으면 STEP1 인사말 대신 재개 선택 카드(`ResumeChoiceCard`)를
//   먼저 보여준다 — 진입 시점 상태는 `entryMode`(`'pending'|'choice'|'chat'`)가 갖는다.
//   `이어서 하기` → `GET /api/performance/session?sessionId=…`(`fetchSessionDetail`)로 그
//   세션의 재개 재료(주제 확정 여부·최신 라운드 카드)를 받아 재개 분기 판정표(명세 2370행)
//   3갈래로 곧장 점프한다:
//     ⓐ `selectedTopicId` 있음 → `requestDesign`을 멱등 재생 경로로 호출해 STEP5로.
//     ⓑ `topics`만 있음      → STEP3 카드로.
//     ⓒ 둘 다 없음            → `requestTopics`를 다시 불러 STEP3 로딩으로.
//   `guideInputMode`가 아직 없으면(STEP2도 안 끝난 세션) 3갈래를 타지 않고 기존 STEP1/2
//   흐름 그대로 이어간다(`createdSession`만 채우고 `guideDone`은 그대로 둔다).
//   `새로 시작하기`는 `resetForNextAssessment`를 재사용한다(§9.3 미차감 세션 1개 제한은
//   `handleSubmit`의 기존 409 처리가 자동으로 지킨다).
//   `/app/performance/:sessionId` 딥링크는 `useParams().sessionId`로 읽어 선택 화면 없이
//   곧장 같은 3갈래 분기를 탄다 — 라우트에 `:sessionId`를 실제로 잇는 것은 별도 통합 몫이라
//   이 컴포넌트는 파라미터가 없을 때(`App.jsx` 미연결 상태)도 정상 동작해야 한다.
//   STEP1/2를 이미 지난 재개는 그 두 스텝의 말풍선을 재생하지 않는다(저장된 안내문 원문·
//   업로드 장수를 bootstrap이 안 주므로 재생하면 빈 값이 보인다) — 대신 다리 역할의 안내
//   한 줄만 남기고 STEP3~5로 넘어간다.
//
// **이 페이지가 안 하는 일 (다음 슬라이스 몫)**:
//   · 이전 값 프리필 — STEP1 폼 재작성 시나리오(§5.4가 다루는 "이어서 하기"와는 다른 축).
//     `initialValues`를 비워 둔 채로 `BasicInfoForm`에 넘긴다.
//   · §5.11 주제 상세 모달은 P9에서 배선했다 — 카드 `onDetail` → `TopicDetailModal` 오픈,
//     `이 주제로 확정하기` → `handleConfirmTopic`.
//   · §5.20 (A) 셸 상단 회차 배너 — 셸(`PerformanceAppLayout`) 소관이라 여기서 만들지 않는다.
//     이 페이지가 담당하는 것은 (B) 인라인 소진 카드뿐이다.
//   · §3.5/Q7 상단 리포트 버튼 — 미결이라 만들지 않는다(아래 `DESIGN_READY_COPY` 주석).
//
// **STEP4(§5.12·§5.13, P10에서 배선)**
//   확정 → `POST /api/performance/design-report`(주제 확정 + 리포트 생성이 서버에서 한
//   트랜잭션) → 성공 시 `DesignReportModal` 자동 오픈. 호출·실패 분류는
//   `src/lib/performance/designReport.js`.
//
// **STEP5(§5.14~§5.17, P11에서 배선)**
//   설계 리포트가 준비되면(`designPhase === 'ready'`) `GET /api/performance/submission`으로
//   8종 동적 스키마와 이어 쓸 초안을 받아 `SubmissionForm`을 타임라인에 붙인다
//   (§4 플로우 `DesignReport --> Step5Form`). 제출 → `PUT …/submission` `mode:'submit'` →
//   `POST …/evaluate` → 리포트 수신 즉시 `EvaluationReportModal` 자동 오픈 →
//   §5.17 분기 3버튼(`EvaluationBranchActions`) → `POST …/finalize`.
//   폼은 `evaluationPhase === 'idle'`인 동안만 렌더되고, `추가 평가 받기`가 그 값을
//   되돌리는 것이 곧 폼 복원이다(§12.2 L2372 — 별도 복원 신호를 두지 않는다).

// §5.6 문구 원문. 두 줄로 쓰인 그대로 보존한다(`좋아요.` 뒤 줄바꿈).
const GUIDE_INTRO =
  "좋아요.\n수행평가 안내문 사진을 올리거나, 안내문 없이 직접 정보를 입력해서 시작할 수 있습니다.";

// §5.8 문구 원문. 사용자 말풍선과 AI3 안내 — AI3 문구는 직접 입력 폼의 placeholder와
// 완전히 동일하다(§5.8 단정). 중복으로 보고 줄이지 말 것.
const MANUAL_CHOICE = "안내문 없이 시작할게요";
const MANUAL_INTRO =
  "수행평가 유형, 제출 형식, 평가 기준, 필수 포함 내용 등을 적어주세요.";

// §5.10 문구 원문 — 추천 결과 AI 말풍선. **두 경로가 서로 다른 문구다.**
//
// 업로드 경로(`3754:3629`) 원문에는 가운데에 `제출 형식은 문항형(문항 1~6)으로
// 확인됩니다.` 한 문장이 더 있다. **그 문장은 옮기지 않았다** — 시안의 `문항형(문항 1~6)`은
// 특정 더미 안내문에서 나온 값이라, 값을 모르는 상태에서 그대로 렌더하면 모든 사용자에게
// "문항형 1~6"이라고 **사실이 아닌 단정**을 하게 된다.
// P11이 제출 형식 판정(`submission_schema` 8종, §8.3·§12.2)을 서버에 배선했지만 **이
// 시점에는 아직 화면에 값이 없다** — 스키마는 설계 리포트가 준비된 뒤
// `GET /api/performance/submission`으로 내려오고(§4 `DesignReport --> Step5Form`),
// STEP3 추천 결과는 그보다 앞선다. 지금 이 자리에서 유형을 말하려면 STEP3 응답이
// `submission_schema.label`을 함께 실어야 하고 그건 §8.6 계약 변경이다. 그래서 문장은
// 계속 빼 두고, 유형 안내는 폼 카드의 `안내문 분석 결과: {label}`(§5.14)이 담당한다.
const TOPIC_RESULT_UPLOAD =
  "안내문을 분석했어요. 조건과 진로를 반영해 주제 3개를 추천했어요.\n마음에 드는 주제를 선택하면 통합 설계 리포트를 바로 만들어드릴게요.";

// 직접 입력 경로(`3754:3746`) 원문 그대로. 시안 각 줄 끝의 trailing space는 옮기지 않는다
// (보이지 않는 공백을 재현할 근거가 없다 — `buildBasicInfoSummary`와 같은 판단).
const TOPIC_RESULT_MANUAL =
  "수행평가 조건과 진로를 바탕으로 주제 3개를 추천했어요.\n각 주제 아래에 선정 근거와 핵심 정보를 함께 정리했습니다.\n마음에 드는 주제를 선택하면 통합 설계 리포트를 바로 만들어드릴게요.";

// 시안 없음 — 제안. `나중에 하기`(§5.20)로 소진 카드를 닫은 뒤 남는 안내다. 카드만 닫고
// 끝내면 화면에 아무 경로도 남지 않아 사용자가 막힌다. §5.20이 문구로 약속한 "입력 내용은
// 유실되지 않는다"를 여기서도 한 번 더 지킨다.
const QUOTA_DISMISSED_COPY =
  "입력한 내용은 그대로 저장돼 있어요. 이용권을 추가하면 이 자리에서 바로 이어서 진행할 수 있습니다.";

/**
 * §5.12 사용자 확정 말풍선 문구 원문. **곡선 따옴표(“ ”)를 쓴다**(§5.12 단정) — 시안이
 * 직선 따옴표가 아니라 U+201C/U+201D를 썼고, 그것이 실측 대상이다.
 */
function buildConfirmBubble(title) {
  return `“${title}”으로 확정할게요`;
}

// 시안 없음 — 제안. §5.13 모달을 닫으면(`창 닫고 작성하기`) 타임라인으로 돌아온다. 그
// 자리에 아무것도 남기지 않으면 방금 만든 리포트로 되돌아갈 길이 사라진다 — 리포트가
// 준비됐다는 사실과 다시 여는 경로를 남긴다(모달 아래에는 §5.14 제출폼이 이어 붙는다).
//
// ⚠️ §5.15 「정본 타임라인」 2항은 이 자리에 **원문**을 지정한다: 「통합 수행평가 설계
// 리포트를 준비했어요. 상단의 통합 설계 리포트 버튼으로 언제든 다시 볼 수 있습니다.」
// **그 원문을 쓰지 않는 이유**는 문장이 가리키는 「상단의 통합 설계 리포트 버튼」이 이
// 화면에 없기 때문이다 — 셸 상단 리포트 진입점은 §3.5 Q7이 미결이라 아직 만들지 않았다
// (위 「안 하는 일」). 원문을 그대로 쓰면 존재하지 않는 버튼을 안내하게 된다. Q7이 닫혀
// 상단 버튼이 생기면 이 상수를 §5.15 원문으로 교체하고 이 주석을 지운다.
const DESIGN_READY_COPY =
  "설계 리포트를 만들었어요. 자료・글 구조・작성 방향을 한 번에 정리했으니 확인하고 작성을 시작해 보세요.";

// 시안 없음 — 제안. 실패해도 사용자가 갇히지 않아야 한다는 요구(§5.12 흐름)의 안내문.
const DESIGN_FAILED_FALLBACK =
  "설계 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * §5.14 제출폼 AI 안내 원문(`3754:3992`, 빈 줄 포함 4줄). 같은 문구가 `3754:4119`에는
 * 빈 줄 없이 3줄로 있는데(§5.14 단정, §11-Q14) **폼이 처음 나타나는 시점이 빈 상태**이므로
 * 그 노드(`3754:3992`)의 원문을 정본으로 쓴다.
 */
const SUBMISSION_FORM_INTRO = [
  "설계 리포트를 참고해 아래 제출폼을 채워주세요. 안내문에서 읽어낸 문항 구조와 지시문이 그대로 들어가 있어, 안내문을 다시 꺼내 보지 않아도 됩니다.",
  "",
  "문장은 학생이 직접 씁니다. 서비스는 완성된 결과물을 제공하지 않아요.",
].join("\n");

// 시안 없음 — 제안. 제출폼 재료(`GET /api/performance/submission`)를 못 받은 경우.
// 스키마 없이는 무엇을 쓸 칸인지 화면이 알 수 없으므로(§8.3 — 판정은 서버 소유) 임의
// 기본 폼을 그려서는 안 된다. 다시 불러오는 경로만 남긴다.
const SUBMISSION_LOAD_FAILED_FALLBACK =
  "제출폼을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

// ── STEP5(§5.15 평가 로딩 / §5.16 평가 리포트 모달 / §5.17 분기 3버튼) 문구 ──────────────

/**
 * 사용자 제출 말풍선. §5.17(`3754:4349`) 문구 원문이며, §5.15 「정본 타임라인」 3번이
 * 평가 로딩 직전에 이 말풍선을 두라고 지정한 그 노드다(실측 235×61).
 */
const SUBMIT_BUBBLE = "수행평가 제출물을 제출합니다.";

/**
 * §5.17 평가 완료 안내 원문. **점수만 동적으로 채운다** — 시안 `86`은 더미이고, §12.4 5행이
 * 「채팅에 종합 점수 노출(`종합 점수는 86점입니다`)」을 외부 앱에 없던 신규 기능으로
 * 지정했다(외부 응답에는 `score` 필드가 아예 없다). 점수를 못 읽은 경우에는 그 문장만
 * 통째로 빼고 나머지 원문을 그대로 쓴다 — 「종합 점수는 null점입니다」를 만들지 않는다.
 */
function buildEvaluationResultCopy(score) {
  return [
    "평가 리포트를 생성했어요.",
    typeof score === "number" ? ` 종합 점수는 ${score}점입니다.` : "",
    " 보완할 점을 반영해 다시 제출하거나, 다음 수행평가를 시작할 수 있어요.",
  ].join("");
}

// 시안 없음 — 제안. 평가 실패 폴백(§5.15에 실패 화면이 없다).
const EVALUATION_FAILED_FALLBACK =
  "평가 리포트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.";
const FINALIZE_FAILED_FALLBACK =
  "최종본을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * 시안 없음 — 제안. `추가 평가 받기`(§12.2 「확정 없이 폼을 복원한다」) 뒤 안내.
 * 폼만 조용히 되돌아오면 방금 본 평가 리포트가 왜 사라졌는지 알 수 없다.
 */
const REEVALUATE_RESTORED_COPY =
  "제출폼이 다시 열렸어요. 내용을 보완해 다시 제출하면 새 평가 리포트를 받을 수 있습니다.";

// 시안 없음 — 제안. `이대로 확정짓기` 완료 안내. Q67 결정(확정 뒤에도 재평가 허용, 최종본은
// 1건 고정)을 그대로 문장으로 옮긴 것이라 사용자가 다음에 무엇을 할 수 있는지가 남는다.
const FINALIZE_CONFIRMED_COPY =
  "이 제출본을 최종본으로 저장했어요. 최종본은 수행평가 1건당 하나만 지정되고, 필요하면 ‘추가 평가 받기’로 다시 평가받을 수 있습니다.";

// 시안 없음 — 제안. 최종본 포인터가 **이미 다른 제출본에 고정돼 있던** 경우(§8.6
// `409 ALREADY_FINALIZED_OTHER`, `finalize.js` Q67 주석의 「최종본 포인터는 움직이지 않는다」).
// 확정 자체는 성립했으므로 실패로 알리지 않되, 무엇이 최종본인지는 사실대로 말한다.
const FINALIZE_KEPT_POINTER_COPY =
  "앞서 확정한 제출본이 최종본으로 그대로 유지됩니다. 최종본을 다른 제출본으로 바꾸는 기능은 아직 없어요.";

// 시안 없음 — 제안. `추가 수행평가 진행하기` 뒤 새 수행평가의 첫 안내.
const NEW_ASSESSMENT_STARTED_COPY =
  "이전 수행평가의 제출본을 최종본으로 저장했어요. 새 수행평가를 시작할게요.";
const NEW_ASSESSMENT_KEPT_POINTER_COPY =
  "앞서 확정한 제출본이 최종본으로 유지된 채로 새 수행평가를 시작할게요.";

/**
 * 평가 실패 중 **같은 제출본으로 다시 시도하면 풀릴 수 있는** 코드. 서버 재시도가 멱등
 * (같은 `submissionId` 재요청은 모델을 부르지 않고 저장분을 돌려준다)이라 안전하다.
 *
 * ⚠️ 이 집합은 **`평가 다시 시도` 버튼을 띄울지만** 결정한다. 「출구가 있는가」를 여기에
 * 맡기지 않는다 — 닫힌 집합에 없는 코드가 오면 화면에 버튼이 하나도 남지 않기 때문이다
 * (검토 P11, 아래 `evaluationPhase === 'failed'` 블록 주석). 제출물을 고쳐야 풀리는
 * 코드(§8.6 evaluate 400 3종 `EMPTY_SUBMISSION`/`REQUIRED_FIELD_EMPTY`/
 * `SUBMISSION_TOO_SHORT`)를 따로 열거하지 않는 이유도 같다 — 그 코드들은 애초에 이
 * 집합에 없으므로 재시도 버튼이 안 뜨고, 폼 복원은 어차피 **모든** 실패에 열려 있다.
 */
const EVALUATION_RETRYABLE_CODES = new Set([
  "MODEL_FAILED",
  "NETWORK",
  "INTERNAL",
  "UNKNOWN",
]);

/**
 * 재평가 상한 안내(§9.2 — 상한 3 = 최초 1 + 재평가 2). 서버가 `409 REEVALUATION_LIMIT`로
 * 막기 전에 버튼을 미리 잠그고, 왜 잠겼는지를 이 문구가 말한다.
 * `'ready'`와 `'failed'` 두 블록이 같은 문구를 쓰므로 한 곳에서만 만든다.
 */
function buildReevaluateLimitNote(maxCount) {
  return `평가는 최대 ${Math.max(maxCount - 1, 0)}번까지 다시 받을 수 있어요.`;
}

/**
 * STEP1 입력 요약 사용자 말풍선(§5.6 문구 원문).
 *   `학년: 고1 1학기 / 학교 유형: 일반고 / 과목: 국어 / 공통국어 1 / 진로: 의학`
 * 시안 문구 끝에 공백 1칸이 붙어 있으나 조립 규칙이 미확정이라(§5.6 단정) **넣지 않는다** —
 * 보이지 않는 공백을 재현할 근거가 없고, 없어서 어긋나는 실측도 없다.
 * 값이 빈 항목은 절(節)째 뺀다(`school_type`은 프로필 스냅샷이라 null일 수 있다 —
 * `sql/54_performance_app.sql` 결정 ㄱ, 가짜 기본값 `'일반고'`를 넣지 않는다).
 * `previousTopic`은 시안 문구에 없어 넣지 않는다.
 *
 * `school_type`은 실서비스 저장 경로(`ProfileTab`/`Under14Form`) 어디에도 코드값이 없고
 * 한글 원문("고등학교" 등)을 그대로 저장하는 게 정본이다 — 그래서 여기서 값을 한글
 * 라벨로 "변환"하지 않는다. `SCHOOL_TYPES` 화이트리스트는 오염값 방어용이다: 로컬 시드
 * 스크립트 오탈자(`supabase/seed.sql`이 한때 `school_type = 'high'`를 넣었다)처럼 정상
 * 저장 경로를 거치지 않은 값이 STEP1 요약에 원시 문자열로 새는 것만 막는다. 목록에
 * 없으면 빈 문자열이 아니라 "학교 유형" 절 자체를 생략한다(위 필터 규칙과 같은 원칙).
 */
export function buildBasicInfoSummary(session) {
  if (!session) return "";

  const grade = [session.gradeLabel, session.semester]
    .filter(Boolean)
    .join(" ");
  const subject = [session.subjectGroup, session.subject]
    .filter(Boolean)
    .join(" / ");
  const schoolType = pickKnownSchoolType(session.schoolType);

  return [
    grade && `학년: ${grade}`,
    schoolType && `학교 유형: ${schoolType}`,
    subject && `과목: ${subject}`,
    session.careerGoal && `진로: ${session.careerGoal}`,
  ]
    .filter(Boolean)
    .join(" / ");
}

/**
 * §5.4 재개 선택 카드의 AI 안내 문구. 시안 원문(`3754:5028`)의 구조(인사 → 요약 →
 * 안내)를 그대로 따르되 값은 전부 `bootstrap`의 `lastSession` 실값이다 — 시안의
 * `김형준`/`고1 1학기` 같은 더미를 박아 넣지 않는다(`buildBasicInfoSummary`와 같은 판단).
 * 값이 없는 줄은 절(節)째 뺀다(이름 없으면 "님" 절 생략, 선택 주제 없으면 🎯 줄 생략).
 */
function buildResumeChoiceCopy(profileName, lastSession) {
  if (!lastSession) return "";

  const grade = [lastSession.gradeLabel, lastSession.semester]
    .filter(Boolean)
    .join(" ");
  const summary = [grade, lastSession.subjectGroup, lastSession.subject]
    .filter(Boolean)
    .join(" / ");

  const rows = [
    profileName ? `반갑습니다, ${profileName}님!` : "반갑습니다!",
    "",
    "지난번 진행 기록을 불러왔습니다.",
  ];
  if (summary) rows.push(`📚 학년/과목: ${summary}`);
  if (lastSession.selectedTopicTitle)
    rows.push(`🎯 선택 주제: ${lastSession.selectedTopicTitle}`);
  rows.push(
    "",
    "평가 리포트까지 만들지 않았어도, 선택한 주제부터 이어서 진행할 수 있습니다.",
  );

  return rows.join("\n");
}

// 시안 없음 — 제안. STEP1/2를 이미 지난 재개("이어서 하기" ⓐ/ⓑ/ⓒ)는 그 두 스텝의
// 말풍선을 재생하지 않는다(저장된 안내문 원문·업로드 장수를 bootstrap이 안 준다, 위
// 파일 상단 주석). 대신 다리 역할의 안내 한 줄만 남긴다.
const RESUME_CONTINUE_COPY = "이전 진행 기록을 불러왔어요. 이어서 진행할게요.";

// ── 이 파일 전용 로컬 타입 ────────────────────────────────────────────────────
// `GET /api/performance/session`·bootstrap 등 서버 응답을 화면이 실제로 쓰는 필드만 좁혀서
// 담는다(§8.6 계약은 그대로이고 타입만 좁힌다 — `session.ts` 상단 주석과 같은 판단).
type PerformanceSession = {
  id: string;
  status?: string;
  currentStep?: number;
  completedSteps?: unknown;
  gradeLabel?: string;
  semester?: string;
  schoolType?: string | null;
  subjectGroup?: string;
  subject?: string;
  careerGoal?: string;
  previousTopic?: string;
  createdAt?: string;
  updatedAt?: string;
};

// bootstrap.ts summaryOf가 실제로 내려주는 값은 DB 컬럼 원본이라 값 없음이 null로
// 온다(undefined가 아니다) — performanceBootstrapQueryOptions(src/lib/queryClient.ts)의
// PerformanceBootstrapPayload와 필드 형태를 맞춘다.
type LastSessionSummary = {
  sessionId: string;
  gradeLabel: string | null;
  semester: string | null;
  subjectGroup: string | null;
  subject: string | null;
  selectedTopicTitle: string | null;
};

// `handleConfirmTopic`(전체 `Topic`)과 `handleResumeConfirmedTopic`(`{id, title: string|null}`,
// 위 JSDoc)이 함께 채운다 — 후자가 title을 모를 수 있어(§5.4 ⓐ 분기) `Topic.title: string`보다
// 넓혀 둔다.
type ConfirmedTopic = { id: string; title: string | null };

type DesignErrorState = {
  code: string;
  message: string;
  confirmedTopicId: string | null;
};

type EvaluationErrorState = { code: string; message: string };

type FinalizeActionKind = "confirm" | "new_assessment";
type FinalizeResultState = { action: FinalizeActionKind; keptPointer: boolean };
type FinalizeErrorState = { action: FinalizeActionKind; message: string };

// ── §5.4 재방문 분기 상태 — `entryMode`/`resumeBusy`/`resumeError`/`resumeContinueNotice`
// 4종을 하나의 리듀서로 묶는다. 전이 지점이 여러 핸들러에 흩어져 있던 탓에
// `handleBackToResumeChoice`가 재개 선택 카드로 돌아가면서 지난 `resolveSessionEntry`
// 실패의 `resumeError`/`resumeContinueNotice`를 지우지 않는 버그가 있었다 — `backToChoice`
// 액션이 그 두 값을 명시적으로 초기화해 원천 차단한다.
type EntryState = {
  mode: "pending" | "choice" | "chat";
  resumeBusy: boolean;
  resumeError: string | null;
  resumeContinueNotice: string | null;
};

type EntryAction =
  | { type: "enterChoice" }
  | { type: "enterChat" }
  | { type: "resumeStart" }
  | { type: "resumeSuccess" }
  | { type: "resumeFail"; message: string; hasLastSession: boolean }
  | { type: "backToChoice" }
  | { type: "setContinueNotice"; notice: string | null }
  | { type: "clearContinueNotice" };

const initialEntryState: EntryState = {
  mode: "pending",
  resumeBusy: false,
  resumeError: null,
  resumeContinueNotice: null,
};

function entryReducer(state: EntryState, action: EntryAction): EntryState {
  switch (action.type) {
    case "enterChoice":
      return { ...state, mode: "choice" };
    case "enterChat":
      return { ...state, mode: "chat" };
    case "resumeStart":
      return { ...state, resumeBusy: true, resumeError: null };
    case "resumeSuccess":
      return { ...state, mode: "chat", resumeBusy: false, resumeError: null };
    case "resumeFail":
      return {
        ...state,
        resumeBusy: false,
        resumeError: action.message,
        mode: action.hasLastSession ? "choice" : "chat",
      };
    case "backToChoice":
      // B1 수정 — 재개 선택 카드로 돌아갈 때 지난 재개 실패의 잔여 상태를 지운다.
      return {
        ...state,
        mode: "choice",
        resumeError: null,
        resumeContinueNotice: null,
      };
    case "setContinueNotice":
      return { ...state, resumeContinueNotice: action.notice };
    case "clearContinueNotice":
      return { ...state, resumeContinueNotice: null };
    default:
      return state;
  }
}

export default function PerformanceChatPage() {
  // quotaRemaining은 SessionContext가 정본이다(§5.20 (A) 배너 판정, P15 [FIX]) —
  // recommend-topics 응답 등 채팅 진행 중 값과 이원화하지 않는다. null=무제한/판정 불가.
  const { session, quotaRemaining, userId } = useSession();
  const { success: toastSuccess, error: toastError } = useToast();
  const { setStepStates, setQuotaBannerVisible, setSessionGradeLabel } =
    usePerformanceShell();
  const accessToken = session?.access_token || null;
  const routeParams = useParams();
  const routeSessionId =
    typeof routeParams?.sessionId === "string" ? routeParams.sessionId : null;

  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [profileName, setProfileName] = useState<string | null>(null);

  // ── §5.4 재방문 분기. `entryMode`가 `'choice'`인 동안은 아래 STEP1~5 렌더 블록이 전부
  //   건너뛰어진다(그 블록들의 게이트 상태가 이 시점엔 전부 초기값이라 자연히 비어 있기도
  //   하다 — `entryMode`는 오직 재개 선택 카드 자체의 노출 여부만 가른다).
  const [lastSessionSummary, setLastSessionSummary] =
    useState<LastSessionSummary | null>(null);
  // bootstrap의 `latestDraft` — "새로 시작하기"가 §9.3 미차감 세션 1개 제한에 걸리는지
  // 미리 판정하는 근거다(`handleResumeRestart` 참고). `lastSessionSummary`와 별개 질문에
  // 답한다(bootstrap.js 주석: lastSession="이어서 할 게 있는가", latestDraft="새로 시작해도 되는가").
  const [latestDraft, setLatestDraft] = useState<unknown>(null);
  // STEP1/2를 이미 지난 재개일 때만 `resumeContinueNotice`가 채워진다(아래
  // `RESUME_CONTINUE_COPY` 주석) — 그 값이 STEP1 그리팅·STEP2 블록을 다리 안내 한 줄로
  // 갈음하는 스위치다.
  const [entryState, entryDispatch] = useReducer(
    entryReducer,
    initialEntryState,
  );
  const {
    mode: entryMode,
    resumeBusy,
    resumeError,
    resumeContinueNotice,
  } = entryState;
  const entryResolvedRef = useRef(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // `submitError`가 `409 UNCHARGED_SESSION_EXISTS`일 때만 채워진다 — 저장 리포트로는
  // 못 돌아가므로(미차감 세션은 산출물이 없어 목록에 안 뜬다) 재개 선택 카드로 돌아가는
  // 실제 출구 버튼을 조건부로 렌더하는 스위치다(`handleBackToResumeChoice`).
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);
  const [createdSession, setCreatedSession] =
    useState<PerformanceSession | null>(null);

  // STEP2 분기. 'upload' = 업로드 카드, 'manual' = 직접 입력 폼(§5.8).
  const [guideMode, setGuideMode] = useState<"upload" | "manual">("upload");
  // STEP2가 끝났는가(업로드 분석 성공 또는 직접 입력 제출 성공).
  const [guideDone, setGuideDone] = useState(false);
  // 제출 결과 사용자 말풍선 재료(§5.9) — 업로드 장수 / 직접 입력 원문.
  const [uploadedCount, setUploadedCount] = useState(0);
  const [manualText, setManualText] = useState("");

  // ── STEP3 상태
  //   'idle'      STEP2 미완료.
  //   'loading'   **최초** 추천 진행 중 → `AiLoadingBubble`(§5.9).
  //   'ready'     3카드 렌더(§5.10).
  //   'quota'     `409 QUOTA_EXHAUSTED` → 인라인 소진 카드(§5.20 (B)).
  //   'dismissed' 소진 카드를 `나중에 하기`로 닫은 뒤.
  //   'failed'    소진 외 실패 + 보여 줄 주제가 아직 없음 → 재시도 안내.
  const [topicPhase, setTopicPhase] = useState<
    "idle" | "loading" | "ready" | "quota" | "dismissed" | "failed"
  >("idle");
  // 재추천 전용 플래그. **`topicPhase`를 `'loading'`으로 바꾸지 않는 것이 요점이다** —
  // 그렇게 하면 `step3-topics` 메시지(카드 3장 + `다른 주제 다시 추천` 버튼)가 타임라인에서
  // 통째로 빠지고, 방금 그 버튼을 누른 사용자의 포커스가 `<body>`로 떨어진다. 키보드
  // 사용자는 위치를 잃고 Tab을 처음부터 다시 밟아야 하며, 새 카드가 도착해도 포커스는
  // 돌아오지 않는다. 카드·버튼은 그대로 두고 로딩 버블만 그 아래에 덧붙인다.
  const [topicRegenerating, setTopicRegenerating] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicRound, setTopicRound] = useState(0);
  // 초기값 2 = 서버 응답이 아직 없을 때의 잠정치(QA 행278, `recommend-topics.ts`
  // `MAX_ROUNDS` 주석 참고). 응답이 오면 곧바로 실측값으로 덮어써진다(아래 setter 호출부).
  const [topicMaxRounds, setTopicMaxRounds] = useState(2);
  const [topicRoundLimited, setTopicRoundLimited] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [quotaPlanEndsAt, setQuotaPlanEndsAt] = useState<string | null>(null);

  // ── 주제 상세 모달(§5.11, P9). 열려 있는 주제 1건만 들고 있으면 된다 — 모달은
  //   `topicDetail`이 있을 때만 렌더한다.
  //   **닫기 경로**(ESC/딤/`다른 주제 보기`)는 카드 목록(`topics`)을 그대로 두므로 포커스가
  //   원래 클릭한 카드로 복귀한다(Base UI Dialog가 기본 제공하는 트리거 복귀가 담당, 카드는
  //   리렌더로 교체되지 않는다 — `topics` 상태가 이 사이에 바뀌지 않기 때문).
  //   **확정 경로는 다르다.** `handleConfirmTopic`이 `designPhase`를 `'loading'`으로 바꾸면
  //   아래 STEP3 메시지 렌더 조건(`designPhase === 'idle'`)이 카드 목록을 통째로
  //   언마운트한다 — React 18 배치로 카드 언마운트와 모달 언마운트가 같은 커밋에서 일어나므로
  //   Base UI Dialog의 트리거 복귀 대상은 cleanup 시점에 이미 detach된 노드다(검토 A).
  //   그래서 확정 경로는 자동 복귀에 기대지 않고 `designLoadingRef`로 새 포커스 목적지(STEP4
  //   로딩 버블)를 직접 지정한다 — 아래 `designLoadingRef` 이펙트 참고. **같은 이유로 P10이
  //   추가한 설계 리포트 모달도 닫힐 때 포커스 목적지를 직접 지정한다**(`handleCloseDesignModal`).
  const [topicDetail, setTopicDetail] = useState<Topic | null>(null);

  // ── STEP4 설계 리포트(§5.12 로딩 → §5.13 모달, P10에서 완성).
  //   'idle'    주제 미확정 — STEP3 카드가 화면에 있다.
  //   'loading' `design-report` 진행 중 → 로딩 버블(§5.12).
  //   'ready'   리포트 수신 → 모달 자동 오픈 + 타임라인에 다시 열기 경로.
  //   'failed'  실패 → 재시도 / 주제 재선택.
  //
  //   **`'idle'`로 되돌아오는 경로가 실재해야 한다.** P9는 확정 후 이 상태에서 나갈 수
  //   없었고(단방향), 그 미결이 이 슬라이스의 배선으로 닫힌다 — 실패 시 `주제 다시 고르기`가
  //   `'idle'`로 되돌린다. 실패 경로에서는 서버가 아무것도 커밋하지 않으므로(모델 호출 전
  //   게이트는 물론, 커밋 RPC 실패도 주제 확정 없이 끝난다 — `design-report.js` 상단 표)
  //   되돌아가 다른 주제를 고르는 것이 실제로 안전하다.
  const [designPhase, setDesignPhase] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const [confirmedTopic, setConfirmedTopic] = useState<ConfirmedTopic | null>(
    null,
  );
  const [designReport, setDesignReport] = useState<DesignReport | null>(null);
  const [designError, setDesignError] = useState<DesignErrorState | null>(null);
  // 모달 개폐는 `designPhase`와 **별개 축**이다 — 닫아도 리포트는 그대로 남아야 다시 열 수 있다.
  const [designModalOpen, setDesignModalOpen] = useState(false);
  // `designPhase === 'loading'`으로 전이할 때 새로 나타나는 STEP4 로딩 버블로 포커스를 옮기는
  // 데 쓴다(검토 A-2, 위 `topicDetail` 주석 참고). `ChatTimeline`에 이 ref를 `focusRef`로
  // 넘기면 `AiLoadingBubble` 루트에 배선되고, 그 항목의 래퍼가 자동으로 `aria-live="off"`가
  // 되어 `ChatTimeline`의 `aria-live="polite"`와 중복 낭독되지 않는다.
  const designLoadingRef = useRef<HTMLDivElement>(null);
  // 모달을 닫을 때 포커스가 갈 자리(`설계 리포트 다시 보기` 버튼). 모달은 로딩 버블이
  // 사라진 커밋에서 자동으로 열리므로 Base UI Dialog가 기억한 트리거는 이미 detach된
  // 노드다 — 복귀 대상을 여기서 직접 준다.
  const designReopenRef = useRef<HTMLButtonElement>(null);
  // `designPhase` 전이 3종을 **대칭으로** 다루기 위한 나머지 두 목적지(검토 P10).
  //   · `'loading' → 'failed'`: 로딩 버블이 언마운트되는데 그 버블이 바로 직전에 프로그램적
  //     포커스를 받은 노드다(`designLoadingRef` 이펙트). 배선이 없으면 `<body>`로 떨어져
  //     `설계 리포트 다시 시도`/`주제 다시 고르기`에 도달하려면 Tab을 처음부터 밟아야 한다.
  //   · `'failed' → 'idle'`(`주제 다시 고르기`): 방금 누른 버튼 자신이 언마운트된다.
  // 둘 다 `topicRegenerating` 주석이 이미 지목한 그 함정이라 같은 rAF 패턴으로 막는다.
  const designFailedRef = useRef<HTMLDivElement>(null);
  const topicsReturnRef = useRef<HTMLDivElement>(null);
  // STEP3 복귀 포커스는 **`주제 다시 고르기`로 되돌아온 경우에만** 필요하다. 항상 배선하면
  // `step3-topics` 항목이 늘 `aria-live="off"`가 되어(포커스 목적지 규약) 최초 추천 결과가
  // 낭독되지 않는다. 그래서 복귀 요청이 있을 때만 켜고, 켜진 뒤에는 그대로 둔다 —
  // 되돌아온 뒤로는 이 항목이 포커스로 낭독되는 쪽이 일관된다.
  const [topicsFocusPending, setTopicsFocusPending] = useState(0);

  // ── STEP5 평가(§5.15 로딩 → §5.16 모달 → §5.17 분기 3버튼)
  //   'idle'    아직 제출하지 않았다 — **§5.14 제출폼이 화면에 있는 상태다.**
  //   'loading' `evaluate` 진행 중 → 로딩 버블(§5.15).
  //   'ready'   리포트 수신 → 모달 자동 오픈(§4 플로우 `EvalLoading --> EvalReport`) +
  //             타임라인에 다시 열기 경로 + 분기 3버튼(§5.17).
  //   'failed'  실패 → 코드에 따라 재시도 / 폼 복원 / 안내만.
  //
  // ⚠️ **제출폼 슬라이스와의 계약**: 폼은 `evaluationPhase === 'idle'`인 동안 렌더된다.
  //   `추가 평가 받기`(§12.2 「확정 없이 폼을 복원한다」)가 이 값을 `'idle'`로 되돌리는 것이
  //   곧 폼 복원이다 — 별도 복원 신호를 두면 두 축이 갈라진다.
  //   폼이 제출에 성공하면 `handleSubmissionEvaluate(submissionId)`를 부른다(아래).
  const [evaluationPhase, setEvaluationPhase] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const [evaluationSubmissionId, setEvaluationSubmissionId] = useState<
    string | null
  >(null);
  /**
   * **평가에 실제로 성공한** 제출본. `evaluationSubmissionId`(마지막으로 *시도한* 제출본)와
   * 갈라지는 축이다 — 재평가가 실패하면 시도 대상은 새 제출본으로 바뀌었는데 서버의
   * evaluation 리포트는 여전히 이전 제출본을 가리킨다(sql/58 (4) upsert는 성공할 때만 돈다).
   * 확정(`finalize`)은 「이 세션의 evaluation 리포트가 **이 제출본을 대상으로** 만들어졌는가」
   * 를 보므로(sql/58 (5) 단계 5 → `400 NO_EVALUATION_YET`) **확정은 이 값을 써야 한다.**
   * `'ready'`에서는 둘이 같아 기존 동작이 그대로다.
   */
  const [evaluatedSubmissionId, setEvaluatedSubmissionId] = useState<
    string | null
  >(null);
  const [evaluationReport, setEvaluationReport] =
    useState<EvaluationReport | null>(null);
  const [evaluationError, setEvaluationError] =
    useState<EvaluationErrorState | null>(null);
  // 모달 개폐는 `evaluationPhase`와 **별개 축**이다(§5.13 모달과 같은 처리) — 닫아도 리포트는
  // 남아야 `평가 리포트 다시 보기`로 돌아올 수 있다.
  const [evaluationModalOpen, setEvaluationModalOpen] = useState(false);
  // 서버가 세는 성공 생성 횟수와 상한(§9.2, 기본 3 = 최초 1 + 재평가 2). 상한에 닿으면
  // `추가 평가 받기`를 눌러도 서버가 `409 REEVALUATION_LIMIT`이라 미리 잠근다.
  const [evaluationCount, setEvaluationCount] = useState(0);
  const [maxEvaluations, setMaxEvaluations] = useState(3);
  // `추가 평가 받기`로 폼이 복원됐음을 알리는 안내를 켜는 카운터(0이면 최초 작성 중이다).
  const [reevaluateRound, setReevaluateRound] = useState(0);

  // ── 확정(§5.17 두 버튼 → `POST /api/performance/finalize`)
  const [finalizeAction, setFinalizeAction] =
    useState<FinalizeActionKind | null>(null); // 진행 중인 action(잠금용)
  const [finalizeResult, setFinalizeResult] =
    useState<FinalizeResultState | null>(null);
  const [finalizeError, setFinalizeError] = useState<FinalizeErrorState | null>(
    null,
  );

  // ── `추가 수행평가 진행하기` 이후. 새 세션은 서버가 이미 만들어 두므로(finalize 응답
  //   `nextSessionId`) 이 화면은 **상태만 STEP1로 되돌린다**. 그 뒤 STEP1 제출은
  //   `action:'create'`가 아니라 `'resume'`이어야 한다 — 미차감 세션이 이미 하나 있어
  //   `create`는 `409 UNCHARGED_SESSION_EXISTS`로 막힌다(§9.3 동시 1개 제한).
  const [sessionStartMode, setSessionStartMode] = useState<"create" | "resume">(
    "create",
  );
  const [restartNotice, setRestartNotice] = useState<string | null>(null);
  const [restartToken, setRestartToken] = useState(0);

  // 포커스 목적지 — 전부 「직전에 포커스를 갖고 있던 노드가 같은 커밋에서 언마운트되는
  // 전이」다(`ChatTimeline`의 `focusRef` 주석과 같은 이유).
  const evaluationLoadingRef = useRef<HTMLDivElement>(null); // 폼 → 로딩(폼 카드가 사라진다)
  const evaluationFailedRef = useRef<HTMLDivElement>(null); // 로딩 → 실패(로딩 버블이 사라진다)
  const evaluationReopenRef = useRef<HTMLButtonElement>(null); // 모달 닫기(자동 오픈이라 트리거가 이미 없다)
  const reevaluateNoticeRef = useRef<HTMLDivElement>(null); // 분기 버튼 → 폼 복원(누른 버튼이 사라진다)
  const finalizeDoneRef = useRef<HTMLDivElement>(null); // 확정 완료 안내
  const restartRef = useRef<HTMLDivElement>(null); // 새 수행평가 첫 안내(타임라인이 통째로 갈린다)

  // ── STEP5 제출폼(§5.14) — 스키마·작성값·저장 상태
  //   `submissionSchema`는 **서버가 내려준 값 그대로**다(§8.3 — 8종 판정은 서버 소유이고
  //   화면은 재판정하지 않는다). 없으면 폼을 그리지 않는다: 스키마를 모르는 채 기본 4칸을
  //   그리면 문항형 학생에게 없는 칸을 보여 주고 저장은 `400 UNKNOWN_FIELD`로 죽는다.
  //   `submissionValue`가 **평가 슬라이스와 독립된 축**인 것이 중요하다 — `추가 평가 받기`가
  //   `evaluationPhase`만 `'idle'`로 되돌려도 작성값이 그대로 남아 폼이 복원된다(§12.2 L2372).
  const [submissionSchema, setSubmissionSchema] =
    useState<SubmissionSchema | null>(null);
  const [submissionValue, setSubmissionValue] = useState<SubmissionFieldValues>(
    {},
  );
  const [submissionLoadError, setSubmissionLoadError] = useState<string | null>(
    null,
  );
  const [submissionLoadToken, setSubmissionLoadToken] = useState(0);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingWork, setSubmittingWork] = useState(false);
  // `savingDraft`/`submittingWork` state는 렌더용이고, 아래 가드(`handleSaveDraft`/
  // `handleSubmitWork` 상단)는 이 ref들을 대신 본다 — state는 setState 호출이 batched
  // 되므로 "지금 이 순간 실제로 저장이 진행 중인가"를 동기적으로 반영하지 않는다.
  // `useDebouncedAutosave`의 언마운트 cleanup이 `onSaveRef.current(최신값)`(=여기
  // `handleSaveDraft`의 마지막 렌더 클로저)을 호출할 때, 그 클로저가 참조하는
  // `savingDraft`는 "그 렌더 시점의 값"으로 굳어 있다 — in-flight 저장이 끝나 cleanup이
  // 실제로 발화하는 시점엔 이미 stale하다. ref는 렌더와 무관하게 항상 최신이라 이 문제가
  // 없다(state는 렌더 트리거·표시용으로 그대로 유지한다).
  const savingDraftRef = useRef(false);
  const submittingWorkRef = useRef(false);
  // 저장 실패와 제출 실패는 서로 다른 상태다(그리핑 원인이었다) — 게이트 실패
  // (`SUBMISSION_TOO_SHORT` 등)는 초안이 이미 저장된 채로 돌아오는데, 두 실패를 한
  // 상태로 합치면 "제출만 실패"한 순간에도 `SubmissionForm`이 "저장 실패"를 띄웠다.
  // `submissionSaveError`는 자동 저장(`handleSaveDraft`) 전용, `submissionSubmitError`는
  // 제출(`handleSubmitWork`) 전용이다.
  const [submissionSaveError, setSubmissionSaveError] = useState<string | null>(
    null,
  );
  const [submissionSubmitError, setSubmissionSubmitError] = useState<
    string | null
  >(null);
  const [submissionSavedAt, setSubmissionSavedAt] = useState<string | null>(
    null,
  );

  // ── 사이드바 진행단계 배선(P13) ────────────────────────────────────────────────
  //
  // §3.3 노드별 활성 스텝 표를 이 페이지가 이미 들고 있는 라이브 상태로 옮긴다.
  // `deriveStepStates`(순수 함수)는 completedSteps/activeStep만 받으므로, 그 두 값을
  // 아래에서 계산한다 — 이 계산이 활성 스텝 산출 규율(off-by-one 교정, 완료 후에만
  // 다음 스텝으로)을 실제로 지키는 자리다.
  //
  //   activeStep=1  createdSession 없음(entryMode pending/choice 포함 — §3.3 표의
  //                 3754:3035/3754:5028/3754:3206이 전부 STEP1 활성).
  //   activeStep=2  createdSession 있고 guideDone=false(STEP2 업로드/직접입력 진행 중).
  //   activeStep=3  guideDone=true, designPhase가 'idle'(주제 미확정 — topicPhase의
  //                 loading/ready/quota/failed/dismissed 전부 이 안에 포함된다. §3.3
  //                 표의 3754:3562~3754:4872가 전부 STEP3 활성인 것과 대응한다).
  //   activeStep=4  designPhase가 'loading'|'failed', 또는 'ready'이면서 모달이 열려
  //                 있음(designModalOpen). 설계 리포트 생성 로딩(3754:3868)과 리포트
  //                 모달(3754:4722)이 표에서 이미 STEP4로 명시돼 있다 — "요청을 보낸
  //                 시점에 다음 스텝을 미리 켠 것"이 아니라 그 로딩 자체가 STEP4 자신의
  //                 작업이라 그렇다(주제 확정은 STEP3의 완료 조건이다).
  //   activeStep=5  designPhase가 'ready'이면서 모달이 닫혀 있음(§5.13 「창 닫고
  //                 작성하기」 이후 — Step5Form) — evaluationPhase(idle/loading/ready/
  //                 failed)와 다음 단계 선택 화면(finalizeAction/finalizeResult)까지
  //                 전부 이 안에 포함된다(§3.3 표의 3754:3992~3754:4349가 전부 STEP5).
  //   activeStep=null 위 어느 것도 아님(초기 렌더 등 이론상 도달하지 않아야 하는 자리) —
  //                 `deriveStepStates`는 null을 「활성 없음」으로 정상 처리한다.
  //
  // completedSteps는 activeStep보다 앞선 스텝 전부다 — 이 페이지의 진행은 단방향
  // 선형이라(다른 주제 재추천·재평가는 같은 스텝 안에서의 왕복이지 스텝 역행이
  // 아니다) 그보다 복잡한 규칙이 필요 없다.
  useEffect(() => {
    let activeStep: number | null = null;

    if (!createdSession) {
      activeStep = 1;
    } else if (!guideDone) {
      activeStep = 2;
    } else if (designPhase === "idle") {
      activeStep = 3;
    } else if (designPhase === "loading" || designPhase === "failed") {
      activeStep = 4;
    } else if (designPhase === "ready") {
      activeStep = designModalOpen ? 4 : 5;
    }

    const completedSteps =
      activeStep == null
        ? []
        : Array.from({ length: activeStep - 1 }, (_, i) => i + 1);

    setStepStates(deriveStepStates({ completedSteps, activeStep }));

    // P5 — 사이드바 프로필 부제의 학년 조각(라이브 세션 우선순위, PerformanceShellContext.tsx
    // 주석 참고)도 같은 라이브 세션 객체(`createdSession`)에서 나오므로 이 이펙트가 함께
    // 올린다 — 학년만 위해 별도 이펙트·조회를 새로 만들지 않는다.
    setSessionGradeLabel(createdSession?.gradeLabel ?? null);

    // 저장 리포트 등 이 페이지 밖으로 나가면 셸의 기본값(all-todo · null)으로 되돌린다 —
    // §3.3 「저장 리포트 = 활성 스텝 0개」와 일치한다. 컨텍스트 자체는 리셋 시점을
    // 모르므로(값을 들고 있을 뿐) 이 페이지가 언마운트 시 직접 리셋해야 한다.
    return () => {
      setStepStates(["todo", "todo", "todo", "todo", "todo"]);
      setSessionGradeLabel(null);
    };
  }, [
    createdSession,
    guideDone,
    designPhase,
    designModalOpen,
    setStepStates,
    setSessionGradeLabel,
  ]);

  // ── 셸 상단 회차 소진 배너 배선(§5.20 (A), P15 [FIX]) ─────────────────────────
  //
  // 조건: `quotaRemaining === 0` && 「이어할 수 있는 세션이 하나도 없음」.
  // 후자를 `!createdSession && !lastSessionSummary`로 정의한다 —
  //   · `createdSession`이 있으면(STEP2 이후, 또는 재개 완료) 그 세션을 이어할 수 있다.
  //   · `createdSession`이 아직 없어도 `lastSessionSummary`(bootstrap이 돌려준, 재개
  //     선택 카드의 근거)가 있으면 「이어서 하기」로 진입할 후보가 있다는 뜻이다
  //     (`entryMode`가 'pending'/'choice'인 구간이 정확히 이 경우다 — entryMode 자체를
  //     조건으로 쓰지 않는 이유는 'pending'이 "아직 판정 전"과 "판정했지만 재개 후보
  //     없음" 둘 다를 가리켜 이 판정에는 한 단계 더 원시적인 `lastSessionSummary`가
  //     더 정확하기 때문이다).
  // `bootstrapLoading` 동안은 `lastSessionSummary`가 아직 신뢰할 수 없으므로(초기값
  // null과 "조회했더니 없음"을 구분 못 함) 배너를 띄우지 않는다 — 판정 불가는 §5.20
  // 취지(선제 "안내"이지 강제 차단이 아님)상 "안 띄움"으로 보수적으로 처리한다.
  //
  // 저장 리포트 등 이 페이지 밖으로 나가면 셸 기본값(false)으로 되돌린다 — 그 화면엔
  // 판정 근거 자체가 없으므로 배너를 띄우지 않는 것이 맞다(PerformanceShellContext.jsx
  // 주석과 같은 규율, stepStates cleanup과 동일 패턴).
  useEffect(() => {
    const hasResumableSession =
      Boolean(createdSession) || Boolean(lastSessionSummary);
    setQuotaBannerVisible(
      !bootstrapLoading && quotaRemaining === 0 && !hasResumableSession,
    );

    return () => {
      setQuotaBannerVisible(false);
    };
  }, [
    bootstrapLoading,
    quotaRemaining,
    createdSession,
    lastSessionSummary,
    setQuotaBannerVisible,
  ]);

  useEffect(() => {
    let alive = true;
    if (!accessToken) return undefined;

    setBootstrapLoading(true);

    (async () => {
      try {
        // P5 — `performanceBootstrapQueryOptions`(src/lib/queryClient.ts)와 같은 캐시
        // 키(['performance','bootstrap',userId])를 채운다 — 셸(PerformanceAppLayout)의
        // 사이드바 프로필 슬롯이 그 캐시를 useQuery로 구독한다. 이 페이지는 화면
        // 진입마다 최신 판정이 필요해(§5.4 진입 분기가 stale 데이터로 잘못 갈리면 안
        // 된다) staleTime:0으로 그 옵션의 기본 staleTime(15초)을 우회해 강제로 새로
        // 조회한다 — 셸은 이 조회가 채운 캐시를 기본 staleTime 그대로 구독만 한다.
        const data = await queryClient.fetchQuery({
          ...performanceBootstrapQueryOptions(userId, accessToken),
          staleTime: 0,
        });
        if (!alive) return;
        setProfileName(data.profile?.name || null);
        setLastSessionSummary(data.lastSession || null);
        setLatestDraft(data.latestDraft || null);
      } catch (error) {
        console.error("[performance] bootstrap 조회 실패:", error);
      } finally {
        if (alive) setBootstrapLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [accessToken, userId]);

  // §5.4 진입 분기 판정 — bootstrap이 끝난 뒤(`bootstrapLoading` false) 딱 한 번만 돈다
  // (`entryResolvedRef`, STEP1 그리팅 이펙트와 달리 재실행될 이유가 없다 — 세션 목록은
  // 이 페이지 안에서 다시 바뀌지 않는다).
  //   · 라우트에 `sessionId`가 있으면(딥링크, §2.1 저장 리포트에서 "이어서" 진입) 선택
  //     화면 없이 곧장 그 세션을 조회해 재개 분기 판정표를 태운다(`resolveSessionEntry`).
  //   · 없고 `lastSession`이 있으면 재개 선택 카드(`entryMode:'choice'`)를 보여준다.
  //   · 둘 다 없으면 기존 그대로 STEP1 그리팅부터 시작한다.
  // resolveSessionEntry는 여러 핸들러가 공유하는 미메모 함수다 — useEffectEvent로 감싸 최신
  // 클로저를 그대로 읽되 deps에서는 뺀다. entryResolvedRef 가드가 실행을 최초 1회로 막는다.
  const onBootstrapReady = useEffectEvent(() => {
    if (entryResolvedRef.current) return;
    entryResolvedRef.current = true;

    if (routeSessionId) {
      void resolveSessionEntry(routeSessionId);
      return;
    }

    entryDispatch({ type: lastSessionSummary ? "enterChoice" : "enterChat" });
  });

  useEffect(() => {
    if (bootstrapLoading) return;
    onBootstrapReady();
  }, [bootstrapLoading]);

  // STEP4 로딩 진입 시 포커스 이동(검토 A-2). 카드 목록이 언마운트되며 Base UI Dialog가
  // 하는 것과 같은 자동 복귀 대상(트리거 카드)도 함께 사라지므로, 여기서 새 목적지를 직접
  // 지정한다. 로딩 버블이 실제로 DOM에 붙은 뒤(같은 렌더 커밋 다음 프레임) 포커스를 옮겨야
  // 하므로 `requestAnimationFrame`을 쓴다 — Base UI Dialog가 열릴 때 첫 포커서블 요소로
  // 옮기는 것과 같은 패턴이다.
  useEffect(() => {
    if (designPhase !== "loading") return undefined;
    const raf = requestAnimationFrame(() => {
      designLoadingRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [designPhase]);

  // STEP4 실패 진입 — 언마운트되는 로딩 버블에서 실패 안내(재시도 버튼을 품은 항목)로 옮긴다.
  useEffect(() => {
    if (designPhase !== "failed") return undefined;
    const raf = requestAnimationFrame(() => {
      designFailedRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [designPhase]);

  // `주제 다시 고르기` 복귀 — 다시 나타난 STEP3 카드 묶음으로 옮긴다.
  useEffect(() => {
    if (!topicsFocusPending) return undefined;
    const raf = requestAnimationFrame(() => {
      topicsReturnRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [topicsFocusPending]);

  // ── STEP5 포커스 전이 5종. 위 세 이펙트와 같은 rAF 패턴이라 헬퍼로 묶었다(전이가 늘어난
  //   만큼 같은 6줄을 다섯 번 더 쓰지 않는다). 훅 호출 순서는 고정이다.
  useRafFocus(evaluationPhase === "loading", evaluationLoadingRef);
  useRafFocus(evaluationPhase === "failed", evaluationFailedRef);
  useRafFocus(
    evaluationPhase === "idle" && reevaluateRound > 0,
    reevaluateNoticeRef,
    [reevaluateRound],
  );
  useRafFocus(Boolean(finalizeResult), finalizeDoneRef, [finalizeResult]);
  useRafFocus(Boolean(restartNotice), restartRef, [restartToken]);

  /**
   * STEP5 제출폼 재료 조회(§8.6 표 밖 추가분 — `GET /api/performance/submission`).
   * 설계 리포트가 준비된 시점(§4 `DesignReport --> Step5Form`)에 딱 한 번 돌고,
   * 실패 시 `submissionLoadToken`으로만 다시 돈다.
   *
   * 서버가 스키마와 **이어서 쓸 초안**을 함께 준다. 화면이 이미 값을 들고 있으면 덮어쓰지
   * 않는다 — 재시도 조회가 작성 중인 원고를 서버 스냅샷으로 되돌리면 안 된다.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: TODO(useEffectEvent) submissionSchema는 의도적으로 deps에서 뺐다(위 주석) — 성공 직후 재실행돼 같은 GET을 두 번 쏘는 걸 막는다. 재조회 트리거는 submissionLoadToken 하나뿐이다.
  useEffect(() => {
    if (designPhase !== "ready" || !accessToken || !createdSession)
      return undefined;

    let alive = true;
    setSubmissionLoadError(null);

    (async () => {
      try {
        const data = await fetchSubmissionForm({
          accessToken,
          sessionId: createdSession.id,
        });
        if (!alive) return;
        setSubmissionSchema(data.schema);
        setSubmissionValue((prev) =>
          Object.keys(prev).length ? prev : data.submission?.fields || {},
        );
      } catch (error) {
        if (!alive) return;
        // 서버는 원 예외를 응답에 싣지 않는다(§8.6 공통 규약) — 콘솔에만 코드를 남긴다.
        console.error("[performance] 제출폼 조회 실패:", error?.code, error);
        setSubmissionLoadError(
          error?.userMessage || SUBMISSION_LOAD_FAILED_FALLBACK,
        );
      }
    })();

    return () => {
      alive = false;
    };
    // 결과 상태(`submissionSchema`)는 의존성에 넣지 않는다 — 넣으면 성공 직후 이펙트가 다시
    // 돌아 같은 GET을 두 번 쏜다. 재조회 트리거는 `submissionLoadToken` 하나뿐이다.
  }, [designPhase, accessToken, createdSession, submissionLoadToken]);

  /** 세션 생성/이어받기 1회. `action`은 `sessionStartMode`가 정한다(아래 주석). */
  async function postSession(values, action) {
    const response = await apiFetch("/api/performance/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, basicInfo: values }),
    });

    const data = await response.json().catch(() => null);
    return { response, data };
  }

  async function handleSubmit(values) {
    if (!accessToken || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrorCode(null);

    try {
      // 기본은 `'create'`다. `추가 수행평가 진행하기`로 되돌아온 직후에만 `'resume'`인데,
      // 그때는 finalize가 이미 미차감 세션을 하나 준비해 뒀으므로(§9.3 동시 1개 제한 때문에
      // `create`는 `409 UNCHARGED_SESSION_EXISTS`로 막힌다) 그것을 이어받아야 한다.
      let { response, data } = await postSession(values, sessionStartMode);

      // 그 미차감 세션이 그 사이에 사라진 경우(다른 탭에서 소비·폐기)에는 `resume`이
      // `404 NO_UNCHARGED_SESSION`으로 떨어진다 — create로 **한 번만** 되돌린다. 그러지
      // 않으면 새 수행평가를 시작할 길이 화면에서 사라진다.
      if (
        !response.ok &&
        sessionStartMode === "resume" &&
        data?.error?.code === "NO_UNCHARGED_SESSION"
      ) {
        ({ response, data } = await postSession(values, "create"));
      }

      if (!response.ok) {
        if (
          response.status === 409 &&
          data?.error?.code === "UNCHARGED_SESSION_EXISTS"
        ) {
          // 저장 리포트로는 못 돌아간다 — 미차감 세션은 정의상 산출물이 없어 그 목록에
          // 뜨지 않는다(api/performance/reports.js). 대신 재개 선택 카드로 돌아가는
          // 버튼을 실제로 렌더한다(`submitErrorCode`, InlineCard 아래 렌더 지점).
          setSubmitError(
            "이미 진행 중인(회차를 아직 쓰지 않은) 수행평가가 있어요.",
          );
          setSubmitErrorCode("UNCHARGED_SESSION_EXISTS");
        } else {
          setSubmitError(
            data?.error?.message ||
              "세션을 생성하지 못했어요. 다시 시도해 주세요.",
          );
        }
        return;
      }

      // 이어받기는 1회성이다 — 세션을 손에 넣은 뒤로는 다시 기본값으로 돌린다.
      setSessionStartMode("create");
      setCreatedSession(data.session);
    } catch (error) {
      console.error("[performance] 세션 생성 실패:", error);
      setSubmitError(
        "네트워크 오류로 세션을 생성하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * STEP3 주제 추천 1회. **최초 추천과 재추천이 같은 호출이다**(§8.6) — 다른 점은 실패했을
   * 때 어디로 되돌아가는지뿐이라 그것만 인자로 받는다.
   *
   * 회차 차감은 서버가 AI 성공 이후에만 커밋하고(§9.3) 재추천은 `already_charged`로 무차감
   * 통과하므로, 이 화면은 차감을 예측하거나 표시하지 않는다.
   *
   * @param {{isRegenerate?: boolean, sessionOverride?: {id: string}}} [options] `isRegenerate`면
   *   ⓐ 진행 중에도 카드·버튼을 화면에 남기고(포커스 유지 — `topicRegenerating` 주석) ⓑ 실패
   *   시 이미 받은 3카드 화면으로 되돌리고 실패 사유만 카드 아래 한 줄로 알린다(있던 결과를
   *   실패로 지우지 않는다). `sessionOverride`는 §5.4 재개 분기 ⓒ 전용이다 —
   *   `applyResumedSession`이 `setCreatedSession` 직후 같은 틱에 이 함수를 부르므로
   *   `createdSession` 상태는 아직 갱신 전(stale closure)이다. 그 세션 객체를 직접 받아
   *   `createdSession`을 대신 참조한다.
   */
  async function requestTopics({
    isRegenerate = false,
    sessionOverride = null,
  }: {
    isRegenerate?: boolean;
    sessionOverride?: PerformanceSession | null;
  } = {}) {
    const activeSession = sessionOverride || createdSession;
    if (!accessToken || !activeSession) return;

    // 최초 추천만 타임라인을 로딩 버블로 교체한다. 재추천은 기존 메시지를 남긴 채
    // 플래그만 켜고, 로딩 버블은 카드 묶음 **아래**에 덧붙는다.
    if (isRegenerate) setTopicRegenerating(true);
    else setTopicPhase("loading");
    setTopicError(null);

    try {
      const data = await recommendTopics({
        accessToken,
        sessionId: activeSession.id,
      });

      setTopics(Array.isArray(data?.topics) ? data.topics : []);
      setTopicRound(Number(data?.round) || 1);
      if (Number(data?.maxRounds) > 0)
        setTopicMaxRounds(Number(data.maxRounds));
      setTopicRoundLimited(false);
      setTopicPhase("ready");
    } catch (error) {
      // 서버는 원 예외·모델 원문을 응답에 싣지 않는다(§8.6 공통 규약) — `userMessage`는
      // 그대로 화면에 띄워도 되는 문구다. 콘솔에만 코드를 남긴다.
      console.error("[performance] 주제 추천 실패:", error?.code, error);

      if (error?.code === "QUOTA_EXHAUSTED") {
        // 재추천 경로에서는 정상적으로 도달하지 않는다 — 같은 세션이라 서버 RPC가
        // `already_charged`를 돌려주는 것이 정상이고(§9.3), 소진이 막는 것은 새 세션
        // 시작뿐이다(§5.20/Q54). 그래도 오면 소진 카드로 수렴시킨다.
        setQuotaPlanEndsAt(error.planEndsAt || null);
        setTopicPhase("quota");
        return;
      }

      if (error?.code === "ROUND_LIMIT") {
        // 다른 탭에서 이미 상한까지 쓴 경우에도 여기로 온다 — 버튼 비활성 안내로 수렴시킨다.
        if (Number(error.maxRounds) > 0)
          setTopicMaxRounds(Number(error.maxRounds));
        setTopicRoundLimited(true);
        setTopicPhase(isRegenerate ? "ready" : "failed");
        if (!isRegenerate) setTopicError(error.userMessage);
        return;
      }

      setTopicError(
        error?.userMessage ||
          "주제를 추천하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      setTopicPhase(isRegenerate ? "ready" : "failed");
    } finally {
      if (isRegenerate) setTopicRegenerating(false);
    }
  }

  /**
   * 업로드 분기 — 전처리까지 끝난 파일 배열을 받아 업로드 → 분석까지 간다.
   * 업로드가 중간에 실패하면 `uploadGuidePhotos`가 이번 시도의 첨부를 회수하므로
   * 사용자는 5장 상한에 막히지 않고 그대로 다시 시도할 수 있다.
   */
  async function handleGuideSubmit(files) {
    if (!accessToken || !createdSession || submitting || !files.length) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const attachmentIds = await uploadGuidePhotos({
        accessToken,
        sessionId: createdSession.id,
        files,
      });

      await analyzeGuideUpload({
        accessToken,
        sessionId: createdSession.id,
        attachmentIds,
      });
      setUploadedCount(attachmentIds.length);
      setGuideDone(true);
      // STEP2가 끝나면 곧바로 STEP3로 이어진다(§5.9 — 로딩 카드가 바로 붙는다).
      // `requestTopics`는 자체적으로 모든 실패를 흡수하므로 여기서 await하지 않는다.
      void requestTopics();
    } catch (error) {
      console.error("[performance] 안내문 업로드·분석 실패:", error);
      // `guideUpload.js`가 화면에 그대로 띄울 수 있는 문구를 달아 던진다.
      setSubmitError(
        error?.userMessage || "안내문을 분석하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** 직접 입력 분기(§5.8) — 같은 `analyze-guide`의 `{ sessionId, freetext }` 분기다. */
  async function handleManualSubmit(freetext) {
    if (!accessToken || !createdSession || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitManualGuide({
        accessToken,
        sessionId: createdSession.id,
        freetext,
      });
      setManualText(freetext);
      setGuideDone(true);
      void requestTopics();
    } catch (error) {
      console.error("[performance] 안내문 직접 입력 제출 실패:", error);
      setSubmitError(
        error?.userMessage ||
          "입력한 정보를 저장하지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** `안내문 없이 시작하기` — 업로드 카드를 걷고 직접 입력 분기로 넘어간다(§5.8). */
  function handleSkipGuide() {
    if (submitting) return;
    setSubmitError(null);
    setGuideMode("manual");
  }

  /**
   * 카드 클릭 → 주제 상세 모달(§5.11 `3754:4872`). **이것이 카드의 유일한 진입점이다** —
   * 확정(`이 주제로 확정하기`)은 모달 하단에만 있고 카드에서 바로 확정하는 경로는 없다
   * (§11.1 Q48).
   */
  function handleTopicDetail(topic) {
    setTopicDetail(topic);
  }

  /** ESC·딤 클릭·`다른 주제 보기` 공통 핸들러 — 모달만 닫는다(카드 목록은 그대로). */
  function handleCloseTopicDetail() {
    setTopicDetail(null);
  }

  /**
   * 설계 리포트 1회 요청. **주제 확정과 리포트 생성이 서버에서 한 트랜잭션이다**(§8.6 —
   * 외부 앱의 2회 왕복 결함 회피). 그래서 "확정만 하는" 호출은 존재하지 않는다.
   *
   * 회차는 이 단계에서 깎이지 않는다(§9.3 「설계 리포트 생성·재생성 | 없음」) — 서버 응답도
   * `charged:false` 고정이라 이 화면은 차감을 예측하지도 표시하지도 않는다.
   *
   * **재시도는 `regenerate`를 보내지 않는다.** 같은 `topicId` 재요청은 서버에서 멱등 재생
   * (모델 미호출)이라, 응답만 유실된 경우에는 저장된 리포트를 그대로 복구하고 아니면 새로
   * 만든다. `regenerate:true`는 재생성 예산(2회)을 태우는 별개 행동이다.
   *
   * @param {object} topic
   * @param {{id: string}} [sessionOverride] §5.4 재개 분기 ⓐ 전용(위 `requestTopics`의
   *   같은 이름 인자와 같은 이유 — `applyResumedSession`이 `setCreatedSession` 직후 같은
   *   틱에 이 함수를 부르므로 `createdSession` state가 아직 stale하다).
   */
  async function requestDesign(
    topic,
    sessionOverride: PerformanceSession | null = null,
  ) {
    const activeSession = sessionOverride || createdSession;
    if (!accessToken || !activeSession || !topic) return;

    setDesignPhase("loading");
    setDesignError(null);

    try {
      const data = await requestDesignReport({
        accessToken,
        sessionId: activeSession.id,
        topicId: topic.id,
      });

      setDesignReport(data);
      setDesignPhase("ready");
      // §5.13 흐름도(`DesignLoading --> DesignReport`)대로 완성 즉시 모달을 연다.
      setDesignModalOpen(true);
    } catch (error) {
      // 서버는 원 예외·모델 원문을 응답에 싣지 않는다(§8.6 공통 규약) — `userMessage`는
      // 그대로 화면에 띄워도 되는 문구다. 콘솔에만 코드를 남긴다.
      console.error("[performance] 설계 리포트 생성 실패:", error?.code, error);
      setDesignError({
        code: error?.code || "UNKNOWN",
        message: error?.userMessage || DESIGN_FAILED_FALLBACK,
        // `TOPIC_ALREADY_CONFIRMED`에서만 실린다 — 복구 경로(아래 `step4-design-failed`)가 쓴다.
        confirmedTopicId: error?.confirmedTopicId || null,
      });
      setDesignPhase("failed");
    }
  }

  /**
   * `이 주제로 확정하기`(§5.11 하단, 모달의 유일한 확정 진입점). 주제 상세 모달을 닫고
   * STEP4로 넘어간다(§5.12 — 카드 3장·재추천 버튼이 타임라인에서 제거되고 확정 말풍선 +
   * 로딩 버블만 남는다).
   */
  function handleConfirmTopic(topic) {
    setConfirmedTopic(topic);
    setTopicDetail(null);
    void requestDesign(topic);
  }

  /** 실패 후 재시도 — 같은 주제로 다시 요청한다(멱등 재생 또는 신규 생성). */
  function handleRetryDesign() {
    if (designPhase === "loading") return;
    void requestDesign(confirmedTopic);
  }

  /**
   * 실패 후 `주제 다시 고르기` — STEP3 카드 화면으로 되돌린다. **이 경로가 P9의 단방향
   * 미결을 닫는 지점이다.** 실패 경로에서는 서버가 주제 확정도 리포트도 커밋하지 않으므로
   * (`design-report.js` 「실패 경로별 잔여 상태」 — 남는 것은 `design_attempt_count` 뿐)
   * 다른 주제를 골라도 서버 상태와 어긋나지 않는다.
   */
  function handleBackToTopics() {
    setDesignPhase("idle");
    setConfirmedTopic(null);
    setDesignError(null);
    // 이 버튼 자신이 같은 커밋에서 언마운트된다 — 다시 나타난 STEP3 카드 묶음으로 포커스를
    // 넘긴다(위 `topicsFocusPending` 주석).
    setTopicsFocusPending((n) => n + 1);
  }

  /**
   * `TOPIC_ALREADY_CONFIRMED` 전용 복구 — 다른 탭에서(또는 이전 방문에서) 이미 다른 주제로
   * 확정된 세션이다. 이 코드에서는 **재시도도 주제 재선택도 통하지 않는다**(무엇을 보내든
   * 같은 409로 돌아온다). 유일하게 통하는 것은 서버가 알려준 확정 주제(`confirmedTopicId`)로
   * 요청하는 것이고, 그러면 멱등 재생 경로로 저장된 리포트가 그대로 열린다(모델 미호출).
   * @param {{id: string, title: string|null}} topic
   */
  function handleResumeConfirmedTopic(topic) {
    if (designPhase === "loading" || !topic?.id) return;
    setConfirmedTopic(topic);
    void requestDesign(topic);
  }

  /**
   * §5.13 `창 닫고 작성하기`·ESC·딤 클릭 공통. 리포트는 상태에 남겨 다시 열 수 있게 한다.
   * 포커스는 Base UI Dialog의 자동 복귀(트리거로 되돌리기)에 기대지 않고 `설계 리포트
   * 다시 보기` 버튼으로 직접 옮긴다 — 모달을 연 트리거(STEP4 로딩 버블)는 같은 커밋에서
   * 이미 언마운트됐다.
   */
  function handleCloseDesignModal() {
    setDesignModalOpen(false);
    requestAnimationFrame(() => designReopenRef.current?.focus());
  }

  function handleReopenDesignModal() {
    setDesignModalOpen(true);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP5 — 평가(§5.15·§5.16) / 분기 3버튼(§5.17)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 평가 리포트 1회. **회차는 깎이지 않는다**(§9.3 「제출 → 평가 리포트 생성 | 없음」,
   * 「`추가 평가 받기` | 없음(상한 2회)」) — 차감 지점은 `recommend-topics` 최초 성공
   * 1곳뿐이고 서버 응답도 `charged:false` 고정이라 이 화면은 차감을 예측하지도 표시하지도
   * 않는다.
   *
   * **재시도는 같은 `submissionId`를 그대로 다시 보낸다.** 서버가 멱등 재생(모델 미호출)이라
   * 응답만 유실된 경우에는 저장된 리포트를 그대로 복구하고, 아니면 새로 만든다.
   */
  async function runEvaluation(targetSubmissionId) {
    if (!accessToken || !createdSession || !targetSubmissionId) return;

    setEvaluationSubmissionId(targetSubmissionId);
    setEvaluationPhase("loading");
    setEvaluationError(null);
    setFinalizeError(null);

    try {
      const data = await requestEvaluation({
        accessToken,
        sessionId: createdSession.id,
        submissionId: targetSubmissionId,
      });

      setEvaluationReport(data?.report || null);
      // 확정이 겨냥할 제출본은 **평가에 성공한** 것이다(위 `evaluatedSubmissionId` 주석).
      setEvaluatedSubmissionId(targetSubmissionId);
      if (Number(data?.evaluationCount) > 0)
        setEvaluationCount(Number(data.evaluationCount));
      if (Number(data?.maxEvaluations) > 0)
        setMaxEvaluations(Number(data.maxEvaluations));
      // 이전 평가로 확정해 둔 결과가 있으면 새 평가와 함께 지운다 — 어느 제출본을 확정했다는
      // 안내가 새 리포트 옆에 남아 있으면 무엇이 최종본인지 화면이 거짓말을 하게 된다.
      setFinalizeResult(null);
      setEvaluationPhase("ready");
      // §4 플로우 `EvalLoading --> EvalReport : 3754:4512`(명세 L332) — 완성 즉시 모달을 연다.
      setEvaluationModalOpen(true);
    } catch (error) {
      // 서버는 원 예외·모델 원문을 응답에 싣지 않는다(§8.6 공통 규약) — `userMessage`는
      // 그대로 화면에 띄워도 되는 문구다. 콘솔에만 코드를 남긴다.
      console.error("[performance] 평가 리포트 생성 실패:", error?.code, error);
      setEvaluationError({
        code: error?.code || "UNKNOWN",
        message: error?.userMessage || EVALUATION_FAILED_FALLBACK,
      });
      setEvaluationPhase("failed");
    }
  }

  /**
   * `중간 저장`(§5.14 secondary가 있던 자리). §4 상태도는 STEP5를 `Empty --> Filled : 입력`
   * / `Filled --> Filled : 중간 저장`(L328) 두 전이로만 그렸고 처음에는 그 근거로 디바운스
   * 자동 저장을 만들지 않았지만, 디자이너 9/4 댓글("자동 저장 되는 로직으로")과 사용자
   * 확정(QA 행280)으로 뒤집혔다 — 수동 `중간 저장` 버튼은 제거됐고, 이 함수는 이제
   * `SubmissionForm` 안의 `useDebouncedAutosave`가 부르는 **유일한 저장 경로**다.
   *
   * 실패해도 `submissionValue`를 건드리지 않는다(작성 내용 유실 금지). 다중 탭 경합은
   * 서버가 `409 SESSION_FINALIZED`/`REEVALUATION_LIMIT`으로 갈라 주므로 문구만 띄운다.
   * 성공 토스트는 두지 않는다(자동 저장이 매 디바운스마다 뜨면 소음이다) — 대신
   * `SubmissionForm`이 `saving`/`error`/`savedAt` props로 조용한 상태 텍스트를 보여준다.
   * **실패 시 에러를 다시 던진다** — `useDebouncedAutosave`가 이 예외로 "저장 안 됨"을
   * 판정해 마지막 저장본을 갱신하지 않고, 실패 상태의 수동 재시도가 다시 시도할 수 있게
   * 한다(호출부가 reject 없이 성공으로 착각하면 재시도 경로가 막힌다).
   */
  async function handleSaveDraft(fields) {
    if (
      !accessToken ||
      !createdSession ||
      savingDraftRef.current ||
      submittingWorkRef.current
    )
      return;

    savingDraftRef.current = true;
    setSavingDraft(true);
    setSubmissionSaveError(null);

    try {
      const data = await saveSubmission({
        accessToken,
        sessionId: createdSession.id,
        fields,
        mode: "draft",
      });
      setSubmissionSavedAt(data.savedAt || new Date().toISOString());
      // 성공한 자동 저장은 "제출 실패" 문구도 함께 걷어낸다 — 게이트 실패
      // (`SUBMISSION_TOO_SHORT` 등) 이후에도 학생은 계속 타이핑을 이어갈 수 있고, 그
      // 입력이 자동 저장되면 방금 있었던 제출 실패 경고는 더 이상 최신 상태를 대변하지
      // 않는다(그대로 두면 고친 뒤에도 "제출하지 못했어요…"가 화석처럼 남는다).
      setSubmissionSubmitError(null);
    } catch (error) {
      console.error("[performance] 중간 저장 실패:", error?.code, error);
      const message =
        error?.userMessage ||
        "중간 저장에 실패했어요. 잠시 후 다시 시도해 주세요.";
      setSubmissionSaveError(message);
      toastError(message);
      throw error;
    } finally {
      savingDraftRef.current = false;
      setSavingDraft(false);
    }
  }

  /**
   * `제출하고 평가 리포트 받기`(§5.14 primary → §5.15). **저장과 평가는 별개 호출이다** —
   * §8.6 `evaluate`는 `{sessionId, submissionId}`만 받고 값은 DB에서 읽는다(클라이언트가
   * 평문 결합 텍스트를 조립해 보내지 않는다). 그래서 여기서 먼저 `mode:'submit'`으로
   * 저장하고, 받은 `submissionId`를 평가 슬라이스의 단일 진입점에 넘긴다.
   *
   * 회차는 이 경로에서 깎이지 않는다(§9.3 — 차감 지점은 `recommend-topics` 1곳뿐).
   */
  async function handleSubmitWork(fields) {
    if (
      !accessToken ||
      !createdSession ||
      savingDraftRef.current ||
      submittingWorkRef.current
    )
      return;

    submittingWorkRef.current = true;
    setSubmittingWork(true);
    setSubmissionSubmitError(null);

    try {
      const data = await saveSubmission({
        accessToken,
        sessionId: createdSession.id,
        fields,
        mode: "submit",
      });
      setSubmissionSavedAt(data.savedAt || null);
      handleSubmissionEvaluate(data.submissionId);
    } catch (error) {
      console.error("[performance] 제출 실패:", error?.code, error);
      // 게이트 실패(`SUBMISSION_TOO_SHORT`/`REQUIRED_FIELD_EMPTY`)는 **초안이 저장된 채로**
      // 돌아온다 — 서버가 게이트를 저장 이후에 보기 때문이다(`api/performance/submission.js`).
      // 학생이 쓰던 글은 남아 있으므로 `submissionSaveError`(자동 저장 실패)는 건드리지
      // 않는다 — 그리핑 원인이었다: 저장은 성공했는데 제출만 실패한 순간에도
      // `submissionSaveError`를 같이 쓰면 `SubmissionForm`이 "저장 실패"를 오표시했다.
      if (error?.saved?.savedAt) setSubmissionSavedAt(error.saved.savedAt);
      setSubmissionSubmitError(
        error?.userMessage || "제출하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      submittingWorkRef.current = false;
      setSubmittingWork(false);
    }
  }

  /** 제출폼 재료 조회 실패 후 재시도. 값·스키마를 비우지 않는다(있으면 그대로 유지). */
  function handleRetrySubmissionLoad() {
    setSubmissionLoadToken((n) => n + 1);
  }

  /**
   * **제출폼 슬라이스가 부르는 유일한 진입점**(§5.14 폼 → §5.15 로딩). 폼이
   * `PUT /api/performance/submission` `mode:'submit'`으로 받은 `submissionId`를 그대로 넘긴다.
   */
  function handleSubmissionEvaluate(submissionId) {
    if (evaluationPhase === "loading") return;
    void runEvaluation(submissionId);
  }

  /** 실패 후 재시도 — 같은 제출본으로 다시 요청한다(멱등 재생 또는 신규 생성). */
  function handleRetryEvaluation() {
    if (evaluationPhase === "loading") return;
    void runEvaluation(evaluationSubmissionId);
  }

  function handleReopenEvaluationModal() {
    setEvaluationModalOpen(true);
  }

  /**
   * §5.16 `다음 단계 선택하기`·ESC·딤 클릭 공통. 리포트는 상태에 남겨 다시 열 수 있게 한다.
   * 포커스는 Base UI Dialog의 자동 복귀(트리거로 되돌리기)에 기대지 않고 `평가 리포트
   * 다시 보기` 버튼으로 직접 옮긴다 — 모달을 연 트리거(STEP5 로딩 버블)는 같은 커밋에서
   * 이미 언마운트됐다.
   */
  function handleCloseEvaluationModal() {
    setEvaluationModalOpen(false);
    requestAnimationFrame(() => evaluationReopenRef.current?.focus());
  }

  /**
   * `추가 평가 받기`(§5.17). **확정하지 않는다** — §12.2 L2372 「'추가 평가 받기'만 확정 없이
   * 폼을 복원한다」. 서버 호출도 없다: 복원된 폼의 다음 저장이 자연스럽게 새 revision을 연다
   * (`api/performance/submission.js` 「draft upsert」).
   */
  function handleReevaluate() {
    if (finalizeAction) return;
    setEvaluationPhase("idle");
    setEvaluationModalOpen(false);
    setEvaluationError(null);
    setFinalizeError(null);
    setReevaluateRound((n) => n + 1);
  }

  /**
   * `이대로 확정짓기`(`confirm`) / `추가 수행평가 진행하기`(`new_assessment`) 공통.
   * §12.2 L2372 정본: 「둘 다 마지막 제출본을 최종본으로 확정 저장한다」 — 그래서 두 버튼이
   * 같은 엔드포인트를 `action`만 달리해 부른다. 이 호출도 무차감이다(§9.3 — 새 세션의 회차는
   * 그 세션의 다음 주제 추천이 성공할 때 든다).
   */
  async function runFinalize(action) {
    // 확정 대상은 마지막으로 **평가에 성공한** 제출본이다(위 `evaluatedSubmissionId` 주석).
    if (
      !accessToken ||
      !createdSession ||
      !evaluatedSubmissionId ||
      finalizeAction
    )
      return;

    setFinalizeAction(action);
    setFinalizeError(null);

    let keptPointer = false;

    try {
      // finalizeSubmission은 §8.6 성공 응답 전체를 그대로 돌려주는 postJson 위임이라 정본
      // 타입이 없다 — 이 화면이 실제로 읽는 필드(nextSessionId)만 좁혀서 갖는다.
      let data: { nextSessionId?: string } | undefined;
      try {
        data = await finalizeSubmission({
          accessToken,
          sessionId: createdSession.id,
          submissionId: evaluatedSubmissionId,
          action,
        });
      } catch (error) {
        // `409 ALREADY_FINALIZED_OTHER` — 확정 뒤 재평가한 제출본으로 다시 확정하려는 경우다
        // (Q67이 열어 둔 경로). 최종본 포인터를 옮기는 계약이 §8.6에 없으므로 서버가 알려준
        // **이미 확정된 제출본**으로 한 번 더 부른다: 그 요청은 `already_final` 200이라
        // 사용자는 막히지 않고(특히 `new_assessment`는 새 세션까지 받는다), 대신 무엇이
        // 최종본인지는 아래 안내로 사실대로 말한다.
        if (
          error?.code !== "ALREADY_FINALIZED_OTHER" ||
          !error.finalSubmissionId
        )
          throw error;
        keptPointer = true;
        data = await finalizeSubmission({
          accessToken,
          sessionId: createdSession.id,
          submissionId: error.finalSubmissionId,
          action,
        });
      }

      toastSuccess("최종 수행평가가 저장되었습니다.");

      if (action === "new_assessment") {
        // 서버가 `nextSessionId`(기존 미차감 세션 재사용 또는 신규 draft)를 준비해 뒀다.
        // 준비에 실패해 null이어도 확정은 이미 성립했으므로 그대로 STEP1로 되돌린다 —
        // `handleSubmit`의 `resume → create` 폴백이 두 경우를 모두 흡수한다.
        resetForNextAssessment({
          keptPointer,
          hasNextSession: Boolean(data?.nextSessionId),
        });
        return;
      }

      setFinalizeResult({ action, keptPointer });
    } catch (error) {
      console.error("[performance] 최종본 확정 실패:", error?.code, error);
      const message = error?.userMessage || FINALIZE_FAILED_FALLBACK;
      setFinalizeError({ action, message });
      toastError(message);
    } finally {
      setFinalizeAction(null);
    }
  }

  function handleConfirmSubmission() {
    void runFinalize("confirm");
  }

  function handleNewAssessment() {
    void runFinalize("new_assessment");
  }

  /**
   * `추가 수행평가 진행하기` 성공 후 화면을 STEP1로 되돌린다. 세션은 서버가 이미 만들어
   * 뒀으므로 여기서 만들지 않고, STEP1 제출만 `'resume'`으로 보내게 표시해 둔다.
   *
   * §5.4 재개 선택 카드의 `새로 시작하기`도 이 함수를 그대로 재사용한다(§9.3 미차감 세션
   * 1개 제한은 `handleSubmit`의 기존 `create → 409 UNCHARGED_SESSION_EXISTS` 처리가 자동으로
   * 지킨다 — 이 함수는 차감 판정에 관여하지 않는다). 그 호출부는 `keptPointer`/`hasNextSession`
   * 둘 다 해당하지 않으므로(방금 finalize한 것이 없다) `notice`를 명시적으로 넘겨 아래
   * 「최종본으로 저장했어요」류 안내를 억누른다 — 넘기지 않았을 때만(호출부가 이 인자를
   * 아예 안 주면) 기존 finalize 흐름의 기본 안내를 그대로 쓴다.
   *
   * ⚠️ **STEP5 제출폼 상태(§5.14)도 여기서 함께 비운다.** 빠뜨리면 새 수행평가의 STEP5에서
   *   이전 수행평가의 원고가 그대로 프리필된다 — `추가 평가 받기`가 작성값을 **남기는**
   *   것과 정반대의 요구다(그쪽은 같은 세션의 폼 복원, 여기는 다른 세션의 시작이다).
   */
  function resetForNextAssessment({
    keptPointer,
    hasNextSession,
    notice,
  }: {
    keptPointer: boolean;
    hasNextSession: boolean;
    notice?: string | null;
  }) {
    setSessionStartMode(hasNextSession ? "resume" : "create");
    setCreatedSession(null);
    setSubmitError(null);
    setSubmitErrorCode(null);

    setGuideMode("upload");
    setGuideDone(false);
    setUploadedCount(0);
    setManualText("");
    entryDispatch({ type: "clearContinueNotice" });

    setTopicPhase("idle");
    setTopicRegenerating(false);
    setTopics([]);
    setTopicRound(0);
    setTopicRoundLimited(false);
    setTopicError(null);
    setQuotaPlanEndsAt(null);
    setTopicDetail(null);
    setTopicsFocusPending(0);

    setDesignPhase("idle");
    setConfirmedTopic(null);
    setDesignReport(null);
    setDesignError(null);
    setDesignModalOpen(false);

    setSubmissionSchema(null);
    setSubmissionValue({});
    setSubmissionLoadError(null);
    setSubmissionSaveError(null);
    setSubmissionSubmitError(null);
    setSubmissionSavedAt(null);

    setEvaluationPhase("idle");
    setEvaluationSubmissionId(null);
    setEvaluatedSubmissionId(null);
    setEvaluationReport(null);
    setEvaluationError(null);
    setEvaluationModalOpen(false);
    setEvaluationCount(0);
    setReevaluateRound(0);
    setFinalizeResult(null);
    setFinalizeError(null);

    const resolvedNotice =
      notice !== undefined
        ? notice
        : keptPointer
          ? NEW_ASSESSMENT_KEPT_POINTER_COPY
          : NEW_ASSESSMENT_STARTED_COPY;
    if (resolvedNotice) {
      setRestartNotice(resolvedNotice);
      setRestartToken((n) => n + 1);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // §5.4 재방문 분기 — 재개 선택 카드 / 딥링크 진입점 공통 재개 로직
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * `GET /api/performance/session` 응답을 받아 재개 분기 판정표(명세 2370행) 3갈래로
   * 화면 상태를 세팅한다. **`sessionOverride`를 `requestDesign`/`requestTopics`에 직접
   * 넘긴다** — 바로 위 `setCreatedSession`은 비동기라 이 함수가 끝나기 전에는
   * `createdSession` state에 반영되지 않는다(stale closure, 두 함수 상단 주석 참고).
   *
   * `guideInputMode`가 없으면(STEP2도 안 끝난 세션) 3갈래를 타지 않는다 — 재개 분기
   * 판정표는 주제 추천 이후만 다루므로, 그보다 이른 지점은 기존 STEP1/2 흐름이 그대로
   * 이어간다(`createdSession`만 채우고 STEP2 업로드/직접입력 카드가 정상 노출된다).
   */
  function applyResumedSession(data) {
    const s = data?.session || {};
    const sessionForState = {
      id: s.id,
      status: s.status,
      currentStep: s.currentStep,
      completedSteps: s.completedSteps,
      gradeLabel: s.gradeLabel,
      semester: s.semester,
      schoolType: s.schoolType,
      subjectGroup: s.subjectGroup,
      subject: s.subject,
      careerGoal: s.careerGoal,
      previousTopic: s.previousTopic,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
    setCreatedSession(sessionForState);

    const guideStepDone = Boolean(s.guideInputMode);
    if (!guideStepDone) {
      setGuideMode("upload");
      setGuideDone(false);
      return;
    }

    setGuideMode(s.guideInputMode === "manual" ? "manual" : "upload");
    setGuideDone(true);
    entryDispatch({ type: "setContinueNotice", notice: RESUME_CONTINUE_COPY });

    if (s.selectedTopicId) {
      // ⓐ 주제 확정까지 끝남 → STEP5로. `requestDesign`은 같은 `topicId` 재요청을 멱등
      // 재생(모델 미호출)으로 처리하므로 여기서 그대로 재사용한다(`design-report.js`
      // 「멱등 재생 vs 재생성」).
      const topic = {
        id: s.selectedTopicId,
        title: s.selectedTopicTitle || null,
      };
      setConfirmedTopic(topic);
      void requestDesign(topic, sessionForState);
      return;
    }

    if (Array.isArray(data?.topics) && data.topics.length) {
      // ⓑ 주제 카드까지만 받음 → STEP3 카드 화면으로.
      setTopics(data.topics);
      setTopicRound(Number(data.round) || 1);
      if (Number(data.maxRounds) > 0) setTopicMaxRounds(Number(data.maxRounds));
      setTopicRoundLimited(false);
      setTopicPhase("ready");
      return;
    }

    // ⓒ 둘 다 없음 → 주제 추천 자동 재호출(STEP3 로딩 상태로 진입).
    void requestTopics({ sessionOverride: sessionForState });
  }

  /**
   * 세션 1건의 재개 재료를 조회해 적용한다. 재개 선택 카드의 `이어서 하기`와 딥링크
   * (`/app/performance/:sessionId`) 진입점이 공유한다 — 후자는 `entryMode`가 아직
   * `'pending'`인 상태에서 부른다.
   */
  async function resolveSessionEntry(sessionId) {
    entryDispatch({ type: "resumeStart" });

    try {
      // 이 함수는 bootstrapLoading이 false로 바뀐 뒤(§5.4 진입 분기 판정 이펙트)에만
      // 호출된다 — 그 이펙트는 bootstrap 조회(accessToken 필수, 위 이펙트)가 끝난 뒤에만
      // bootstrapLoading을 false로 내리므로 이 시점의 accessToken은 항상 존재한다.
      const data = await fetchSessionDetail({
        accessToken: accessToken as string,
        sessionId,
      });
      applyResumedSession(data);
      entryDispatch({ type: "resumeSuccess" });
    } catch (error) {
      console.error("[performance] 세션 이어가기 실패:", error?.code, error);
      // 딥링크 진입 실패는 재개 선택 카드가 있으면 그리로, 없으면(=이 세션이 유일한
      // 후보였는데도 조회가 죽은 경우) STEP1부터 새로 시작하는 것 말고는 출구가 없다.
      entryDispatch({
        type: "resumeFail",
        message:
          error?.userMessage ||
          "이전 진행 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
        hasLastSession: Boolean(lastSessionSummary),
      });
    }
  }

  /** 재개 선택 카드 `이어서 하기`. */
  function handleResumeContinue() {
    if (resumeBusy || !lastSessionSummary?.sessionId) return;
    void resolveSessionEntry(lastSessionSummary.sessionId);
  }

  /**
   * STEP1 폼에서 `409 UNCHARGED_SESSION_EXISTS`를 만났을 때의 실제 출구. 저장 리포트
   * 안내는 거짓이므로(위 `handleSubmit` 주석) 재개 선택 카드로 되돌린다 — 이 카드가
   * `이어서 하기`로 그 미차감 세션을 이어받는 정상 경로를 제공한다.
   */
  function handleBackToResumeChoice() {
    setSubmitError(null);
    setSubmitErrorCode(null);
    entryDispatch({ type: "backToChoice" });
  }

  /**
   * 재개 선택 카드 `새로 시작하기` — 기존 `resetForNextAssessment`를 재사용한다. 방금
   * finalize한 것이 없으므로 `notice: null`로 그 안내를 억누른다(파일 상단 함수 주석).
   *
   * `hasNextSession`은 `latestDraft`(bootstrap이 이미 조회해 둔, 아직 회차를 쓰지 않은
   * 세션) 존재 여부로 정한다 — `false`로 고정하면 `sessionStartMode`가 `'create'`가 되어
   * STEP1 재제출이 §9.3 미차감 세션 1개 제한에 걸려 `409 UNCHARGED_SESSION_EXISTS`로
   * 막힌다(재개 선택 카드가 뜬 시점엔 이미 미차감 세션이 있다는 뜻이므로 이 경로가 실제로
   * 발생한다). `latestDraft`가 있으면 `'resume'`이 되어 그 세션을 그대로 이어받는다.
   */
  function handleResumeRestart() {
    if (resumeBusy) return;
    resetForNextAssessment({
      keptPointer: false,
      hasNextSession: Boolean(latestDraft),
      notice: null,
    });
    entryDispatch({ type: "enterChat" });
  }

  /** `다른 주제 다시 추천`(§5.10) — 같은 엔드포인트 재호출. 회차는 깎이지 않는다(§9.3). */
  function handleRegenerate() {
    if (topicPhase === "loading" || topicRegenerating) return;
    void requestTopics({ isRegenerate: true });
  }

  /**
   * 소진-해제(`dismissed`)·실패(`failed`) 카드의 `주제 추천 다시 시도` 버튼 공통 핸들러.
   * `handleRegenerate`와 같은 가드를 쓴다 — 리렌더 전 연타로 `requestTopics`가 중복
   * 발사되면 모델이 2회 호출되고 `topic_attempt_count`가 이중으로 오른다.
   */
  function handleRetryTopics() {
    if (topicPhase === "loading" || topicRegenerating) return;
    void requestTopics();
  }

  /** `나중에 하기`(§5.20) — 카드만 닫는다. 세션도 입력값도 건드리지 않는다. */
  function handleQuotaDismiss() {
    setTopicPhase("dismissed");
  }

  // 인사말 — §5.5 문구 원문. 이름을 모르면(§bootstrap 조회 실패 등) "님" 절을 통째로
  // 빼지, 가짜 이름을 채우지 않는다(bootstrap.js/PerformanceSidebar와 같은 관례).
  const greetingBody = bootstrapLoading
    ? undefined
    : [
        profileName
          ? `반갑습니다, ${profileName}님. 첫 수행평가를 함께 시작해볼게요.`
          : "반갑습니다! 첫 수행평가를 함께 시작해볼게요.",
        "",
        "주제 추천부터 자료 · 글 구조 설계, 제출 후 평가까지 이 채팅에서 진행됩니다. 먼저 학년, 과목, 이전 주제, 희망 진로를 입력해주세요.",
      ].join("\n");

  if (bootstrapLoading || entryMode === "pending") {
    return (
      <div className="mt-10">
        <AiLoadingBubble
          title="정보를 불러오는 중입니다."
          subtitle="잠시만 기다려 주세요."
        />
      </div>
    );
  }

  const messages: PerformanceChatMessage[] = [];

  if (entryMode === "choice") {
    // §5.4 재개 선택 카드. STEP1 그리팅 대신 이 한 항목만 렌더한다 — 나머지 STEP1~5
    // 블록은 이 시점에 전부 초기 상태(게이트가 닫혀 있다)라 자연히 아무것도 밀어넣지 않는다.
    messages.push({
      id: "resume-choice",
      role: "ai",
      kind: "text",
      body: buildResumeChoiceCopy(profileName, lastSessionSummary),
      children: (
        <ResumeChoiceCard
          onContinue={handleResumeContinue}
          onRestart={handleResumeRestart}
          busy={resumeBusy}
          error={resumeError}
        />
      ),
    });
  } else if (resumeContinueNotice) {
    // §5.4 「이어서 하기」 ⓐ/ⓑ/ⓒ — STEP1/2를 이미 지난 재개. 그 두 스텝의 말풍선을
    // 재생하지 않고(파일 상단 주석) 다리 안내 한 줄만 남긴 채 아래 STEP3~5 블록으로 넘어간다.
    messages.push({
      id: "resume-continue",
      role: "ai",
      kind: "text",
      body: resumeContinueNotice,
    });
  } else {
    if (restartNotice) {
      // `추가 수행평가 진행하기` 직후(§5.17). 새 수행평가의 **첫** 메시지 자리라 인사말보다
      // 앞에 온다 — 직전 수행평가에서 무슨 일이 있었는지(최종본 저장)를 여기서 한 번만 말한다.
      // 타임라인이 통째로 갈리는 전이라 포커스 목적지이기도 하다.
      messages.push({
        id: "step5-new-assessment",
        role: "ai",
        kind: "text",
        body: restartNotice,
        focusRef: restartRef,
      });
    }

    messages.push({
      id: "step1-greeting",
      role: "ai",
      kind: "text",
      body: greetingBody,
      // 세션이 만들어지면 폼 카드는 사라진다(§5.6 — `3754:3261`에 폼 카드가 없다).
      children: createdSession ? null : (
        <InlineCard>
          <BasicInfoForm
            onSubmit={handleSubmit}
            submitting={submitting}
            submitError={submitError}
          />
          {/* `409 UNCHARGED_SESSION_EXISTS`의 실제 출구 — 저장 리포트엔 못 뜨는 세션이라
              (`handleSubmit` 주석) 재개 선택 카드로 돌아가는 버튼을 여기서 직접 렌더한다. */}
          {submitErrorCode === "UNCHARGED_SESSION_EXISTS" && (
            <div className="mt-3">
              <RetryButton onClick={handleBackToResumeChoice}>
                이어서 하기로 돌아가기
              </RetryButton>
            </div>
          )}
        </InlineCard>
      ),
    });

    if (createdSession) {
      messages.push({
        id: "step1-summary",
        role: "user",
        kind: "text",
        body: buildBasicInfoSummary(createdSession),
      });

      messages.push({
        id: "step2-intro",
        role: "ai",
        kind: "text",
        body: GUIDE_INTRO,
        // 업로드 카드는 ⓐ 직접 입력으로 넘어갔거나 ⓑ STEP2가 끝나면 타임라인에서 빠진다.
        // 말풍선 자체는 두 경로 모두에서 남는다(`3754:3562`/`3754:3493` 둘 다 @626에 있다).
        children:
          guideMode === "upload" && !guideDone ? (
            <GuideUploadCard
              onSubmit={handleGuideSubmit}
              onSkip={handleSkipGuide}
              submitting={submitting}
              submitError={submitError}
            />
          ) : null,
      });
    }

    if (createdSession && guideMode === "manual") {
      messages.push({
        id: "step2-manual-choice",
        role: "user",
        kind: "text",
        body: MANUAL_CHOICE,
      });

      // AI3 안내 말풍선 + 직접 입력 폼은 제출과 동시에 **함께** 사라진다(§5.9 단정 —
      // `3754:3493`에 둘 다 없다). 그래서 카드만 걷는 것이 아니라 메시지를 통째로 뺀다.
      if (!guideDone) {
        messages.push({
          id: "step2-manual-intro",
          role: "ai",
          kind: "text",
          body: MANUAL_INTRO,
          children: (
            <ManualInfoForm
              onSubmit={handleManualSubmit}
              submitting={submitting}
              submitError={submitError}
            />
          ),
        });
      }
    }

    if (guideDone) {
      // 제출 결과 사용자 말풍선(§5.9) — 업로드 경로는 장수 요약, 직접 입력 경로는 원문 그대로.
      messages.push(
        guideMode === "manual"
          ? {
              id: "step2-manual-text",
              role: "user",
              kind: "text",
              body: manualText,
            }
          : {
              id: "step2-upload-summary",
              role: "user",
              kind: "text",
              body: `안내문 ${uploadedCount}장을 업로드했어요`,
            },
      );
    }
  }

  if (guideDone && topicPhase === "loading") {
    // 문구는 `loadingCopy.js`의 3쌍 중 주제 추천 쌍을 그대로 쓴다(§5.9, `3754:3493` 원문).
    messages.push({
      id: "step3-loading",
      kind: "loading",
      payload: PERFORMANCE_LOADING_COPY.topicRecommendation,
    });
  }

  // 주제를 확정한 뒤(`designPhase !== 'idle'`)에는 이 메시지가 통째로 빠진다 — §5.12 단정
  // 「추천 주제 카드 3장 + 재추천 버튼이 타임라인에서 **완전히 제거**되고, 사용자 확정
  // 말풍선 + AI 로딩 말풍선만 남는다」. P9는 카드·버튼만 걷고 AI 안내 말풍선을 남겨
  // 뒀는데(§5.12 본편이 P10 몫이었다) 이번에 말풍선까지 건다. 걷지 않으면 로딩 중에도
  // 카드를 눌러 모달을 다시 열거나 재추천을 누를 수 있어 "이미 확정한 주제로 리포트를
  // 만드는 중"이라는 상태와 화면이 어긋난다. 실패 후 `주제 다시 고르기`로 `'idle'`이 되면
  // 그대로 되돌아온다.
  if (guideDone && topicPhase === "ready" && designPhase === "idle") {
    messages.push({
      id: "step3-topics",
      role: "ai",
      kind: "text",
      body: guideMode === "manual" ? TOPIC_RESULT_MANUAL : TOPIC_RESULT_UPLOAD,
      // `주제 다시 고르기`로 되돌아온 뒤에만 포커스 목적지가 된다(위 `topicsFocusPending`).
      focusRef: topicsFocusPending ? topicsReturnRef : undefined,
      children: (
        // §5.10 실측은 말풍선 하단 → 첫 카드 상단이 1.25rem(20)인데 `AiMessage` 컬럼의
        // 기본 gap은 1rem(16)이다(라벨↔말풍선·말풍선↔폼 카드가 전부 16이라 그렇게 고정됐다).
        // 카드 묶음에만 0.25rem을 더해 실측 20을 맞춘다.
        <div className="w-full pt-1">
          <TopicCardList
            topics={topics}
            round={topicRound}
            maxRounds={topicMaxRounds}
            onDetail={handleTopicDetail}
            onRegenerate={handleRegenerate}
            regenerating={topicRegenerating}
            roundLimited={topicRoundLimited}
            error={topicError}
          />
        </div>
      ),
    });
  }

  if (
    guideDone &&
    topicPhase === "ready" &&
    topicRegenerating &&
    designPhase === "idle"
  ) {
    // 재추천 진행 표시. 최초 추천과 달리 카드 묶음을 **대체하지 않고** 그 아래에 붙는다 —
    // 카드·버튼이 남아 있어야 방금 버튼을 누른 사용자의 포커스가 유지된다.
    // 문구는 최초 추천과 같은 쌍을 쓴다(같은 작업이다).
    messages.push({
      id: "step3-regenerating",
      kind: "loading",
      payload: PERFORMANCE_LOADING_COPY.topicRecommendation,
    });
  }

  if (confirmedTopic?.title && designPhase !== "idle") {
    // §5.12 사용자 확정 말풍선. 로딩·완료·실패 어느 상태에서도 남는다 — 확정은 되돌리지 않는
    // 사실이고(되돌리는 것은 실패 후 `주제 다시 고르기`뿐이며 그때는 `confirmedTopic`째
    // 비운다), 로딩 버블만 있고 무엇을 확정했는지 없는 화면은 §5.12 실측과 다르다.
    // 제목을 모르는 복구 경로(`handleResumeConfirmedTopic`의 fallback)에서는 말풍선을
    // 생략한다 — 빈 따옴표만 남은 문장을 만들지 않는다.
    messages.push({
      id: "step4-confirm",
      role: "user",
      kind: "text",
      body: buildConfirmBubble(confirmedTopic.title),
    });
  }

  if (designPhase === "loading" && confirmedTopic) {
    // STEP4 로딩(§5.12) — 로딩 버블을 재사용한다(`AiLoadingBubble` + `loadingCopy.js`
    // `designReport` 쌍, 새 로딩 UI를 만들지 않는다).
    messages.push({
      id: "step4-design-loading",
      kind: "loading",
      payload: PERFORMANCE_LOADING_COPY.designReport,
      // 검토 A-2 — 이 항목이 나타나는 시점에 포커스를 옮긴다(위 `designLoadingRef` 이펙트).
      focusRef: designLoadingRef,
    });
  }

  if (designPhase === "ready") {
    // 모달이 자동으로 열리므로(§5.13 흐름도) 이 말풍선은 **모달을 닫은 뒤** 보이는 화면이다.
    // 이 아래로 STEP5 제출폼(§5.14)이 이어 붙으므로 흐름은 계속되지만, 방금 만든 리포트로
    // 되돌아갈 길은 여기서만 열린다(상단 진입점은 §3.5 Q7 미결 — `DESIGN_READY_COPY` 주석).
    // 다시 열기 버튼은 모달 닫기의 포커스 목적지이기도 하다(`handleCloseDesignModal`).
    messages.push({
      id: "step4-design-ready",
      role: "ai",
      kind: "text",
      body: DESIGN_READY_COPY,
      children: (
        <RetryButton ref={designReopenRef} onClick={handleReopenDesignModal}>
          설계 리포트 다시 보기
        </RetryButton>
      ),
    });
  }

  if (designPhase === "failed") {
    // 실패해도 갇히지 않는다. 두 갈래로 나뉜다:
    //   · `TOPIC_ALREADY_CONFIRMED` — 무엇을 보내도 같은 409다. 유일한 출구는 서버가 알려준
    //     확정 주제로 요청해 저장된 리포트를 여는 것(`handleResumeConfirmedTopic`).
    //     제목은 현재 카드 목록에서 찾아 붙이고, 없으면(다른 라운드의 주제) null로 둔다 —
    //     그러면 확정 말풍선을 생략한다(가짜 제목을 지어내지 않는다).
    //   · 그 외 — 재시도(같은 주제, 멱등)와 주제 재선택.
    const alreadyConfirmedId =
      designError?.code === "TOPIC_ALREADY_CONFIRMED"
        ? designError.confirmedTopicId
        : null;
    const resumeTopic = alreadyConfirmedId
      ? topics.find((topic) => topic.id === alreadyConfirmedId) || {
          id: alreadyConfirmedId,
          title: null,
        }
      : null;

    messages.push({
      id: "step4-design-failed",
      role: "ai",
      kind: "text",
      body: designError?.message || DESIGN_FAILED_FALLBACK,
      // 로딩 버블(직전 포커스 보유자)이 언마운트되는 전이라 목적지를 직접 지정한다.
      // 안내 문구와 출구 버튼을 함께 품은 래퍼가 목적지다 — 버튼 하나만 잡으면 "무엇이
      // 일어났는지"(문구)를 건너뛴 채 낭독된다.
      focusRef: designFailedRef,
      children: (
        <div className="flex flex-wrap gap-3">
          {resumeTopic ? (
            <RetryButton
              onClick={() => handleResumeConfirmedTopic(resumeTopic)}
            >
              확정한 주제의 리포트 열기
            </RetryButton>
          ) : (
            <>
              <RetryButton onClick={handleRetryDesign}>
                설계 리포트 다시 시도
              </RetryButton>
              <RetryButton onClick={handleBackToTopics}>
                주제 다시 고르기
              </RetryButton>
            </>
          )}
        </div>
      ),
    });
  }

  // ── STEP5 (§5.15 로딩 → §5.16 모달 → §5.17 분기 3버튼) ─────────────────────────────
  //
  // §5.15 「정본 타임라인」 4·5항: **제출폼 카드는 제출과 동시에 타임라인에서 제거하되
  // 사용자 제출 말풍선은 남긴다**(§5.9/§5.12에서 이미 확립된 규칙). 폼 제거는 폼 슬라이스가
  // `evaluationPhase === 'idle'`을 렌더 조건으로 삼는 것으로 성립하고, 남기는 쪽이 여기다.
  if (evaluationPhase !== "idle") {
    messages.push({
      id: "step5-submit",
      role: "user",
      kind: "text",
      body: SUBMIT_BUBBLE,
    });
  }

  if (evaluationPhase === "loading") {
    // §5.15 로딩 카드 — `AiLoadingBubble` + `loadingCopy.js`의 평가 쌍 그대로(새 로딩 UI를
    // 만들지 않는다). 폼 카드가 사라지는 전이라 포커스 목적지이기도 하다.
    messages.push({
      id: "step5-eval-loading",
      kind: "loading",
      payload: PERFORMANCE_LOADING_COPY.evaluationReport,
      focusRef: evaluationLoadingRef,
    });
  }

  if (evaluationPhase === "failed") {
    // 실패해도 갇히지 않는다. 출구는 코드에 따라 갈린다 —
    //   · 상류 장애·네트워크(`MODEL_FAILED` 등) → 같은 제출본으로 재시도(서버가 멱등이다).
    //   · 제출물 게이트(400 3종)          → 재시도는 같은 값을 다시 보내는 것이라 무의미하다.
    //                                        폼을 되돌리는 것이 유일한 출구다.
    //   · 상한·소유권 계열                 → 다시 눌러도 같은 결과라 재시도를 권하지 않는다.
    //
    // ⚠️ **닫힌 코드 집합을 출구 판정의 유일한 근거로 삼지 않는다**(검토 P11). 예전에는
    //   `RETRYABLE`/`FIXABLE` 두 집합 + 「이전 리포트가 있으면 다시 보기」 셋뿐이라, 그
    //   밖의 코드가 오고 이전 리포트가 없으면 **버튼이 하나도 없는 안내 문장만** 남았다.
    //   제출폼은 `evaluationPhase === 'idle'` 조건이라 이미 언마운트된 상태여서, 방금 쓴
    //   원고로 돌아갈 경로가 화면에서 통째로 사라진다. 실제로 그 구멍에 빠지는 코드가
    //   서버에 넷 있다 — `401 UNAUTHENTICATED` / `403 NO_ENTITLEMENT` /
    //   `429 EVALUATION_ATTEMPT_LIMIT` / `409 REEVALUATION_LIMIT`(evaluate.js).
    //   그래서 **폼 복원 경로를 항상 남긴다** — 서버 호출 없이 `evaluationPhase`만
    //   `'idle'`로 되돌리는 로컬 전이라(`handleReevaluate`) 어떤 실패 코드에서도 안전하다.
    //   400 3종(제출물을 고쳐야 풀리는 코드)을 따로 열거하던 집합은 지웠다 — 그 코드들은
    //   `RETRYABLE`에 없어 재시도 버튼이 안 뜨고, 폼 복원은 이제 무조건 열려 있다.
    const failedCode = evaluationError?.code;
    const canRetry = EVALUATION_RETRYABLE_CODES.has(failedCode ?? "");
    // 이전 평가가 살아 있으면 그 리포트를 열고 **확정까지** 할 수 있어야 한다. 확정 버튼이
    // `'ready'`에만 있으면 재평가가 상한(`409 REEVALUATION_LIMIT`)에 걸린 순간 확정 경로가
    // 통째로 사라진다 — 이미 평가받은 제출본을 최종본으로 만들 길이 없어진다(§5.17).
    // 대상은 마지막으로 **평가에 성공한** 제출본이다(`evaluatedSubmissionId` 주석).
    const hasFinalizableReport = Boolean(
      evaluationReport && evaluatedSubmissionId,
    );
    const reevaluateExhaustedOnFail = evaluationCount >= maxEvaluations;
    // 분기 스택의 `추가 평가 받기`가 곧 폼 복원이라 중복을 만들지 않는다. 단 그 버튼이
    // 상한으로 잠긴 경우에는 폴백이 유일한 복귀 경로이므로 반드시 남긴다.
    const showFormFallback = !hasFinalizableReport || reevaluateExhaustedOnFail;

    messages.push({
      id: "step5-eval-failed",
      role: "ai",
      kind: "text",
      body: evaluationError?.message || EVALUATION_FAILED_FALLBACK,
      // 로딩 버블(직전 포커스 보유자)이 언마운트되는 전이라 목적지를 직접 지정한다. 버튼
      // 하나만 잡으면 "무엇이 일어났는지"(문구)를 건너뛴 채 낭독된다 — 래퍼가 목적지다.
      focusRef: evaluationFailedRef,
      children: (
        <div className="flex w-full flex-col gap-4 pt-1">
          <div className="flex flex-wrap gap-3">
            {canRetry ? (
              <RetryButton onClick={handleRetryEvaluation}>
                평가 다시 시도
              </RetryButton>
            ) : null}
            {showFormFallback ? (
              <RetryButton onClick={handleReevaluate}>
                제출폼 다시 열기
              </RetryButton>
            ) : null}
            {hasFinalizableReport ? (
              <RetryButton onClick={handleReopenEvaluationModal}>
                평가 리포트 다시 보기
              </RetryButton>
            ) : null}
          </div>

          {hasFinalizableReport ? (
            <EvaluationBranchActions
              onReevaluate={handleReevaluate}
              onConfirm={handleConfirmSubmission}
              onNewAssessment={handleNewAssessment}
              busyAction={finalizeAction}
              reevaluateDisabled={reevaluateExhaustedOnFail}
              reevaluateNote={
                reevaluateExhaustedOnFail
                  ? buildReevaluateLimitNote(maxEvaluations)
                  : ""
              }
            />
          ) : null}
        </div>
      ),
    });
  }

  if (evaluationPhase === "ready" && evaluationReport) {
    // §5.17 평가 완료 안내 + 분기 3버튼. 모달은 완성 즉시 자동으로 열리므로(§4 플로우)
    // 이 말풍선은 **모달을 닫은 뒤** 보이는 화면이다.
    //
    // **모달 진입점 결정** — §5.17 단정 「평가 리포트 상세 모달(`3754:4512`)을 여는 진입점이
    // 이 화면에 없다」. 진입점을 두 개 둔다:
    //   ① 평가 완료 즉시 자동 오픈(§4 플로우 `EvalLoading --> EvalReport`가 명시한 전이).
    //   ② 이 `평가 리포트 다시 보기` 버튼 — §5.13 설계 리포트가 `설계 리포트 다시 보기`로
    //      만든 관례 그대로이며, 모달 닫기의 포커스 목적지이기도 하다.
    // ②는 §5.17 실측 스택(260×180 = 3버튼 정확히) **바깥**에 둔다. 스택 안에 넣으면 실측
    // 치수가 깨지고, 무엇보다 "다시 보기"는 분기 선택이 아니라 열람이라 위계가 다르다.
    // 그래서 크기도 분기 버튼(3.25rem)이 아니라 `RetryButton`(2.5rem)을 쓴다.
    const evaluationScore =
      typeof evaluationReport.score === "number" &&
      Number.isFinite(evaluationReport.score)
        ? evaluationReport.score
        : null;
    const reevaluateExhausted = evaluationCount >= maxEvaluations;

    messages.push({
      id: "step5-eval-ready",
      role: "ai",
      kind: "text",
      body: buildEvaluationResultCopy(evaluationScore),
      children: (
        <div className="flex w-full flex-col gap-4 pt-1">
          <RetryButton
            ref={evaluationReopenRef}
            onClick={handleReopenEvaluationModal}
          >
            평가 리포트 다시 보기
          </RetryButton>
          <EvaluationBranchActions
            onReevaluate={handleReevaluate}
            onConfirm={handleConfirmSubmission}
            onNewAssessment={handleNewAssessment}
            busyAction={finalizeAction}
            reevaluateDisabled={reevaluateExhausted}
            // 상한은 서버가 `409 REEVALUATION_LIMIT`으로 막는다(§9.2 상한 = 최초 1 + 재평가 2).
            // 눌러서 실패를 보게 하지 않고 미리 잠그되, 왜 잠겼는지는 말한다
            // (`EvaluationBranchActions`가 이 문구를 버튼의 `aria-describedby`로 연결한다).
            reevaluateNote={
              reevaluateExhausted
                ? buildReevaluateLimitNote(maxEvaluations)
                : ""
            }
          />
        </div>
      ),
    });
  }

  if (finalizeResult) {
    // `이대로 확정짓기` 완료. 분기 버튼은 **그대로 남긴다** — Q67 결정대로 확정 뒤에도
    // 재평가가 열려 있고(같은 세션이라 무료다), 세션을 잠그면 오확정을 되돌릴 수 없다.
    messages.push({
      id: "step5-finalize-done",
      role: "ai",
      kind: "text",
      body: finalizeResult.keptPointer
        ? FINALIZE_KEPT_POINTER_COPY
        : FINALIZE_CONFIRMED_COPY,
      focusRef: finalizeDoneRef,
    });
  }

  if (finalizeError) {
    messages.push({
      id: "step5-finalize-failed",
      role: "ai",
      kind: "text",
      body: finalizeError.message,
      children: (
        <RetryButton onClick={() => void runFinalize(finalizeError.action)}>
          다시 시도
        </RetryButton>
      ),
    });
  }

  if (evaluationPhase === "idle" && reevaluateRound > 0) {
    // `추가 평가 받기` 뒤. 폼(폼 슬라이스가 `'idle'`에서 렌더한다)이 조용히 돌아오기만 하면
    // 방금 본 리포트가 왜 사라졌는지 알 수 없다. 분기 버튼이 통째로 언마운트되는 전이라
    // 포커스 목적지이기도 하다.
    messages.push({
      id: "step5-reevaluate",
      role: "ai",
      kind: "text",
      body: REEVALUATE_RESTORED_COPY,
      focusRef: reevaluateNoticeRef,
    });
  }

  // ── STEP5 제출폼(§5.14 `3754:3992`/`3754:4119`) ──────────────────────────────────
  //
  // §4 플로우 `DesignReport --> Step5Form : 창 닫고 작성하기`(L323) — 설계 리포트가
  // 준비되면 폼이 타임라인에 붙는다(모달은 그 위에 겹쳐 열려 있고, 닫으면 이 폼이 남는다).
  // **제출과 동시에 사라진다**(§5.15 정본 타임라인 4항)는 것이 `evaluationPhase === 'idle'`
  // 조건이고, `추가 평가 받기`가 그 값을 되돌리면 작성값(`submissionValue`)이 그대로 남아
  // 있으므로 폼이 그대로 복원된다(§12.2 L2372 — 별도 복원 신호를 두지 않는 이유).
  //
  // **이 블록이 마지막인 이유**: `추가 평가 받기` 복원 안내(`step5-reevaluate`)가 폼보다
  // 먼저 와야 "왜 폼이 다시 열렸는지"를 읽고 폼에 닿는다.
  if (designPhase === "ready" && evaluationPhase === "idle") {
    messages.push({
      id: "step5-form",
      role: "ai",
      kind: "text",
      body: SUBMISSION_FORM_INTRO,
      children: submissionSchema ? (
        <SubmissionForm
          schema={submissionSchema}
          value={submissionValue}
          onChange={setSubmissionValue}
          onSaveDraft={handleSaveDraft}
          onSubmit={handleSubmitWork}
          // §5.14 `주제*` 칸은 확정 주제 prefill이다 — 제출 필드가 아니라 표시값이고,
          // 서버는 `performance_sessions.selected_topic_id`로 직접 읽는다(§8.3).
          topicTitle={confirmedTopic?.title || null}
          saving={savingDraft}
          submitting={submittingWork}
          error={submissionSaveError}
          submitError={submissionSubmitError}
          savedAt={submissionSavedAt}
        />
      ) : submissionLoadError ? (
        // 스키마 없이 임의의 기본 폼을 그리지 않는다(위 `SUBMISSION_LOAD_FAILED_FALLBACK`).
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-app-label text-[#d01c1c]">
            {submissionLoadError}
          </p>
          <RetryButton onClick={handleRetrySubmissionLoad}>
            제출폼 다시 불러오기
          </RetryButton>
        </div>
      ) : null,
    });
  }

  if (guideDone && topicPhase === "quota") {
    // §5.20 (B): 모달이 아니라 타임라인 안, **AI 말풍선과 같은 정렬**로 넣는다. 말풍선 없이
    // 아바타·발신자 라벨만 두고 카드를 그 컬럼에 붙이면 정렬이 그대로 맞는다.
    messages.push({
      id: "step3-quota",
      role: "ai",
      kind: "text",
      children: (
        <QuotaExhaustedCard
          planEndsAt={quotaPlanEndsAt}
          onDismiss={handleQuotaDismiss}
        />
      ),
    });
  }

  if (guideDone && topicPhase === "dismissed") {
    messages.push({
      id: "step3-quota-dismissed",
      role: "ai",
      kind: "text",
      body: QUOTA_DISMISSED_COPY,
      // 다른 탭에서 이용권을 결제하고 돌아오는 경로가 실제로 있다 — 그때 새로고침 없이
      // 이어갈 수 있게 재시도 버튼을 남긴다. 회차가 그대로면 다시 소진 카드로 돌아간다.
      children: (
        <RetryButton onClick={handleRetryTopics}>
          주제 추천 다시 시도
        </RetryButton>
      ),
    });
  }

  if (guideDone && topicPhase === "failed") {
    messages.push({
      id: "step3-failed",
      role: "ai",
      kind: "text",
      body:
        topicError || "주제를 추천하지 못했어요. 잠시 후 다시 시도해 주세요.",
      // 상한(`ROUND_LIMIT`)에 걸린 실패는 다시 눌러도 같은 결과라 재시도를 권하지 않는다.
      children: topicRoundLimited ? null : (
        <RetryButton onClick={handleRetryTopics}>
          주제 추천 다시 시도
        </RetryButton>
      ),
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatTimeline messages={messages} className="min-h-0 flex-1" />
      <TopicDetailModal
        open={Boolean(topicDetail)}
        topic={topicDetail}
        onClose={handleCloseTopicDetail}
        onConfirm={handleConfirmTopic}
      />
      <DesignReportModal
        open={designModalOpen}
        report={designReport}
        topicTitle={confirmedTopic?.title ?? undefined}
        studentName={profileName}
        studentGrade={createdSession?.gradeLabel ?? null}
        onClose={handleCloseDesignModal}
      />
      <EvaluationReportModal
        open={evaluationModalOpen}
        report={evaluationReport}
        topicTitle={confirmedTopic?.title ?? undefined}
        studentName={profileName}
        studentGrade={createdSession?.gradeLabel ?? null}
        onClose={handleCloseEvaluationModal}
      />
    </div>
  );
}

/**
 * "이 조건이 켜지는 순간 이 노드로 포커스를 옮긴다"를 한 줄로 쓰는 헬퍼. 새로 나타난 노드가
 * DOM에 붙은 뒤(같은 렌더 커밋 다음 프레임) 옮겨야 하므로 `requestAnimationFrame`을 쓴다 —
 * Base UI Dialog가 열릴 때 첫 포커서블 요소로 옮기는 것과 같은 패턴이다.
 *
 * 쓰는 이유는 전부 같다: **직전에 포커스를 갖고 있던 노드가 같은 커밋에서 언마운트되는
 * 전이**라 브라우저 기본 동작(`<body>`로 떨어짐)에 맡기면 키보드 사용자가 위치를 잃는다.
 *
 * @param {boolean} active 포커스를 옮겨야 하는 상태인가.
 * @param {import('react').RefObject<HTMLElement>} ref 목적지(`ChatTimeline`의 `focusRef`).
 * @param {unknown[]} [retriggers] `active`가 켜진 채 유지되지만 **다시** 옮겨야 하는 경우의
 *   추가 의존성(예: 재평가 라운드가 한 번 더 돌 때). 없으면 켜지는 순간에만 옮긴다.
 */
function useRafFocus(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
  retriggers: unknown[] = [],
) {
  useEffect(() => {
    if (!active) return undefined;
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ref, ...retriggers]);
}

/**
 * 재시도 버튼. 시안에 대응 노드가 없어 §5.10 `다른 주제 다시 추천`(h 2.5rem, r0.625rem,
 * stroke `#d9d9d9`, 라벨 0.875rem w500 `#525252`)의 형태만 빌린다. 폭만 실측(8.125rem)을
 * 따르지 않고 내용에 맡긴다 — 라벨이 더 길어 고정폭에 넣으면 글자가 잘린다.
 *
 * `ref`를 받는 이유는 포커스 관리다 — 설계 리포트 모달을 닫을 때 복귀할 자리가 이 버튼이다
 * (`handleCloseDesignModal`). 나머지 호출부는 ref를 넘기지 않는다.
 */
const RetryButton = forwardRef<
  HTMLButtonElement,
  { children: ReactNode; onClick: () => void }
>(function RetryButton({ children, onClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className="flex h-10 items-center justify-center rounded-[0.625rem] border border-performance-line bg-white px-4 text-app-label font-medium text-ink transition-colors hover:border-ink-sub"
    >
      {children}
    </button>
  );
});
