import { Loader2 } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { memo, useCallback, useId, useMemo, useRef } from "react";
import {
  checkFieldsMinLength,
  countFieldChars,
  SUBMISSION_MIN_CHARS,
} from "@/lib/performance/submission";
import CharCounter from "./CharCounter";
import { useDebouncedAutosave } from "./useDebouncedAutosave";

// STEP5 수행평가 제출폼 — docs/수행평가-상세-명세.md §5.14(`3754:3992` 빈 상태 /
// `3754:4119` 작성 완료) / §6.1 컴포넌트 표(props `schema`·`value`·`onChange`·
// `onSaveDraft`·`onSubmit`, 상태 empty/filled/saving/submitting) / §7.1·§7.2(토큰) /
// §8.3·§8.6(스키마·저장 계약) / §12.2 Q35(글자 수).
//
// ─────────────────────────────────────────────────────────────────────
// 1. 동적 스키마 — **4필드 고정 폼이 아니다**
// ─────────────────────────────────────────────────────────────────────
// §6.1: 「`schema`는 4필드 고정이 아니라 8종 동적 스키마(문항형 최대 20필드)」. 시안은
// 기본 보고서형(서론·본론·결론) 변형만 그리지만(§11-Q71) 그건 8종 중 하나의 스냅샷이다.
// 필드 개수·키·라벨·헬퍼·순서·필수 여부는 전부 **서버 소유**이고(§8.3
// `performance_sessions.submission_schema`) 이 컴포넌트는 받은 대로 렌더한다. 유형별
// 분기(`if type === 'cardnews'` 같은 것)를 여기 만들면 서버가 스키마를 고칠 때마다 화면이
// 갈라진다 — 그런 분기는 하나도 없다.
//
// **20필드에서 무너지지 않게 한 것**(§5.14 시안은 4필드 기준이라 근거가 없는 구간이다.
// 새 레이아웃을 발명하지 않고, 시안 리듬을 그대로 반복시키면서 깨지는 축만 막았다):
//   ⓐ 세로: 필드 1개 = 라벨(18) + 12 + 텍스트영역(160) + 12 + 카운터(18) = 220px 고정.
//      자동 확장을 쓰지 않으므로(§5.14 제안 「높이 10rem 고정 + 내부 스크롤. 자동 확장은
//      채팅 스크롤 위치가 튄다」) 20필드여도 높이가 예측 가능하게 선형으로만 늘어난다.
//      카드에 `max-height + overflow`를 씌우는 선택지는 **채택하지 않았다** — 채팅
//      타임라인 안의 카드가 자체 스크롤을 가지면 스크롤 컨테이너가 이중이 되고
//      (`ChatTimeline`의 자동 스크롤이 어느 쪽을 움직일지 불명확해진다) 시안에 근거도 없다.
//   ⓑ 렌더 비용: 필드 행을 `memo`로 감싸고 변경 핸들러를 **단 하나의 안정된 함수**로
//      유지한다(아래 `handleFieldChange`). 이게 없으면 한 글자 칠 때마다 textarea 20개가
//      전부 리렌더된다(각각 값·카운터 재계산). 실제로 문항형은 20개가 상한이라 이 비용이
//      항상 최악치로 걸린다.
//   ⓒ 카운터·게이트 계산은 O(전체 글자수)라 타이핑마다 도는 것이 맞다 — 20필드×수천 자
//      수준에서 체감 비용이 없고, 값과 표시가 어긋나지 않는 것이 더 중요하다.
//
// ─────────────────────────────────────────────────────────────────────
// 2. 100자 게이트 (§12.2 Q35) — 판정 함수를 **서버와 공유**한다
// ─────────────────────────────────────────────────────────────────────
// `checkFieldsMinLength`/`countFieldChars`는 `api/_lib/performance/submission-chars.js`
// 원본 그대로다(`src/lib/performance/submission.js`가 재수출). 사본을 만들면 "카운터는
// 통과인데 서버가 400"이 생긴다 — §8.3이 「시안 카운터와 동일 계산식 공유」를 요구하는
// 이유가 정확히 그것이다.
//
// **클라이언트 검증은 UX이고 권위는 서버다.** 여기서 막는 것은 서버 왕복 한 번을 아끼는
// 일일 뿐이고, 서버 게이트(`checkSubmissionMinLength`)는 그대로 살아 있다.
//
// ─────────────────────────────────────────────────────────────────────
// 3. 디바운스 자동 저장(QA 행280 — 수동 `중간 저장` 버튼 폐지)
// ─────────────────────────────────────────────────────────────────────
// §4 상태도는 STEP5를 `Empty --> Filled : 입력` / `Filled --> Filled : 중간 저장` 두
// 전이로만 그렸고(L328), 처음에는 그 근거로 자동 저장을 만들지 않았다. 디자이너 9/4
// 댓글("자동 저장 되는 로직으로")과 사용자 확정으로 그 결정이 뒤집혔다 — 수동 버튼
// 2개(카드 제목 옆·하단 버튼 행)는 제거됐고, `useDebouncedAutosave`가 입력이 멈춘 뒤
// 조용히 `onSaveDraft`를 부른다. 타이핑 중 매 글자마다 `PUT`이 나가지 않도록 디바운스로
// 묶고(트레일링 1회, 동일 값 스킵), 저장 상태는 버튼 대신 카드 제목 옆 텍스트로만
// 알린다(성공 토스트는 소음이라 뺐다 — `PerformanceChatPage.handleSaveDraft` 주석).
// **실패로 작성 내용을 잃지 않는다** — 값은 호출부(`PerformanceChatPage`)가 들고 있고
// 이 컴포넌트는 실패해도 입력을 비우거나 잠그지 않는다.
//
// ─────────────────────────────────────────────────────────────────────
// 4. 접근성
// ─────────────────────────────────────────────────────────────────────
//   · 모든 입력에 `htmlFor`로 연결된 `<label>`. placeholder는 라벨 대용이 아니다.
//   · 헬퍼(시안에서 placeholder 자리 — §5.14 「placeholder `#d9d9d9` → 값 `#525252`」)는
//     placeholder로 두되 **같은 문장을 sr-only로도 넣어 `aria-describedby`에 연결**한다.
//     placeholder는 값이 채워지면 사라져 지시문이 증발하기 때문이다.
//     ⚠️ 시안 placeholder 색 `#d9d9d9`는 입력 배경(`#f8f7f5`) 대비 1.32:1로 WCAG AA
//        미달이다. 기존 인앱 폼(`ManualInfoForm`·`GuideUploadCard`)이 이미 시안대로
//        `placeholder:text-performance-line`을 쓰고 있어 **여기서만 색을 바꾸면 폼끼리
//        갈라진다** — 색은 시안/저장소 관례를 따르고, 정보 접근성은 위 sr-only 설명으로
//        보전한다(저대비 텍스트에만 담긴 정보가 없게 만든다). 색 자체는 §5.14/§7.2를
//        고치는 결정이 먼저다.
//   · 카운터는 live region이 아니다(`CharCounter` 주석) — 필드의 `aria-describedby`에
//     들어가 포커스 시 1회 읽힌다. 타이핑마다 낭독되지 않는다.
//   · 게이트 문구도 live region이 아니다(숫자가 매 글자 바뀐다). 대신 **임계값을 넘는
//     순간에만** 바뀌는 sr-only `aria-live="polite"` 한 줄을 따로 둔다 — 문자열이 불리언
//     하나에서 파생되므로 상태가 뒤집힐 때만 announce된다.
//   · ⚠️ 위 두 줄이 성립하려면 **루트에 `aria-live="off"`가 있어야 한다**(검토 P11).
//     이 폼은 `ChatTimeline`의 항목으로 렌더되는데 그 루트가 `aria-live="polite"`라
//     (`ChatTimeline.jsx:102`), ARIA 규정상 live region은 자기 서브트리의 텍스트 변경을
//     전부 announce한다 — 아무 조치도 하지 않으면 카운터(`{n}자`)와 게이트 문구
//     (`현재 N자예요`)가 **타이핑 한 글자마다** 낭독된다. `ChatTimeline`은 `focusRef`가
//     붙은 항목에만 `aria-live="off"`를 내려주는데 이 폼 항목에는 `focusRef`가 없다.
//     그래서 무효화를 컴포넌트가 직접 건다 — 어느 호출부에 붙어도 계약이 성립하고,
//     아래 sr-only `aria-live="polite"`·`role="status"`·`role="alert"`는 각자 명시적
//     live 의미론을 가지므로 그대로 살아남는다(자식이 조상을 그 서브트리에 한해 덮는다).
//   · 두 버튼은 `disabled` 대신 `aria-disabled`다(`TopicCardList`가 세운 관례).
//     ⓐ `disabled` 버튼은 포커스를 못 받아 `aria-describedby`가 **영원히 읽히지 않는다** —
//        "왜 못 누르는지"를 프로그램적으로 전달하라는 요구와 정면으로 충돌한다.
//     ⓑ 방금 누른 버튼이 처리 중 `disabled`가 되면 포커스가 `<body>`로 떨어진다.
//     대신 핸들러에서 직접 막는다(`if (locked) return`).
//   · 대비(직접 계산, 흰 카드 배경 기준): 라벨 `performance-required`(#991e1e) 8.21:1 /
//     본문·입력값 `ink`(#525252) 7.82:1 / 카운터·보조문 `ink-sub`(#6b6b6b) 5.33:1 /
//     primary 버튼 흰 글자 on #013262 12.86:1 / 처리중 흰 글자 on `bg-primary/80`
//     (흰 카드 위 합성 #345b81) 7.15:1 / secondary 라벨 `ink-sub` on 흰색 5.33:1 /
//     **비활성 primary `ink`(#525252) on `performance-line`(#d9d9d9) 5.54:1**.
//     전부 AA(4.5:1) 충족. (예외는 위 placeholder 항.)
//     ⚠️ 비활성 primary는 원래 흰 글자였고 #d9d9d9 대비 **1.41:1**이었다(검토 P11). 빈
//     상태가 이 폼의 **기본 상태**라 학생이 폼을 처음 만나는 순간 라벨이 판독되지 않았고,
//     `aria-disabled`라 실제로 포커스·클릭이 가능한 컨트롤이라 「비활성 컴포넌트」 예외
//     (WCAG 1.4.3)에 기대기도 어렵다. **면 색(§5.8 실측 `#d9d9d9`)은 그대로 두고 글자색만**
//     `ink`로 내렸다 — §5.14 버튼 표가 기록한 것은 활성 fill `#013262` 하나뿐이라
//     비활성 글자색은 시안 실측이 아니라 관례에서 빌려 온 값이었다(고칠 근거가 있다).
//     `ink-sub`(#6b6b6b)는 같은 배경에서 3.78:1로 여전히 미달이라 쓰지 않는다.
//   · 모션은 저장소 관례 그대로 `active:scale-[0.97] motion-reduce:active:scale-100`.

/** §5.14 카드 본문 원문. 제목·`안내문 분석 결과:` 접두는 시안 문자열 그대로다. */
const CARD_TITLE = "수행평가 제출폼";
const SCHEMA_LABEL_PREFIX = "안내문 분석 결과: ";

/** §5.14 필드 표 — 주제 칸은 확정 주제 prefill이다(제출 필드가 아니다, 아래 주석). */
const TOPIC_LABEL = "주제";

const SUBMIT_LABEL = "제출하고 평가 리포트 받기";

const SAVE_STATUS_SAVING = "저장 중…";
const SAVE_STATUS_ERROR = "저장 실패 — 다시 시도";

// QA 행280 — 원래 QA 행281 접수(`중간 저장`이 카드 맨 아래에만 있어 문항형 20필드에서는
// 스크롤해야 보였다)로 카드 제목 옆에 버튼을 하나 더 뒀었는데, 이번 결정(디자이너 9/4
// 댓글 + 사용자 확정)으로 수동 버튼 2개(제목 옆·하단 버튼 행)를 전부 없애고 자동 저장으로
// 바꿨다. 저장이 실제로 대상하는 값은 여전히 **이 폼의 필드 값뿐**이다(`handleSaveDraft`가
// `fields`를 그대로 `saveSubmission({mode:'draft'})`에 넘긴다 — `PerformanceChatPage.tsx`).
// 버튼이 있던 카드 제목 옆 자리에는 이제 저장 상태 텍스트(저장 중…/자동 저장됨 HH:MM/
// 저장 실패 — 다시 시도)만 남는다 — 가시성 문제(스크롤해야 보였다는 원 접수)가 애초에
// "손으로 눌러야 할 버튼이 안 보인다"는 문제였는데, 자동 저장은 누를 버튼 자체가
// 없어지므로 그 문제가 구조적으로 사라진다(실패 시 재시도만 예외적으로 누를 수 있다).

type SubmissionField = {
  key: string;
  label: string;
  helper?: string;
  example?: string;
  required?: boolean;
};

export type SubmissionSchema = {
  type?: string;
  label?: string;
  notice?: string;
  fields?: SubmissionField[];
};

export type SubmissionFieldValues = Record<string, string>;

/**
 * 필드 1개. `memo`로 감싼 이유는 문항형 20필드다(파일 상단 ⓑ) — `field`는 스키마 객체라
 * 참조가 안정적이고, `value`는 문자열, `onChange`는 호출부에서 단 한 번 만들어진 함수라
 * 실제로 "그 필드만" 리렌더된다.
 */
const SubmissionField = memo(function SubmissionField({
  field,
  value,
  onChange,
  idPrefix,
  readOnly,
}: {
  field: SubmissionField;
  value: string;
  onChange: (key: string, value: string) => void;
  idPrefix: string;
  readOnly?: boolean;
}) {
  const id = `${idPrefix}-${field.key}`;
  const helperId = field.helper ? `${id}-helper` : null;
  const counterId = `${id}-counter`;
  const count = countFieldChars(value);

  return (
    // 라벨↔컨트롤 0.75rem(12), 컨트롤↔카운터 0.75rem(12) — §5.14 실측이 같은 값이라
    // 컬럼 gap 하나로 둘 다 맞는다.
    <div className="flex flex-col gap-3">
      <label
        htmlFor={id}
        className={[
          "text-app-label font-medium",
          field.required ? "text-performance-required" : "text-ink-sub",
        ].join(" ")}
      >
        {field.label}
        {/* 필수를 색 하나에만 맡기지 않는다(WCAG 1.4.1) — 시안 `서론*` 표기를 그대로 쓰되
            별표는 aria-hidden, 스크린리더에는 "(필수)"를 준다(BasicInfoForm·ManualInfoForm
            과 동일 관례). 선택 필드는 눈에 보이는 "(선택)"을 붙인다. */}
        {field.required ? (
          <>
            <span aria-hidden="true">*</span>
            <span className="sr-only"> (필수)</span>
          </>
        ) : (
          <span> (선택)</span>
        )}
      </label>

      {/* 작성 예시. placeholder는 대비가 AA 미달이고 값이 차면 사라지므로, 입력칸 위에
          항상 보이는 박스로 둔다. `<label>`이 아니라 `<p>`다(라벨은 필드당 1개). */}
      {field.example && (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-app-caption text-ink-sub">
          <span className="mr-1.5 font-semibold text-ink">예시</span>
          {field.example}
        </p>
      )}

      {/* §5.14: 46.375rem×10rem 고정 + 내부 스크롤(자동 확장 미채택). r0.5rem,
          fill `#f8f7f5`, stroke `#d9d9d9`, 값 0.875rem/1.125rem w500 `#525252`. */}
      <textarea
        id={id}
        name={field.key}
        value={value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(field.key, event.target.value)
        }
        placeholder={field.helper || undefined}
        readOnly={readOnly}
        aria-describedby={[helperId, counterId].filter(Boolean).join(" ")}
        className="h-40 w-full resize-none overflow-y-auto rounded-lg border border-performance-line bg-performance-bubble p-3 text-app-body font-medium text-ink outline-hidden transition placeholder:text-performance-line focus:border-primary"
      />

      {/* 값이 채워지면 사라지는 placeholder를 대신할 항구적 지시문(파일 상단 4). */}
      {helperId && (
        <span id={helperId} className="sr-only">
          {field.helper}
        </span>
      )}

      <CharCounter id={counterId} count={count} />
    </div>
  );
});

type SubmissionFormProps = {
  /** **서버가 내려준 값 그대로**(`GET /api/performance/submission`의 `schema`). 화면이
   * 판정하거나 보정하지 않는다. */
  schema?: SubmissionSchema | null;
  /** 필드 키 → 작성 값. 호출부가 소유한다(제출 실패·재평가 복원에서 같은 값을 다시 쓰기
   * 때문이다). */
  value?: SubmissionFieldValues;
  /** 값 전체를 새 객체로 돌려준다. */
  onChange?: (next: SubmissionFieldValues) => void;
  /** 자동 저장(QA 행280). `useDebouncedAutosave`가 입력이 멈춘 뒤 이 함수를 부른다 —
   * 더는 버튼 클릭으로 직접 불리지 않는다(실패 상태의 수동 "다시 시도"만 예외). 실패하면
   * 반드시 reject해야 한다(`PerformanceChatPage.handleSaveDraft` 주석). */
  onSaveDraft?: (fields: SubmissionFieldValues) => Promise<unknown>;
  /** `제출하고 평가 리포트 받기`. **클라이언트 게이트를 통과한 경우에만 호출된다**
   * (서버 검증은 그대로 살아 있다). */
  onSubmit?: (fields: SubmissionFieldValues) => void;
  /** 확정 주제. §5.14 `주제*` 칸의 prefill 표시값이고 **제출 필드가 아니다** — 확정 주제는
   * `performance_sessions.selected_topic_id`가 들고 있어 서버가 직접 읽는다(§8.3). 그래서
   * 읽기 전용이고 `fields`에 실리지 않는다. */
  topicTitle?: string | null;
  /** 자동 저장 진행 중(§6.1 상태 `saving`). */
  saving?: boolean;
  /** 제출 진행 중(§6.1 상태 `submitting`). */
  submitting?: boolean;
  /** **자동 저장(draft) 실패** 문구(서버가 준 한국어 문구 그대로). 카드 제목 옆 상태
   * 텍스트(`저장 실패 — 다시 시도`)와 이 값 자체를 알리는 하단 문구를 함께 켠다. 제출
   * 실패는 여기 실리지 않는다 — 아래 `submitError` 참고(그리핑 원인: 예전엔 두 실패가
   * 한 상태를 같이 썼는데, 게이트 실패(`SUBMISSION_TOO_SHORT` 등)로 초안은 이미 저장된
   * 채 제출만 실패한 경우에도 "저장 실패"가 떠 학생이 방금 저장된 글을 잃은 줄
   * 오인했다). */
  error?: string | null;
  /** **제출 실패** 문구. 게이트 실패처럼 초안은 저장됐는데 제출만 안 된 경우가 흔해서
   * `error`(저장 실패)와 분리했다 — 제출 버튼 아래에 별도 문단으로만 뜨고, 카드 제목
   * 옆 자동 저장 상태 텍스트에는 영향을 주지 않는다. */
  submitError?: string | null;
  /** 마지막 자동 저장 시각(ISO). 저장 성공 피드백에만 쓴다. */
  savedAt?: string | null;
};

export default function SubmissionForm({
  schema,
  value,
  onChange,
  onSaveDraft,
  onSubmit,
  topicTitle = null,
  saving = false,
  submitting = false,
  error = null,
  submitError = null,
  savedAt = null,
}: SubmissionFormProps) {
  const reactId = useId();
  const idPrefix = `performance-submission${reactId}`;
  const gateId = `${idPrefix}-gate`;
  const errorId = `${idPrefix}-error`;
  const submitErrorId = `${idPrefix}-submit-error`;

  const fields = Array.isArray(schema?.fields) ? schema.fields : [];

  // 변경 핸들러를 **한 번만** 만든다(파일 상단 ⓑ). `value`/`onChange`를 의존성으로 넣으면
  // 매 타이핑마다 새 함수가 되어 `memo`가 전부 무력화된다 — 최신 값은 ref로 읽는다.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleFieldChange = useCallback((key: string, next: string) => {
    onChangeRef.current?.({ ...valueRef.current, [key]: next });
  }, []);

  // 게이트·카운터는 서버와 같은 함수로 잰다(파일 상단 2).
  const gate = useMemo(
    () => checkFieldsMinLength(fields, value),
    [fields, value],
  );

  const busy = saving || submitting;
  const isEmpty = gate.total === 0;

  // §6.1 상태 4종. 버튼이 있던 시절엔 `saveLocked`가 "중간 저장" 버튼의 `aria-disabled`
  // 였는데(QA 행280으로 그 버튼이 없어졌다), 같은 조건이 이제 **자동 저장을 걸어도 되는지**
  // 로 옮겨졌다(아래 `useDebouncedAutosave`의 `enabled`) — 빈 폼은 서버가 `400
  // EMPTY_SUBMISSION`으로 거절하니 애초에 요청을 걸지 않는다.
  //   empty      → 자동 저장 안 걸림(내용이 없다), 제출도 잠김
  //   filled     → 입력이 멈추면 자동 저장, 제출은 게이트 통과 시에만
  //   saving     → 카드 제목 옆 상태 텍스트가 "저장 중…"
  //   submitting → 제출 버튼 잠김 + 스피너/`aria-busy`, 입력은 읽기 전용, 자동 저장은 안 건다
  const submitLocked = !gate.ok || busy;
  const autosaveEnabled = !isEmpty && !submitting;

  const autosave = useDebouncedAutosave({
    value: value ?? {},
    onSave: (fields) => {
      const result = onSaveDraft?.(fields);
      return result instanceof Promise ? result : Promise.resolve(result);
    },
    enabled: autosaveEnabled,
  });

  // §5.14에 없는 표면이라 최소한만 만든다(§11.3 Q39 — 시안에 토스트가 없다).
  // **필드 카운터에 기준선을 얹지 않는 대신** 폼 전체 게이트를 여기 한 줄로 말하고,
  // 제출 버튼이 이 문장을 `aria-describedby`로 가리킨다(비활성 사유의 프로그램적 전달).
  let gateMessage: string;
  if (isEmpty) {
    gateMessage =
      "아직 작성한 내용이 없어요. 내용을 입력하면 저장하거나 제출할 수 있어요.";
  } else if (gate.missingRequired.length) {
    gateMessage = `필수 항목을 모두 작성해야 제출할 수 있어요. 남은 항목: ${gate.missingRequired.join(", ")} (현재 ${gate.total}자)`;
  } else if (gate.total < SUBMISSION_MIN_CHARS) {
    gateMessage = `제출하려면 전체 ${SUBMISSION_MIN_CHARS}자 이상 작성해야 해요. 현재 ${gate.total}자예요.`;
  } else {
    gateMessage = `전체 ${gate.total}자를 작성했어요. 지금 제출할 수 있어요.`;
  }

  // 제출 버튼이 가리키는 설명 — 게이트 사유 + (있다면) 저장 실패 문구 + (있다면) 제출
  // 실패 문구. 저장 버튼이 있던 시절엔 두 버튼이 같이 가리켰지만, 이제 저장은 버튼이
  // 아니라 상태 텍스트다.
  const describedBy = [
    gateId,
    error ? errorId : null,
    submitError ? submitErrorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  /** 저장 실패 상태 텍스트의 수동 재시도(§ 위 `useDebouncedAutosave` 주석). `force`를
   * 줘야 한다 — 안 주면 훅 내부 북키핑상 "이미 저장된 값"으로 보이는 경우 아무 것도
   * 하지 않고 조용히 no-op할 수 있다(사용자가 누른 재시도가 아무 반응이 없는 버그). */
  function handleRetrySave() {
    autosave.flush({ force: true });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitLocked) return;
    // 대기 중이던 자동 저장 타이머를 취소한다 — 제출 자체가 `mode:'submit'`으로 같은
    // 값을 다시 저장하므로 중복 draft 저장과 경합할 필요가 없다(훅 주석 `cancel`).
    autosave.cancel();
    // 지금 값을 제출로 넘겼다고 표시한다 — 제출이 성공해 이 폼이 언마운트되면(§평가
    // 로딩 전환) 언마운트 cleanup이 방금 넘긴 값을 또 draft로 저장하지 않는다(훅 주석
    // `suspendUnmountFlush`). 제출이 실패해 폼이 남으면 편집·재시도가 자동으로 다시
    // 풀어 준다.
    autosave.suspendUnmountFlush();
    onSubmit?.(value ?? {});
  }

  return (
    // §5.14 카드 실측: 49.125rem(786) 폭, r16, stroke `#d9d9d9`, 인셋 좌 1.25rem(20) /
    // 우 1.5rem(24) → 콘텐츠 46.375rem(742, **정본**). `InlineCard`를 쓰지 않는 이유는
    // 그쪽이 `max-w-perf-bubble`(596)과 `px-7.5`을 고정하고 있어서다 — className
    // 으로 덮으면 `max-w-*` 두 개가 겹쳐 어느 쪽이 이길지 예측 불가다(AiMessage 주석의
    // 그 함정). 카드 모양만 같은 토큰으로 다시 짓는다.
    // `aria-live="off"` — 파일 상단 4의 ⚠️ 항. `ChatTimeline` 루트의 `polite`를 이
    // 서브트리에 한해 무효화해 카운터·게이트 문구가 타이핑마다 낭독되지 않게 한다.
    <div
      aria-live="off"
      className="w-full max-w-196.5 rounded-2xl border border-performance-line bg-white py-5 pl-5 pr-6"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-app-card-title font-semibold text-ink">
              {CARD_TITLE}
            </h3>
            {/* 저장 버튼이 있던 자리(QA 행280). 이제 버튼이 아니라 자동 저장 상태
                텍스트다 — `role="status"`라 상태가 바뀔 때만 1회 announce된다(파일 상단
                4의 aria-live 관례와 같다). 실패 상태만 예외적으로 클릭 가능한 재시도다. */}
            <span
              role="status"
              className="flex h-9 shrink-0 items-center gap-1.5 text-app-label font-medium text-ink-sub"
            >
              {saving ? (
                <>
                  <Loader2
                    size={14}
                    strokeWidth={2.5}
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  {SAVE_STATUS_SAVING}
                </>
              ) : error ? (
                <button
                  type="button"
                  onClick={handleRetrySave}
                  aria-describedby={errorId}
                  className="underline decoration-dotted underline-offset-2 text-[#d01c1c] hover:text-[#d01c1c]/80"
                >
                  {SAVE_STATUS_ERROR}
                </button>
              ) : (
                savedAt && `자동 저장됨 ${formatSavedAt(savedAt)}`
              )}
            </span>
          </div>
          {/* §5.14 카드 본문 2·3행. 유형 라벨·안내문은 **서버 스키마 값**이라 8종에 따라
              바뀐다(시안의 `기본 보고서형`은 그중 하나다). */}
          <p className="text-app-label font-medium text-ink-sub">
            {SCHEMA_LABEL_PREFIX}
            {schema?.label}
          </p>
          {schema?.notice && (
            <p className="text-app-label font-normal text-ink-sub">
              {schema.notice}
            </p>
          )}
        </div>

        {/* 필드 스택 gap 1.25rem(20) — §5.14 실측. */}
        <div className="flex flex-col gap-5">
          {/* 주제 — 읽기 전용 prefill(§5.14 「확정 주제 prefill(`#525252`)」). 단일행
              46.375rem×2.625rem(42) r0.5rem. 제출 필드가 아니므로 `fields`에 없다. */}
          <div className="flex flex-col gap-3">
            <label
              htmlFor={`${idPrefix}-topic`}
              className="text-app-label font-medium text-performance-required"
            >
              {TOPIC_LABEL}
              <span aria-hidden="true">*</span>
              <span className="sr-only">
                {" "}
                (필수 — 확정한 주제이며 수정할 수 없습니다)
              </span>
            </label>
            <input
              id={`${idPrefix}-topic`}
              type="text"
              value={topicTitle || ""}
              readOnly
              className="h-10.5 w-full cursor-default rounded-lg border border-performance-line bg-performance-bubble px-3 text-app-body font-medium text-ink outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </div>

          {fields.map((field) => (
            <SubmissionField
              key={field.key}
              field={field}
              value={value?.[field.key] ?? ""}
              onChange={handleFieldChange}
              idPrefix={idPrefix}
              // 제출 중에는 값이 바뀌면 안 되지만 `disabled`를 걸면 포커스가 날아간다 —
              // `readOnly`는 포커스를 유지한 채 편집만 막는다.
              readOnly={submitting}
            />
          ))}
        </div>

        {/* 게이트 문구(비활성 사유). live region이 아니다 — 숫자가 매 글자 바뀐다. */}
        <p id={gateId} className="text-app-label font-normal text-ink-sub">
          {gateMessage}
        </p>

        {/* 임계값을 넘나드는 순간에만 문자열이 바뀌므로 그때만 announce된다. */}
        <p aria-live="polite" className="sr-only">
          {gate.ok ? "제출할 수 있는 분량이 되었어요." : ""}
        </p>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-app-label text-[#d01c1c]"
          >
            {error}
          </p>
        )}

        {/* 제출 실패는 자동 저장 실패(`error`)와 별개 문단이다 — 위 props 주석 참고.
            게이트 실패(`SUBMISSION_TOO_SHORT` 등)로 초안은 이미 저장된 채 제출만 실패한
            경우가 흔해서, 여기서만 알리고 카드 제목 옆 상태 텍스트는 건드리지 않는다. */}
        {submitError && (
          <p
            id={submitErrorId}
            role="alert"
            className="text-app-label text-[#d01c1c]"
          >
            {submitError}
          </p>
        )}

        {/* 버튼 행 — §5.14 실측은 저장+제출 2버튼 기준이었다(33.25rem×3.25rem gap
            0.75rem). QA 행280으로 저장 버튼이 상태 텍스트로 바뀌면서 이 행에는 제출
            버튼 하나만 남았다 — 자리·치수는 그대로 유지한다(카드 786 안 가운데 정렬).
            `PrimaryButton`을 쓰지 않은 이유는 그쪽이 `disabled` 속성만 노출하고
            `aria-disabled`/`aria-describedby`를 받지 못해서다(파일 상단 4) — 로그인·
            회원가입이 함께 쓰는 컴포넌트라 그 계약을 이 화면 사정으로 넓히지 않는다.
            치수·색·모션 클래스는 그 컴포넌트와 동일하게 맞췄다. */}
        <div className="flex justify-center gap-3">
          <button
            type="submit"
            aria-disabled={submitLocked}
            aria-busy={submitting || undefined}
            aria-describedby={describedBy}
            className={[
              "flex h-13 w-65 items-center justify-center gap-2 rounded-xl text-app-label font-semibold transition active:scale-[0.97] motion-reduce:active:scale-100",
              // 비활성 **면 색**은 §5.8 실측(「빈 상태 `#d9d9d9`(비활성) / 입력 시 `#013262`」)과
              // `PrimaryButton`의 disabled 톤을 그대로 따른다 — 처리중(`bg-primary/80`)과
              // 비활성을 시각적으로 구분하는 것도 그 컴포넌트의 관례다.
              // **글자색만** 비활성에서 `ink`로 내린다(파일 상단 4 대비 항의 ⚠️).
              submitting
                ? "cursor-progress bg-primary/80 text-white"
                : submitLocked
                  ? "cursor-not-allowed bg-performance-line text-ink"
                  : "bg-primary text-white hover:bg-primary/90",
            ].join(" ")}
          >
            {submitting && (
              <Loader2
                size={18}
                strokeWidth={2.5}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {SUBMIT_LABEL}
          </button>
        </div>
      </form>
    </div>
  );
}

/** `2026. 08. 12. 14:03` 같은 절대 시각 대신 시:분만 — 같은 세션 안의 피드백이다. */
function formatSavedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "방금";
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
